import test from "node:test";
import assert from "node:assert/strict";
import {serviceCompletion,attendanceReference,planAttendance} from "../../lib/financial-commands/attendance.mjs";
import {hash} from "../../lib/agreements/contracts.mjs";
const completion={schemaVersion:1,id:"done",clientId:"synthetic",environment:"sandbox",currency:"CAD",appointmentId:"appt",appointmentRevision:1,revision:1,
  projectId:"project",artistId:"artist",status:"completed",decision:"authorized",tattooServiceCents:20000,settledTattooCents:0,supplyFeeCents:15000,taxCents:1750,otherCents:0,
  completedAt:"2026-11-01T00:00:00.000Z",authorizedAt:"2026-11-01T00:01:00.000Z",actorId:"owner",actorRoleRevision:1,auditId:"audit"};
const booking={allocations:[{id:"advance",kind:"tattoo_advance",amountCents:30000}],reviews:[],applications:[]};
test("service evidence is exact versioned CAD integer data with separate fee/tax amounts",()=>{
  assert.deepEqual(serviceCompletion(completion),completion);
  for(const patch of [{schemaVersion:2},{tattooServiceCents:1.5},{currency:"USD"},{status:"cancelled"},{decision:false},{artistId:"../other"},{claimed:true}])
    assert.throws(()=>serviceCompletion({...completion,...patch}),/invalid_contract/);
  assert.throws(()=>serviceCompletion({...completion,settledTattooCents:30000}),/invalid_service_settlement/);
});
test("client attendance input can reference only immutable completion identity/revision/hash",()=>{
  const ref={completionId:"done",revision:1,definitionHash:hash(completion)};
  assert.deepEqual(attendanceReference(ref),ref);
  assert.throws(()=>attendanceReference({...ref,tattooServiceCents:30000}),/invalid_contract/);
  assert.throws(()=>attendanceReference({...ref,completed:true}),/invalid_contract/);
});
test("partial single allocation retains the unused purchased value",()=>{
  const plan=planAttendance(booking,completion,20000,0);
  assert.equal(plan.remainingPurchasedCents,10000);assert.equal(plan.unpaidTattooServiceCents,0);
  assert.deepEqual(plan.allocations,[{id:"advance",kind:"tattoo_advance",appliedCents:20000,remainingCents:10000}]);
  assert.equal(booking.allocations[0].amountCents,30000);
});
test("no implied ordering allocates mixed booking fees and advances on partial attendance",()=>{
  const mixed={...booking,allocations:[{id:"fee",kind:"appointment_booking_fee",amountCents:5000},{id:"advance",kind:"tattoo_advance",amountCents:25000}]};
  assert.equal(planAttendance(mixed,completion,20000,0).outcome,"review_required");
});
test("verified unpaid tattoo value, not fees or proposed amount, caps redemption",()=>{
  assert.throws(()=>planAttendance(booking,completion,30000,0),/attendance_exceeds/);
  assert.throws(()=>planAttendance(booking,completion,10000,15000),/attendance_exceeds/);
  assert.throws(()=>planAttendance({...booking,applications:[{id:"already"}]},completion,10000,0),/booking_closed/);
});
