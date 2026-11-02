import { validateRecord } from "../ledger/schemas.mjs";
import { agreement, policyVersion, policyRef, purchasedCredit, serverContext, record, check, hash, canonical,
  id, reference, timestamp, digest, positiveCents, integer } from "./contracts.mjs";

export const acknowledgmentDefaults = Object.freeze({ policyAccepted: false, marketingOptIn: false });
const same = (a,b) => canonical(a) === canonical(b);
export function acceptPolicy({ request, policy, policyAccepted, acceptedOfferTerms }, context) {
  const a = agreement(request), p = policyVersion(policy), ctx = serverContext(context);
  check(policyAccepted === true && p.status === "published" && same(a.policy, policyRef(p)), "policy_acceptance_required");
  check(ctx.clientId === a.clientId && ctx.actorId === a.clientId && ctx.role === "client" && ctx.environment === a.environment, "acceptance_identity_mismatch");
  check(Array.isArray(acceptedOfferTerms) && same(acceptedOfferTerms, a.requiredOfferTerms), "offer_acceptance_required");
  return { schemaVersion: 1, id: "accept_" + hash([a,ctx]).slice(0,48), clientId: a.clientId, environment: a.environment,
    requestId: a.id, agreementHash: hash(a), policy: policyRef(p), acceptedOfferTerms: structuredClone(acceptedOfferTerms),
    acceptedAt: ctx.now, authorizationEvidenceId: ctx.authorizationEvidenceId };
}
export function requireAcceptance(request, policy, receipt, context) {
  const a = agreement(request), p = policyVersion(policy), ctx = serverContext(context);
  record({ schemaVersion:v=>v===1, id, clientId:id, environment:v=>["sandbox","production"].includes(v),
    requestId:id, agreementHash:digest, policy:reference, acceptedOfferTerms:v=>Array.isArray(v)&&v.every(reference),
    acceptedAt:timestamp, authorizationEvidenceId:id }, receipt);
  check(ctx.clientId === a.clientId && ctx.environment === a.environment && receipt.clientId === a.clientId
    && receipt.environment === a.environment && receipt.requestId === a.id && receipt.agreementHash === hash(a)
    && same(receipt.policy,a.policy) && same(a.policy,policyRef(p)) && p.status === "published"
    && same(receipt.acceptedOfferTerms,a.requiredOfferTerms) && Date.parse(receipt.acceptedAt) <= Date.parse(ctx.now), "stale_or_invalid_acceptance");
  return true;
}
export function createBooking({ request, policy, acceptance, payment, startsAt, lineageId }, context) {
  requireAcceptance(request, policy, acceptance, context);
  const a=agreement(request), ctx=serverContext(context), p=policyVersion(policy), paid=validateRecord("providerTransaction",payment);
  check(id(lineageId) && timestamp(startsAt) && Date.parse(startsAt)>Date.parse(ctx.now), "invalid_booking");
  check(paid.clientId===a.clientId && paid.environment===a.environment && paid.requestId===a.id
    && paid.amountCents===a.totalCents && paid.status==="COMPLETED" && paid.sourceType==="CARD"
    && paid.readbackVerified && paid.verificationVersion===1, "verified_receipt_required");
  return { schemaVersion:1,lineageId,clientId:a.clientId,environment:a.environment,policy:p,
    originalAppointmentId:a.appointmentId, appointment:{id:a.appointmentId,revision:a.appointmentRevision,startsAt},
    fundingEvidenceId:paid.evidenceId, allocations:structuredClone(a.allocations), moves:[], applications:[], reviews:[] };
}
export function reschedule(booking, change, context) {
  const ctx=serverContext(context); policyVersion(booking.policy);
  record({id,fromRevision:integer,appointmentId:id,startsAt:timestamp},change);
  check(ctx.clientId===booking.clientId && ctx.environment===booking.environment,"booking_scope_mismatch");
  const prior=booking.moves.find(m=>m.id===change.id);
  if(prior){check(same(prior.change,change),"reschedule_id_collision");return structuredClone(booking);}
  check(!booking.applications.length&&!booking.reviews.length,"booking_closed_or_under_review");
  check(change.fromRevision===booking.appointment.revision && Date.parse(change.startsAt)>Date.parse(ctx.now),"stale_appointment");
  check(booking.moves.length<1 && Date.parse(booking.appointment.startsAt)-Date.parse(ctx.now)>=168*3600000,"complimentary_reschedule_unavailable");
  const next=structuredClone(booking);
  next.moves.push({id:change.id,change:structuredClone(change),from:next.appointment,receivedAt:ctx.now,actorId:ctx.actorId});
  next.appointment={id:change.appointmentId,revision:booking.appointment.revision+1,startsAt:change.startsAt};
  return next; // Both original allocations carry forward unchanged.
}
export function applyOnAttendance(booking, event, context) {
  const ctx=serverContext(context);
  record({id,appointmentId:id,appointmentRevision:integer,serviceTotalCents:positiveCents},event);
  check(["owner","admin"].includes(ctx.role) && ctx.clientId===booking.clientId && ctx.environment===booking.environment,"attendance_authorization_required");
  const prior=booking.applications.find(a=>a.id===event.id);
  if(prior){check(same(prior.event,event),"attendance_id_collision");return structuredClone(booking);}
  check(!booking.reviews.length,"cancellation_review_pending");
  check(!booking.applications.length && booking.appointment.id===event.appointmentId
    && booking.appointment.revision===event.appointmentRevision,"already_applied_or_stale");
  check(booking.allocations.reduce((n,a)=>n+a.amountCents,0)<=event.serviceTotalCents,"excess_requires_review");
  const next=structuredClone(booking);
  next.applications.push({id:event.id,event:structuredClone(event),allocationIds:booking.allocations.map(a=>a.id),actorId:ctx.actorId,recordedAt:ctx.now});
  return next; // An allocation decision only, never a ledger posting.
}
export function planStudioTransfer(credit, transfer, policy, context) {
  const c=purchasedCredit(credit),p=policyVersion(policy),ctx=serverContext(context);
  record({id,sourceId:id,amountCents:positiveCents,ownerApprovalId:v=>v===null||id(v)},transfer);
  check(ctx.clientId===c.clientId && ctx.environment===c.environment && transfer.sourceId===c.id
    && same(c.policy,policyRef(p)) && p.status==="published" && p.advanceToStudio,"transfer_policy_required");
  check(c.category!=="appointment_booking_fee","booking_fee_requires_review");
  const restricted=!!(c.artistId||c.projectId||c.appointmentId);
  check(!restricted||(ctx.role==="owner"&&id(transfer.ownerApprovalId)),"owner_approval_required");
  check(transfer.amountCents<=c.remainingCents-c.reservedCents,"insufficient_eligible_value");
  return {schemaVersion:1,...structuredClone(transfer),clientId:c.clientId,environment:c.environment,
    sourceFingerprint:hash(c),policy:policyRef(p),targetCategory:"studio_credit",fundingEvidenceId:c.fundingEvidenceId,
    amountRemovedCents:transfer.amountCents,amountAddedCents:transfer.amountCents,actorId:ctx.actorId,recordedAt:ctx.now};
}
export function cancellationReview(booking, event, context) {
  const ctx=serverContext(context);
  record({id,appointmentRevision:integer,reasonCode:id},event);
  check(!booking.applications.length,"already_applied");
  check(ctx.clientId===booking.clientId && ctx.environment===booking.environment
    && event.appointmentRevision===booking.appointment.revision,"stale_cancellation");
  const prior=booking.reviews.find(r=>r.id===event.id);
  if(prior){check(same(prior.event,event),"review_id_collision");return structuredClone(booking);}
  const next=structuredClone(booking);
  next.reviews.push({id:event.id,event:structuredClone(event),policy:policyRef(booking.policy),appointment:structuredClone(booking.appointment),
    receivedAt:ctx.now,actorId:ctx.actorId,status:"pending_review",compensationCents:null,
    cancellationChargeId:null,replacementDiscountId:null,exceptionId:null,refundId:null});
  return next; // No forfeiture, refund or balance mutation.
}
