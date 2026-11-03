import {sealSyntheticRecords} from "./security-fixture.mjs";
import test,{after} from "node:test";
import assert from "node:assert/strict";
import { emulatorDependencies,setup,accept,funded,transferable,approve,receive,operation,command,PROJECT,completed } from "./fixture.mjs";
import { createFinancialCommands,principalPath,commandPaths,auditPath } from "../../lib/financial-commands/service.mjs";
import { ledgerPaths,evidencePath } from "../../lib/ledger/server/firestore.mjs";
import { hash } from "../../lib/agreements/contracts.mjs";
import { sourceKey,importId } from "../../lib/ledger/import/manifest.mjs";
import { rebuild,balances } from "../../lib/ledger/engine.mjs";
import { expireOffer,emptyOffers,assignOffer } from "../../lib/agreements/offers.mjs";
const deps=emulatorDependencies(),{db,auth}=deps;
after(async()=>{await db.terminate();await deps.close();});
const projection=async f=>(await db.doc(ledgerPaths(f.scope).account).get()).data();
const entries=async f=>(await db.collection(ledgerPaths(f.scope).journal).orderBy("sequence").get()).docs.map(d=>d.data());

test("actual Auth emulator verifies accounts; roles/actor flags and cross-client access fail closed",async()=>{
  const f=await setup(deps,"auth"),receipt=await accept(f),op=receive(receipt);
  await assert.rejects(f.service.execute("invalid",f.scope,op),/authentication_required/);
  await assert.rejects(f.service.execute(f.tokens.client,f.scope,op),/authorization_required|privileged_role/);
  await assert.rejects(f.service.execute(f.tokens.admin,{clientId:"another_client",environment:"sandbox"},op),/authorization_required/);
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,{...op,owner:true}),/invalid_contract/);
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,{...op,command:{...op.command,actorId:"owner"}}),/invalid_operation/);
  await assert.rejects(f.service.accept(f.tokens.owner,f.scope,{id:"spoof",requestId:f.request.id,requestHash:hash(f.request),policyAccepted:true,acceptedOfferTerms:[]}),/authorization_required|client_identity/);
  assert.equal(await projection(f),undefined);
});

test("disabled, revoked and expired authorization is rejected without a journal",async()=>{
  const f=await setup(deps,"revoked"),receipt=await accept(f),op=receive(receipt);
  await auth.updateUser("admin_revoked",{disabled:true});
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,op),/authentication_required/);
  await auth.updateUser("admin_revoked",{disabled:false});
  // Let auth_time's second pass so Firebase's revocation boundary is unambiguous.
  await new Promise(resolve=>setTimeout(resolve,1100));await auth.revokeRefreshTokens("admin_revoked");
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,op),/authentication_required/);
  const expired=createFinancialCommands({db,auth,projectId:PROJECT,runtime:deps.runtime,clock:()=>Date.now()+3700000});
  await assert.rejects(expired.execute(f.tokens.owner,f.scope,op),/authentication_required/);
  assert.equal(await projection(f),undefined);
});

test("current application role, project scope and revocation epoch are checked transactionally",async()=>{
  const f=await setup(deps,"scope"),receipt=await accept(f),op=receive(receipt),ref=db.doc(principalPath("admin_scope"));
  await ref.update({projectIds:[]});await sealSyntheticRecords(db,[ref.path]);await assert.rejects(f.service.execute(f.tokens.admin,f.scope,op),/project_authorization/);
  await ref.update({projectIds:["project_1"],validAfterSeconds:Math.floor(Date.now()/1000)+10});
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,op),/authorization_required/);
  await ref.update({validAfterSeconds:0,active:false});await assert.rejects(f.service.execute(f.tokens.admin,f.scope,op),/authorization_required/);
  assert.equal(await projection(f),undefined);
});

test("missing/forged acceptance and forwarded-link assumptions cannot fund an account",async()=>{
  const f=await setup(deps,"missing"),op=receive({id:"forged_acceptance"});
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,op),/trusted_acceptance_required/);
  const invalid={id:"consent_1",requestId:f.request.id,requestHash:hash(f.request),policyAccepted:false,acceptedOfferTerms:[]};
  await assert.rejects(f.service.accept(f.tokens.client,f.scope,invalid),/invalid_contract/);
  const receipt=await accept(f);
  const ref=db.doc(`${f.paths.consents}/${receipt.id}`),stored=(await ref.get()).data();
  stored.receipt.authorizationEvidenceId="forged_audit";await ref.set(stored);
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(receipt)),/acceptance_audit_required/);
  assert.equal(await projection(f),undefined);
});

