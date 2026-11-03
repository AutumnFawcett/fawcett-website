import "./local-network.mjs";
import {createLocalFinancialDependencies} from "../../lib/financial-security/runtime.mjs";
import {sealSyntheticRecords} from "./security-fixture.mjs";
import { createFinancialCommands, commandPaths, agreementPolicyPath, principalPath } from "../../lib/financial-commands/service.mjs";
import { ledgerPaths, evidencePath, policyPath } from "../../lib/ledger/server/firestore.mjs";
import { hash, policyRef } from "../../lib/agreements/contracts.mjs";
export const PROJECT="demo-fawcett-ledger";
export function emulatorDependencies(){
  if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8087"||process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9097"
    ||process.env.GCLOUD_PROJECT!==PROJECT||process.env.GOOGLE_CLOUD_PROJECT!==PROJECT)throw Error("local_auth_and_firestore_required");
  return createLocalFinancialDependencies();
}
export const ledgerPolicy={schemaVersion:1,id:"terms",version:1,status:"approved",currency:"CAD",depositScope:"project",purchasedExpiry:"never",
  cancellationCredit:"retain",supplyFees:"separate",promotionUse:"explicit",disputeFreeze:"remaining_funding_lot"};
export const policy={schemaVersion:1,id:"terms",version:1,content:"Synthetic accepted terms",contentHash:hash("Synthetic accepted terms"),status:"published",
  legalReview:"approved",accountingReview:"approved",complimentaryNoticeHours:168,complimentaryReschedules:1,automaticForfeiture:false,advanceToStudio:true};
