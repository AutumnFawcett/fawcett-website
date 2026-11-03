import test,{after} from "node:test";
import assert from "node:assert/strict";
import {emulatorDependencies,funded,completed,operation,command,PROJECT} from "./fixture.mjs";
import {createFinancialCommands,principalPath} from "../../lib/financial-commands/service.mjs";
import {createFirestoreLedger,ledgerPaths} from "../../lib/ledger/server/firestore.mjs";
import {hash} from "../../lib/agreements/contracts.mjs";
import {rebuild,balances} from "../../lib/ledger/engine.mjs";
const deps=emulatorDependencies(),{db,auth}=deps;
after(async()=>{await db.terminate();await deps.close();});
const entryList=async f=>(await db.collection(ledgerPaths(f.scope).journal).orderBy("sequence").get()).docs.map(d=>d.data());
const summary=async f=>(await db.doc(ledgerPaths(f.scope).account).get()).data().summary;
const redeem=(f,attendance,patch={})=>({...operation(command("redeem",{expectedRevision:1,lotId:"lot_1",projectId:"project_1",appointmentId:"appointment_1",
  amountCents:30000,purpose:"tattoo_service",creditType:"purchased",...patch}),f.receipt.id),attendance});
const execute=(f,op)=>f.service.execute(f.tokens.admin,f.scope,op);

test("verified service below/equal/above prepayment conserves liability, revenue and cash",async()=>{
  for(const price of [20000,30000,50000]){
    const f=await funded(deps,`price_${price}`,{single:true});
    const attendance=await completed(deps,f,{tattooServiceCents:price});
    const amount=Math.min(price,30000),op=redeem(f,attendance,{amountCents:amount});
    const result=await execute(f,op),s=await summary(f);
    assert.equal(s.collectedPaymentsCents,30000);assert.equal(s.netCollectedCents,30000);
    assert.equal(s.earnedTattooRevenueCents,amount);assert.equal(s.prepaidLiabilityCents,30000-amount);
    assert.equal(s.availablePurchasedCents,30000-amount);assert.equal(s.earnedSupplyRevenueCents,0);
    assert.deepEqual(result.entry.lines.map(l=>l.account),["purchasedLiability","tattooRevenue"]);
    const application=(await db.doc(`${f.paths.serviceApplications}/${op.command.id}`).get()).data();
    assert.equal(application.plan.unpaidTattooServiceCents,price-amount);
    assert.equal(application.completion.supplyFeeCents,15000);
    const value=(await db.doc(`${f.paths.values}/lot_1`).get()).data();
    assert.equal(value.credit.remainingCents,30000-amount);assert.equal(value.credit.category,"appointment_advance");
    assert.equal(value.credit.appointmentId,"appointment_1");assert.equal(value.credit.projectId,"project_1");
    assert.deepEqual(balances(rebuild(f.scope,await entryList(f))),s);
    assert.equal(s.prepaidLiabilityCents+s.earnedTattooRevenueCents,30000);
  }
});

test("a proposed redemption cannot become the service price or consume separate fees/taxes",async()=>{
  const f=await funded(deps,"price_bound",{single:true}),a=await completed(deps,f,{tattooServiceCents:20000,supplyFeeCents:15000,taxCents:1750,otherCents:500});
  await assert.rejects(execute(f,redeem(f,a)),/attendance_exceeds_eligible_or_service_value/);
  await assert.rejects(execute(f,{...redeem(f,a),serviceTotalCents:30000}),/invalid_contract/);
  assert.equal((await summary(f)).earnedTattooRevenueCents,0);
});

test("already settled tattoo service value reduces the independently verified unpaid limit",async()=>{
  const f=await funded(deps,"settled",{single:true}),a=await completed(deps,f,{tattooServiceCents:40000,settledTattooCents:20000});
  await assert.rejects(execute(f,redeem(f,a)),/attendance_exceeds_eligible_or_service_value/);
  await execute(f,redeem(f,a,{amountCents:20000}));assert.equal((await summary(f)).prepaidLiabilityCents,10000);
});

