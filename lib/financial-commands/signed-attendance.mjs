import "server-only";
import {createFinancialCommands} from "./service.mjs";
import {assertFinancialRuntime} from "../financial-security/runtime.mjs";
import {registryAuthorityContext} from "../financial-security/registry-emulator.mjs";
import {registryKey} from "../financial-security/protocol/registry.mjs";
import {createArtifactSigner,unsignedArtifact,verifyArtifact} from "../financial-security/protocol/artifacts.mjs";
import {check,record,id,timestamp,hash,same,freeze} from "../financial-security/protocol/contracts.mjs";
import {stagePosting,applyStagedPosting,signStagedOwnership,attachStagedOwnership} from "../ledger/server/staged-posting.mjs";
import {ledgerPaths} from "../ledger/server/firestore.mjs";
import {validateJournal} from "../ledger/engine.mjs";
export const signedAttendancePath=(scope,operationId)=>{check(id(operationId),"invalid_operation_id");return `${ledgerPaths(scope).account}/signedAttendanceV1/${operationId}`;};
// Bounded operation identity; accepted legacy artifact IDs remain readable.
export const signedAttendanceArtifactId=(resource,scope,operationId)=>{
  ledgerPaths(scope);check(id(operationId),"invalid_operation_id");
  return `attendance_${hash({protocol:"signed_attendance_v1",resource,scope,operationId})}`;
};
// Internal, emulator-only composition. Not exported through the application entry.
// The existing protected attendance command, engine and adapter remain authoritative.
export function createSignedAttendanceCommands({db,auth,projectId,runtime,registryAuthority,keyId,issuerId,signBytes,clock=()=>Date.now(),signingTimeoutMs=2000,maxSigningAttempts=2}){
  const binding={db,auth,projectId,runtime};assertFinancialRuntime(binding);
  const registry=registryAuthorityContext(registryAuthority,db);
  check(id(keyId)&&id(issuerId)&&typeof signBytes==="function"&&Number.isSafeInteger(signingTimeoutMs)&&signingTimeoutMs>0&&signingTimeoutMs<=5000
    &&Number.isSafeInteger(maxSigningAttempts)&&maxSigningAttempts>0&&maxSigningAttempts<=3,"invalid_signing_authority");
  const now=()=>new Date(clock()).toISOString();
  function request(scope,operation){
    assertFinancialRuntime(binding,scope);ledgerPaths(scope);
    check(operation?.command?.type==="redeem"&&operation.command.purpose==="tattoo_service"&&operation.command.creditType==="purchased"
      &&operation.approvalId===null&&operation.legacy===null,"signed_attendance_only");
    return freeze({scope,operation});
  }
  function expected(scope,operation){return {kind:"financial_journal",issuerId,writerKind:"ledger",scope:registry.resource,
    subject:{clientId:scope.clientId,requestId:operation.agreementId,transactionId:operation.command.id}};}
  function signedJournal(plan){
    check(Array.isArray(plan.writes),"signed_journal_write_required");
    const journals=plan.writes.filter(w=>typeof w.path==="string"&&w.path.includes("/journal/"));
    const path=`${ledgerPaths(plan.scope).journal}/${plan.operation.command.id}`;
    check(journals.length===1&&journals[0].type==="create"&&journals[0].path===path,"signed_journal_write_required");
    const entry=validateJournal(journals[0].value);
    check(entry.id===plan.operation.command.id&&entry.clientId===plan.scope.clientId&&entry.environment===plan.scope.environment
      &&entry.command.actorId===plan.actorId,"signed_journal_scope_mismatch");return entry;
  }
  function normalized(plan){
    const entry=signedJournal(plan);
    const family=plan.writes.find(w=>w.path.startsWith("financialFundingFamilies/")&&w.path.split("/").length===2)?.value;
    check(entry.command.type==="redeem"&&entry.command.creditType==="purchased"&&entry.command.purpose==="tattoo_service"&&family,"signed_attendance_effect_required");
    return {clientId:plan.scope.clientId,requestId:plan.operation.agreementId,currency:"CAD",transactionId:entry.id,fundingFamilyId:family.id,
      policyVersion:entry.policy.version,auditId:plan.auditId,entries:entry.lines.map(line=>({accountId:line.account,allocationId:entry.allocation.id,
        side:line.debitCents?"debit":"credit",amountCents:line.debitCents||line.creditCents}))};
  }
  function verifyPrepared(current,prepared,scope,operation,context){
    record({plan:v=>!!v,artifact:v=>!!v},prepared);const {plan,artifact}=prepared;
    check(plan.protocol==="signed_attendance_v1"&&plan.schemaVersion===1&&same(plan.scope,scope)&&same(plan.operation,operation)
      &&plan.registryId===registry.registryId,"signed_plan_scope_mismatch");
    if(context.mode==="new")check(artifact.body.keyId===keyId
      &&artifact.body.artifactId===signedAttendanceArtifactId(registry.resource,scope,operation.command.id),"current_signing_key_or_id_required");
    check(plan.intentHash===hash({scope,operation,actorId:plan.actorId})&&artifact.body.proposalHash===hash(plan)&&same(artifact.payload,normalized(plan)),"signed_plan_mismatch");
    check(timestamp(plan.preparedAt)&&timestamp(plan.expiresAt)&&Date.parse(plan.expiresAt)-Date.parse(plan.preparedAt)===15000
      &&artifact.body.issuedAt===plan.preparedAt&&artifact.body.registryRevision===plan.registryRevision,"signed_plan_time_mismatch");
    // Original key authority comes from the pinned registry, never the current
    // issuance configuration or a registry supplied with the artifact.
    const original=context.mode==="historical"?registryKey(current.registry,artifact.body.keyId):null;
    verifyArtifact(current.registry,artifact,{...expected(scope,operation),...(original?{issuerId:original.issuerId}:{})},context);
  }
  async function sign(current,plan){
    const signer=createArtifactSigner({registry:current.registry,keyId,issuerId,writerKind:"ledger",signBytes});
    const unsigned=unsignedArtifact(current.registry,{keyId,artifactId:signedAttendanceArtifactId(registry.resource,plan.scope,plan.operation.command.id),kind:"financial_journal",scope:registry.resource,
      payload:normalized(plan),issuedAt:plan.preparedAt,proposalHash:hash(plan)});
    for(let attempt=0;attempt<maxSigningAttempts;attempt++){
      check(now()<plan.expiresAt,"signed_proposal_expired");const controller=new AbortController();let timer;
      try{return await Promise.race([signer.sign(unsigned,{signal:controller.signal}),new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("signer_timeout"));},signingTimeoutMs);})]);}
      catch(error){if(attempt===maxSigningAttempts-1)throw error;}finally{clearTimeout(timer);controller.abort();}
    }
  }
  // Each invocation authenticates with Firebase outside all Firestore callbacks.
  // postingClock freezes only journal/audit time; authentication still uses live time.
  async function run(token,scope,operation,prepared){
    const start=prepared?.plan.preparedAt??now();
    const facade={doc:path=>db.doc(path),runTransaction:(callback,options)=>db.runTransaction(async tx=>{
      const current=await registry.read(tx),anchorRef=db.doc(signedAttendancePath(scope,operation.command.id));
      const anchor=(await tx.get(anchorRef)).data();
      const stage=stagePosting(tx,db),result=await callback(stage.tx);
      if(result.duplicate){
        // No old operation is adopted/re-signed; only explicitly versioned new
        // anchors created by this path can return a durable historical replay.
        check(anchor?.protocol==="signed_attendance_anchor_v1","durable_attendance_anchor_required");
        check(anchor.intentHash===hash({scope,operation,actorId:result.entry.command.actorId})
          &&same(anchor.prepared.plan.operation,operation),"signed_replay_mismatch");
        verifyPrepared(current,anchor.prepared,scope,operation,{mode:"historical",now:now(),acceptedAt:anchor.acceptedAt,acceptedHash:anchor.artifactHash});
        const journal=signedJournal(anchor.prepared.plan),entryHash=hash(journal);
        check(same(result.entry,journal)&&anchor.entryHash===entryHash&&anchor.intentHash===anchor.prepared.plan.intentHash
          &&hash(anchor.prepared.artifact)===anchor.artifactHash,"signed_replay_mismatch");
        check(!stage.snapshot().writes.length,"duplicate_staged_effect");
        return {prepared:anchor.prepared,result:{...result,artifactHash:anchor.artifactHash}};
      }
      check(!anchor,"signed_anchor_collision");
      check(result.entry&&!result.outcome,"signed_attendance_review_required");
      const staged=stage.snapshot(),snapshot=prepared?attachStagedOwnership(db,staged,prepared.plan):staged,audit=snapshot.writes.find(w=>w.path.startsWith("financialCommandAudits/")&&w.value.action==="redeem");
      check(audit,"signed_audit_required");
      const plan=freeze({protocol:"signed_attendance_v1",schemaVersion:1,scope,operation,actorId:result.entry.command.actorId,
        intentHash:hash({scope,operation,actorId:result.entry.command.actorId}),preparedAt:start,expiresAt:new Date(Date.parse(start)+15000).toISOString(),
        registryId:registry.registryId,registryRevision:current.projection.revision,registryHash:current.hash,auditId:audit.path.split("/").at(-1),...snapshot});
      check(now()<plan.expiresAt,"signed_proposal_expired");
      if(!prepared)return {plan,current}; // Read-only transaction: staged writes discarded.
      verifyPrepared(current,prepared,scope,operation,{mode:"new",now:now()});
      check(same(plan,prepared.plan),"signed_plan_changed_reprepare_required");
      applyStagedPosting(tx,db,snapshot);
      const artifactHash=hash(prepared.artifact),acceptedAt=now();
      tx.create(anchorRef,{protocol:"signed_attendance_anchor_v1",schemaVersion:1,intentHash:plan.intentHash,entryHash:hash(result.entry),
        artifactHash,acceptedAt,registryRevision:current.projection.revision,prepared});
      return {prepared,result:{...result,artifactHash}};
    },options)};
    const service=createFinancialCommands({...binding,db:facade,clock,postingClock:()=>Date.parse(start)});
    return service.execute(token,scope,operation);
  }
  // Capture facade's transaction return without changing the existing service API.
  // run returns the custom runTransaction result through execute().
  async function prepare(token,scope,input){
    const {scope:target,operation}=request(scope,input);const result=await run(token,target,operation,null);
    if(result.prepared)return freeze(result.prepared);
    const plan=signStagedOwnership(db,result.plan);
    const artifact=await sign(result.current,plan);check(now()<plan.expiresAt,"signed_proposal_expired");
    return freeze({plan,artifact});
  }
  async function commit(token,scope,input,prepared){
    const {scope:target,operation}=request(scope,input);const frozen=freeze(prepared);
    const result=await run(token,target,operation,frozen);return freeze(result.result);
  }
  return Object.freeze({prepare,commit,async execute(token,scope,operation){return commit(token,scope,operation,await prepare(token,scope,operation));}});
}
