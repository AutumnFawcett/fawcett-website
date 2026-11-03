import {generateKeyPairSync,sign} from "node:crypto";
import {createRegistry} from "../../lib/financial-security/protocol/registry.mjs";
import {createArtifactSigner,unsignedArtifact} from "../../lib/financial-security/protocol/artifacts.mjs";
import {createProposalCoordinator} from "../../lib/financial-security/protocol/proposal.mjs";
import {hash,writers,dependencyKinds} from "../../lib/financial-security/protocol/contracts.mjs";
export const NOW="2026-11-03T12:00:00.000Z",LATER="2026-11-03T12:00:01.000Z",BEFORE="2026-11-01T00:00:00.000Z";
export const SCOPE={projectId:"demo-fawcett-ledger",databaseId:"(default)",environment:"sandbox"};
export function registryFixture(){
  const privateKeys={},keys=Object.keys(writers).map(writerKind=>{
    const pair=generateKeyPairSync("ed25519"),keyId=`key_${writerKind}`;privateKeys[keyId]=pair.privateKey;
    return {keyId,issuerId:`issuer_${writerKind}`,writerKind,algorithm:"Ed25519",publicKey:pair.publicKey.export({type:"spki",format:"der"}).toString("base64"),
      scope:SCOPE,artifactTypes:writers[writerKind],introducedRevision:1,createdAt:BEFORE,effectiveAt:BEFORE,retiredAt:null,revokedAt:null,state:"active",compromised:false};
  });
  const value={schemaVersion:1,id:"synthetic_registry",revision:1,keys};
  const registry=createRegistry(value,{expectedId:value.id});
  const signer=(kind="ledger",signBytes)=>createArtifactSigner({registry,keyId:`key_${kind}`,issuerId:`issuer_${kind}`,writerKind:kind,
    signBytes:signBytes??(async bytes=>sign(null,bytes,privateKeys[`key_${kind}`]).toString("base64"))});
  return {value,registry,privateKeys,signer};
}
const base={clientId:"client_1",requestId:"request_1",currency:"CAD"};
const provider={...base,provider:"square",merchantId:"merchant_1",paymentId:"payment_1",orderId:"order_1",locationId:"location_1",amountCents:30000,readbackAt:NOW,verifierDecisionId:"verification_1"};
export function payloadFor(kind){
  return structuredClone({
    provider_payment:{...provider,status:"COMPLETED",sourceType:"CARD",cardStatus:"CAPTURED",externalDetailsAbsent:true,requestRevision:1},
    provider_refund:{...provider,refundId:"refund_1",status:"COMPLETED",originalPaymentEvidenceId:"evidence_1"},
    financial_journal:{...base,transactionId:"transaction_1",fundingFamilyId:"family_1",policyVersion:1,auditId:"audit_1",entries:[
      {accountId:"advance_liability",allocationId:"tattoo_advance",side:"debit",amountCents:20000},
      {accountId:"tattoo_revenue",allocationId:"tattoo_advance",side:"credit",amountCents:20000}]},
    replay_event:{...base,transactionId:"transaction_1",originalArtifactHash:hash("original"),intentHash:hash("intent"),resultHash:hash("result")},
    owner_decision:{...base,decisionId:"decision_1",actorId:"owner_1",action:"transfer",projectId:"project_1",amountCents:30000,restrictionId:"project_1",policyVersion:1,roleRevision:1,accountRevision:1,approvalId:"approval_1",expiresAt:LATER,auditId:"audit_1"},
    policy_definition:{policyId:"policy_1",policyVersion:1,contentHash:hash("terms"),content:"terms",publishedAt:NOW,authorizerId:"publisher_1",auditId:"audit_1"},
    service_completion:{...base,completionId:"completion_1",appointmentId:"appointment_1",projectId:"project_1",artistId:"artist_1",appointmentRevision:1,serviceRevision:1,
      status:"completed",decision:"authorized",serviceTotalCents:20000,supplyFeeCents:1000,taxCents:1000,otherCents:0,actorId:"artist_1",auditId:"audit_1",applicationId:"application_1"}
  }[kind]);
}
export const writerFor=kind=>Object.keys(writers).find(k=>writers[k].includes(kind));
export function unsigned(f,kind="financial_journal"){return unsignedArtifact(f.registry,{keyId:`key_${writerFor(kind)}`,artifactId:`artifact_${kind}`,kind,scope:SCOPE,payload:payloadFor(kind),issuedAt:NOW,proposalHash:hash("proposal")});}
export const expected=a=>({kind:a.body.kind,issuerId:a.body.issuerId,writerKind:a.body.writerKind,scope:SCOPE,subject:a.body.subject});
export function stateFixture(){return {actorId:"admin_1",scope:SCOPE,dependencies:dependencyKinds.map(kind=>({kind,id:`${kind}_1`,revision:1,contentHash:hash(kind),validUntil:null})),
  artifact:{artifactId:"attendance_1",kind:"financial_journal",payload:payloadFor("financial_journal")}};}
export const operation={id:"operation_1",intent:{action:"attend",amountCents:20000}};
// Disposable offline transaction store, not a deployed financial writer.
export function memoryFixture(){
  const f=registryFixture();let state=stateFixture(),replay=null,live=true,time=NOW,inside=0,calls=0,effects=0;
  const store={readPlan:async()=>structuredClone(state),authorize:async()=>{if(!live)throw Error("revoked");},readReplay:async()=>replay,
    runTransaction:async cb=>{inside++;try{return await cb({});}finally{inside--; }},apply:async(tx,p)=>{effects++;replay=p.replay;}};
  const signer=f.signer("ledger",async bytes=>{if(inside)throw Error("signer_in_transaction");calls++;await Promise.resolve();return sign(null,bytes,f.privateKeys.key_ledger).toString("base64");});
  const create=(patch={})=>createProposalCoordinator({store,signer,keyId:"key_ledger",getRegistry:()=>f.registry,clock:()=>time,...patch});
  return {...f,store,create,get state(){return state;},set state(s){state=s;},revoke:()=>{live=false;},advance:t=>{time=t;},get calls(){return calls;},get effects(){return effects;},get replay(){return replay;}};
}