test("ambiguous fee/advance partial application records review without posting or changing funds",async()=>{
  const f=await funded(deps,"mixed_review"),a=await completed(deps,f,{tattooServiceCents:20000}),op=redeem(f,a,{amountCents:20000});
  const before=await summary(f),result=await execute(f,op);
  assert.equal(result.outcome,"review_required");assert.equal(result.review.plan.reason,"ambiguous_booking_allocation");
  assert.deepEqual(await summary(f),before);assert.equal((await entryList(f)).length,1);
  assert.equal((await db.collection(f.paths.attendanceReviews).get()).size,1);
  assert.equal((await execute(f,op)).duplicate,true);
  await assert.rejects(execute(f,{...op,command:{...op.command,amountCents:19000}}),/posting_id_collision/);
  assert.equal((await db.doc(`${f.paths.bookings}/request_1`).get()).data().applications.length,0);
});

test("mixed full application keeps booking fee and advance traceable without another receipt",async()=>{
  const f=await funded(deps,"mixed_full"),a=await completed(deps,f,{tattooServiceCents:50000});
  await execute(f,redeem(f,a));
  const application=(await db.doc(`${f.paths.serviceApplications}/redeem_1`).get()).data();
  assert.deepEqual(application.plan.allocations,[{id:"fee",kind:"appointment_booking_fee",appliedCents:5000,remainingCents:0},
    {id:"advance",kind:"tattoo_advance",appliedCents:25000,remainingCents:0}]);
  assert.equal(application.plan.unpaidTattooServiceCents,20000);
  assert.equal((await entryList(f)).filter(e=>e.command.type==="receive").length,1);
});

test("missing, forged, incomplete and cancelled completion evidence fails closed",async()=>{
  for(const variant of ["missing","audit","incomplete","cancelled","decision","author"]){
    const f=await funded(deps,`invalid_${variant}`,{single:true}),a=await completed(deps,f);
    const ref=db.doc(`${f.paths.serviceCompletions}/completion_1`);
    if(variant==="missing")await ref.delete();
    if(variant==="audit")await db.doc(`financialCommandAudits/completion_audit_${f.scope.clientId}`).delete();
    if(variant==="incomplete"||variant==="cancelled")await ref.update({status:variant});
    if(variant==="decision")await ref.update({decision:"browser_claimed"});
    if(variant==="author")await db.doc(principalPath(`owner_${f.scope.clientId.slice(7)}`)).update({active:false});
    await assert.rejects(execute(f,redeem(f,a)),/invalid_contract|trusted_service_completion_required/);
    assert.equal((await entryList(f)).length,1);
  }
});

test("price mutation, stale revisions and cross-client/project/artist evidence are rejected",async()=>{
  for(const variant of ["price","revision","head","client","project","artist","appointment"]){
    const f=await funded(deps,`mismatch_${variant}`,{single:true});
    const patch={client:{clientId:"other_client"},project:{projectId:"other_project"},artist:{artistId:"other_artist"},appointment:{appointmentRevision:2}}[variant]||{};
    const a=await completed(deps,f,patch),ref=db.doc(`${f.paths.serviceCompletions}/completion_1`);
    if(variant==="price")await ref.update({tattooServiceCents:50000});
    if(variant==="revision")a.revision=2;
    if(variant==="head")await db.doc(`${f.paths.serviceCompletionHeads}/appointment_1`).update({revision:2});
    await assert.rejects(execute(f,redeem(f,a)),/stale_service_completion|service_completion_scope_mismatch|service_artist_mismatch/);
    assert.equal((await summary(f)).earnedTattooRevenueCents,0);
  }
});

test("duplicates, uncertain commits and concurrent attempts have one financial effect",async()=>{
  const f=await funded(deps,"attendance_concurrent",{single:true}),a=await completed(deps,f),op=redeem(f,a);
  const results=await Promise.all([execute(f,op),execute(f,op)]);assert.equal(results.filter(r=>r.duplicate).length,1);
  await assert.rejects(execute(f,{...op,command:{...op.command,amountCents:10000}}),/posting_id_collision/);
  await assert.rejects(execute(f,{...op,command:{...op.command,id:"another_application",expectedRevision:2}}),/attendance_funding_mismatch|booking_closed_or_under_review/);
  assert.equal((await db.collection(f.paths.serviceApplications).get()).size,1);assert.equal((await entryList(f)).length,2);
  const lost=await funded(deps,"attendance_lost",{single:true}),la=await completed(deps,lost),lop=redeem(lost,la);
  const interrupted={doc:p=>db.doc(p),runTransaction:async(...args)=>{await db.runTransaction(...args);throw Error("response_lost");}};
  await assert.rejects(createFinancialCommands({db:interrupted,auth,projectId:PROJECT}).execute(lost.tokens.admin,lost.scope,lop),/response_lost/);
  assert.equal((await execute(lost,lop)).duplicate,true);assert.equal((await entryList(lost)).length,2);
});

