import test,{after} from "node:test";
import assert from "node:assert/strict";
import {Firestore} from "@google-cloud/firestore";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {emulatorDependencies,setup,accept,receive,transferable,approve,PROJECT} from "./fixture.mjs";
import {sealSyntheticRecords} from "./security-fixture.mjs";
import {createFinancialCommands,principalPath,auditPath} from "../../lib/financial-commands/service.mjs";
import {createFinancialRoleManager} from "../../lib/financial-security/roles.mjs";
import {createFinancialAuthorization} from "../../lib/financial-security/authorization.mjs";
import {createLocalFinancialDependencies} from "../../lib/financial-security/runtime.mjs";
import {createOwnershipWriter,ownershipPath} from "../../lib/financial-security/ownership.mjs";
import {createFirestoreLedger,ledgerPaths,evidencePath} from "../../lib/ledger/server/firestore.mjs";
import {fundingFamilyId} from "../../lib/ledger/funding-family.mjs";
import {hash} from "../../lib/agreements/contracts.mjs";
const deps=emulatorDependencies(),{db,auth,runtime}=deps;
after(async()=>{await db.terminate();await deps.close();});
const manager=(database=db)=>createFinancialRoleManager({db:database,auth,projectId:PROJECT,runtime});
const assignment=(f,patch={})=>({id:`assign_${f.scope.clientId}`,targetUid:`admin_${f.scope.clientId.slice(7)}`,expectedRevision:1,action:"assign",revokeSessions:false,
  assignment:{role:"admin",actions:["receive","redeem"],grants:[{clientId:f.scope.clientId,projectIds:["project_1"]}]},...patch});
const count=async f=>(await db.collection(ledgerPaths(f.scope).journal).get()).size;

test("client self-elevation and owner assignments through role-management commands are denied",async()=>{
  const f=await setup(deps,"security_elevation");
  await assert.rejects(manager().decide(f.tokens.client,f.scope,assignment(f,{targetUid:f.scope.clientId})),/authorization_required/);
  await assert.rejects(manager().decide(f.tokens.owner,f.scope,assignment(f,{assignment:{role:"owner",actions:["manage_roles"],grants:[]}})),/invalid_contract/);
  await assert.rejects(manager().decide(f.tokens.owner,f.scope,{...assignment(f),actorId:"owner"}),/invalid_contract/);
  assert.equal((await db.doc(principalPath(f.scope.clientId)).get()).data().role,"client");
});

test("owner decisions version exact scopes, preserve immutable audit and cannot delegate outside grants",async()=>{
  const f=await setup(deps,"security_grant");const result=await manager().decide(f.tokens.owner,f.scope,assignment(f));
  assert.equal(result.revision,2);assert.equal(result.revocationEpoch,1);
  const decision=(await db.doc(`financialAuthorizationDecisions/${result.decisionId}`).get()).data();
  assert.equal(decision.actorId,"owner_security_grant");assert.equal(decision.targetUid,"admin_security_grant");assert.ok(Date.parse(decision.recordedAt)<=Date.now());
  await assert.rejects(manager().decide(f.tokens.owner,f.scope,assignment(f,{id:"foreign",expectedRevision:2,assignment:{role:"admin",actions:["receive"],grants:[{clientId:f.scope.clientId,projectIds:["outside"]}]}})),/role_scope_escalation/);
  await assert.rejects(manager().decide(f.tokens.owner,f.scope,assignment(f,{id:"privilege",expectedRevision:2,assignment:{role:"admin",actions:["transfer"],grants:[{clientId:f.scope.clientId,projectIds:["project_1"]}]}})),/role_scope_escalation/);
});

test("Firestore revocation immediately blocks financial commands even while Auth user remains enabled",async()=>{
  const f=await setup(deps,"security_revoke"),receipt=await accept(f);
  const result=await manager().decide(f.tokens.owner,f.scope,assignment(f,{id:"revoke",action:"revoke",assignment:null,revokeSessions:true}));
  assert.equal(result.active,false);assert.equal((await auth.getUser("admin_security_revoke")).disabled,false);
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(receipt)),/authorization_required/);
  assert.equal(await count(f),0);
  const row=(await db.doc(principalPath("admin_security_revoke")).get()).data();assert.ok(row.validAfterSeconds>Math.floor(Date.now()/1000)-1);
});

