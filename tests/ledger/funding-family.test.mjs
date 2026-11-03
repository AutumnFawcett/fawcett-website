import test from "node:test";
import assert from "node:assert/strict";
import {emptyAccount,post,rebuild} from "../../lib/ledger/engine.mjs";
import {fundingFamilyId,coordinatePosting,coordinateRisk,familyHash,rebuildFundingFamily,protectedBalances,FAMILY_LIMITS} from "../../lib/ledger/funding-family.mjs";
const scope={clientId:"synthetic_family",environment:"sandbox"};
const policy={schemaVersion:1,id:"terms",version:1,status:"approved",currency:"CAD",depositScope:"project",purchasedExpiry:"never",cancellationCredit:"retain",supplyFees:"separate",promotionUse:"explicit",disputeFreeze:"remaining_funding_lot"};
const payment={schemaVersion:1,id:"row",...scope,currency:"CAD",provider:"square",merchantId:"merchant",paymentId:"payment",orderId:"order",locationId:"location",requestId:"request",projectId:"project",amountCents:30000,status:"COMPLETED",sourceType:"CARD",readbackVerified:true,verificationVersion:1,evidenceId:"evidence"};
const request={schemaVersion:1,id:"request",...scope,currency:"CAD",projectId:"project",appointmentId:null,projectApproved:true,purpose:"project_deposit",amountCents:30000,policyId:"terms",policyVersion:1,status:"open"};
function fixture(){
  let state=emptyAccount(scope),family=null;const events=[];
  const apply=command=>{
    const original=command.type==="reverse"?state.entries.find(e=>e.id===command.originalId):null;
    const result=post(state,{actorId:"trusted",recordedAt:"2026-11-03T00:00:00.000Z",...command},policy);
    const next=coordinatePosting(family,result.entry,"audit",original);
    events.push({schemaVersion:1,kind:"posting",entry:result.entry,original,authorizationEvidenceId:"audit",beforeHash:familyHash(family),afterHash:familyHash(next)});
    state=result.state;family=next;return result.entry;
  };
  const risk=command=>{const result=coordinateRisk(family,scope,command,"audit");if(result.family){events.push({schemaVersion:1,kind:"risk",command,authorizationEvidenceId:"audit",beforeHash:familyHash(family),afterHash:familyHash(result.family)});family=result.family;}return result;};
  apply({id:"receipt",type:"receive",lotId:"root",purpose:"project_deposit",payment,request});
  return {apply,risk,get state(){return state;},get family(){return family;},events};
}
const transfer=(id,target,amount)=>({id,type:"transfer",lotId:"root",targetLotId:target,projectId:"project",amountCents:amount});
const redeem=(amount=10000)=>({id:"spend",type:"redeem",lotId:"root",projectId:"project",appointmentId:"appointment",amountCents:amount,purpose:"tattoo_service",creditType:"purchased"});

test("family identity uses trusted provider/environment/merchant/payment, never amount or email",()=>{
  assert.equal(fundingFamilyId(payment),fundingFamilyId({...payment,amountCents:1}));
  for(const patch of [{paymentId:"other"},{merchantId:"other"},{environment:"production"}])assert.notEqual(fundingFamilyId(payment),fundingFamilyId({...payment,...patch}));
});
test("split descendants preserve one receipt, exact source and independent reconstruction",()=>{
  const f=fixture();f.apply(transfer("move_1","child_1",10000));f.apply(transfer("move_2","child_2",5000));
  assert.equal(Object.keys(f.family.members).length,3);assert.equal(f.family.totals.availableCents,30000);
  assert.equal(f.family.members.child_1.parentLotId,"root");assert.equal(f.family.members.child_1.createdBy,"move_1");
  const reconstructed=rebuildFundingFamily(scope,f.events);assert.deepEqual(reconstructed,f.family);
  assert.equal(protectedBalances(rebuild(scope,f.state.entries),[reconstructed]).collectedPaymentsCents,30000);
});
test("family reservation/dispute union never double deducts or releases another hold",()=>{
  const f=fixture();f.apply(transfer("move","child",10000));
  f.risk({type:"reserve",caseId:"refund",amountCents:10000});f.risk({type:"freeze",caseId:"dispute"});
  assert.equal(f.family.totals.reservedCents,30000);
  f.risk({type:"release_reservation",caseId:"refund"});assert.equal(f.family.totals.availableCents,0);
  assert.throws(()=>f.risk({type:"release_dispute",caseId:"wrong"}),/family_coordinator_dispute_required/);
  f.risk({type:"release_dispute",caseId:"dispute"});assert.equal(f.family.totals.availableCents,30000);
});
test("all descendants freeze even when only the empty original lot has a dispute",()=>{
  const f=fixture();f.apply(transfer("move","child",30000));f.apply({id:"freeze",type:"freeze_dispute",lotId:"root",caseId:"case"});
  assert.equal(f.family.totals.availableCents,0);assert.equal(f.family.totals.extraReservedCents,30000);
  assert.equal(protectedBalances(f.state,[f.family]).reservedPurchasedCents,30000);
  assert.throws(()=>f.apply({...redeem(),lotId:"child"}),/transferred_value_redemption_not_enabled/);
});
test("family availability guards spending and transfer while preserving purchased value",()=>{
  const f=fixture();f.risk({type:"reserve",caseId:"hold",amountCents:25000});
  assert.throws(()=>f.apply(redeem()),/family_value_requires_review/);
  assert.throws(()=>f.apply(transfer("move","child",1000)),/family_hold_blocks_transfer/);
  assert.equal(f.family.totals.unspentCents,30000);
});
test("consumed value yields review; dispute still freezes the actual unspent remainder",()=>{
  const f=fixture();f.apply(redeem(20000));
  assert.equal(f.risk({type:"reserve",caseId:"refund",amountCents:20000}).outcome,"review_required");
  const result=f.risk({type:"freeze",caseId:"dispute"});assert.equal(result.reason,"dispute_includes_consumed_value");
  assert.equal(f.family.totals.disputedCents,10000);assert.equal(f.family.totals.usedCents,20000);
});
test("transfer and redemption reversals reconstruct value without rewriting original provenance",()=>{
  const f=fixture();f.apply(transfer("move","child",5000));f.apply({id:"undo_move",type:"reverse",originalId:"move"});
  f.apply(redeem());f.apply({id:"undo_spend",type:"reverse",originalId:"spend"});
  assert.equal(f.family.totals.availableCents,30000);assert.deepEqual(rebuildFundingFamily(scope,f.events),f.family);
});
test("bounded family/case limits and cross-scope reconciliation fail closed",()=>{
  const f=fixture();for(let i=0;i<FAMILY_LIMITS.cases;i++)f.risk({type:"freeze",caseId:`dispute_${i}`});
  assert.throws(()=>f.risk({type:"freeze",caseId:"too_many"}),/funding_family_limit/);
  assert.throws(()=>coordinateRisk(f.family,{...scope,clientId:"other"},{type:"freeze",caseId:"a"},"audit"),/invalid_funding_family/);
  assert.throws(()=>protectedBalances(f.state,[]),/missing_funding_family/);
  const changed=structuredClone(f.events);changed[0].afterHash=familyHash("tampered");assert.throws(()=>rebuildFundingFamily(scope,changed),/family_reconstruction_mismatch/);
});
