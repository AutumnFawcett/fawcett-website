import "server-only";
import {check,record,id,timestamp,scope,dependencies,payload,canonical,hash,same,freeze} from "./contracts.mjs";
import {unsignedArtifact,verifyArtifact} from "./artifacts.mjs";
// Inert integration seam. These callbacks are privileged server implementation,
// not request-supplied hooks. No existing financial adapter consumes this protocol.
function plan(value,now){
  canonical(value);const p=record({actorId:id,scope:v=>{try{scope(v);return true;}catch{return false;}},dependencies:Array.isArray,
    artifact:v=>{try{record({artifactId:id,kind:v=>typeof v==="string",payload:v=>!!v},v);payload(v.kind,v.payload);return true;}catch{return false;}}},value);
  p.dependencies=dependencies(p.dependencies);
  check(p.dependencies.every(d=>d.validUntil===null||now<d.validUntil),"dependency_expired");return freeze(p);
}
export function createProposalCoordinator({store,signer,keyId,getRegistry,clock,maxSigningAttempts=2,ttlMs=15000,signingTimeoutMs=2000}){
  check(Number.isSafeInteger(maxSigningAttempts)&&maxSigningAttempts>=1&&maxSigningAttempts<=3&&Number.isSafeInteger(ttlMs)&&ttlMs>=1&&ttlMs<=15000&&Number.isSafeInteger(signingTimeoutMs)&&signingTimeoutMs>=1&&signingTimeoutMs<=5000,"invalid_proposal_limits");
  check(store&&["readPlan","authorize","readReplay","apply","runTransaction"].every(k=>typeof store[k]==="function")&&typeof clock==="function"&&typeof getRegistry==="function","trusted_store_required");
  const now=()=>{const t=clock();check(timestamp(t),"server_clock_required");return t;};
  function resultFor(operationId,artifact){return freeze({operationId,artifactId:artifact.body.artifactId,artifactHash:hash(artifact),payloadHash:artifact.body.payloadHash});}
  function expected(a){return {kind:a.body.kind,scope:a.body.scope,issuerId:a.body.issuerId,writerKind:a.body.writerKind,subject:a.body.subject};}
  async function prepare(operation){
    canonical(operation);record({id,intent:v=>v&&typeof v==="object"},operation);
    const preparedAt=now(),state=plan(await store.readPlan(null,freeze(operation)),preparedAt);
    const proposal=freeze({schemaVersion:1,operationId:operation.id,intentHash:hash(operation.intent),state,preparedAt,expiresAt:new Date(Date.parse(preparedAt)+ttlMs).toISOString()});
    const unsigned=unsignedArtifact(getRegistry(),{keyId,...state.artifact,scope:state.scope,issuedAt:preparedAt,proposalHash:hash(proposal)});
    // Signer retry never runs in a Firestore callback. No commit on failure.
    let signed;
    for(let attempt=0;attempt<maxSigningAttempts;attempt++){
      check(now()<proposal.expiresAt,"proposal_expired");
      const controller=new AbortController();let timer;
      try{
        signed=await Promise.race([signer.sign(unsigned,{signal:controller.signal}),new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("signer_timeout"));},signingTimeoutMs);})]);break;
      }catch(error){if(attempt===maxSigningAttempts-1)throw error;}finally{clearTimeout(timer);controller.abort();}
    }
    check(now()<proposal.expiresAt,"proposal_expired");return freeze({proposal,signed});
  }
  async function commit(operation,prepared){
    canonical(operation);record({id,intent:v=>v&&typeof v==="object"},operation);
    canonical(prepared);record({proposal:v=>!!v,signed:v=>!!v},prepared);
    const {proposal,signed}=freeze(prepared);
    check(signed.body.keyId===keyId,"signer_authority_mismatch");
    record({schemaVersion:v=>v===1,operationId:id,intentHash:v=>typeof v==="string",state:v=>!!v,preparedAt:timestamp,expiresAt:timestamp},proposal);
    const state=plan(proposal.state,proposal.preparedAt);
    check(operation.id===proposal.operationId&&hash(operation.intent)===proposal.intentHash&&signed.body.proposalHash===hash(proposal),"operation_proposal_mismatch");
    check(same(signed.payload,state.artifact.payload)&&signed.body.artifactId===state.artifact.artifactId&&signed.body.kind===state.artifact.kind
      &&same(signed.body.scope,state.scope)&&signed.body.issuedAt===proposal.preparedAt,"signed_posting_mismatch");
    check(Date.parse(proposal.expiresAt)-Date.parse(proposal.preparedAt)===ttlMs,"invalid_proposal_expiry");
    return store.runTransaction(async tx=>{
      const currentTime=now();
      // Must read the current principal/project grant on EVERY retry, including
      // replays. Auth token status/lease preflight belongs to the protected store.
      await store.authorize(tx,freeze(operation),state.actorId,currentTime);
      const replay=await store.readReplay(tx,operation.id);
      if(replay){
        check(replay.intentHash===proposal.intentHash,"operation_id_conflict");
        check(replay.artifact.body.proposalHash===hash(replay.proposal)&&same(replay.result,resultFor(operation.id,replay.artifact)),"invalid_replay_record");
        check(same(replay.artifact.payload,replay.proposal.state.artifact.payload)&&replay.artifact.body.artifactId===replay.proposal.state.artifact.artifactId,"invalid_replay_record");
        verifyArtifact(getRegistry(),replay.artifact,expected(signed),{mode:"historical",now:currentTime,acceptedAt:replay.acceptedAt,acceptedHash:replay.artifactHash});
        check(replay.proposal.operationId===operation.id&&replay.proposal.intentHash===proposal.intentHash,"invalid_replay_record");
        return freeze(replay.result);
      }
      check(currentTime<proposal.expiresAt,"proposal_expired");
      verifyArtifact(getRegistry(),signed,expected(signed),{mode:"new",now:currentTime});
      const current=plan(await store.readPlan(tx,freeze(operation)),currentTime);
      check(same(current,state),"stale_proposal_reprepare_required");
      // apply must stage ONLY this exact signed effect + immutable replay in the
      // same transaction. It must not call a provider, signer, HTTP or KMS.
      const result=resultFor(operation.id,signed);
      const replayRecord={intentHash:proposal.intentHash,proposal,artifact:signed,artifactHash:hash(signed),acceptedAt:currentTime,result};
      await store.apply(tx,freeze({proposal,signed,replay:replayRecord}));return result;
    });
  }
  return Object.freeze({prepare,commit});
}
