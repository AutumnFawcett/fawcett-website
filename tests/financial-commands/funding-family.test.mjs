import {sealSyntheticRecords} from "./security-fixture.mjs";
import test,{after} from "node:test";
import assert from "node:assert/strict";
import {emulatorDependencies,funded,transferable,approve,operation,command,PROJECT} from "./fixture.mjs";
import {createFirestoreLedger,ledgerPaths,evidencePath} from "../../lib/ledger/server/firestore.mjs";
import {createFundingFamilyCoordinator,familyPath} from "../../lib/ledger/server/funding-family.mjs";
import {fundingFamilyId,rebuildFundingFamily,protectedBalances} from "../../lib/ledger/funding-family.mjs";
import {rebuild} from "../../lib/ledger/engine.mjs";
import {principalPath,createFinancialCommands} from "../../lib/financial-commands/service.mjs";
const deps=emulatorDependencies(),{db,auth}=deps;
after(async()=>{await db.terminate();await deps.close();});
const projection=async f=>(await db.doc(ledgerPaths(f.scope).account).get()).data();
const family=async f=>(await db.doc(familyPath(fundingFamilyId(f.payment))).get()).data();
const entries=async f=>(await db.collection(ledgerPaths(f.scope).journal).orderBy("sequence").get()).docs.map(d=>d.data());
// Synthetic trusted server principal for this inactive risk adapter. Current role
// is read inside each transaction; this does not prove deployed provisioning.
const principal=Object.freeze({syntheticServerSession:true});
function authorizer(f){return async(p,action)=>{
  assert.equal(p,principal);assert.equal(action.clientId,f.scope.clientId);assert.equal(action.environment,f.scope.environment);
  const role=(await action.tx.get(db.doc(principalPath(`owner_${f.scope.clientId.slice(7)}`)))).data();
  if(!role?.active||role.role!=="owner")throw Error("family_authorization_required");
  return {actorId:role.uid,authorizationEvidenceId:"synthetic_family_authorization"};
};}
const coordinator=f=>createFundingFamilyCoordinator({db,authorize:authorizer(f)});
async function risk(f,type,caseId,amountCents=null,patch={}){
  const input={id:`${type}_${caseId}`,type,familyId:fundingFamilyId(f.payment),caseId,amountCents,expectedFamilyRevision:(await family(f)).revision,...patch};
  return coordinator(f).coordinate(f.scope,input,principal);
}
function raw(f,database=db){return createFirestoreLedger({db:database,authorize:async()=>({actorId:`owner_${f.scope.clientId.slice(7)}`,authorizationEvidenceId:"synthetic_refund_auth"})});}
const financial=(type,patch)=>({id:`family_${type}`,type,policyId:"terms",policyVersion:1,expectedRevision:null,...patch});
async function split(name){const f=await transferable(deps,name);await approve(f);await f.service.execute(f.tokens.owner,f.scope,f.op);return f;}
async function refundEvidence(f,id,amount){
  await db.doc(evidencePath(f.scope,"refunds",id)).create({schemaVersion:1,id,environment:f.scope.environment,currency:"CAD",provider:"square",
    merchantId:f.payment.merchantId,paymentId:f.payment.paymentId,amountCents:amount,status:"COMPLETED",readbackVerified:true,verificationVersion:1,evidenceId:id});
  await sealSyntheticRecords(db,[evidencePath(f.scope,"refunds",id)]);
}
async function reconcile(f){
  const fs=await family(f),events=(await db.collection(`${familyPath(fs.id)}/events`).orderBy("revision").get()).docs.map(d=>d.data());
  const rebuilt=rebuildFundingFamily(f.scope,events);assert.deepEqual(rebuilt,fs);
  const actual=protectedBalances(rebuild(f.scope,await entries(f)),[rebuilt]);assert.deepEqual(actual,(await projection(f)).summary);
  return actual;
}

test("owner-approved splits create related descendants without another collected payment",async()=>{
  const f=await split("family_split");
  const op={...f.op,approvalId:"approval_2",command:{...f.op.command,id:"transfer_2",expectedRevision:2,targetLotId:"general_2",amountCents:5000}};
  await f.service.approveTransfer(f.tokens.owner,f.scope,{id:"approval_2",operation:op,expiresAt:new Date(Date.now()+60000).toISOString()});
  await f.service.execute(f.tokens.owner,f.scope,op);
  const fs=await family(f);assert.equal(Object.keys(fs.members).length,3);assert.equal(fs.originalCents,30000);
  assert.equal(fs.members.general_1.parentLotId,"lot_1");assert.equal(fs.members.general_1.authorizationEvidenceId.startsWith("audit_"),true);
  assert.equal((await reconcile(f)).collectedPaymentsCents,30000);
});

