import "server-only";
import {familyHash,fundingFamilyId,validateFamily,coordinateRisk} from "../funding-family.mjs";
import {id,cents,add,canonical} from "../schemas.mjs";
const check=(ok,why)=>{if(!ok)throw Error(why);};
export const familyPath=familyId=>{check(id(familyId),"invalid_family_id");return `financialFundingFamilies/${familyId}`;};
export const familyIdFromLot=(scope,lot)=>`family_${familyHash([1,scope.environment,"square",lot.funding.merchantId,lot.funding.paymentId])}`;
export function applyFamilyProtection(projection,before,after){
  const delta=add(after?.totals.extraReservedCents||0,-(before?.totals.extraReservedCents||0));
  projection.summary.availablePurchasedCents=add(projection.summary.availablePurchasedCents,-delta);
  projection.summary.reservedPurchasedCents=add(projection.summary.reservedPurchasedCents,delta);
  check(projection.summary.availablePurchasedCents>=0&&projection.summary.reservedPurchasedCents>=0
    &&add(projection.summary.availablePurchasedCents,projection.summary.reservedPurchasedCents)===projection.summary.prepaidLiabilityCents,"family_account_projection_drift");
  return projection;
}
export async function readPostingFamily(tx,db,scope,lots,command){
  const purchased=lots.filter(l=>l.type==="purchased");
  if(command.type!=="receive"&&!purchased.length)return null;
  const familyId=command.type==="receive"?fundingFamilyId(command.payment):familyIdFromLot(scope,purchased[0]);
  check(purchased.every(l=>familyIdFromLot(scope,l)===familyId),"cross_family_posting_forbidden");
  const ref=db.doc(familyPath(familyId)),prior=(await tx.get(ref)).data();
  if(command.type!=="receive"){
    validateFamily(prior,scope);
    for(const lot of purchased)check(canonical(prior.members[lot.id]?.lot)===canonical(lot),"family_lot_projection_mismatch");
  }else check(!prior,"duplicate_provider_source");
  return {ref,prior};
}
export function postingFamilyEvent(prior,next,entry,authorizationEvidenceId,original=null){
  const event={schemaVersion:1,kind:"posting",revision:next.revision,beforeHash:familyHash(prior||null),afterHash:familyHash(next),entry,authorizationEvidenceId,original};
  check(Buffer.byteLength(canonical(event))<=524288,"family_event_size_limit");return event;
}
// Inactive server library, no SDK setup or routes. The injected authorizer must
// verify current server identity/action/client scope on EVERY transaction retry.
export function createFundingFamilyCoordinator({db,authorize,clock=()=>new Date().toISOString()}){
  check(db?.runTransaction&&typeof authorize==="function","server_dependencies_required");
  return {async coordinate(scope,input,principal){
    check(scope&&Object.keys(scope).length===2&&id(scope.clientId)&&["sandbox","production"].includes(scope.environment),"invalid_scope");
    const fields=["id","type","familyId","caseId","amountCents","expectedFamilyRevision"];
    check(input&&Object.keys(input).length===fields.length&&fields.every(k=>Object.hasOwn(input,k))
      &&id(input.id)&&id(input.familyId)&&id(input.caseId)&&cents(input.expectedFamilyRevision)&&input.expectedFamilyRevision>0
      &&["reserve","release_reservation","freeze","release_dispute"].includes(input.type)
      &&(input.type==="reserve"?Number.isSafeInteger(input.amountCents)&&input.amountCents>0:input.amountCents===null),"invalid_family_command");
    const accountId=familyHash([scope.environment,scope.clientId]),accountRef=db.doc(`financialLedgerAccounts/${accountId}`);
    const operationRef=db.doc(`${accountRef.path}/familyOperations/${input.id}`),ref=db.doc(familyPath(input.familyId));
    return db.runTransaction(async tx=>{
      const actor=await authorize(principal,{...scope,operation:structuredClone(input),tx});
      check(actor&&id(actor.actorId)&&id(actor.authorizationEvidenceId),"family_authorization_required");
      const intent=familyHash({scope,input,actorId:actor.actorId});
      const [priorOperation,familySnap,accountSnap]=await tx.getAll(operationRef,ref,accountRef);
      const family=validateFamily(familySnap.data(),scope);check(family.id===input.familyId,"family_reference_mismatch");
      if(priorOperation.exists){const prior=priorOperation.data();check(prior.intent===intent,"family_operation_id_collision");return {...prior.result,duplicate:true};}
      check(family.revision===input.expectedFamilyRevision,"stale_family_revision");
      check(accountSnap.exists,"missing_family_account");
      const result=coordinateRisk(family,scope,input,actor.authorizationEvidenceId),recordedAt=clock();
      check(typeof recordedAt==="string"&&new Date(recordedAt).toISOString()===recordedAt,"invalid_server_time");
      const outcome={outcome:result.outcome,...(result.reason?{reason:result.reason}:{}),...(result.family?{familyRevision:result.family.revision,totals:result.family.totals}:{reason:result.reason})};
      if(result.family){
        const next=applyFamilyProtection(structuredClone(accountSnap.data()),family,result.family);
        next.protectionRevision=add(next.protectionRevision||0,1);
        tx.set(accountRef,next);tx.set(ref,result.family);
        tx.create(db.doc(`${ref.path}/events/risk_${input.id}`),{schemaVersion:1,kind:"risk",revision:result.family.revision,
          beforeHash:familyHash(family),afterHash:familyHash(result.family),command:input,authorizationEvidenceId:actor.authorizationEvidenceId,
          actorId:actor.actorId,recordedAt});
      }
      tx.create(operationRef,{schemaVersion:1,intent,result:outcome,actorId:actor.actorId,authorizationEvidenceId:actor.authorizationEvidenceId,recordedAt});
      if(result.outcome==="review_required")tx.create(db.doc(`${accountRef.path}/familyReviews/${input.id}`),
        {schemaVersion:1,command:input,...scope,familyId:family.id,reason:result.reason,actorId:actor.actorId,authorizationEvidenceId:actor.authorizationEvidenceId,recordedAt});
      return {...outcome,duplicate:false};
    },{maxAttempts:5});
  }};
}
