import test,{after} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {emulatorDependencies,funded,completed,operation,command} from "./fixture.mjs";
import {principalPath,agreementPolicyPath} from "../../lib/financial-commands/service.mjs";
import {createSignedAttendanceCommands,signedAttendancePath} from "../../lib/financial-commands/signed-attendance.mjs";
import {localLedgerContext} from "../../lib/financial-security/runtime.mjs";
import {createEmulatorRegistryAuthority,registryPaths} from "../../lib/financial-security/registry-emulator.mjs";
import {sealSyntheticRecords} from "./security-fixture.mjs";
import {createFirestoreLedger,ledgerPaths} from "../../lib/ledger/server/firestore.mjs";
import {fundingFamilyId,validateFamily} from "../../lib/ledger/funding-family.mjs";
import {balances,rebuild} from "../../lib/ledger/engine.mjs";
import {hash} from "../../lib/financial-security/protocol/contracts.mjs";
const deps=emulatorDependencies(),{db,auth,runtime}=deps,projectId="demo-fawcett-ledger";
let observedDepth=0;const ctx=localLedgerContext(db),originalSign=ctx.signOwnership;
ctx.signOwnership=(...args)=>{assert.equal(observedDepth,0,"ephemeral signing inside protected transaction");return originalSign(...args);};
after(async()=>{ctx.signOwnership=originalSign;await db.terminate();await deps.close();});
async function fixture(name,{mixed=false,price=20000}={}){
  const f=await funded(deps,`signed_${name}`,{single:!mixed}),attendance=await completed(deps,f,{tattooServiceCents:price});
  const owner=`owner_signed_${name}`,ownerRef=db.doc(principalPath(owner)),ownerRecord=(await ownerRef.get()).data();
  await ownerRef.update({actions:[...ownerRecord.actions,"manage_roles","family_freeze"]});await sealSyntheticRecords(db,[ownerRef.path]);
  const keys=generateKeyPairSync("ed25519"),publisher=generateKeyPairSync("ed25519");
  const registryId=`registry_${name}`,at=new Date(Date.now()-60000).toISOString();let txDepth=0,signCalls=0;
  const definition={schemaVersion:1,id:registryId,revision:1,keys:[{keyId:"ledger_key",issuerId:"ledger_issuer",writerKind:"ledger",algorithm:"Ed25519",
    publicKey:keys.publicKey.export({type:"spki",format:"der"}).toString("base64"),scope:{projectId,databaseId:"(default)",environment:"sandbox"},artifactTypes:["financial_journal"],
    introducedRevision:1,createdAt:at,effectiveAt:at,retiredAt:null,revokedAt:null,state:"active",compromised:false}]};
  const observedDb={doc:p=>db.doc(p),runTransaction:(callback,options)=>db.runTransaction(async tx=>{txDepth++;observedDepth++;try{return await callback(tx);}finally{txDepth--;observedDepth--; }},options)};
  const authority=createEmulatorRegistryAuthority({db:observedDb,auth,projectId,runtime,publisherUid:owner,publisherScope:f.scope,registryId,
    publisherPublicKey:publisher.publicKey.export({type:"spki",format:"der"}).toString("base64"),
    signPublisherBytes:async bytes=>{assert.equal(txDepth,0);return sign(null,bytes,publisher.privateKey).toString("base64");}});
  await authority.publish(f.tokens.owner,definition);
  const signing=async bytes=>{assert.equal(txDepth,0,"signing inside transaction callback");signCalls++;return sign(null,bytes,keys.privateKey).toString("base64");};
  const writer=(patch={})=>createSignedAttendanceCommands({db:observedDb,auth,projectId,runtime,registryAuthority:authority,keyId:"ledger_key",issuerId:"ledger_issuer",signBytes:signing,...patch});
  const op={...operation(command("redeem",{expectedRevision:1,lotId:"lot_1",projectId:"project_1",appointmentId:"appointment_1",amountCents:Math.min(price,30000),purpose:"tattoo_service",creditType:"purchased"}),f.receipt.id),attendance};
  const paths=ledgerPaths(f.scope),familyRef=db.doc(`financialFundingFamilies/${fundingFamilyId(f.payment)}`);
  const summary=async()=>(await db.doc(paths.account).get()).data().summary;
  const entries=async()=>(await db.collection(paths.journal).get()).docs.map(d=>d.data()).sort((a,b)=>a.sequence-b.sequence);
  const publish=async change=>{const row=(await db.doc(registryPaths(registryId).current).get()).data(),next=structuredClone(row.definition);next.revision++;change(next);
    return authority.publish(f.tokens.owner,next);};
  const commit=(p,input=op)=>writer().commit(f.tokens.admin,f.scope,input,p);
  return {...f,op,writer,signing,authority,definition,publish,paths,familyRef,summary,entries,commit,get signCalls(){return signCalls;}};
}
async function untouched(f){assert.equal((await f.entries()).length,1);assert.equal((await f.summary()).earnedTattooRevenueCents,0);assert.equal((await db.collection(f.paths.serviceApplications).get()).size,0);}