test("family reservation protects descendant value; releasing it cannot release a dispute",async()=>{
  const f=await split("family_overlap");await risk(f,"reserve","refund",15000);await risk(f,"freeze","dispute");
  assert.equal((await family(f)).totals.reservedCents,30000);assert.equal((await projection(f)).summary.availablePurchasedCents,0);
  await risk(f,"release_reservation","refund");assert.equal((await projection(f)).summary.reservedPurchasedCents,30000);
  await assert.rejects(risk(f,"release_dispute","wrong"),/family_coordinator_dispute_required/);
  await risk(f,"release_dispute","dispute");assert.equal((await reconcile(f)).availablePurchasedCents,30000);
});

test("transferred lot refund and overlapping dispute reduce actual value once",async()=>{
  const f=await split("family_refund"),store=raw(f);
  await store.post(f.scope,financial("reserve_refund",{lotId:"general_1",caseId:"refund",amountCents:5000}),principal);
  await store.post(f.scope,financial("freeze_dispute",{lotId:"lot_1",caseId:"dispute"}),principal);
  await refundEvidence(f,"refund_1",5000);
  const input=financial("complete_refund",{lotId:"general_1",caseId:"refund",amountCents:5000,refundEvidenceId:"refund_1"});
  await store.post(f.scope,input,principal);assert.equal((await store.post(f.scope,input,principal)).duplicate,true);
  assert.equal((await family(f)).totals.refundedCents,5000);assert.equal((await family(f)).totals.disputedCents,25000);
  await store.post(f.scope,financial("reserve_refund",{id:"second_hold",lotId:"general_1",caseId:"second",amountCents:5000}),principal);
  await assert.rejects(store.post(f.scope,{...input,id:"duplicate_provider_refund",caseId:"second"},principal),/duplicate_provider_source/);
  const s=await reconcile(f);assert.equal(s.netCollectedCents,25000);assert.equal(s.collectedPaymentsCents,30000);assert.equal(s.reservedPurchasedCents,25000);
});

test("family-wide cross-lot reservation cannot be silently executed by a lot refund",async()=>{
  const f=await split("family_crosslot");await risk(f,"reserve","whole_refund",30000);await refundEvidence(f,"whole_refund",30000);
  const result=await raw(f).post(f.scope,financial("complete_refund",{lotId:"lot_1",caseId:"whole_refund",amountCents:30000,refundEvidenceId:"whole_refund"}),principal);
  assert.equal(result.outcome,"review_required");assert.equal(result.review.reason,"cross_lot_refund_execution_not_enabled");
  assert.equal((await reconcile(f)).prepaidLiabilityCents,30000);
});

test("concurrent owner transfer versus reservation cannot evade the shared family revision",async()=>{
  const f=await transferable(deps,"family_transfer_race");await approve(f);
  const input={id:"reserve_race",type:"reserve",familyId:fundingFamilyId(f.payment),caseId:"refund",amountCents:25000,expectedFamilyRevision:1};
  const results=await Promise.allSettled([f.service.execute(f.tokens.owner,f.scope,f.op),coordinator(f).coordinate(f.scope,input,principal)]);
  if(results[1].status==="rejected"){assert.match(results[1].reason.message,/stale_family_revision/);await risk(f,"reserve","refund",25000);}
  assert.equal((await family(f)).totals.reservedCents,25000);assert.equal((await reconcile(f)).availablePurchasedCents,5000);
  if((await family(f)).members.general_1)assert.equal((await entries(f)).filter(e=>e.command.type==="transfer").length,1);
  else assert.equal((await entries(f)).filter(e=>e.command.type==="transfer").length,0);
});

