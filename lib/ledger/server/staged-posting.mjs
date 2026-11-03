import "server-only";
import {localLedgerContext} from "../../financial-security/runtime.mjs";
import {canonical,check,hash,freeze,same} from "../../financial-security/protocol/contracts.mjs";
// Narrow recording facade for the existing adapter: only point reads and exact
// create/set writes. It cannot commit while preparing or accept arbitrary SDK ops.
const staging=new WeakMap();
export function deferStagedOwnership(tx,kind,path,payload){
  const state=staging.get(tx);if(!state)return false;
  state.deferred.push(freeze({kind,path,payload}));tx.create(state.dbRef(path),{...payload,signature:null});return true;
}
export function stagePosting(tx,db){
  const reads=new Map(),writes=[],deferred=[];
  const remember=snap=>{
    const item={path:snap.ref.path,exists:snap.exists,contentHash:hash(snap.exists?snap.data():null)};
    check(!reads.has(item.path)||same(reads.get(item.path),item),"inconsistent_staged_read");reads.set(item.path,item);return snap;
  };
  const point=ref=>check(typeof ref?.path==="string"&&ref.path.split("/").length%2===0
    &&ref.firestore===db.doc("financialRuntime/probe").firestore,"point_reference_required");
  const stage=(type,ref,value,extra)=>{point(ref);check(extra.length===0&&!writes.some(w=>w.path===ref.path),"unsupported_staged_write");
    writes.push(freeze({type,path:ref.path,value}));return facade;};
  const facade={
    get:async ref=>{point(ref);check(!writes.length,"read_after_staged_write");return remember(await tx.get(ref));},
    getAll:async(...refs)=>{refs.forEach(point);check(!writes.length,"read_after_staged_write");return (await tx.getAll(...refs)).map(remember);},
    create:(ref,value,...extra)=>stage("create",ref,value,extra),set:(ref,value,...extra)=>stage("set",ref,value,extra),
    delete:()=>{throw Error("staged_deletion_not_enabled");}
  };
  staging.set(facade,{deferred,dbRef:path=>db.doc(path)});
  return {tx:facade,snapshot:()=>{
    check(reads.size<=128&&writes.length<=32,"staged_posting_limit");
    return freeze({reads:[...reads.values()].sort((a,b)=>a.path<b.path?-1:1),writes,deferredOwnership:deferred});
  }};
}
export function applyStagedPosting(tx,db,plan){
  // The protected caller has just recomputed and compared this entire plan.
  for(const write of plan.writes){check(["create","set"].includes(write.type),"unsupported_staged_write");tx[write.type](db.doc(write.path),write.value);}
}

// Only prepare calls this after its read-only transaction has returned. Existing
// schema-1 seals for NEW records coexist with the new durable envelope.
export function signStagedOwnership(db,snapshot){
  const ctx=localLedgerContext(db),value=structuredClone(snapshot);
  for(const seal of value.deferredOwnership){
    const write=value.writes.find(w=>w.path===seal.path);check(same(write.value,{...seal.payload,signature:null}),"staged_seal_mismatch");
    write.value.signature=ctx.signOwnership(seal.kind,Buffer.from(canonical(seal.payload)));
  }
  return freeze(value);
}
// Commit verifies precomputed seals and attaches them to exactly matching staged
// payloads. No signature creation occurs in a transaction callback.
export function attachStagedOwnership(db,snapshot,prepared){
  const ctx=localLedgerContext(db),value=structuredClone(snapshot);
  check(same(value.deferredOwnership,prepared.deferredOwnership),"staged_seal_mismatch");
  for(const seal of value.deferredOwnership){
    const expected=prepared.writes.find(w=>w.path===seal.path),write=value.writes.find(w=>w.path===seal.path);
    check(expected&&same(write.value,{...seal.payload,signature:null})&&same({...expected.value,signature:null},write.value)
      &&ctx.verifyOwnership(seal.kind,Buffer.from(canonical(seal.payload)),expected.value.signature),"staged_seal_mismatch");
    write.value.signature=expected.value.signature;
  }
  return freeze(value);
}
