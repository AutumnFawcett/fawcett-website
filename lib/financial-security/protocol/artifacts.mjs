import "server-only";
import {verify} from "node:crypto";
import {record,check,id,revision,timestamp,digest,writerKind,artifactKind,payload,scope,same,hash,canonical,freeze} from "./contracts.mjs";
import {requireKey,registryKey} from "./registry.mjs";
const bodyFields={protocolVersion:v=>v===1,artifactSchemaVersion:v=>v===1,artifactId:id,kind:artifactKind,issuerId:id,writerKind,keyId:id,
  algorithm:v=>v==="Ed25519",registryId:id,registryRevision:revision,scope:v=>{try{scope(v);return true;}catch{return false;}},
  subject:v=>{try{record({clientId:v=>v===null||id(v),requestId:v=>v===null||id(v),transactionId:v=>v===null||id(v)},v);return true;}catch{return false;}},
  issuedAt:timestamp,payloadHash:digest,proposalHash:digest};
export function artifactBody(value){canonical(value);return record(bodyFields,value);}
function validateSubject(body,value){
  for(const field of ["clientId","requestId","transactionId"])
    check(body.subject[field]===(value[field]??null),"artifact_subject_mismatch");
}
export function unsignedArtifact(registry,{keyId,artifactId,kind,scope:target,payload:value,issuedAt,proposalHash}){
  const key=registryKey(registry,keyId),data=payload(kind,value);
  const body=artifactBody({protocolVersion:1,artifactSchemaVersion:1,artifactId,kind,issuerId:key.issuerId,writerKind:key.writerKind,keyId,
    algorithm:"Ed25519",registryId:registry.id,registryRevision:registry.revision,scope:scope(target),
    subject:{clientId:data.clientId??null,requestId:data.requestId??null,transactionId:data.transactionId??null},issuedAt,payloadHash:hash(data),proposalHash});
  requireKey(registry,body,{mode:"new",now:issuedAt});return freeze({body,payload:data});
}
// Caller supplies an independently pinned registry and exact intended scope/kind.
// Historical mode ALSO requires a durable, protected acceptance receipt. A caller-
// supplied timestamp/hash is not such a receipt. Historical verification never
// grants permission to post a new effect.
export function verifyArtifact(registry,value,expected,context){
  canonical(value);const a=record({body:v=>!!v,payload:v=>!!v,signature:v=>typeof v==="string"&&/^[A-Za-z0-9+/]{86}==$/.test(v)},value);
  check(Buffer.from(a.signature,"base64").toString("base64")===a.signature,"invalid_artifact_signature");
  const body=artifactBody(a.body),data=payload(body.kind,a.payload);
  if(body.kind==="owner_decision"&&context.mode==="new")check(context.now<data.expiresAt,"owner_approval_expired");
  for(const field of ["readbackAt","publishedAt"])if(data[field])check(data[field]<=body.issuedAt,"future_evidence");
  check(expected&&body.kind===expected.kind&&same(body.scope,scope(expected.scope))&&body.issuerId===expected.issuerId&&body.writerKind===expected.writerKind,"artifact_target_mismatch");
  check(same(body.subject,expected.subject)&&body.payloadHash===hash(data),"artifact_payload_mismatch");validateSubject(body,data);
  const key=requireKey(registry,body,context);
  check(verify(null,Buffer.from(canonical(body)),key.key,Buffer.from(a.signature,"base64")),"invalid_artifact_signature");
  if(context.mode==="historical")check(context.acceptedHash===hash(a),"trusted_historical_receipt_required");
  return freeze(a);
}
// This factory receives a scoped signer from trusted server composition, never an
// artifact or request. There is intentionally no private-key loader or cloud SDK.
export function createArtifactSigner({registry,keyId,issuerId,writerKind:writer,signBytes}){
  const key=registryKey(registry,keyId);check(key.issuerId===issuerId&&key.writerKind===writer&&typeof signBytes==="function","signer_authority_mismatch");
  return Object.freeze({async sign(unsigned,{signal}={}){
    canonical(unsigned);record({body:v=>!!v,payload:v=>!!v},unsigned);const body=artifactBody(unsigned.body);
    check(body.keyId===keyId&&body.issuerId===issuerId&&body.writerKind===writer,"signer_authority_mismatch");
    requireKey(registry,body,{mode:"new",now:body.issuedAt});const data=payload(body.kind,unsigned.payload);
    validateSubject(body,data);check(hash(data)===body.payloadHash,"artifact_payload_mismatch");
    // Copy bytes; a remote signer cannot mutate the frozen proposal.
    const signature=await signBytes(Buffer.from(canonical(body)),{signal});
    const signed={...unsigned,signature};
    return verifyArtifact(registry,signed,{kind:body.kind,scope:body.scope,issuerId,writerKind:writer,subject:body.subject},{mode:"new",now:body.issuedAt});
  }});
}