test("stale itemized amount/request revision and appointment revision invalidate consent",async()=>{
  for(const variant of ["amount","request","appointment"]){
    const f=await setup(deps,`stale_${variant}`),receipt=await accept(f);
    if(variant==="appointment")await db.doc(`${f.paths.appointments}/appointment_1`).update({revision:2});
    else {const changed=structuredClone(f.request);if(variant==="request")changed.revision=2;else{changed.totalCents++;changed.allocations[0].amountCents++;}await db.doc(`${f.paths.agreements}/request_1`).set(changed);}
    await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(receipt)),/stale_or_invalid_acceptance|stale_appointment|trusted_acceptance_required|booking_ownership_required/);
    assert.equal(await projection(f),undefined);
  }
});

test("separate exact offer terms and server timestamp are retained in acceptance",async()=>{
  const f=await setup(deps,"offers"),request={...f.request,requiredOfferTerms:[{id:"offer_1",version:1,contentHash:hash("synthetic offer")}]};
  await db.doc(`${f.paths.agreements}/request_1`).set(request);await sealSyntheticRecords(db,[`${f.paths.agreements}/request_1`]);f.request=request;
  await assert.rejects(f.service.accept(f.tokens.client,f.scope,{id:"a",requestId:request.id,requestHash:hash(request),policyAccepted:true,acceptedOfferTerms:[]}),/offer_acceptance_required/);
  const receipt=await accept(f);assert.deepEqual(receipt.acceptedOfferTerms,request.requiredOfferTerms);assert.ok(Date.parse(receipt.acceptedAt)<=Date.now());
  const replay=await accept(f);assert.deepEqual(replay,receipt);
  assert.ok((await db.doc(auditPath(f.scope,"accept_policy","consent_1")).get()).exists);
});

test("provider evidence must exist, be consistent CARD capture and match trusted order",async()=>{
  for(const variant of ["missing","external","capture","order","failed","forged"]){
    const f=await setup(deps,`provider_${variant}`),receipt=await accept(f);
    if(variant==="missing")await db.doc(`${f.paths.readbacks}/evidence_1`).delete();
    if(variant==="external")await db.doc(`${f.paths.readbacks}/evidence_1`).update({externalDetailsPresent:true});
    if(variant==="capture")await db.doc(`${f.paths.readbacks}/evidence_1`).update({cardStatus:"AUTHORIZED"});
    if(variant==="order")await db.doc(`${f.paths.providerOrders}/request_1`).update({orderId:"wrong_order"});
    if(variant==="failed"){const payment={...f.payment,status:"FAILED"};await db.doc(evidencePath(f.scope,"payments","evidence_1")).set(payment);await db.doc(`${f.paths.readbacks}/evidence_1`).update({paymentHash:hash(payment)});}
    if(variant==="forged")await db.doc(evidencePath(f.scope,"payments","evidence_1")).update({amountCents:100});
    await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(receipt)),/trusted_provider_readback_required|provider_order_mismatch|verified_receipt_required|provider_ownership_required/);
    assert.equal(await projection(f),undefined);
  }
});

test("booking fee and advance stay separate; attendance applies both exactly once",async()=>{
  const f=await funded(deps,"booking"),booking=(await db.doc(`${f.paths.bookings}/request_1`).get()).data();
  assert.deepEqual(booking.allocations.map(a=>[a.kind,a.amountCents]),[["appointment_booking_fee",5000],["tattoo_advance",25000]]);
  const op=operation(command("redeem",{expectedRevision:1,lotId:"lot_1",projectId:"project_1",appointmentId:"appointment_1",amountCents:30000,purpose:"tattoo_service",creditType:"purchased"}),f.receipt.id);
  op.attendance=await completed(deps,f);
  await f.service.execute(f.tokens.admin,f.scope,op);assert.equal((await f.service.execute(f.tokens.admin,f.scope,op)).duplicate,true);
  assert.equal((await projection(f)).summary.availablePurchasedCents,0);
  assert.equal((await db.doc(`${f.paths.bookings}/request_1`).get()).data().applications.length,1);
});

test("restricted transfer needs a real owner approval and preserves all purchased value",async()=>{
  const f=await transferable(deps,"transfer");
  await assert.rejects(f.service.execute(f.tokens.owner,f.scope,f.op),/invalid_or_stale_owner_approval/);
  await assert.rejects(f.service.approveTransfer(f.tokens.admin,f.scope,{id:"approval_1",operation:f.op,expiresAt:new Date(Date.now()+60000).toISOString()}),/authorization_required|owner_required/);
  await approve(f);const before=(await projection(f)).summary;
  await f.service.execute(f.tokens.owner,f.scope,f.op);
  const after=(await projection(f)).summary;assert.deepEqual(after,before);
  const target=(await db.doc(`${f.paths.values}/general_1`).get()).data();assert.equal(target.credit.category,"studio_credit");assert.equal(target.credit.remainingCents,10000);
  assert.equal((await db.doc(`${f.paths.values}/lot_1`).get()).data().credit.remainingCents,20000);
  const rebuilt=rebuild(f.scope,await entries(f));assert.deepEqual(balances(rebuilt),after);
});

