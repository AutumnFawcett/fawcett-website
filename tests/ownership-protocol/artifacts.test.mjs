import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {registryFixture,unsigned,expected,writerFor,NOW,LATER,SCOPE} from "./fixture.mjs";
import {createRegistry} from "../../lib/financial-security/protocol/registry.mjs";
import {verifyArtifact} from "../../lib/financial-security/protocol/artifacts.mjs";
import {canonical,hash,writers} from "../../lib/financial-security/protocol/contracts.mjs";
const verify=(registry,a,context={})=>verifyArtifact(registry,a,expected(a),{mode:"new",now:NOW,...context});
function rotate(f,change){const v=structuredClone(f.value);v.revision=2;change(v);return createRegistry(v,{expectedId:v.id,previous:f.registry});}
for(const kind of Object.values(writers).flat())test(`valid canonical ${kind} artifact`,async()=>{
  const f=registryFixture(),a=await f.signer(writerFor(kind)).sign(unsigned(f,kind));assert.deepEqual(verify(f.registry,a),a);
});
test("canonical bytes reject ambiguous or non-integer JSON without changing the original",()=>{
  assert.equal(canonical({z:1,a:[true,null,"a"]}),'{"a":[true,null,"a"],"z":1}');
  for(const value of [undefined,NaN,1.2,-0,new Date(),[,1],{a:undefined},{a:"\ud800"},Object.create({a:1})])assert.throws(()=>canonical(value));
  assert.throws(()=>canonical(Object.defineProperty({a:1},"hidden",{value:2})));assert.throws(()=>canonical({get a(){return 1;}}));
});
test("payload alterations, forged signatures, extra fields and unsupported versions reject",async()=>{
  const f=registryFixture(),a=await f.signer().sign(unsigned(f));
  for(const mutate of [x=>x.signature="A".repeat(86)+"==",x=>x.payload.entries[0].amountCents++,x=>x.body.artifactSchemaVersion=2,x=>x.body.protocolVersion=2,x=>x.body.actorId="owner",x=>x.body.payloadHash=hash("fake")]){
    const altered=structuredClone(a);mutate(altered);assert.throws(()=>verify(f.registry,altered));
  }
});
test("issuer and exact project/database/environment/subject bind the signature",async()=>{
  const f=registryFixture(),a=await f.signer().sign(unsigned(f));
  for(const mutate of [x=>x.body.issuerId="claimed_owner",x=>x.body.scope.projectId="production",x=>x.body.scope.databaseId="other",x=>x.body.scope.environment="production",x=>x.body.subject.clientId="client_2"]){
    const bad=structuredClone(a);mutate(bad);assert.throws(()=>verify(f.registry,bad));
  }
  assert.throws(()=>verifyArtifact(f.registry,a,{...expected(a),scope:{...SCOPE,environment:"production"}},{mode:"new",now:NOW}),/target/);
  assert.throws(()=>verify({...f.registry},a),/trusted_registry/);
});
test("key collisions, shared material, unknown fields and unsupported algorithms reject",()=>{
  for(const change of [v=>v.keys.push(v.keys[0]),v=>v.keys[0].algorithm="RSA",v=>v.keys[0].privateKey="forbidden",v=>v.keys[1].publicKey=v.keys[0].publicKey,v=>v.keys[0].artifactTypes.push("owner_decision")]){
    const f=registryFixture(),v=structuredClone(f.value);change(v);assert.throws(()=>createRegistry(v,{expectedId:v.id}));
  }
});
test("writer authorities cannot cross-sign and no claimed role grants signing authority",async()=>{
  const f=registryFixture();await assert.rejects(f.signer("provider_verifier").sign(unsigned(f,"owner_decision")),/authority/);
  await assert.rejects(f.signer("ledger").sign(unsigned(f,"provider_payment")),/authority/);
  const bad=unsigned(f);await assert.rejects(f.signer().sign({...bad,role:"owner"}),/invalid_contract/);
});
test("retired key preserves anchored history but rejects new/backdated issuance",async()=>{
  const f=registryFixture(),a=await f.signer().sign(unsigned(f));
  const rotated=rotate(f,v=>{v.keys.find(k=>k.keyId==="key_ledger").state="verification_only";v.keys.find(k=>k.keyId==="key_ledger").retiredAt=LATER;});
  assert.throws(()=>verify(rotated,a),/key_not_active/);
  assert.deepEqual(verify(rotated,a,{mode:"historical",now:LATER,acceptedAt:NOW,acceptedHash:hash(a)}),a);
  assert.throws(()=>verify(rotated,a,{mode:"historical",now:LATER,acceptedAt:LATER,acceptedHash:hash(a)}),/retirement/);
  assert.throws(()=>verify(rotated,a,{mode:"historical",now:LATER,acceptedAt:NOW,acceptedHash:hash("fake")}),/historical/);
});
test("revoked or compromised keys freeze history for review rather than deleting it",async()=>{
  const f=registryFixture(),a=await f.signer().sign(unsigned(f));
  for(const compromised of [false,true]){
    const r=rotate(f,v=>Object.assign(v.keys.find(k=>k.keyId==="key_ledger"),{state:"revoked",revokedAt:LATER,compromised}));
    assert.throws(()=>verify(r,a,{mode:"historical",now:LATER,acceptedAt:NOW,acceptedHash:hash(a)}),/review_required/);assert.equal(a.payload.currency,"CAD");
  }
});
test("rotation retains key identity, rejects rollback/reactivation and supports a new key",async()=>{
  const f=registryFixture(),old=await f.signer().sign(unsigned(f));
  const value=structuredClone(f.value);value.revision=2;
  const pair=generateKeyPairSync("ed25519");value.keys.push({...value.keys.find(k=>k.keyId==="key_ledger"),keyId:"key_ledger_2",introducedRevision:2,publicKey:pair.publicKey.export({type:"spki",format:"der"}).toString("base64")});
  const r=createRegistry(value,{expectedId:value.id,previous:f.registry});assert.deepEqual(verify(r,old),old);
  for(const change of [v=>v.keys.pop(),v=>v.revision=1,v=>v.keys[0].issuerId="other"]){
    const bad=structuredClone(value);bad.revision=3;change(bad);assert.throws(()=>createRegistry(bad,{expectedId:value.id,previous:r}));
  }
});
test("EXTERNAL, missing capture and unbalanced or promotional money payloads cannot be signed",async()=>{
  const f=registryFixture();
  for(const [kind,mutate] of [["provider_payment",p=>p.sourceType="EXTERNAL"],["provider_payment",p=>p.cardStatus=null],["financial_journal",p=>p.entries[0].amountCents++],["provider_payment",p=>p.externalDetailsAbsent=false]]){
    const u=structuredClone(unsigned(f,kind));mutate(u.payload);u.body.payloadHash=hash(u.payload);await assert.rejects(f.signer(writerFor(kind)).sign(u));
  }
});

