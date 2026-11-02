import { validateRecord } from "../ledger/schemas.mjs";
import { offerVersion, serverContext, record, id, integer, check, hash, canonical } from "./contracts.mjs";
const same=(a,b)=>canonical(a)===canonical(b);
export function emptyOffers(clientId,environment){
  check(id(clientId)&&["sandbox","production"].includes(environment),"invalid_offer_scope");
  return {schemaVersion:1,clientId,environment,revision:0,assignments:[],redemptions:[]};
}
function scope(state,ctx){check(state.clientId===ctx.clientId&&state.environment===ctx.environment,"offer_scope_mismatch");}
function assignment(state,assignmentId){
  const a=state.assignments.find(a=>a.id===assignmentId);check(a,"unknown_assignment");
  offerVersion(a.offer);check(a.definitionHash===hash(a.offer),"offer_snapshot_changed");return a;
}
export function assignOffer(state,offer,assignmentId,qualifyingRequestId,context){
  const o=offerVersion(offer),ctx=serverContext(context);scope(state,ctx);
  check(["owner","admin"].includes(ctx.role)&&id(assignmentId)
    && (o.qualifyingCents===0?qualifyingRequestId===null:id(qualifyingRequestId)),"assignment_authorization_required");
  const prior=state.assignments.find(a=>a.id===assignmentId);
  if(prior){check(prior.definitionHash===hash(o)&&prior.qualifyingRequestId===qualifyingRequestId,"assignment_id_collision");return structuredClone(state);}
  check(!state.assignments.some(a=>a.offer.id===o.id&&a.offer.version===o.version),"duplicate_offer_assignment");
  const next=structuredClone(state);next.revision++;
  next.assignments.push({schemaVersion:1,id:assignmentId,offer:o,definitionHash:hash(o),qualifyingRequestId,
    assignedAt:ctx.now,assignedBy:ctx.actorId,acceptance:null,qualification:null,expiredAt:null});return next;
}
export function acceptOffer(state,assignmentId,accepted,context){
  const ctx=serverContext(context);scope(state,ctx);const a=assignment(state,assignmentId);
  check(ctx.role==="client"&&ctx.actorId===state.clientId&&accepted===true,"offer_acceptance_required");
  check(Date.parse(ctx.now)<Date.parse(a.offer.expiresAt)&&!a.expiredAt,"offer_expired");
  if(a.acceptance)return structuredClone(state);
  const next=structuredClone(state),target=next.assignments.find(a=>a.id===assignmentId);next.revision++;
  target.acceptance={schemaVersion:1,offerId:a.offer.id,offerVersion:a.offer.version,definitionHash:a.definitionHash,
    termsHash:a.offer.termsHash,acceptedAt:ctx.now,clientId:ctx.clientId,authorizationEvidenceId:ctx.authorizationEvidenceId};return next;
}
export function qualifyOffer(state,assignmentId,payment,context){
  const ctx=serverContext(context);scope(state,ctx);const a=assignment(state,assignmentId);
  const p=validateRecord("providerTransaction",payment);
  check(["owner","admin"].includes(ctx.role)&&p.clientId===state.clientId&&p.environment===state.environment
    &&p.requestId===a.qualifyingRequestId&&p.status==="COMPLETED"&&p.sourceType==="CARD"
    &&p.readbackVerified&&p.verificationVersion===1&&p.amountCents>=a.offer.qualifyingCents,"qualifying_payment_required");
  check(!a.expiredAt&&Date.parse(ctx.now)<Date.parse(a.offer.expiresAt),"offer_expired");
  if(a.qualification){check(same(a.qualification,p),"qualification_collision");return structuredClone(state);}
  const next=structuredClone(state);next.revision++;next.assignments.find(a=>a.id===assignmentId).qualification=p;return next;
}
export function expireOffer(state,assignmentId,context){
  const ctx=serverContext(context);scope(state,ctx);const a=assignment(state,assignmentId);
  check(["owner","admin"].includes(ctx.role)&&Date.parse(ctx.now)>=Date.parse(a.offer.expiresAt),"not_expired");
  if(a.expiredAt)return structuredClone(state);
  const next=structuredClone(state);next.revision++;next.assignments.find(a=>a.id===assignmentId).expiredAt=ctx.now;return next;
}
// A pure redemption decision; no credit issuance, Square request or database write.
export function redeemOffer(state,decision,context){
  const ctx=serverContext(context);scope(state,ctx);
  record({id,assignmentId:id,lineageId:id,appointmentId:id,appointmentRevision:integer,serviceId:id,artistId:id},decision);
  check(["owner","admin"].includes(ctx.role),"redemption_authorization_required");
  const prior=state.redemptions.find(r=>r.id===decision.id);
  if(prior){check(same(prior.decision,decision),"redemption_id_collision");return {state:structuredClone(state),redemption:structuredClone(prior),duplicate:true};}
  const a=assignment(state,decision.assignmentId),o=a.offer;
  check(a.acceptance&&a.acceptance.definitionHash===a.definitionHash,"offer_acceptance_required");
  check(o.qualifyingCents===0||a.qualification,"qualifying_payment_required");
  check(!a.expiredAt&&Date.parse(ctx.now)>=Date.parse(o.startsAt)&&Date.parse(ctx.now)<Date.parse(o.expiresAt),"offer_not_active");
  check((!o.serviceIds.length||o.serviceIds.includes(decision.serviceId))&&(!o.artistIds.length||o.artistIds.includes(decision.artistId)),"offer_ineligible");
  check(state.redemptions.filter(r=>r.offerId===o.id&&r.offerVersion===o.version).length<o.maxRedemptions,"redemption_limit");
  const sameBooking=state.redemptions.filter(r=>r.decision.lineageId===decision.lineageId);
  for(const r of sameBooking){
    check(r.offerId!==o.id&&!(o.stackGroup&&o.stackGroup===r.stackGroup)
      &&o.allowStackWith.includes(r.offerId)&&r.allowStackWith.includes(o.id),"stacking_not_allowed");
  }
  const redemption={schemaVersion:1,id:decision.id,decision:structuredClone(decision),clientId:ctx.clientId,environment:ctx.environment,
    offerId:o.id,offerVersion:o.version,definitionHash:a.definitionHash,termsHash:o.termsHash,
    type:o.type,discountCents:o.discountCents,entitlementCode:o.entitlementCode,stackGroup:o.stackGroup,
    allowStackWith:structuredClone(o.allowStackWith),qualifyingEvidenceId:a.qualification?.evidenceId||null,
    actorId:ctx.actorId,recordedAt:ctx.now};
  const next=structuredClone(state);next.revision++;next.redemptions.push(redemption);return {state:next,redemption,duplicate:false};
}
// Port requires a shared CLIENT revision and create-only decision IDs. A future
// Firestore adapter must retry conflicting transactions; no adapter included.
export async function redeemAtomically(store,clientScope,decision,context){
  return store.transaction(clientScope,async tx=>{
    const state=await tx.read();const result=redeemOffer(state,decision,context);
    if(!result.duplicate)await tx.commit(result.state,state.revision);
    return result;
  });
}