test("concurrent approval use/replay has one effect and one durable use record",async()=>{
  const f=await transferable(deps,"concurrent");await approve(f);
  const results=await Promise.all([f.service.execute(f.tokens.owner,f.scope,f.op),f.service.execute(f.tokens.owner,f.scope,f.op)]);
  assert.equal(results.filter(r=>r.duplicate).length,1);assert.equal((await entries(f)).length,2);
  assert.equal((await db.collection(f.paths.approvalUses).get()).size,1);
  const changed={...f.op,command:{...f.op.command,id:"transfer_2",expectedRevision:2,targetLotId:"general_2"}};
  await assert.rejects(f.service.execute(f.tokens.owner,f.scope,changed),/invalid_or_stale_owner_approval/);
});

test("approval binds exact amount, restriction, role revision and account revision",async()=>{
  for(const variant of ["amount","restriction","role","revision"]){
    const f=await transferable(deps,`approval_${variant}`);await approve(f);let op=f.op;
    if(variant==="amount")op={...op,command:{...op.command,amountCents:9000}};
    if(variant==="restriction"){const ref=db.doc(`${f.paths.values}/lot_1`),v=(await ref.get()).data();v.credit.artistId="another_artist";await ref.set(v);}
    if(variant==="role"){await db.doc(principalPath(`owner_approval_${variant}`)).update({revision:2});await sealSyntheticRecords(db,[principalPath(`owner_approval_${variant}`)]);}
    if(variant==="revision")await db.doc(ledgerPaths(f.scope).account).update({revision:2});
    await assert.rejects(f.service.execute(f.tokens.owner,f.scope,op),/invalid_or_stale_owner_approval|stale_revision/);
    assert.equal((await db.collection(f.paths.approvalUses).get()).size,0);
  }
});

test("lost commit response retries without duplicate journal/audit/approval consumption",async()=>{
  const f=await transferable(deps,"uncertain");await approve(f);
  const interrupted={doc:path=>db.doc(path),runTransaction:async(...args)=>{await db.runTransaction(...args);throw Error("synthetic_response_lost");}};
  const service=createFinancialCommands({db:interrupted,auth,projectId:PROJECT,runtime:deps.runtime});
  await assert.rejects(service.execute(f.tokens.owner,f.scope,f.op),/synthetic_response_lost/);
  assert.equal((await f.service.execute(f.tokens.owner,f.scope,f.op)).duplicate,true);assert.equal((await entries(f)).length,2);
  assert.equal((await db.collection(f.paths.approvalUses).get()).size,1);
});

test("historical reconciliation IDs and consumed sources cannot create new credit",async()=>{
  const f=await setup(deps,"legacy"),receipt=await accept(f),legacy={source:{projectId:"synthetic_legacy",collection:"payments",id:"old_receipt",recordHash:hash("synthetic original")}};
  await db.doc(`financialLegacyImportSources/${sourceKey(legacy)}`).set({importId:importId(legacy)});
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,{...receive(receipt),legacy}),/duplicate_legacy_source/);
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(receipt,{id:importId(legacy)})),/legacy_import_not_enabled/);
  assert.equal(await projection(f),undefined);
});

test("membership cancellation and expiry of a noncash benefit never remove purchased funds",async()=>{
  const f=await funded(deps,"preserve"),before=(await projection(f)).summary;
  const cancel=operation(command("cancel_membership",{expectedRevision:1,membershipId:"membership_1"}),null,{agreementId:null});
  await f.service.execute(f.tokens.admin,f.scope,cancel);assert.deepEqual((await projection(f)).summary,before);
  const ctx={actorId:"synthetic_owner",clientId:f.scope.clientId,environment:"sandbox",role:"owner",now:"2026-11-01T00:00:00.000Z",authorizationEvidenceId:"synthetic_audit"};
  const offer={schemaVersion:1,id:"discount",version:1,type:"conditional_discount",terms:"Synthetic noncash discount",termsHash:hash("Synthetic noncash discount"),
    startsAt:"2026-10-01T00:00:00.000Z",expiresAt:"2026-11-02T00:00:00.000Z",serviceIds:[],artistIds:[],qualifyingCents:0,maxRedemptions:1,stackGroup:null,allowStackWith:[],discountCents:1000,entitlementCode:null};
  let offers=assignOffer(emptyOffers(f.scope.clientId,"sandbox"),offer,"assignment",null,ctx);
  offers=expireOffer(offers,"assignment",{...ctx,now:"2026-11-03T00:00:00.000Z"});assert.ok(offers.assignments[0].expiredAt);
  assert.deepEqual((await projection(f)).summary,before);
  for(const type of ["promote","complete_refund","cancel_forfeit","redeem_offer"])await assert.rejects(f.service.execute(f.tokens.owner,f.scope,{...cancel,command:{...cancel.command,type}}),/command_not_enabled/);
});