test("spending versus freeze either spends first or freezes first; no later spending escapes",async()=>{
  // Generic Stage 2B synthetic receipt, no appointment-owned attendance metadata.
  const {seed,scopeFor,receive}=await import("../ledger-firestore/fixture.mjs");
  const scope=scopeFor("family_spend_race");const payment=await seed(db,scope);
  const store=createFirestoreLedger({db,authorize:async()=>({actorId:"synthetic",authorizationEvidenceId:"synthetic_audit"})});
  await store.post(scope,receive(),principal);
  const coord=createFundingFamilyCoordinator({db,authorize:async()=>({actorId:"synthetic",authorizationEvidenceId:"synthetic_audit"})});
  const input={id:"freeze",type:"freeze",familyId:fundingFamilyId(payment),caseId:"dispute",amountCents:null,expectedFamilyRevision:1};
  const spend=financial("redeem",{lotId:"lot_1",projectId:"project_1",appointmentId:"appointment",amountCents:10000,purpose:"tattoo_service",creditType:"purchased"});
  const results=await Promise.allSettled([store.post(scope,spend,principal),coord.coordinate(scope,input,principal)]);
  if(results[1].status==="rejected")await coord.coordinate(scope,{...input,expectedFamilyRevision:2},principal);
  const f={scope,payment},fs=await family(f);assert.equal(fs.totals.availableCents,0);
  const result=await store.post(scope,{...spend,id:"later_spend"},principal);assert.equal(result.outcome,"review_required");
  const s=await reconcile(f);assert.equal(s.earnedTattooRevenueCents+s.reservedPurchasedCents,30000);
});

test("insufficient consumed family funds yield durable review, not fabricated refund value",async()=>{
  const {seed,scopeFor,receive,redeem}=await import("../ledger-firestore/fixture.mjs");const scope=scopeFor("family_consumed"),payment=await seed(db,scope);
  const store=createFirestoreLedger({db,authorize:async()=>({actorId:"synthetic",authorizationEvidenceId:"audit"})});
  await store.post(scope,receive(),principal);await store.post(scope,redeem(),principal);
  const coord=createFundingFamilyCoordinator({db,authorize:async()=>({actorId:"synthetic",authorizationEvidenceId:"audit"})});
  const result=await coord.coordinate(scope,{id:"large_refund",type:"reserve",familyId:fundingFamilyId(payment),caseId:"refund",amountCents:20000,expectedFamilyRevision:2},principal);
  assert.equal(result.outcome,"review_required");assert.equal((await projection({scope})).summary.prepaidLiabilityCents,10000);
  const freeze=await coord.coordinate(scope,{id:"freeze",type:"freeze",familyId:fundingFamilyId(payment),caseId:"dispute",amountCents:null,expectedFamilyRevision:2},principal);
  assert.equal(freeze.outcome,"review_required");assert.equal((await family({scope,payment})).totals.disputedCents,10000);
  const f={scope,payment};await refundEvidence(f,"consumed_refund",20000);
  const review=await store.post(scope,financial("complete_refund",{lotId:"lot_1",caseId:"missing_reservation",amountCents:20000,refundEvidenceId:"consumed_refund"}),principal);
  assert.equal(review.outcome,"review_required");assert.equal(review.review.reason,"family_refund_reservation_requires_review");
  await reconcile(f);
});

test("stale revisions, duplicate reservations and revoked authorizers fail closed",async()=>{
  const f=await split("family_stale");await risk(f,"reserve","hold",1000);
  await assert.rejects(risk(f,"reserve","other",1000,{expectedFamilyRevision:1}),/stale_family_revision/);
  await assert.rejects(risk(f,"reserve","hold",1000,{id:"another_id"}),/duplicate_family_reservation/);
  await db.doc(principalPath("owner_family_stale")).update({active:false});
  await assert.rejects(risk(f,"freeze","dispute"),/family_authorization_required/);assert.equal((await family(f)).totals.reservedCents,1000);
});

test("coordinator rollback and lost commit response preserve exact idempotent effects",async()=>{
  const f=await split("family_retry"),input={id:"reserve",type:"reserve",familyId:fundingFamilyId(f.payment),caseId:"refund",amountCents:5000,expectedFamilyRevision:2};
  const failing={doc:p=>db.doc(p),runTransaction:(callback,options)=>db.runTransaction(async tx=>{await callback(tx);throw Error("rollback");},options)};
  await assert.rejects(createFundingFamilyCoordinator({db:failing,authorize:authorizer(f)}).coordinate(f.scope,input,principal),/rollback/);
  assert.equal((await family(f)).revision,2);assert.equal((await projection(f)).summary.reservedPurchasedCents,0);
  const lost={doc:p=>db.doc(p),runTransaction:async(...args)=>{await db.runTransaction(...args);throw Error("response_lost");}};
  await assert.rejects(createFundingFamilyCoordinator({db:lost,authorize:authorizer(f)}).coordinate(f.scope,input,principal),/response_lost/);
  assert.equal((await coordinator(f).coordinate(f.scope,input,principal)).duplicate,true);
  await assert.rejects(coordinator(f).coordinate(f.scope,{...input,amountCents:6000},principal),/family_operation_id_collision/);
  assert.equal((await family(f)).totals.reservedCents,5000);await reconcile(f);
});