test("different concurrent operation IDs cannot double apply one booking",async()=>{
  const f=await funded(deps,"different_concurrent",{single:true}),a=await completed(deps,f),op=redeem(f,a);
  const results=await Promise.allSettled([execute(f,op),execute(f,{...op,command:{...op.command,id:"other_application"}})]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await db.collection(f.paths.serviceApplications).get()).size,1);
  assert.equal((await summary(f)).earnedTattooRevenueCents,30000);
});

test("failed transaction rolls back journal, booking, balance and application together",async()=>{
  const f=await funded(deps,"attendance_rollback",{single:true}),a=await completed(deps,f),op=redeem(f,a),before=await summary(f);
  const failing={doc:p=>db.doc(p),runTransaction:(callback,options)=>db.runTransaction(async tx=>{await callback(tx);throw Error("synthetic_failure");},options)};
  await assert.rejects(createFinancialCommands({db:failing,auth,projectId:PROJECT}).execute(f.tokens.admin,f.scope,op),/synthetic_failure/);
  assert.deepEqual(await summary(f),before);assert.equal((await entryList(f)).length,1);
  assert.equal((await db.collection(f.paths.serviceApplications).get()).size,0);assert.equal((await db.collection(f.paths.serviceBalances).get()).size,0);
  await execute(f,op);assert.equal((await summary(f)).earnedTattooRevenueCents,30000);
});

test("retry re-reads service revision; changed evidence cannot post",async()=>{
  const f=await funded(deps,"attendance_retry",{single:true}),a=await completed(deps,f),op=redeem(f,a);let attempts=0;
  const retrying={doc:p=>db.doc(p),runTransaction:(callback,options)=>db.runTransaction(async tx=>{
    attempts++;if(attempts===2)await db.doc(`${f.paths.serviceCompletionHeads}/appointment_1`).update({revision:2});
    const result=await callback(tx);if(attempts===1)throw Object.assign(Error("aborted"),{code:10});return result;
  },options)};
  await assert.rejects(createFinancialCommands({db:retrying,auth,projectId:PROJECT}).execute(f.tokens.admin,f.scope,op),/stale_service_completion/);
  assert.equal(attempts,2);assert.equal((await entryList(f)).length,1);
});

test("direct adapter and no-op guard cannot bypass protected booking attendance",async()=>{
  const f=await funded(deps,"adapter_denied",{single:true}),a=await completed(deps,f),op=redeem(f,a);
  for(const guard of [undefined,async()=>()=>{}]){
    const raw=createFirestoreLedger({db,authorize:async()=>({actorId:`admin_adapter_denied`,authorizationEvidenceId:"invented"}),transactionalGuard:guard});
    await assert.rejects(raw.post(f.scope,op.command,{}),/protected_attendance_command_required/);
  }
  assert.equal((await summary(f)).earnedTattooRevenueCents,0);
});

test("clients cannot write completion evidence, heads, applications or audits",async()=>{
  const f=await funded(deps,"browser_denied",{single:true});
  for(const path of [`${f.paths.serviceCompletions}/forged`,`${f.paths.serviceCompletionHeads}/appointment_1`,`${f.paths.serviceApplications}/forged`,`financialCommandAudits/forged`]){
    const response=await fetch(`http://127.0.0.1:8087/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,{method:"PATCH",
      headers:{Authorization:`Bearer ${f.tokens.client}`,"Content-Type":"application/json"},body:JSON.stringify({fields:{status:{stringValue:"completed"}}})});
    assert.equal(response.status,403);
  }
});
