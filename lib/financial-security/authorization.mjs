import "server-only";
import {check,id,hash,canonical} from "../agreements/contracts.mjs";
import {assertFinancialRuntime} from "./runtime.mjs";
import {requireOwnership} from "./ownership.mjs";
export const principalPath=uid=>{check(id(uid),"invalid_actor");return `financialCommandPrincipals/${uid}`;};
export const ROLE_ACTIONS=Object.freeze({client:["accept_policy"],admin:["receive","redeem","cancel_membership","authorize_service_completion","family_reserve","family_freeze"],
  owner:["accept_policy","receive","redeem","cancel_membership","authorize_service_completion","transfer","approve_transfer","manage_roles","family_reserve","family_freeze","family_release_reservation","family_release_dispute"]});
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const ids=v=>Array.isArray(v)&&v.length<=64&&v.every(id)&&new Set(v).size===v.length;
export function validatePrincipal(p){
  check(p?.schemaVersion===2&&id(p.uid)&&Object.hasOwn(ROLE_ACTIONS,p.role)&&typeof p.active==="boolean"
    &&integer(p.revision)&&p.revision>0&&integer(p.revocationEpoch)&&integer(p.validAfterSeconds)&&p.environment==="sandbox"
    &&ids(p.actions)&&p.actions.every(a=>ROLE_ACTIONS[p.role].includes(a))&&ids(p.clientIds)&&ids(p.projectIds)
    &&Array.isArray(p.grants)&&p.grants.length<=64&&new Set(p.grants.map(g=>g.clientId)).size===p.grants.length
    &&p.grants.every(g=>id(g.clientId)&&ids(g.projectIds)&&Object.keys(g).length===2),"invalid_financial_principal");
  return p;
}
export function createFinancialAuthorization({db,auth,projectId,runtime,clock=()=>Date.now()}){
  const binding={db,auth,projectId,runtime};assertFinancialRuntime(binding);
  const live=(identity,scope)=>{assertFinancialRuntime(binding,scope);check(clock()<identity.expiresAt&&clock()-identity.verifiedAt<=15000,"authorization_lease_expired");};
  async function authenticate(token){
    assertFinancialRuntime(binding);let decoded;
    try{check(typeof token==="string"&&token.length<=16000,"authentication_required");decoded=await auth.verifyIdToken(token,true);}catch{throw Error("authentication_required");}
    check(id(decoded.uid)&&decoded.aud===projectId&&decoded.iss===`https://securetoken.google.com/${projectId}`
      &&integer(decoded.auth_time)&&integer(decoded.iat)&&integer(decoded.exp)&&decoded.exp*1000>clock()
      &&decoded.iat*1000<=clock()&&decoded.auth_time<=decoded.iat&&!decoded.firebase?.tenant,"authentication_required");
    return Object.freeze({uid:decoded.uid,authTime:decoded.auth_time,expiresAt:decoded.exp*1000,verifiedAt:clock(),roleVersions:new Map()});
  }
  async function authorize(tx,identity,scope,action,project){
    live(identity,scope);const path=principalPath(identity.uid),p=validatePrincipal((await tx.get(db.doc(path))).data());
    check(p.uid===identity.uid&&p.active&&p.environment===scope.environment&&identity.authTime>=p.validAfterSeconds
      &&p.actions.includes(action)&&p.clientIds.includes(scope.clientId)&&p.grants.some(g=>g.clientId===scope.clientId),"authorization_required");
    if(action==="accept_policy")check(p.role==="client"&&identity.uid===scope.clientId,"client_identity_required");
    else check(["admin","owner"].includes(p.role),"privileged_role_required");
    if(["transfer","approve_transfer","manage_roles","family_release_reservation","family_release_dispute"].includes(action))check(p.role==="owner","owner_required");
    if(project){
      check(p.projectIds.includes(project)&&p.grants.some(g=>g.clientId===scope.clientId&&g.projectIds.includes(project)),"project_authorization_required");
      const associated=(await tx.get(db.doc(`financialLedgerAccounts/${hash([scope.environment,scope.clientId])}/projects/${project}`))).data();
      check(associated?.id===project&&associated.clientId===scope.clientId&&associated.environment===scope.environment,"project_scope_mismatch");
      await requireOwnership(tx,db,"booking",`financialLedgerAccounts/${hash([scope.environment,scope.clientId])}/projects/${project}`,associated);
    }
    const version=canonical([p.revision,p.revocationEpoch]);
    check(!identity.roleVersions.has(p.uid)||identity.roleVersions.get(p.uid)===version,"authorization_revision_changed");
    identity.roleVersions.set(p.uid,version);
    await requireOwnership(tx,db,"principal",path,p);return p;
  }
  return {authenticate,authorize,live};
}