test("cross-client and cross-environment family associations fail independently of authorization",async()=>{
  const f=await split("family_isolation"),coord=createFundingFamilyCoordinator({db,authorize:async()=>({actorId:"synthetic",authorizationEvidenceId:"audit"})});
  const input={id:"freeze",type:"freeze",familyId:fundingFamilyId(f.payment),caseId:"dispute",amountCents:null,expectedFamilyRevision:2};
  for(const scope of [{...f.scope,clientId:"other_client"},{...f.scope,environment:"production"}])await assert.rejects(coord.coordinate(scope,input,principal),/invalid_funding_family|financial_environment_mismatch/);
  assert.equal((await family(f)).totals.availableCents,30000);
});

test("unrelated payment families do not share holds or original provider identity",async()=>{
  const first=await split("family_first"),second=await split("family_second");await risk(first,"freeze","dispute");
  assert.notEqual(fundingFamilyId(first.payment),fundingFamilyId(second.payment));
  assert.equal((await family(second)).totals.availableCents,30000);await reconcile(first);await reconcile(second);
});

test("membership cancellation preserves purchased family value and transferred spending remains denied",async()=>{
  const f=await split("family_preserve"),before=(await family(f)).totals;
  await f.service.execute(f.tokens.admin,f.scope,operation(command("cancel_membership",{expectedRevision:2,membershipId:"membership_1"}),null,{agreementId:null}));
  assert.deepEqual((await family(f)).totals,before);
  const denied={...operation(command("redeem",{expectedRevision:3,lotId:"general_1",projectId:"project_1",appointmentId:"appointment_1",amountCents:1000,purpose:"tattoo_service",creditType:"purchased"}),f.receipt.id),
    attendance:{completionId:"unused",revision:1,definitionHash:"a".repeat(64)}};
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,denied),/transferred_value_redemption_not_enabled/);
  await reconcile(f);
});

test("financial posting rollback leaves family and monetary projections unchanged",async()=>{
  const f=await transferable(deps,"family_post_rollback");await approve(f);
  const failing={doc:p=>db.doc(p),runTransaction:(callback,options)=>db.runTransaction(async tx=>{await callback(tx);throw Error("posting_rollback");},options)};
  const service=createFinancialCommands({db:failing,auth,projectId:PROJECT,runtime:deps.runtime});
  await assert.rejects(service.execute(f.tokens.owner,f.scope,f.op),/posting_rollback/);
  assert.equal((await family(f)).revision,1);assert.equal((await entries(f)).length,1);await reconcile(f);
});

test("independent families in one account retain separate availability and rebuild together",async()=>{
  const {seed,scopeFor,receive}=await import("../ledger-firestore/fixture.mjs"),scope=scopeFor("two_families");
  const payment=await seed(db,scope),store=createFirestoreLedger({db,authorize:async()=>({actorId:"synthetic",authorizationEvidenceId:"audit"})});
  await store.post(scope,receive(),principal);const second=await seed(db,scope,{paymentId:"unrelated_payment"});
  await store.post(scope,receive({id:"receipt_2",lotId:"lot_2"}),principal);
  const coord=createFundingFamilyCoordinator({db,authorize:async()=>({actorId:"synthetic",authorizationEvidenceId:"audit"})});
  await coord.coordinate(scope,{id:"freeze_one",type:"freeze",familyId:fundingFamilyId(payment),caseId:"dispute",amountCents:null,expectedFamilyRevision:1},principal);
  const families=[];
  for(const p of [payment,second]){const events=(await db.collection(`${familyPath(fundingFamilyId(p))}/events`).orderBy("revision").get()).docs.map(d=>d.data());families.push(rebuildFundingFamily(scope,events));}
  const s=protectedBalances(rebuild(scope,await entries({scope})),families);
  assert.deepEqual(s,(await projection({scope})).summary);assert.equal(s.availablePurchasedCents,30000);assert.equal(s.reservedPurchasedCents,30000);
});

test("client tokens cannot write family state, risk commands or family audit events",async()=>{
  const f=await split("family_browser_denied"),base=ledgerPaths(f.scope).account;
  for(const path of [familyPath(fundingFamilyId(f.payment)),`${base}/familyOperations/forged`,`${familyPath(fundingFamilyId(f.payment))}/events/forged`]){
    const response=await fetch(`http://127.0.0.1:8087/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,{method:"PATCH",
      headers:{Authorization:`Bearer ${f.tokens.client}`,"Content-Type":"application/json"},body:JSON.stringify({fields:{revision:{integerValue:"999"}}})});
    assert.equal(response.status,403);
  }
});
