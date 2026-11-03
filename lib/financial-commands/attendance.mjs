// Versioned, inert service evidence/planning contracts. No browser or SDK writes.
import { record, check, id, integer, cents, positiveCents, timestamp, digest, hash, add } from "../agreements/contracts.mjs";
export function serviceCompletion(value) {
  const result=record({schemaVersion:v=>v===1,id,clientId:id,environment:v=>["sandbox","production"].includes(v),currency:v=>v==="CAD",
    appointmentId:id,appointmentRevision:integer,revision:integer,projectId:id,artistId:id,
    status:v=>v==="completed",decision:v=>v==="authorized",tattooServiceCents:cents,settledTattooCents:cents,supplyFeeCents:cents,taxCents:cents,otherCents:cents,
    completedAt:timestamp,authorizedAt:timestamp,actorId:id,actorRoleRevision:integer,auditId:id},value);
  check(result.settledTattooCents<=result.tattooServiceCents,"invalid_service_settlement");
  return result;
}
export function completionHead(value) {
  return record({schemaVersion:v=>v===1,completionId:id,revision:integer,definitionHash:digest,status:v=>v==="completed"},value);
}
export function attendanceReference(value) {
  return record({completionId:id,revision:integer,definitionHash:digest},value);
}
export function planAttendance(booking, completion, amountCents, alreadyAppliedCents) {
  check(positiveCents(amountCents)&&cents(alreadyAppliedCents),"invalid_attendance_amount");
  check(!booking.reviews.length&&!booking.applications.length,"booking_closed_or_under_review");
  const prepaid=booking.allocations.reduce((n,a)=>add(n,a.amountCents),0);
  const unpaid=add(add(completion.tattooServiceCents,-completion.settledTattooCents),-alreadyAppliedCents);
  check(unpaid>=0,"service_projection_drift");
  check(amountCents<=prepaid&&amountCents<=unpaid,"attendance_exceeds_eligible_or_service_value");
  if(booking.allocations.length>1&&amountCents!==prepaid)
    return {outcome:"review_required",reason:"ambiguous_booking_allocation",prepaidCents:prepaid,unpaidTattooServiceCents:unpaid};
  const allocations=booking.allocations.map(a=>({id:a.id,kind:a.kind,appliedCents:booking.allocations.length===1?amountCents:a.amountCents,
    remainingCents:booking.allocations.length===1?add(a.amountCents,-amountCents):0}));
  return {outcome:"applied",allocations,appliedCents:amountCents,remainingPurchasedCents:add(prepaid,-amountCents),
    unpaidTattooServiceCents:add(unpaid,-amountCents),completionHash:hash(completion)};
}
