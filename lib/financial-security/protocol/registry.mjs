import "server-only";
import {createPublicKey} from "node:crypto";
import {check,record,id,revision,timestamp,optionalTime,oneOf,writerKind,artifactKind,writers,scope,canonical,freeze,same} from "./contracts.mjs";
const registries=new WeakMap();
// Only trusted server configuration may call this constructor. A registry shipped
// with an artifact is never an authority. No registry persistence writer exists.
export function createRegistry(value,{expectedId,minimumRevision=1,previous=null}={}){
  canonical(value);
  const r=record({schemaVersion:v=>v===1,id,revision,keys:v=>Array.isArray(v)&&v.length>0&&v.length<=128},value);
  check(r.id===expectedId&&r.revision>=minimumRevision,"registry_rollback_or_identity");
  const keys=new Map(),material=new Set();
  for(const item of r.keys){
    const k=record({keyId:id,issuerId:id,writerKind,algorithm:v=>v==="Ed25519",publicKey:v=>typeof v==="string"&&v.length<1024,
      scope:v=>{try{scope(v);return true;}catch{return false;}},artifactTypes:v=>Array.isArray(v)&&v.length>0&&v.every(artifactKind)&&new Set(v).size===v.length,
      introducedRevision:revision,createdAt:timestamp,effectiveAt:timestamp,retiredAt:optionalTime,revokedAt:optionalTime,
      state:oneOf("active","verification_only","revoked"),compromised:v=>typeof v==="boolean"},item);
    check(!keys.has(k.keyId),"key_id_collision");
    check(k.artifactTypes.every(t=>writers[k.writerKind].includes(t)),"writer_kind_escalation");
    check(k.introducedRevision<=r.revision&&k.createdAt<=k.effectiveAt,"invalid_key_dates");
    check(k.retiredAt===null||k.retiredAt>k.effectiveAt,"invalid_key_dates");
    check(k.state!=="verification_only"||k.retiredAt!==null,"retirement_required");
    check(k.state!=="active"||k.retiredAt===null,"active_key_retired");
    check((k.state==="revoked")===(k.revokedAt!==null)&&(!k.revokedAt||k.revokedAt>=k.effectiveAt),"invalid_revocation");
    check(!k.compromised||k.state==="revoked","compromised_key_must_be_revoked");
    let publicKey;try{publicKey=createPublicKey({key:Buffer.from(k.publicKey,"base64"),type:"spki",format:"der"});}catch{throw Error("invalid_public_key");}
    check(publicKey.asymmetricKeyType==="ed25519"&&publicKey.export({type:"spki",format:"der"}).toString("base64")===k.publicKey,"invalid_public_key");
    check(!material.has(k.publicKey),"shared_signing_authority");material.add(k.publicKey);keys.set(k.keyId,Object.freeze({...freeze(k),key:publicKey}));
  }
  for(const a of keys.values())for(const b of keys.values())if(a.issuerId===b.issuerId)check(a.writerKind===b.writerKind&&same(a.scope,b.scope),"issuer_authority_collision");
  const old=previous?registryContext(previous):null;
  if(old){
    check(old.value.id===r.id&&r.revision>old.value.revision,"registry_rollback_or_identity");
    for(const [keyId,key] of keys)if(!old.keys.has(keyId))check(key.introducedRevision===r.revision,"invalid_key_introduction");
    for(const [keyId,before] of old.keys){
      const after=keys.get(keyId);check(after,"historical_key_removed");
      for(const field of ["issuerId","writerKind","algorithm","publicKey","scope","artifactTypes","introducedRevision","createdAt","effectiveAt"])
        check(same(before[field],after[field]),"key_identity_changed");
      check(before.state!=="revoked"||after.state==="revoked","revoked_key_reactivated");
      check(before.state!=="verification_only"||after.state!=="active","retired_key_reactivated");
      check(!before.compromised||after.compromised,"compromise_erased");
      check(before.retiredAt===null||before.retiredAt===after.retiredAt,"retirement_changed");
      check(before.revokedAt===null||before.revokedAt===after.revokedAt,"revocation_changed");
    }
  }
  const authority=Object.freeze({id:r.id,revision:r.revision});registries.set(authority,{value:freeze(r),keys});return authority;
}
function registryContext(authority){const r=registries.get(authority);check(r,"trusted_registry_required");return r;}
export function requireKey(authority,body,{mode,now,acceptedAt=null}={}){
  check(timestamp(now)&&["new","historical"].includes(mode),"trusted_verification_context_required");
  const r=registryContext(authority),key=r.keys.get(body.keyId);check(key,"unknown_key");
  check(body.registryId===r.value.id&&body.registryRevision<=r.value.revision&&body.registryRevision>=key.introducedRevision,"registry_version_mismatch");
  check(key.issuerId===body.issuerId&&key.writerKind===body.writerKind&&key.artifactTypes.includes(body.kind)&&same(key.scope,body.scope),"issuer_scope_mismatch");
  // Compromise freezes every key of the affected issuer; old history is retained,
  // but none of it can silently authorize new financial effects.
  check(![...r.keys.values()].some(k=>k.issuerId===key.issuerId&&k.compromised),"issuer_compromised_review_required");
  check(key.state!=="revoked","revoked_key_review_required");
  check(body.issuedAt>=key.effectiveAt&&body.issuedAt<=now,"key_not_effective");
  if(mode==="new")check(key.state==="active","key_not_active");
  else check(timestamp(acceptedAt)&&body.issuedAt<=acceptedAt&&acceptedAt<=now,"trusted_historical_receipt_required");
  check(!key.retiredAt||(body.issuedAt<key.retiredAt&&acceptedAt<key.retiredAt),"artifact_after_retirement");
  return key;
}

export function registryKey(authority,keyId){const key=registryContext(authority).keys.get(keyId);check(key,"unknown_key");return key;}