test("fixtures and emulator auth cannot select a real Firebase project",()=>{
  assert.throws(()=>createFinancialCommands({db,auth,projectId:"real_project"}),/emulator_auth_forbidden/);
  const prior=process.env.GCLOUD_PROJECT;try{process.env.GCLOUD_PROJECT="real_project";assert.throws(emulatorDependencies,/local_auth_and_firestore_required/);}finally{process.env.GCLOUD_PROJECT=prior;}
});

test("expired owner approval and forged role/approval document writes are rejected",async()=>{
  const f=await transferable(deps,"expiry");await approve(f);
  const later=createFinancialCommands({db,auth,projectId:PROJECT,runtime:deps.runtime,clock:()=>Date.now()+61000});
  await assert.rejects(later.execute(f.tokens.owner,f.scope,f.op),/invalid_or_stale_owner_approval/);
  for(const path of [principalPath(f.scope.clientId),`${f.paths.approvals}/forged`]){
    const response=await fetch(`http://127.0.0.1:8087/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,{
      method:"PATCH",headers:{Authorization:`Bearer ${f.tokens.client}`,"Content-Type":"application/json"},body:JSON.stringify({fields:{role:{stringValue:"owner"}}})});
    assert.equal(response.status,403);
  }
  assert.equal((await db.collection(f.paths.approvalUses).get()).size,0);
});

test("transaction retry observes role revocation and commits no financial or approval writes",async()=>{
  const f=await transferable(deps,"role_race");await approve(f);let attempts=0;
  const retrying={doc:path=>db.doc(path),runTransaction:(callback,options)=>db.runTransaction(async tx=>{
    attempts++;
    if(attempts===2)await db.doc(principalPath("owner_role_race")).update({active:false,revision:2});
    const result=await callback(tx);
    if(attempts===1)throw Object.assign(Error("synthetic_aborted"),{code:10});
    return result;
  },options)};
  const service=createFinancialCommands({db:retrying,auth,projectId:PROJECT,runtime:deps.runtime});
  await assert.rejects(service.execute(f.tokens.owner,f.scope,f.op),/authorization_required/);
  assert.equal(attempts,2);assert.equal((await entries(f)).length,1);assert.equal((await db.collection(f.paths.approvalUses).get()).size,0);
});

test("receipt retries require current project access and different IDs cannot reuse provider funds",async()=>{
  const f=await funded(deps,"receipt_retry"),op=receive(f.receipt);
  assert.equal((await f.service.execute(f.tokens.admin,f.scope,op)).duplicate,true);
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(f.receipt,{id:"repeat_receipt",expectedRevision:1,lotId:"lot_2"})),/duplicate_provider_source/);
  await db.doc(principalPath("admin_receipt_retry")).update({projectIds:[]});await sealSyntheticRecords(db,[principalPath("admin_receipt_retry")]);
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,op),/project_authorization_required/);
  assert.equal((await entries(f)).length,1);
});

test("test network guard rejects nonlocal sockets before any connection",async()=>{
  const net=await import("node:net");assert.throws(()=>net.connect({host:"outside.invalid",port:8087}),/local_emulator_network_only/);
});

test("transferred general value cannot be spent or transferred again through this increment",async()=>{
  const f=await transferable(deps,"target_locked");await approve(f);await f.service.execute(f.tokens.owner,f.scope,f.op);
  const redeem=operation(command("redeem",{expectedRevision:2,lotId:"general_1",projectId:"project_1",appointmentId:"appointment_1",amountCents:30000,purpose:"tattoo_service",creditType:"purchased"}),f.receipt.id);
  redeem.attendance={completionId:"unused",revision:1,definitionHash:hash("unused")};
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,redeem),/transferred_value_redemption_not_enabled/);
  const next={...f.op,approvalId:"approval_2",command:{...f.op.command,id:"transfer_2",expectedRevision:2,lotId:"general_1",targetLotId:"general_2",projectId:null}};
  await assert.rejects(f.service.approveTransfer(f.tokens.owner,f.scope,{id:"approval_2",operation:next,expiresAt:new Date(Date.now()+60000).toISOString()}),/tattoo_credit_transfer_only/);
  assert.equal((await projection(f)).summary.availablePurchasedCents,30000);
});