test("role revision change during retry fails closed despite retaining the requested action",async()=>{
  const f=await setup(deps,"security_role_retry"),receipt=await accept(f);let attempts=0;
  const retrying={doc:p=>db.doc(p),runTransaction:(callback,options)=>db.runTransaction(async tx=>{
    attempts++;if(attempts===2)await manager().decide(f.tokens.owner,f.scope,assignment(f));
    const result=await callback(tx);if(attempts===1)throw Object.assign(Error("aborted"),{code:10});return result;
  },options)};
  const service=createFinancialCommands({db:retrying,auth,projectId:PROJECT,runtime});
  await assert.rejects(service.execute(f.tokens.admin,f.scope,receive(receipt)),/authorization_revision_changed/);
  assert.equal(attempts,2);assert.equal(await count(f),0);
});

test("revoking an owner invalidates prior transfer approvals without consuming them",async()=>{
  const f=await transferable(deps,"security_owner_revoke");await approve(f);
  await manager().decide(f.tokens.owner,f.scope,assignment(f,{id:"revoke_owner",targetUid:"owner_security_owner_revoke",action:"revoke",assignment:null,revokeSessions:true}));
  await assert.rejects(f.service.execute(f.tokens.owner,f.scope,f.op),/authorization_required/);
  assert.equal(await count(f),1);assert.equal((await db.collection(f.paths.approvalUses).get()).size,0);
});

test("role-operation uncertain commits are idempotent and conflicting IDs are rejected",async()=>{
  const f=await setup(deps,"security_uncertain"),input=assignment(f);
  const lost={doc:p=>db.doc(p),runTransaction:async(...args)=>{await db.runTransaction(...args);throw Error("response_lost");}};
  await assert.rejects(manager(lost).decide(f.tokens.owner,f.scope,input),/response_lost/);
  assert.equal((await manager().decide(f.tokens.owner,f.scope,input)).duplicate,true);
  await assert.rejects(manager().decide(f.tokens.owner,f.scope,{...input,revokeSessions:true}),/role_operation_id_collision/);
  assert.equal((await db.doc(principalPath(input.targetUid)).get()).data().revision,2);
});

test("runtime rejects missing/fabricated profiles, wrong actual databases and mismatched Auth projects",async()=>{
  assert.throws(()=>createFinancialCommands({db,auth,projectId:"demo-wrong",runtime}),/financial_auth_project_mismatch/);
  assert.throws(()=>createFinancialCommands({db,auth,projectId:PROJECT}),/financial_runtime_required/);
  assert.throws(()=>createFinancialCommands({db,auth,projectId:PROJECT,runtime:{...runtime}}),/financial_runtime_required/);
  const other=new Firestore({projectId:"demo-other",databaseId:"(default)",host:"127.0.0.1:8087",ssl:false});
  const named=new Firestore({projectId:PROJECT,databaseId:"other",host:"127.0.0.1:8087",ssl:false});
  try{for(const database of [other,named])assert.throws(()=>createFinancialCommands({db:database,auth,projectId:PROJECT,runtime}),/unbound_financial_database/);}
  finally{await other.terminate();await named.terminate();}
  const app=initializeApp({projectId:"demo-other"},"wrong-auth-project");
  try{assert.throws(()=>createFinancialCommands({db,auth:getAuth(app),projectId:PROJECT,runtime}),/financial_auth_database_binding_mismatch/);}finally{await deleteApp(app);}
  assert.throws(()=>db.settings({projectId:"different"}),/settings|initialized|once/);
});

test("Preview/Production confusion and changed emulator configuration fail before commands",async()=>{
  const f=await setup(deps,"security_runtime"),receipt=await accept(f);
  for(const mode of ["preview","production"]){const old=process.env.VERCEL_ENV;
    try{process.env.VERCEL_ENV=mode;assert.throws(createLocalFinancialDependencies,/deployed_financial_runtime_not_enabled/);
      await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(receipt)),/deployed_financial_runtime_not_enabled/);
    }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
  }
  await assert.rejects(f.service.execute(f.tokens.admin,{...f.scope,environment:"production"},receive(receipt)),/financial_environment_mismatch/);
  assert.equal(await count(f),0);
});

