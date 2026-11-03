import "server-only";
import {createPublicKey,verify} from "node:crypto";
import {createFinancialAuthorization} from "./authorization.mjs";
import {assertFinancialRuntime,localLedgerContext} from "./runtime.mjs";
import {createRegistry} from "./protocol/registry.mjs";
import {check,record,id,revision,hash,canonical,same,freeze,timestamp} from "./protocol/contracts.mjs";
const authorities=new WeakMap();
export const registryPaths=idValue=>{check(id(idValue),"invalid_registry_id");return {current:`financialSigningRegistries/${idValue}`,versions:`financialSigningRegistries/${idValue}/versions`};};
export function registryAuthorityContext(authority,db){const ctx=authorities.get(authority);check(ctx&&ctx.db===localLedgerContext(db).db,"trusted_registry_authority_required");return ctx;}
// Disposable emulator trust root. Public root/UID are server-pinned; caller roles
// or public keys in a document never create publisher authority. No deployed mode.
export function createEmulatorRegistryAuthority({db,auth,projectId,runtime,publisherUid,publisherScope,registryId,minimumRevision=1,publisherPublicKey,signPublisherBytes,clock=()=>Date.now()}){
  assertFinancialRuntime({db,auth,projectId,runtime},publisherScope);check(id(publisherUid)&&id(registryId)&&revision(minimumRevision)&&typeof signPublisherBytes==="function","pinned_publisher_required");
  const publicKey=createPublicKey({key:Buffer.from(publisherPublicKey,"base64"),format:"der",type:"spki"});check(publicKey.asymmetricKeyType==="ed25519","invalid_publisher_key");
  const security=createFinancialAuthorization({db,auth,projectId,runtime,clock}),paths=registryPaths(registryId);
  const resource=freeze({projectId:runtime.projectId,databaseId:runtime.databaseId,environment:runtime.environment});let highWater=minimumRevision;
  function validated(projection){
    const row=record({schemaVersion:v=>v===1,registryId:id,revision,definition:v=>!!v,definitionHash:v=>typeof v==="string",previousHash:v=>v===null||typeof v==="string",
      publisherUid:id,publisherRevision:revision,publishedAt:timestamp,signature:v=>typeof v==="string"},projection);
    const {signature,...body}=row;
    check(row.registryId===registryId&&row.publisherUid===publisherUid&&row.revision===row.definition.revision&&row.definitionHash===hash(row.definition),"registry_projection_mismatch");
    check(verify(null,Buffer.from(canonical(body)),publicKey,Buffer.from(signature,"base64")),"registry_publisher_signature_required");
    const registry=createRegistry(row.definition,{expectedId:registryId,minimumRevision:Math.max(minimumRevision,highWater)});
    check(row.definition.keys.every(k=>same(k.scope,resource)),"registry_resource_mismatch");return {projection:freeze(row),registry,hash:hash(row),resource};
  }
  async function read(tx){
    assertFinancialRuntime({db,auth,projectId,runtime},publisherScope);
    const row=(await tx.get(db.doc(paths.current))).data();check(row,"registry_missing");const current=validated(row);
    const version=(await tx.get(db.doc(`${paths.versions}/${row.revision}`))).data();check(same(version||null,row),"registry_history_mismatch");highWater=Math.max(highWater,row.revision);return current;
  }
  const authority=Object.freeze({
    async publish(token,definition){
      assertFinancialRuntime({db,auth,projectId,runtime},publisherScope);
      const identity=await security.authenticate(token);check(identity.uid===publisherUid,"registry_publisher_required");
      const data=freeze(definition),now=new Date(clock()).toISOString();
      const authorize=async tx=>{const p=await security.authorize(tx,identity,publisherScope,"manage_roles");check(p.role==="owner","registry_owner_required");return p;};
      const prepared=await db.runTransaction(async tx=>{
        const owner=await authorize(tx),prior=(await tx.get(db.doc(paths.current))).data();
        const old=prior?validated(prior):null;
        createRegistry(data,{expectedId:registryId,minimumRevision,previous:old?.registry??null});
        check(data.keys.every(k=>same(k.scope,resource)),"registry_resource_mismatch");
        check((old?old.projection.revision+1:minimumRevision)===data.revision,"registry_revision_sequence");
        return {ownerRevision:owner.revision,previousHash:prior?hash(prior):null};
      });
      const body={schemaVersion:1,registryId,revision:data.revision,definition:data,definitionHash:hash(data),previousHash:prepared.previousHash,
        publisherUid,publisherRevision:prepared.ownerRevision,publishedAt:now};
      // ALL signing (including publisher signing) occurs outside retry callbacks.
      const signature=await signPublisherBytes(Buffer.from(canonical(body)));
      const row=freeze({...body,signature});validated(row);
      await db.runTransaction(async tx=>{
        const owner=await authorize(tx),prior=(await tx.get(db.doc(paths.current))).data();
        check(owner.revision===prepared.ownerRevision&&(prior?hash(prior):null)===prepared.previousHash,"stale_registry_publication");
        if(prior)validated(prior);security.live(identity,publisherScope);
        tx.create(db.doc(`${paths.versions}/${data.revision}`),row);tx.set(db.doc(paths.current),row);
      });
      highWater=Math.max(highWater,data.revision);return {registryId,revision:data.revision};
    }
  });
  authorities.set(authority,{db:localLedgerContext(db).db,read,resource,registryId,minimumRevision,observe:revisionValue=>{highWater=Math.max(highWater,revisionValue);}});return authority;
}
