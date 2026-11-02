import test from "node:test";
import assert from "node:assert/strict";
import { hash, policyVersion, offerVersion, purchasedCredit } from "../../lib/agreements/contracts.mjs";
import { acknowledgmentDefaults, acceptPolicy, requireAcceptance, createBooking, reschedule, applyOnAttendance, planStudioTransfer, cancellationReview } from "../../lib/agreements/policy.mjs";
import { emptyOffers, assignOffer, acceptOffer, qualifyOffer, expireOffer, redeemOffer, redeemAtomically } from "../../lib/agreements/offers.mjs";
const now="2026-11-01T12:00:00.000Z";
const client={actorId:"client_test",clientId:"client_test",environment:"sandbox",role:"client",now,authorizationEvidenceId:"auth_test"};
const owner={...client,actorId:"owner_test",role:"owner"};
const policy={schemaVersion:1,id:"policy_1",version:1,content:"Appointment booking and payment policy version 1",contentHash:hash("Appointment booking and payment policy version 1"),
  status:"published",legalReview:"pending",accountingReview:"pending",complimentaryNoticeHours:168,complimentaryReschedules:1,automaticForfeiture:false,advanceToStudio:true};
const ref={id:policy.id,version:policy.version,contentHash:policy.contentHash};
const request={schemaVersion:1,id:"request_1",clientId:client.clientId,environment:"sandbox",currency:"CAD",revision:1,
  appointmentId:"appointment_1",appointmentRevision:1,policy:ref,allocations:[{id:"booking_fee",kind:"appointment_booking_fee",amountCents:5000},{id:"advance",kind:"tattoo_advance",amountCents:20000}],requiredOfferTerms:[],totalCents:25000};
const payment={schemaVersion:1,id:"payment_row",environment:"sandbox",currency:"CAD",provider:"square",merchantId:"merchant_test",paymentId:"payment_test",
  orderId:"order_test",locationId:"location_test",requestId:request.id,clientId:client.clientId,projectId:"project_test",amountCents:25000,
  status:"COMPLETED",sourceType:"CARD",readbackVerified:true,verificationVersion:1,evidenceId:"evidence_test"};
const accept=(r=request,p=policy)=>acceptPolicy({request:r,policy:p,policyAccepted:true,acceptedOfferTerms:r.requiredOfferTerms},client);
const booking=()=>createBooking({request,policy,acceptance:accept(),payment,startsAt:"2026-11-08T12:00:00.000Z",lineageId:"lineage_1"},client);
const move={id:"move_1",fromRevision:1,appointmentId:"appointment_2",startsAt:"2026-12-01T12:00:00.000Z"};
const offer=(patch={})=>({schemaVersion:1,id:"offer_1",version:1,type:"conditional_discount",terms:"Conditional offer terms",termsHash:hash("Conditional offer terms"),
  startsAt:now,expiresAt:"2026-12-01T12:00:00.000Z",serviceIds:["tattoo"],artistIds:["artist_1"],qualifyingCents:20000,maxRedemptions:1,
  stackGroup:null,allowStackWith:[],discountCents:10000,entitlementCode:null,...patch});
const assigned=(o=offer())=>assignOffer(emptyOffers(client.clientId,"sandbox"),o,"assignment_1","request_1",owner);
const ready=(o=offer())=>qualifyOffer(acceptOffer(assigned(o),"assignment_1",true,client),"assignment_1",payment,owner);
const decision=(patch={})=>({id:"redeem_1",assignmentId:"assignment_1",lineageId:"lineage_1",appointmentId:"appointment_1",appointmentRevision:1,serviceId:"tattoo",artistId:"artist_1",...patch});
const credit=(patch={})=>({schemaVersion:1,id:"credit_1",clientId:client.clientId,environment:"sandbox",currency:"CAD",category:"appointment_advance",revision:0,acceptanceEvidenceId:"acceptance_test",remainingCents:30000,
  reservedCents:0,artistId:null,projectId:"project_test",appointmentId:"appointment_1",fundingEvidenceId:"evidence_test",policy:ref,...patch});