test("forged provider flags and matching hashes cannot substitute for trusted writer signatures",async()=>{
  const f=await setup(deps,"security_evidence"),receipt=await accept(f),path=evidencePath(f.scope,"payments","evidence_1");
  const payment={...f.payment,paymentId:"forged_payment"};await db.doc(path).set(payment);
  await db.doc(`${f.paths.readbacks}/evidence_1`).update({paymentHash:hash(payment)});
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(receipt)),/provider_ownership_required/);
  const old=(await db.doc(ownershipPath(db,path,f.payment)).get()).data();
  await db.doc(ownershipPath(db,path,payment)).set({...old,recordHash:hash(payment),signature:Buffer.alloc(64).toString("base64")});
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,receive(receipt)),/provider_ownership_required/);
  assert.equal(await count(f),0);
});

test("command and role writers cannot claim provider or each other's audit ownership",async()=>{
  const f=await setup(deps,"security_writer"),batch=db.batch();
  assert.throws(()=>createOwnershipWriter(db,"command").seal(batch,"provider",evidencePath(f.scope,"payments","fake"),f.payment),/unauthorized_record_writer/);
  assert.throws(()=>createOwnershipWriter(db,"role").seal(batch,"audit",auditPath(f.scope,"receive","fake"),{}),/unauthorized_record_writer/);
  const response=await fetch(`http://127.0.0.1:8087/v1/projects/${PROJECT}/databases/(default)/documents/financialRecordOwnership/forged`,{method:"PATCH",
    headers:{Authorization:`Bearer ${f.tokens.client}`,"Content-Type":"application/json"},body:JSON.stringify({fields:{signature:{stringValue:"forged"}}})});
  assert.equal(response.status,403);
});

test("changing an admin document to owner without an authentic role decision fails closed",async()=>{
  const f=await transferable(deps,"security_forged_owner");
  await db.doc(principalPath("admin_security_forged_owner")).update({role:"owner",actions:["approve_transfer","transfer"]});
  await assert.rejects(f.service.approveTransfer(f.tokens.admin,f.scope,{id:"approval_1",operation:f.op,expiresAt:new Date(Date.now()+60000).toISOString()}),/principal_ownership_required/);
  assert.equal(await count(f),1);
});

test("client/project grants are exact pairs, not the cross product of flat lists",async()=>{
  const f=await setup(deps,"security_pairs"),ref=db.doc(principalPath("owner_security_pairs")),p=(await ref.get()).data();
  await ref.set({...p,clientIds:[f.scope.clientId,"different_client"],projectIds:["project_1","project_2"],grants:[...p.grants,{clientId:"different_client",projectIds:["project_2"]}]});
  await sealSyntheticRecords(db,[ref.path]);
  const security=createFinancialAuthorization({db,auth,projectId:PROJECT,runtime}),identity=await security.authenticate(f.tokens.owner);
  await assert.rejects(db.runTransaction(tx=>security.authorize(tx,identity,f.scope,"manage_roles","project_2")),/project_authorization_required/);
});

test("authenticated family coordination preserves holds and requires owner scope to release",async()=>{
  const f=await transferable(deps,"security_family");await approve(f);await f.service.execute(f.tokens.owner,f.scope,f.op);
  const input={id:"freeze",type:"freeze",familyId:fundingFamilyId(f.payment),caseId:"dispute",amountCents:null,expectedFamilyRevision:2};
  await assert.rejects(f.service.coordinateFamily(f.tokens.client,f.scope,input),/authorization_required/);
  await f.service.coordinateFamily(f.tokens.owner,f.scope,input);
  assert.equal((await f.service.coordinateFamily(f.tokens.owner,f.scope,input)).duplicate,true);
  assert.equal((await db.doc(ledgerPaths(f.scope).account).get()).data().summary.availablePurchasedCents,0);
  await assert.rejects(f.service.coordinateFamily(f.tokens.admin,f.scope,{...input,id:"release",type:"release_dispute",expectedFamilyRevision:3}),/authorization_required/);
  const audit=(await db.doc(auditPath(f.scope,"family_freeze","freeze")).get()).data();assert.equal(audit.actorId,"owner_security_family");
});

test("tampered replay metadata cannot borrow authenticity from an unchanged signed journal",async()=>{
  const f=await setup(deps,"security_replay"),receipt=await accept(f),op=receive(receipt);
  await f.service.execute(f.tokens.admin,f.scope,op);
  await db.doc(`${ledgerPaths(f.scope).operations}/${op.command.id}`).update({authorizationEvidenceId:"forged_authority"});
  await assert.rejects(f.service.execute(f.tokens.admin,f.scope,op),/journal_ownership_required/);
  assert.equal(await count(f),1);
});