test("retirement and revocation cannot be undone by a later registry version",()=>{
  const f=registryFixture();
  for(const state of ["verification_only","revoked"]){
    const v=structuredClone(f.value);v.revision=2;const k=v.keys[0];Object.assign(k,{state,...(state==="revoked"?{revokedAt:LATER}:{retiredAt:LATER})});
    const r=createRegistry(v,{expectedId:v.id,previous:f.registry});v.revision=3;Object.assign(k,{state:"active",retiredAt:null,revokedAt:null});
    assert.throws(()=>createRegistry(v,{expectedId:v.id,previous:r}),/reactivated|changed/);
  }
});
test("compromise freezes all keys of an issuer, including a rotated active key",async()=>{
  const f=registryFixture(),a=await f.signer().sign(unsigned(f)),v=structuredClone(f.value);v.revision=2;
  const k=v.keys.find(k=>k.keyId==="key_ledger");const pair=generateKeyPairSync("ed25519");
  v.keys.push({...k,keyId:"key_rotated",introducedRevision:2,publicKey:pair.publicKey.export({type:"spki",format:"der"}).toString("base64"),state:"revoked",revokedAt:LATER,compromised:true});
  const r=createRegistry(v,{expectedId:v.id,previous:f.registry});assert.throws(()=>verify(r,a,{now:LATER}),/issuer_compromised/);
});
test("owner approval expiry and unsupported signing algorithm reject new artifacts",async()=>{
  const f=registryFixture(),a=await f.signer("owner_administration").sign(unsigned(f,"owner_decision"));
  assert.throws(()=>verify(f.registry,a,{now:LATER}),/approval_expired/);
  const bad=structuredClone(a);bad.body.algorithm="RSA";assert.throws(()=>verify(f.registry,bad));
});