export async function setup(deps,name,{single=false}={}){
  const {db,auth}=deps,scope={clientId:`client_${name}`,environment:"sandbox"},paths=commandPaths(scope);
  const tokens={};
  for(const [key,uid] of Object.entries({client:scope.clientId,owner:`owner_${name}`,admin:`admin_${name}`})){
    const email=`${uid}@example.invalid`,password="Synthetic-only-password-123";
    await auth.createUser({uid,email,password});
    const response=await fetch("http://127.0.0.1:9097/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,returnSecureToken:true})});
    if(!response.ok)throw Error("synthetic_signin_failed");tokens[key]=(await response.json()).idToken;
  }
  const request={schemaVersion:1,id:"request_1",...scope,currency:"CAD",revision:1,appointmentId:"appointment_1",appointmentRevision:1,policy:policyRef(policy),
    allocations:single?[{id:"advance",kind:"tattoo_advance",amountCents:30000}]:[{id:"fee",kind:"appointment_booking_fee",amountCents:5000},{id:"advance",kind:"tattoo_advance",amountCents:25000}],
    requiredOfferTerms:[],totalCents:30000};
  const payment={schemaVersion:1,id:"provider_row",...scope,currency:"CAD",provider:"square",merchantId:"merchant_1",paymentId:`payment_${name}`,
    orderId:`order_${name}`,locationId:"location_1",requestId:request.id,projectId:"project_1",amountCents:30000,
    status:"COMPLETED",sourceType:"CARD",readbackVerified:true,verificationVersion:1,evidenceId:"evidence_1"};
  const batch=db.batch(),owned=[];
  const setOwned=(path,value)=>{owned.push(path);batch.set(db.doc(path),value);};
  for(const [key,role] of Object.entries({client:"client",owner:"owner",admin:"admin"})){
    const uid=key==="client"?scope.clientId:`${key}_${name}`;
    setOwned(principalPath(uid),{schemaVersion:2,revocationEpoch:0,grants:[{clientId:scope.clientId,projectIds:["project_1"]}],uid,active:true,role,revision:1,environment:"sandbox",validAfterSeconds:0,
      clientIds:[scope.clientId],projectIds:["project_1"],actions:key==="client"?["accept_policy"]:["receive","redeem","cancel_membership",...(key==="owner"?["transfer","approve_transfer","manage_roles","family_reserve","family_freeze","family_release_reservation","family_release_dispute"]:[])]});
  }
  setOwned(`${paths.projects}/project_1`,{id:"project_1",...scope,artistId:"artist_1"});
  setOwned(`${paths.appointments}/appointment_1`,{id:"appointment_1",...scope,revision:1,projectId:"project_1",startsAt:new Date(Date.now()+15*86400000).toISOString()});
  setOwned(`${paths.agreements}/${request.id}`,request);
  setOwned(agreementPolicyPath(scope,request.policy),policy);
  setOwned(policyPath("sandbox","terms",1),ledgerPolicy);
  setOwned(evidencePath(scope,"payments",payment.evidenceId),payment);
  setOwned(evidencePath(scope,"requests",request.id),{schemaVersion:1,id:request.id,...scope,currency:"CAD",projectId:"project_1",appointmentId:request.appointmentId,
    projectApproved:true,purpose:"project_deposit",amountCents:30000,policyId:"terms",policyVersion:1,status:"open"});
  setOwned(`${paths.readbacks}/evidence_1`,{schemaVersion:1,paymentHash:hash(payment),sourceType:"CARD",externalDetailsPresent:false,cardStatus:"CAPTURED",
    retrievedAt:new Date().toISOString(),verifierId:"synthetic_verifier"});
  setOwned(`${paths.providerOrders}/${request.id}`,{...scope,requestId:request.id,orderId:payment.orderId,locationId:payment.locationId,
    merchantId:payment.merchantId,amountCents:30000,currency:"CAD"});
  batch.set(db.doc(`${ledgerPaths(scope).account}/memberships/membership_1`),{...scope});
  await batch.commit();await sealSyntheticRecords(db,owned);
  const service=createFinancialCommands({db,auth,projectId:PROJECT,runtime:deps.runtime});
  return {scope,paths,tokens,request,payment,service};
}
export const command=(type,patch={})=>({id:`${type}_1`,type,policyId:"terms",policyVersion:1,expectedRevision:0,...patch});
export const operation=(command,acceptanceId=null,patch={})=>({command,agreementId:"request_1",acceptanceId,approvalId:null,legacy:null,...patch});
export async function accept(f){
  return f.service.accept(f.tokens.client,f.scope,{id:"consent_1",requestId:f.request.id,requestHash:hash(f.request),policyAccepted:true,acceptedOfferTerms:f.request.requiredOfferTerms});
}
export const receive=(receipt,patch={})=>operation(command("receive",{lotId:"lot_1",purpose:"project_deposit",paymentEvidenceId:"evidence_1",requestId:"request_1",...patch}),receipt.id);
export async function funded(deps,name,options={}){
  const f=await setup(deps,name,options),receipt=await accept(f);await f.service.execute(f.tokens.admin,f.scope,receive(receipt));return {...f,receipt};
}
export async function transferable(deps,name){
  const f=await funded(deps,name,{single:true});
  const ref=deps.db.doc(`${f.paths.values}/lot_1`),value=(await ref.get()).data();
  // Fixture-only trusted provisioning: no generic live value-classification writer.
  value.credit.category="tattoo_credit";value.credit.artistId="artist_1";value.credit.appointmentId=null;await ref.set(value);
  const op=operation(command("transfer",{expectedRevision:1,lotId:"lot_1",targetLotId:"general_1",projectId:"project_1",amountCents:10000}),f.receipt.id,{approvalId:"approval_1"});
  return {...f,op};
}
export async function approve(f,patch={}){
  return f.service.approveTransfer(f.tokens.owner,f.scope,{id:"approval_1",operation:f.op,expiresAt:new Date(Date.now()+60000).toISOString(),...patch});
}

// Synthetic privileged evidence provisioning only. No live producer is activated.
export async function completed(deps,f,patch={}){
  const completion={schemaVersion:1,id:"completion_1",...f.scope,currency:"CAD",appointmentId:"appointment_1",appointmentRevision:1,revision:1,
    projectId:"project_1",artistId:"artist_1",status:"completed",decision:"authorized",tattooServiceCents:30000,settledTattooCents:0,
    supplyFeeCents:15000,taxCents:0,otherCents:0,completedAt:new Date().toISOString(),authorizedAt:new Date().toISOString(),
    actorId:`owner_${f.scope.clientId.slice(7)}`,actorRoleRevision:1,auditId:`completion_audit_${f.scope.clientId}`,...patch};
  await deps.db.doc(principalPath(completion.actorId)).update({actions:["receive","redeem","transfer","approve_transfer","authorize_service_completion"]});
  await sealSyntheticRecords(deps.db,[principalPath(completion.actorId)]);
  await deps.db.doc(`${f.paths.serviceCompletions}/${completion.id}`).create(completion);
  await deps.db.doc(`${f.paths.serviceCompletionHeads}/appointment_1`).set({schemaVersion:1,completionId:completion.id,revision:completion.revision,definitionHash:hash(completion),status:"completed"});
  await deps.db.doc(`financialCommandAudits/${completion.auditId}`).create({schemaVersion:1,...f.scope,action:"authorize_service_completion",
    actorId:completion.actorId,role:"owner",roleRevision:1,recordedAt:completion.authorizedAt,payloadHash:hash(completion),payload:completion});
  await sealSyntheticRecords(deps.db,[`${f.paths.serviceCompletions}/${completion.id}`,`${f.paths.serviceCompletionHeads}/appointment_1`,`financialCommandAudits/${completion.auditId}`]);
  return {completionId:completion.id,revision:completion.revision,definitionHash:hash(completion)};
}