test("booking acknowledgment defaults are unchecked and exact affirmative acceptance is required",()=>{
  assert.deepEqual(acknowledgmentDefaults,{policyAccepted:false,marketingOptIn:false});
  for(const policyAccepted of [undefined,false,"true",1])assert.throws(()=>acceptPolicy({request,policy,policyAccepted,acceptedOfferTerms:[]},client));
  assert.equal(requireAcceptance(request,policy,accept(),owner),true);
  assert.throws(()=>acceptPolicy({request,policy,policyAccepted:true,acceptedOfferTerms:[]},{...client,actorId:"other"}));
  assert.equal(Object.hasOwn(accept(),"marketingOptIn"),false);
});
test("stale request, allocation amounts, client, environment, appointment revision and policy invalidate consent",()=>{
  const receipt=accept();
  for(const patch of [{revision:2},{appointmentRevision:2},{appointmentId:"other"},{clientId:"other"},{environment:"production"},
    {allocations:[{...request.allocations[0],amountCents:6000},request.allocations[1]],totalCents:26000}]){
    assert.throws(()=>requireAcceptance({...request,...patch},policy,receipt,owner));
  }
  assert.throws(()=>requireAcceptance(request,policy,{...receipt,agreementHash:"a".repeat(64)},owner));
  assert.throws(()=>requireAcceptance(request,policy,{...receipt,acceptedAt:"2027-01-01T00:00:00.000Z"},owner));
  const changed={...policy,version:2,content:"new terms",contentHash:hash("new terms")};
  assert.throws(()=>requireAcceptance(request,changed,receipt,owner));
  assert.equal(receipt.policy.version,1);
});
test("offer terms need separate exact consent and policy payload tampering fails",()=>{
  const r={...request,requiredOfferTerms:[{id:"offer_1",version:1,contentHash:hash("terms")}]};
  assert.throws(()=>acceptPolicy({request:r,policy,policyAccepted:true,acceptedOfferTerms:[]},client));
  assert.ok(accept(r));
  assert.throws(()=>policyVersion({...policy,content:"silently changed"}));
  assert.throws(()=>policyVersion({...policy,automaticForfeiture:true}));
});
test("separate booking fee and advance require a matching verified receipt",()=>{
  const b=booking();assert.equal(b.allocations.length,2);assert.equal(b.allocations[0].kind,"appointment_booking_fee");
  for(const patch of [{status:"FAILED"},{sourceType:"EXTERNAL"},{readbackVerified:false},{amountCents:25001},{requestId:"wrong"},{environment:"production"}]){
    assert.throws(()=>createBooking({request,policy,acceptance:accept(),payment:{...payment,...patch},startsAt:"2026-11-08T12:00:00.000Z",lineageId:"lineage_1"},client));
  }
});
test("168-hour rescheduling carries both allocations, retains lineage and cannot reset allowance",()=>{
  const b=booking(),next=reschedule(b,move,client);
  assert.deepEqual(next.allocations,b.allocations);assert.equal(next.lineageId,b.lineageId);assert.equal(next.moves[0].from.id,"appointment_1");
  assert.deepEqual(reschedule(next,move,client),next);
  assert.throws(()=>reschedule(b,move,{...client,now:"2026-11-01T12:00:00.001Z"}),/unavailable/);
  assert.throws(()=>reschedule(next,{...move,id:"move_2",fromRevision:2,appointmentId:"appointment_3",startsAt:"2027-01-01T12:00:00.000Z"},client),/unavailable/);
  assert.throws(()=>reschedule(b,{...move,fromRevision:2},client),/stale/);
  assert.equal(b.moves.length,0);
});
test("attendance applies both allocations once and excess value requires review",()=>{
  const b=booking(),event={id:"attendance",appointmentId:"appointment_1",appointmentRevision:1,serviceTotalCents:50000};
  const next=applyOnAttendance(b,event,owner);
  assert.deepEqual(next.applications[0].allocationIds,["booking_fee","advance"]);
  assert.deepEqual(applyOnAttendance(next,event,owner),next);
  assert.throws(()=>applyOnAttendance(next,{...event,id:"another"},owner));
  assert.throws(()=>applyOnAttendance(b,{...event,serviceTotalCents:20000},owner));
  assert.throws(()=>applyOnAttendance(b,event,client));
});
test("cancellation is review-only and retains unused purchased allocations",()=>{
  const b=booking(),event={id:"cancel_1",appointmentRevision:1,reasonCode:"client_request"};
  const next=cancellationReview(b,event,client);
  assert.deepEqual(next.allocations,b.allocations);assert.equal(next.reviews[0].compensationCents,null);
  assert.equal(next.reviews[0].policy.contentHash,ref.contentHash);
  assert.deepEqual(cancellationReview(next,event,client),next);
});
test("restricted transfers need owner approval and accepted policy; no balance posting occurs",()=>{
  const c=credit(),t={id:"transfer_1",sourceId:c.id,amountCents:10000,ownerApprovalId:null};
  assert.throws(()=>planStudioTransfer(c,t,policy,client),/owner/);
  assert.throws(()=>planStudioTransfer(c,t,policy,owner),/owner/);
  const plan=planStudioTransfer(c,{...t,ownerApprovalId:"approval_1"},policy,owner);
  assert.equal(plan.amountRemovedCents,plan.amountAddedCents);assert.equal(c.remainingCents,30000);
  assert.throws(()=>planStudioTransfer(credit({reservedCents:25000}),{...t,ownerApprovalId:"approval_1"},policy,owner),/insufficient/);
  assert.throws(()=>planStudioTransfer(credit({category:"appointment_booking_fee"}),{...t,ownerApprovalId:"approval_1"},policy,owner),/review/);
  assert.throws(()=>purchasedCredit(credit({category:"studio_credit"})),/restricted/);
});
test("all three offer types are non-cash and bonus-credit/conversion types reject",()=>{
  for(const type of ["conditional_discount","loyalty_benefit","service_entitlement"]){
    const o=offer({type,...(type==="conditional_discount"?{}:{discountCents:0,entitlementCode:"service_reward"})});assert.ok(offerVersion(o));
  }
  for(const type of ["bonus_credit","convert_to_credit"])assert.throws(()=>offerVersion(offer({type})));
  assert.throws(()=>offerVersion(offer({bonusCreditCents:10000})));
});
test("failed, foreign, pending and external qualifying payments cannot activate an offer",()=>{
  const s=acceptOffer(assigned(),"assignment_1",true,client);
  for(const patch of [{status:"FAILED"},{status:"PENDING"},{sourceType:"EXTERNAL"},{clientId:"other"},{requestId:"other"},{readbackVerified:false},{amountCents:100}]){
    assert.throws(()=>qualifyOffer(s,"assignment_1",{...payment,...patch},owner));
  }
  assert.throws(()=>redeemOffer(s,decision(),owner),/qualifying/);
  assert.equal(s.assignments[0].qualification,null);
});
test("expiry affects only the benefit and never converts discount to purchased value",()=>{
  const s=ready(),funds=credit(),before=structuredClone(funds),ctx={...owner,now:offer().expiresAt};
  const next=expireOffer(s,"assignment_1",ctx);
  assert.throws(()=>redeemOffer(next,decision(),ctx),/active/);
  assert.deepEqual(funds,before);assert.equal(funds.remainingCents,30000);
  assert.equal(Object.hasOwn(next,"credit"),false);
  assert.throws(()=>expireOffer(s,"assignment_1",owner),/not_expired/);
});
test("redemption enforces consent, service/artist eligibility, duplicate ID and redemption limit",()=>{
  assert.throws(()=>redeemOffer(assigned(),decision(),owner));
  const s=ready();
  for(const patch of [{artistId:"other"},{serviceId:"other"}])assert.throws(()=>redeemOffer(s,decision(patch),owner));
  const first=redeemOffer(s,decision(),owner);
  assert.equal(first.redemption.discountCents,10000);assert.equal(redeemOffer(first.state,decision(),owner).duplicate,true);
  assert.throws(()=>redeemOffer(first.state,decision({id:"another"}),owner),/limit/);
  assert.throws(()=>redeemOffer(first.state,decision({artistId:"other"}),owner),/collision/);
});
test("offer snapshots and assignment history cannot silently change or reset redemption counts",()=>{
  const s=ready();assert.throws(()=>assignOffer(s,offer(),"second_assignment","request_1",owner),/duplicate/);
  const tampered=structuredClone(s);tampered.assignments[0].offer.discountCents++;
  assert.throws(()=>redeemOffer(tampered,decision(),owner),/snapshot/);
  const next=assignOffer(s,offer({version:2,terms:"version2",termsHash:hash("version2")}),"assignment_2","request_1",owner);
  assert.equal(next.assignments[0].offer.version,1);assert.equal(next.assignments[0].acceptance.termsHash,offer().termsHash);
  assert.equal(next.assignments[1].acceptance,null);
});
test("stacking defaults to deny and explicit mutual permission is required across assignments",()=>{
  let s=ready();
  s=assignOffer(s,offer({id:"offer_2"}),"assignment_2","request_1",owner);
  s=acceptOffer(s,"assignment_2",true,client);s=qualifyOffer(s,"assignment_2",payment,owner);
  s=redeemOffer(s,decision(),owner).state;
  assert.throws(()=>redeemOffer(s,decision({id:"second",assignmentId:"assignment_2"}),owner),/stacking/);
  let allowed=ready(offer({allowStackWith:["offer_2"]}));
  allowed=assignOffer(allowed,offer({id:"offer_2",allowStackWith:["offer_1"]}),"assignment_2","request_1",owner);
  allowed=qualifyOffer(acceptOffer(allowed,"assignment_2",true,client),"assignment_2",payment,owner);
  allowed=redeemOffer(allowed,decision(),owner).state;
  assert.equal(redeemOffer(allowed,decision({id:"second",assignmentId:"assignment_2"}),owner).state.redemptions.length,2);
});
function store(initial){let current=structuredClone(initial),tail=Promise.resolve();return {
  snapshot:()=>structuredClone(current),
  async transaction(scope,callback){const prior=tail;let release;tail=new Promise(resolve=>{release=resolve;});await prior;
    try{assert.equal(scope.clientId,current.clientId);let staged=current;
      const result=await callback({read:async()=>structuredClone(current),commit:async(next,revision)=>{assert.equal(current.revision,revision);staged=structuredClone(next);}});
      current=staged;return result;
    }finally{release();}}
};}
test("concurrent redemption decisions serialize on a shared client revision",async()=>{
  const db=store(ready());const results=await Promise.allSettled(["first","second"].map(id=>redeemAtomically(db,{clientId:client.clientId},decision({id}),owner)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(db.snapshot().redemptions.length,1);
});
test("concurrent identical delivery returns the original redemption once",async()=>{
  const db=store(ready());const results=await Promise.all([1,2].map(()=>redeemAtomically(db,{clientId:client.clientId},decision(),owner)));
  assert.equal(results.filter(r=>r.duplicate).length,1);assert.equal(db.snapshot().redemptions.length,1);
});

test("completed or cancellation-review bookings cannot silently reschedule/apply again",()=>{
  const b=booking(),cancel={id:"cancel_1",appointmentRevision:1,reasonCode:"client_request"};
  const reviewed=cancellationReview(b,cancel,client);
  assert.throws(()=>reschedule(reviewed,move,client),/review/);
  assert.throws(()=>applyOnAttendance(reviewed,{id:"attend",appointmentId:"appointment_1",appointmentRevision:1,serviceTotalCents:50000},owner),/review/);
  const attended=applyOnAttendance(b,{id:"attend",appointmentId:"appointment_1",appointmentRevision:1,serviceTotalCents:50000},owner);
  assert.throws(()=>reschedule(attended,move,client),/closed/);
  assert.throws(()=>cancellationReview(attended,cancel,client),/applied/);
});
test("transfer policy mismatch and booked fee never silently become unrestricted credit",()=>{
  const t={id:"transfer",sourceId:"credit_1",amountCents:10000,ownerApprovalId:"approval_1"};
  assert.throws(()=>planStudioTransfer(credit(),t,{...policy,version:2},owner),/policy/);
  assert.throws(()=>planStudioTransfer(credit(),t,{...policy,advanceToStudio:false},owner),/policy/);
  const free=credit({category:"studio_credit",projectId:null,appointmentId:null});
  assert.equal(planStudioTransfer(free,{...t,ownerApprovalId:null},policy,client).amountAddedCents,10000);
});
