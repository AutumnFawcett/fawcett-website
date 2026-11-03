import "server-only";
import {check,id,hash,canonical,record,timestamp} from "../agreements/contracts.mjs";
import {createFinancialAuthorization,validatePrincipal,principalPath,ROLE_ACTIONS} from "./authorization.mjs";
import {createOwnershipWriter,requireOwnership} from "./ownership.mjs";
export function createFinancialRoleManager({db,auth,projectId,runtime,clock=()=>Date.now()}){
  const security=createFinancialAuthorization({db,auth,projectId,runtime,clock}),writer=createOwnershipWriter(db,"role");
  return {async decide(token,scope,input){
    input=record({id,targetUid:id,expectedRevision:v=>Number.isSafeInteger(v)&&v>=0,action:v=>["assign","revoke"].includes(v),
      assignment:v=>v===null||(v&&typeof v==="object"),revokeSessions:v=>typeof v==="boolean"},input);
    const identity=await security.authenticate(token);security.live(identity,scope);
    // Authorize before any target-user lookup to avoid exposing account existence
    // to authenticated callers without role-management authority. Recheck on write.
    await db.runTransaction(tx=>security.authorize(tx,identity,scope,"manage_roles"),{maxAttempts:5});
    // Auth existence/status checks are outside retry callbacks. No user is changed.
    const targetUser=await auth.getUser(input.targetUid);check(!targetUser.disabled||input.action==="revoke","target_auth_disabled");
    const intent=hash({input,scope,actorId:identity.uid}),opRef=db.doc(`financialRoleOperations/${hash([scope.environment,input.id])}`);
    return db.runTransaction(async tx=>{
      const owner=await security.authorize(tx,identity,scope,"manage_roles");
      const ref=db.doc(principalPath(input.targetUid)),old=(await tx.get(ref)).data(),prior=(await tx.get(opRef)).data();
      if(prior){check(prior.intent===intent,"role_operation_id_collision");await requireOwnership(tx,db,"audit",opRef.path,prior);return {...prior.result,duplicate:true};}
      check((old?.revision||0)===input.expectedRevision,"stale_role_revision");
      if(old){validatePrincipal(old);await requireOwnership(tx,db,"principal",ref.path,old);}
      check(!old||old.clientIds.every(c=>owner.clientIds.includes(c))&&old.grants.every(g=>owner.grants.some(o=>o.clientId===g.clientId&&g.projectIds.every(p=>o.projectIds.includes(p)))),"role_scope_escalation");
      let next;
      if(input.action==="assign"){
        record({role:v=>["admin","client"].includes(v),actions:Array.isArray,grants:Array.isArray},input.assignment);
        check(input.targetUid!==identity.uid&&old?.role!=="owner","owner_assignment_requires_offline_provisioning");
        const a=input.assignment;
        check(a.actions.every(x=>ROLE_ACTIONS[a.role].includes(x))&&a.grants.every(g=>owner.grants.some(o=>g.clientId===o.clientId&&g.projectIds.every(p=>o.projectIds.includes(p))))
          &&(a.role!=="client"||a.grants.every(g=>g.clientId===input.targetUid)),"role_scope_escalation");
        next={schemaVersion:2,uid:input.targetUid,role:a.role,active:true,environment:scope.environment,actions:a.actions,grants:a.grants,
          clientIds:a.grants.map(g=>g.clientId),projectIds:[...new Set(a.grants.flatMap(g=>g.projectIds))]};
      }else{
        check(old&&input.assignment===null,"revocation_target_required");next={...old,active:false};
      }
      const at=new Date(clock()).toISOString();check(timestamp(at),"invalid_server_time");
      next={...next,revision:(old?.revision||0)+1,revocationEpoch:(old?.revocationEpoch||0)+1,
        validAfterSeconds:Math.max(old?.validAfterSeconds||0,input.revokeSessions||input.action==="revoke"?Math.floor(clock()/1000)+1:0),
        authorizationDecisionId:hash([scope.environment,input.id]),updatedAt:at,updatedBy:identity.uid};
      validatePrincipal(next);security.live(identity,scope);
      const decisionPath=`financialAuthorizationDecisions/${next.authorizationDecisionId}`;
      const decision={schemaVersion:1,...scope,id:input.id,actorId:identity.uid,actorRoleRevision:owner.revision,targetUid:input.targetUid,
        action:input.action,before:old||null,beforeHash:hash(old||null),afterHash:hash(next),recordedAt:at,role:next};
      const result={uid:next.uid,revision:next.revision,revocationEpoch:next.revocationEpoch,active:next.active,decisionId:next.authorizationDecisionId};
      tx.set(ref,next);writer.seal(tx,"principal",ref.path,next);
      tx.create(db.doc(decisionPath),decision);writer.seal(tx,"audit",decisionPath,decision);
      const storedOperation={schemaVersion:1,intent,result,recordedAt:at};
      tx.create(opRef,storedOperation);writer.seal(tx,"audit",opRef.path,storedOperation);return {...result,duplicate:false};
    },{maxAttempts:5});
  }};
}
