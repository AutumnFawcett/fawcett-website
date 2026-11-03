import "server-only";
import {createHash} from "node:crypto";
import {check,record,id,timestamp,digest,oneOf,nullableId} from "../../agreements/contracts.mjs";
export {check,record,id,timestamp,digest,oneOf,nullableId};
export const revision=v=>Number.isSafeInteger(v)&&v>0;
export const cents=v=>Number.isSafeInteger(v)&&v>=0;
export const positive=v=>cents(v)&&v>0;
export const optionalTime=v=>v===null||timestamp(v);
// Deliberately narrower than JSON: no floats, undefined, accessors, exotic objects,
// sparse arrays or ambiguous Unicode. Version 1 is not a general JCS implementation.
export function canonical(value){
  const seen=new Set();
  function encode(v){
    if(v===null||typeof v==="boolean")return JSON.stringify(v);
    if(typeof v==="string"){
      check(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v),"invalid_unicode");return JSON.stringify(v);
    }
    if(typeof v==="number"){check(Number.isSafeInteger(v)&&!Object.is(v,-0),"invalid_integer");return String(v);}
    check(v&&typeof v==="object"&&!seen.has(v),"invalid_canonical_value");seen.add(v);
    check(Object.getOwnPropertySymbols(v).length===0,"invalid_canonical_value");
    const keys=Object.keys(v),descriptors=Object.getOwnPropertyDescriptors(v);
    check(Object.values(descriptors).every(d=>Object.hasOwn(d,"value")),"invalid_canonical_value");
    let result;
    if(Array.isArray(v)){
      check(Object.getPrototypeOf(v)===Array.prototype&&Object.getOwnPropertyNames(v).length===keys.length+1&&keys.length===v.length&&keys.every((k,i)=>k===String(i)),"invalid_array");
      result="["+v.map(encode).join(",")+"]";
    }else{
      check(Object.getPrototypeOf(v)===Object.prototype&&Object.getOwnPropertyNames(v).length===keys.length,"invalid_object");
      check(keys.every(k=>id(k)),"invalid_object_key");result="{"+keys.sort().map(k=>JSON.stringify(k)+":"+encode(v[k])).join(",")+"}";
    }
    seen.delete(v);return result;
  }
  const result=encode(value);check(Buffer.byteLength(result)<=65536,"artifact_too_large");return result;
}
export const hash=value=>createHash("sha256").update(canonical(value)).digest("hex");
export function freeze(value){canonical(value);const copy=structuredClone(value);const visit=v=>{if(v&&typeof v==="object"){Object.values(v).forEach(visit);Object.freeze(v);}return v;};return visit(copy);}
export const scopeFields={projectId:id,databaseId:v=>v==="(default)"||id(v),environment:oneOf("sandbox","production")};
export const scope=value=>record(scopeFields,value);
export const same=(a,b)=>canonical(a)===canonical(b);
export const writers=Object.freeze({
  provider_verifier:["provider_payment","provider_refund"],ledger:["financial_journal","replay_event"],
  owner_administration:["owner_decision"],policy_publisher:["policy_definition"],service_authorizer:["service_completion"]
});
export const artifactKind=oneOf(...Object.values(writers).flat());
export const writerKind=oneOf(...Object.keys(writers));
const ids=v=>Array.isArray(v)&&v.length<=64&&v.every(id)&&new Set(v).size===v.length;
const amountBase={clientId:id,requestId:id,currency:v=>v==="CAD"};
const providerBase={...amountBase,provider:v=>v==="square",merchantId:id,paymentId:id,orderId:id,locationId:id,amountCents:positive,readbackAt:timestamp,verifierDecisionId:id};
const fields={
  provider_payment:{...providerBase,status:v=>v==="COMPLETED",sourceType:v=>v==="CARD",cardStatus:v=>v==="CAPTURED",externalDetailsAbsent:v=>v===true,requestRevision:revision},
  provider_refund:{...providerBase,refundId:id,status:v=>v==="COMPLETED",originalPaymentEvidenceId:id},
  financial_journal:{...amountBase,transactionId:id,fundingFamilyId:id,policyVersion:revision,auditId:id,
    entries:v=>Array.isArray(v)&&v.length>=2&&v.length<=32&&v.every(e=>{try{record({accountId:id,allocationId:id,side:oneOf("debit","credit"),amountCents:positive},e);return true;}catch{return false;}})},
  replay_event:{...amountBase,transactionId:id,originalArtifactHash:digest,intentHash:digest,resultHash:digest},
  owner_decision:{...amountBase,decisionId:id,actorId:id,action:id,projectId:nullableId,amountCents:cents,restrictionId:nullableId,policyVersion:revision,roleRevision:revision,accountRevision:revision,approvalId:id,expiresAt:timestamp,auditId:id},
  policy_definition:{policyId:id,policyVersion:revision,contentHash:digest,content:v=>typeof v==="string"&&v.length>0&&v.length<=20000,publishedAt:timestamp,authorizerId:id,auditId:id},
  service_completion:{...amountBase,completionId:id,appointmentId:id,projectId:id,artistId:id,appointmentRevision:revision,serviceRevision:revision,
    status:v=>v==="completed",decision:v=>v==="authorized",serviceTotalCents:cents,supplyFeeCents:cents,taxCents:cents,otherCents:cents,actorId:id,auditId:id,applicationId:id}
};
export function payload(kind,value){
  check(artifactKind(kind),"unsupported_artifact_kind");canonical(value);const result=record(fields[kind],value);
  if(kind==="financial_journal"){
    const sum=side=>result.entries.filter(e=>e.side===side).reduce((s,e)=>{const total=s+e.amountCents;check(Number.isSafeInteger(total),"money_overflow");return total;},0);
    check(sum("debit")===sum("credit"),"unbalanced_journal");
  }
  if(kind==="policy_definition")check(hash(result.content)===result.contentHash,"policy_hash_mismatch");
  return result;
}
export const dependencyKinds=["role","approval","policy","account","family","evidence"];
export function dependencies(value){
  check(Array.isArray(value)&&value.length>=6&&value.length<=32,"invalid_dependencies");
  const result=value.map(v=>record({kind:oneOf(...dependencyKinds),id,revision,contentHash:digest,validUntil:optionalTime},v));
  check(dependencyKinds.every(k=>result.some(v=>v.kind===k)),"missing_dependency");
  const keys=result.map(v=>`${v.kind}:${v.id}`);check(new Set(keys).size===keys.length,"duplicate_dependency");
  return result.sort((a,b)=>`${a.kind}:${a.id}`<`${b.kind}:${b.id}`?-1:1);
}
export const identifiers=ids;
