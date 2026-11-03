import test from "node:test";
import assert from "node:assert/strict";
import {memoryFixture,operation,LATER} from "./fixture.mjs";
import {createRegistry} from "../../lib/financial-security/protocol/registry.mjs";

test("proposal is deeply frozen and signs once outside every transaction",async()=>{
  const f=memoryFixture(),c=f.create(),p=await c.prepare(operation);
  assert.ok(Object.isFrozen(p.proposal.state.artifact.payload.entries));assert.throws(()=>p.proposal.state.dependencies[0].revision++);
  const result=await c.commit(operation,p);assert.equal(f.calls,1);assert.equal(f.effects,1);assert.equal(result.payloadHash,p.signed.body.payloadHash);
  assert.deepEqual(await c.commit(operation,p),result);assert.equal(f.effects,1);assert.equal(f.calls,1);
});
for(const kind of ["role","approval","policy","account","family","evidence"])test(`${kind} changes while signing invalidate exact proposal`,async()=>{
  const f=memoryFixture(),c=f.create(),p=await c.prepare(operation);f.state.dependencies.find(d=>d.kind===kind).revision++;
  await assert.rejects(c.commit(operation,p),/stale_proposal/);assert.equal(f.effects,0);
  const fresh=await c.prepare(operation);await c.commit(operation,fresh);assert.equal(f.effects,1);assert.equal(f.calls,2);
});
test("content change with unchanged revision, actor and unsigned posting substitution reject",async()=>{
  const f=memoryFixture(),c=f.create(),p=await c.prepare(operation);
  f.state.artifact.payload.entries.forEach(e=>e.amountCents=15000);
  await assert.rejects(c.commit(operation,p),/stale_proposal/);assert.equal(f.effects,0);
  const altered=structuredClone(p);altered.signed.payload.entries.forEach(e=>e.amountCents=10000);
  await assert.rejects(c.commit(operation,altered),/signed_posting/);
});
test("revoked role, expired approval and expired proposal fail closed",async()=>{
  const f=memoryFixture(),c=f.create(),p=await c.prepare(operation);f.revoke();await assert.rejects(c.commit(operation,p),/revoked/);
  const g=memoryFixture();g.state.dependencies.find(d=>d.kind==="approval").validUntil=LATER;
  const d=g.create(),q=await d.prepare(operation);g.advance(LATER);await assert.rejects(d.commit(operation,q),/dependency_expired/);
  const h=memoryFixture(),e=h.create({ttlMs:1}),r=await e.prepare(operation);h.advance(LATER);await assert.rejects(e.commit(operation,r),/proposal_expired/);
});
test("uncertain commit recovery returns original outcome without a second effect",async()=>{
  const f=memoryFixture(),run=f.store.runTransaction;let lose=true;
  f.store.runTransaction=async cb=>{const result=await run(cb);if(lose){lose=false;throw Error("connection_lost_after_commit");}return result;};
  const c=f.create(),p=await c.prepare(operation);await assert.rejects(c.commit(operation,p),/connection_lost/);
  assert.deepEqual(await c.commit(operation,p),f.replay.result);assert.equal(f.effects,1);
  await assert.rejects(c.commit({...operation,intent:{action:"attend",amountCents:1}},p),/operation_proposal/);
  const conflict=await c.prepare({...operation,intent:{action:"attend",amountCents:1}});
  await assert.rejects(c.commit({...operation,intent:{action:"attend",amountCents:1}},conflict),/operation_id_conflict/);
});
test("revocation still rejects idempotent retries; duplicate ID is not an auth bypass",async()=>{
  const f=memoryFixture(),c=f.create(),p=await c.prepare(operation);await c.commit(operation,p);f.revoke();await assert.rejects(c.commit(operation,p),/revoked/);
});
test("key revocation while signing freezes the uncommitted proposal",async()=>{
  const f=memoryFixture();let registry=f.registry;
  const c=f.create({getRegistry:()=>registry}),p=await c.prepare(operation);
  const value=structuredClone(f.value);value.revision=2;Object.assign(value.keys.find(k=>k.keyId==="key_ledger"),{state:"revoked",revokedAt:LATER});
  registry=createRegistry(value,{expectedId:value.id,previous:registry});f.advance(LATER);
  await assert.rejects(c.commit(operation,p),/review_required/);assert.equal(f.effects,0);
});
test("signer unavailability has bounded retries and no persistence side effects",async()=>{
  const f=memoryFixture();let calls=0;
  const c=f.create({signer:{sign:async()=>{calls++;throw Error("signer_unavailable");}}});
  await assert.rejects(c.prepare(operation),/signer_unavailable/);assert.equal(calls,2);assert.equal(f.effects,0);
  assert.throws(()=>f.create({maxSigningAttempts:4}),/limits/);
});
test("a transient signer failure retries identical frozen bytes outside transactions",async()=>{
  const f=memoryFixture();let first=null,count=0;
  const c=f.create({signer:{sign:async u=>{if(count++===0){first=u;throw Error("temporary");}assert.strictEqual(u,first);return f.signer().sign(u);}}});
  const p=await c.prepare(operation);await c.commit(operation,p);assert.equal(count,2);assert.equal(f.effects,1);
});
test("missing dependency families and fabricated complete proposals cannot bypass trusted state",async()=>{
  const f=memoryFixture();f.state.dependencies=f.state.dependencies.filter(d=>d.kind!=="evidence");await assert.rejects(f.create().prepare(operation),/dependencies/);
});

test("actual asynchronous signing window observes role revocation before commit",async()=>{
  const f=memoryFixture();let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const c=f.create({signer:{sign:async u=>{entered();await gate;return f.signer().sign(u);}}});
  const preparing=c.prepare(operation);await started;f.revoke();release();const p=await preparing;
  await assert.rejects(c.commit(operation,p),/revoked/);assert.equal(f.effects,0);
});
test("actual asynchronous signing window freezes account/family snapshots",async()=>{
  const f=memoryFixture();let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const c=f.create({signer:{sign:async u=>{entered();await gate;return f.signer().sign(u);}}});
  const preparing=c.prepare(operation);await started;f.state.dependencies.find(d=>d.kind==="family").contentHash="0".repeat(64);release();
  const p=await preparing;await assert.rejects(c.commit(operation,p),/stale_proposal/);assert.equal(f.effects,0);
});

test("an unavailable hanging signer times out and exhausts bounded retries",async()=>{
  const f=memoryFixture();let calls=0,aborts=0;
  const c=f.create({signingTimeoutMs:5,signer:{sign:async(u,{signal})=>{calls++;signal.addEventListener("abort",()=>{aborts++;});return new Promise(()=>{});}}});
  await assert.rejects(c.prepare(operation),/signer_timeout/);assert.equal(calls,2);assert.equal(aborts,2);assert.equal(f.effects,0);
});