test("signed attendance commits exact Stage 2A/2B effect, family, allocation, audit and durable anchor",async()=>{
  const f=await fixture("success"),before=await f.summary(),writer=f.writer(),p=await writer.prepare(f.tokens.admin,f.scope,f.op);
  await untouched(f);const result=await f.commit(p),after=await f.summary();
  assert.equal(result.duplicate,false);assert.equal(before.collectedPaymentsCents,30000);assert.equal(after.collectedPaymentsCents,30000);
  assert.equal(after.prepaidLiabilityCents,10000);assert.equal(after.availablePurchasedCents,10000);assert.equal(after.earnedTattooRevenueCents,20000);
  assert.equal(after.earnedSupplyRevenueCents,0);assert.deepEqual(balances(rebuild(f.scope,await f.entries())),after);
  const family=validateFamily((await f.familyRef.get()).data(),f.scope);assert.equal(family.revision,2);assert.equal(family.totals.usedCents,20000);assert.equal(family.totals.availableCents,10000);
  const lot=(await db.doc(`${f.paths.lots}/lot_1`).get()).data();assert.deepEqual(lot.funding,{merchantId:f.payment.merchantId,paymentId:f.payment.paymentId});
  const value=(await db.doc(`${f.paths.values}/lot_1`).get()).data();assert.equal(value.credit.remainingCents,10000);assert.equal(value.credit.category,"appointment_advance");
  const anchor=(await db.doc(signedAttendancePath(f.scope,f.op.command.id)).get()).data();assert.equal(anchor.artifactHash,hash(p.artifact));
  assert.equal(anchor.entryHash,hash(result.entry));assert.equal(f.signCalls,1);
  const allocation=(await db.doc(`${f.paths.allocations}/${f.op.command.id}`).get()).data();assert.equal(allocation.amountCents,20000);
});
test("post-sign journal or projection alteration cannot be committed",async()=>{
  const f=await fixture("alter"),p=await f.writer().prepare(f.tokens.admin,f.scope,f.op),bad=structuredClone(p);
  const altered=bad.plan.writes.find(w=>w.path.includes("/journal/redeem_1")).value;altered.lines[0].debitCents++;altered.lines[1].creditCents++;
  await assert.rejects(f.commit(bad),/signed_plan_mismatch|unbalanced/);await untouched(f);
});
for(const kind of ["account","family","consent","policy"])test(`signed attendance rejects changed ${kind} after signing`,async()=>{
  const f=await fixture(`changed_${kind}`),p=await f.writer().prepare(f.tokens.admin,f.scope,f.op);
  const ref=kind==="account"?db.doc(f.paths.account):kind==="family"?f.familyRef:kind==="consent"?db.doc(`${f.paths.consents}/${f.receipt.id}`):db.doc(agreementPolicyPath(f.scope,f.request.policy));
  await ref.update(kind==="account"||kind==="family"?{revision:2}:kind==="policy"?{content:"Altered terms"}:{operationId:"forged"});
  await assert.rejects(f.commit(p),/stale_revision|signed_plan_changed|acceptance|invalid_contract|policy_hash|ownership/);await untouched(f);
});
for(const kind of ["retire","revoke","compromise","revision"])test(`transactional registry ${kind} invalidates uncommitted signature`,async()=>{
  const f=await fixture(`registry_${kind}`),p=await f.writer().prepare(f.tokens.admin,f.scope,f.op);
  await f.publish(v=>{const k=v.keys[0];if(kind==="retire")Object.assign(k,{state:"verification_only",retiredAt:new Date().toISOString()});
    if(kind==="revoke"||kind==="compromise")Object.assign(k,{state:"revoked",revokedAt:new Date().toISOString(),compromised:kind==="compromise"});});
  await assert.rejects(f.commit(p),/key_not_active|review_required|signed_plan_changed/);await untouched(f);
});
test("publisher requires pinned authenticated owner; registry document flags/signatures cannot forge authority",async()=>{
  const f=await fixture("publisher"),next={...f.definition,revision:2};
  await assert.rejects(f.authority.publish(f.tokens.admin,next),/registry_publisher/);await assert.rejects(f.authority.publish("forged",next),/authentication/);
  await db.doc(registryPaths(f.definition.id).current).update({signature:"forged"});
  await assert.rejects(f.writer().prepare(f.tokens.admin,f.scope,f.op),/registry_publisher_signature/);await untouched(f);
});
for(const kind of ["role","scope"])test(`current ${kind} revocation during asynchronous signing denies posting`,async()=>{
  const f=await fixture(`revocation_${kind}`);let release,started;
  const gate=new Promise(r=>{release=r;}),entered=new Promise(r=>{started=r;});
  const writer=f.writer({signBytes:async bytes=>{started();await gate;return f.signing(bytes);}}),preparing=writer.prepare(f.tokens.admin,f.scope,f.op);
  await entered;await db.doc(principalPath(`admin_signed_revocation_${kind}`)).update(kind==="role"?{active:false,revision:2}:{grants:[],revision:2});
  release();const p=await preparing;await assert.rejects(f.commit(p),/authorization_required/);await untouched(f);
});
test("different concurrent signed commands cannot spend twice; same intent returns one immutable result",async()=>{
  const f=await fixture("concurrent"),w=f.writer(),p=await w.prepare(f.tokens.admin,f.scope,f.op);
  const other={...f.op,command:{...f.op.command,id:"other_redemption"}},q=await w.prepare(f.tokens.admin,f.scope,other);
  const results=await Promise.allSettled([f.commit(p),f.commit(q,other)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const winner=results[0].status==="fulfilled"?f.op:other,prepared=results[0].status==="fulfilled"?p:q;
  const replay=await f.commit(prepared,winner);assert.equal(replay.duplicate,true);assert.equal((await f.entries()).length,2);
  assert.equal((await db.collection(f.paths.serviceApplications).get()).size,1);
  const conflict={...winner,command:{...winner.command,amountCents:10000}};await assert.rejects(f.writer().execute(f.tokens.admin,f.scope,conflict),/posting_id_collision/);
});
test("lost commit response recovers with original signed anchor; old ephemeral postings cannot be adopted",async()=>{
  const f=await fixture("uncertain"),w=f.writer(),p=await w.prepare(f.tokens.admin,f.scope,f.op);
  const interrupted={doc:p=>db.doc(p),runTransaction:async(cb,opts)=>{await db.runTransaction(cb,opts);throw Error("response_lost");}};
  await assert.rejects(f.writer({db:interrupted}).commit(f.tokens.admin,f.scope,f.op,p),/response_lost/);
  const replay=await f.commit(p);assert.equal(replay.duplicate,true);assert.equal((await f.entries()).length,2);
  const g=await fixture("old_posting");await g.service.execute(g.tokens.admin,g.scope,g.op);
  await assert.rejects(g.writer().prepare(g.tokens.admin,g.scope,g.op),/durable_attendance_anchor_required/);
});
test("rollback has no journal, projection, family, application or durable-anchor partial writes",async()=>{
  const f=await fixture("rollback"),p=await f.writer().prepare(f.tokens.admin,f.scope,f.op),prior=(await f.familyRef.get()).data();
  const failing={doc:p=>db.doc(p),runTransaction:(cb,opts)=>db.runTransaction(async tx=>{await cb(tx);throw Error("synthetic_rollback");},opts)};
  await assert.rejects(f.writer({db:failing}).commit(f.tokens.admin,f.scope,f.op,p),/synthetic_rollback/);await untouched(f);
  assert.deepEqual((await f.familyRef.get()).data(),prior);assert.equal((await db.doc(signedAttendancePath(f.scope,f.op.command.id)).get()).exists,false);
  await f.commit(p);
});
test("registry change during Firestore retry invalidates the originally signed plan",async()=>{
  const f=await fixture("registry_retry"),p=await f.writer().prepare(f.tokens.admin,f.scope,f.op);let attempts=0;
  const retrying={doc:p=>db.doc(p),runTransaction:(cb,opts)=>db.runTransaction(async tx=>{
    attempts++;if(attempts===2)await f.publish(()=>{});const result=await cb(tx);if(attempts===1)throw Object.assign(Error("aborted"),{code:10});return result;
  },opts)};
  await assert.rejects(f.writer({db:retrying}).commit(f.tokens.admin,f.scope,f.op,p),/signed_plan_changed/);assert.equal(attempts,2);await untouched(f);
});
test("timeout, failed signer and late response produce no financial state",async()=>{
  const f=await fixture("timeout");let release,calls=0;
  const pending=new Promise(r=>{release=r;}),writer=f.writer({signingTimeoutMs:5,maxSigningAttempts:1,signBytes:async bytes=>{calls++;await pending;return f.signing(bytes);}});
  await assert.rejects(writer.prepare(f.tokens.admin,f.scope,f.op),/signer_timeout/);release();await new Promise(r=>setImmediate(r));await untouched(f);assert.equal(calls,1);
  let failures=0;await assert.rejects(f.writer({signBytes:async()=>{failures++;throw Error("signer_failed");}}).prepare(f.tokens.admin,f.scope,f.op),/signer_failed/);
  assert.equal(failures,2);await untouched(f);
});
test("history survives retirement; revocation freezes replay without changing original history",async()=>{
  const f=await fixture("retained_history"),p=await f.writer().prepare(f.tokens.admin,f.scope,f.op);await f.commit(p);
  const original=(await f.entries())[1];await f.publish(v=>Object.assign(v.keys[0],{state:"verification_only",retiredAt:new Date().toISOString()}));
  assert.equal((await f.commit(p)).duplicate,true);
  await f.publish(v=>Object.assign(v.keys[0],{state:"revoked",revokedAt:new Date().toISOString()}));
  await assert.rejects(f.commit(p),/review_required/);assert.deepEqual((await f.entries())[1],original);
});
test("attendance limits, mixed allocations, transferred spending and family holds remain enforced",async()=>{
  const f=await fixture("price_limit");await assert.rejects(f.writer().prepare(f.tokens.admin,f.scope,{...f.op,command:{...f.op.command,amountCents:30000}}),/attendance_exceeds/);
  const g=await fixture("mixed",{mixed:true,price:50000}),op={...g.op,command:{...g.op.command,amountCents:30000}};
  const result=await g.writer().execute(g.tokens.admin,g.scope,op);assert.equal(result.entry.allocation.amountCents,30000);
  const application=(await db.doc(`${g.paths.serviceApplications}/redeem_1`).get()).data();assert.deepEqual(application.plan.allocations.map(a=>a.kind),["appointment_booking_fee","tattoo_advance"]);
  const h=await fixture("transferred");await db.doc(`${h.paths.values}/lot_1`).update({originLotId:"prior"});
  await assert.rejects(h.writer().prepare(h.tokens.admin,h.scope,h.op),/transferred_value_redemption_not_enabled/);
  const j=await fixture("family_hold"),family=(await j.familyRef.get()).data();
  await j.service.coordinateFamily(j.tokens.owner,j.scope,{id:"freeze",type:"freeze",familyId:family.id,caseId:"dispute",amountCents:null,expectedFamilyRevision:family.revision});
  await assert.rejects(j.writer().prepare(j.tokens.admin,j.scope,j.op),/family_value_requires_review|signed_attendance_review_required/);await untouched(j);
  const raw=createFirestoreLedger({db,authorize:async()=>({actorId:"invented",authorizationEvidenceId:"invented"}),transactionalGuard:async()=>()=>{}});
  await assert.rejects(raw.post(j.scope,j.op.command,{}),/protected_attendance_command_required/);
});

test("registry update during actual asynchronous signing cannot be bypassed at commit",async()=>{
  const f=await fixture("registry_signing");let release,started;
  const gate=new Promise(r=>{release=r;}),entered=new Promise(r=>{started=r;});
  const w=f.writer({signBytes:async bytes=>{started();await gate;return f.signing(bytes);}}),preparing=w.prepare(f.tokens.admin,f.scope,f.op);
  await entered;await f.publish(()=>{});release();const p=await preparing;
  await assert.rejects(f.commit(p),/signed_plan_changed/);await untouched(f);
});
test("concurrent identical signed commits have one effect and one protected anchor",async()=>{
  const f=await fixture("same_intent"),p=await f.writer().prepare(f.tokens.admin,f.scope,f.op);
  const results=await Promise.all([f.commit(p),f.commit(p)]);assert.equal(results.filter(r=>r.duplicate).length,1);
  assert.equal((await f.entries()).length,2);assert.equal((await db.collection(`${f.paths.account}/signedAttendanceV1`).get()).size,1);assert.equal(f.signCalls,1);
});
test("valid signed older registry projection cannot roll back the observed revision",async()=>{
  const f=await fixture("rollback_registry"),ref=db.doc(registryPaths(f.definition.id).current),old=(await ref.get()).data();
  await f.publish(()=>{});await ref.set(old);
  await assert.rejects(f.writer().prepare(f.tokens.admin,f.scope,f.op),/registry_rollback_or_identity/);await untouched(f);
});
