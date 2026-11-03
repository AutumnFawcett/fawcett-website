// Local demo Firestore only. The protocol is NOT connected to real adapters.
import test,{after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,sign} from "node:crypto";
import {createLocalFinancialDependencies} from "../../lib/financial-security/runtime.mjs";
import {createProposalCoordinator} from "../../lib/financial-security/protocol/proposal.mjs";
import {hash,dependencyKinds} from "../../lib/financial-security/protocol/contracts.mjs";
import {registryFixture,stateFixture,NOW,LATER,operation} from "../ownership-protocol/fixture.mjs";
const deps=createLocalFinancialDependencies();const {db}=deps;
after(async()=>{await db.terminate();await deps.close();});
async function fixture(){
  const f=registryFixture(),run=`financialProtocolSyntheticRuns/${randomUUID()}`,base=stateFixture();let inside=0,signCalls=0,attempts=0,fail=false,uncertain=false,time=NOW;
  const ref=kind=>db.doc(`${run}/dependencies/${kind}`),op=id=>db.doc(`${run}/operations/${id}`),journal=db.doc(`${run}/journal/signed_effect`);
  const batch=db.batch();for(const kind of dependencyKinds)batch.create(ref(kind),{kind,id:`${kind}_1`,revision:1,validUntil:null,
    value:kind==="role"?{actorId:"admin_1",active:true,clientId:"client_1",projectId:"project_1"}:kind==="evidence"?base.artifact:{approved:true}});
  await batch.commit();
  const read=async(tx,r)=>((await (tx?tx.get(r):r.get())).data());
  const store={
    runTransaction:cb=>db.runTransaction(async tx=>{inside++;attempts++;try{const result=await cb(tx);if(fail)throw Error("rollback_requested");return result;}finally{inside--;}}).then(result=>{if(uncertain){uncertain=false;throw Error("uncertain_commit");}return result;}),
    authorize:async(tx,request,actor)=>{const role=await read(tx,ref("role"));assert.equal(role.value.actorId,actor);if(!role.value.active)throw Error("revoked_role");assert.equal(role.value.clientId,"client_1");assert.equal(role.value.projectId,"project_1");},
    readPlan:async tx=>{
      const rows=await Promise.all(dependencyKinds.map(k=>read(tx,ref(k))));
      return {...base,dependencies:rows.map(r=>({kind:r.kind,id:r.id,revision:r.revision,contentHash:hash(r.value),validUntil:r.validUntil})),artifact:rows.find(r=>r.kind==="evidence").value};
    },
    readReplay:(tx,id)=>read(tx,op(id)),
    apply:async(tx,{signed,replay})=>{tx.create(journal,{artifact:signed});tx.create(op(replay.proposal.operationId),replay);}
  };
  const signer=f.signer("ledger",async bytes=>{assert.equal(inside,0,"external signer inside transaction");signCalls++;await Promise.resolve();return sign(null,bytes,f.privateKeys.key_ledger).toString("base64");});
  const coordinator=createProposalCoordinator({store,signer,keyId:"key_ledger",getRegistry:()=>f.registry,clock:()=>time});
  return {coordinator,store,ref,journal,op,advance:()=>{time=LATER;},failure:v=>{fail=v;},uncertain:()=>{uncertain=true;},
    get calls(){return signCalls;},get attempts(){return attempts;},change:async(kind,patch={})=>{const r=await read(null,ref(kind));await ref(kind).update({revision:r.revision+1,...patch});}};
}
test("protocol emulator: concurrent identical proposals commit one signed effect atomically",async()=>{
  const f=await fixture(),p=await f.coordinator.prepare(operation);
  const results=await Promise.all([f.coordinator.commit(operation,p),f.coordinator.commit(operation,p)]);
  assert.deepEqual(results[0],results[1]);assert.equal((await f.journal.get()).exists,true);assert.equal(f.calls,1);
  assert.ok(f.attempts>=2);assert.equal((await f.op(operation.id).get()).data().artifactHash,hash(p.signed));
});
for(const kind of dependencyKinds)test(`protocol emulator: ${kind} change during signing fails closed`,async()=>{
  const f=await fixture(),p=await f.coordinator.prepare(operation);await f.change(kind);
  await assert.rejects(f.coordinator.commit(operation,p),/stale_proposal/);assert.equal((await f.journal.get()).exists,false);
});
test("protocol emulator: revocation, approval expiry and evidence change deny posting",async()=>{
  const f=await fixture(),p=await f.coordinator.prepare(operation);await f.change("role",{value:{actorId:"admin_1",active:false,clientId:"client_1",projectId:"project_1"}});
  await assert.rejects(f.coordinator.commit(operation,p),/revoked_role/);
  const g=await fixture();await g.change("approval",{validUntil:LATER});const q=await g.coordinator.prepare(operation);g.advance();
  await assert.rejects(g.coordinator.commit(operation,q),/dependency_expired/);assert.equal((await g.journal.get()).exists,false);
});
test("protocol emulator: rollback writes neither effect nor replay; signed proposal can retry",async()=>{
  const f=await fixture(),p=await f.coordinator.prepare(operation);f.failure(true);
  await assert.rejects(f.coordinator.commit(operation,p),/rollback_requested/);
  assert.equal((await f.journal.get()).exists,false);assert.equal((await f.op(operation.id).get()).exists,false);
  f.failure(false);await f.coordinator.commit(operation,p);assert.equal(f.calls,1);
});
test("protocol emulator: uncertain commit and conflicting ID recovery preserve immutable effect",async()=>{
  const f=await fixture(),p=await f.coordinator.prepare(operation);f.uncertain();await assert.rejects(f.coordinator.commit(operation,p),/uncertain_commit/);
  const result=await f.coordinator.commit(operation,p);assert.equal(result.artifactHash,hash(p.signed));assert.equal(f.calls,1);
  const changed={...operation,intent:{action:"attend",amountCents:1}},q=await f.coordinator.prepare(changed);
  await assert.rejects(f.coordinator.commit(changed,q),/operation_id_conflict/);
});
test("protocol emulator: retry rechecks authorization without reentering signer",async()=>{
  const f=await fixture(),p=await f.coordinator.prepare(operation),run=f.store.runTransaction;let attempts=0;
  f.store.runTransaction=callback=>run(async tx=>{attempts++;if(attempts===2)await f.change("role",{value:{actorId:"admin_1",active:false,clientId:"client_1",projectId:"project_1"}});
    const result=await callback(tx);if(attempts===1)throw Object.assign(Error("aborted"),{code:10});return result;});
  await assert.rejects(f.coordinator.commit(operation,p),/revoked_role/);assert.equal(attempts,2);assert.equal(f.calls,1);assert.equal((await f.journal.get()).exists,false);
});
