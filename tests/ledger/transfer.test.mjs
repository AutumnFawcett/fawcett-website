import test from "node:test";
import assert from "node:assert/strict";
import { emptyAccount,post,balances,rebuild } from "../../lib/ledger/engine.mjs";
const scope={clientId:"transfer_test",environment:"sandbox"};
const policy={schemaVersion:1,id:"terms",version:1,status:"approved",currency:"CAD",depositScope:"project",purchasedExpiry:"never",cancellationCredit:"retain",supplyFees:"separate",promotionUse:"explicit",disputeFreeze:"remaining_funding_lot"};
const payment={schemaVersion:1,id:"payment_row",...scope,currency:"CAD",provider:"square",merchantId:"merchant",paymentId:"payment",orderId:"order",locationId:"location",requestId:"request",projectId:"project",amountCents:30000,status:"COMPLETED",sourceType:"CARD",readbackVerified:true,verificationVersion:1,evidenceId:"evidence"};
const request={schemaVersion:1,id:"request",...scope,currency:"CAD",projectId:"project",appointmentId:null,projectApproved:true,purpose:"project_deposit",amountCents:30000,policyId:"terms",policyVersion:1,status:"open"};
const audit=command=>({actorId:"owner",recordedAt:"2026-11-02T00:00:00.000Z",...command});
const fund=()=>post(emptyAccount(scope),audit({id:"receipt",type:"receive",lotId:"restricted",purpose:"project_deposit",payment,request}),policy).state;
const transfer=patch=>audit({id:"transfer",type:"transfer",lotId:"restricted",targetLotId:"general",projectId:"project",amountCents:10000,...patch});
test("purchased transfer preserves money/liability totals and independently rebuilds/reverses",()=>{
  const original=fund(),before=balances(original),after=post(original,transfer(),policy).state;
  assert.deepEqual(balances(after),before);assert.equal(after.lots.restricted.transferredCents,10000);assert.equal(after.lots.general.projectId,null);
  assert.deepEqual(rebuild(scope,after.entries),after);
  const reversed=post(after,audit({id:"reversal",type:"reverse",originalId:"transfer"}),policy).state;
  assert.deepEqual(reversed.lots,original.lots);assert.deepEqual(balances(reversed),before);assert.deepEqual(rebuild(scope,reversed.entries),reversed);
});
test("transfer cannot bypass project scope, reservations, available funds or target uniqueness",()=>{
  const state=fund();
  assert.throws(()=>post(state,transfer({projectId:"other"}),policy),/project_scope/);
  assert.throws(()=>post(state,transfer({amountCents:30001}),policy),/insufficient/);
  const held=post(state,audit({id:"hold",type:"reserve_refund",lotId:"restricted",caseId:"case",amountCents:25000}),policy).state;
  assert.throws(()=>post(held,transfer(),policy),/insufficient/);
  const moved=post(state,transfer(),policy).state;assert.throws(()=>post(moved,transfer({id:"second"}),policy),/invalid_transfer_target/);
});
