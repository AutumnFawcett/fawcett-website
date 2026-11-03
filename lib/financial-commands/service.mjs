import "server-only";
import { randomUUID } from "node:crypto";
import { createFirestoreLedger, ledgerPaths, accountKey, evidencePath } from "../ledger/server/firestore.mjs";
import { canonical, id, validateRecord, add } from "../ledger/schemas.mjs";
import { agreement, policyVersion, policyRef, purchasedCredit, hash, record, check, timestamp } from "../agreements/contracts.mjs";
import { acceptPolicy, requireAcceptance, createBooking, planStudioTransfer } from "../agreements/policy.mjs";
import { sourceKey, importId } from "../ledger/import/manifest.mjs";
import {createFinancialAuthorization} from "../financial-security/authorization.mjs";
import {createOwnershipWriter,requireOwnership} from "../financial-security/ownership.mjs";
import {createFundingFamilyCoordinator,familyPath} from "../ledger/server/funding-family.mjs";

import { serviceCompletion, completionHead, attendanceReference, planAttendance } from "./attendance.mjs";

// Only this authenticated service can mint a transaction-local attendance permit.
// The adapter imports the read-only predicate; the registry is never exported.
const attendancePermits = new WeakMap();
export const isProtectedAttendance = (writes, tx, input) => {
  const permit=attendancePermits.get(writes);
  return !!permit && permit.tx===tx && permit.commandHash===hash(input);
};
const same = (a,b) => canonical(a) === canonical(b);
const nullableId = value => value === null || id(value);
const revision = value => Number.isSafeInteger(value) && value >= 0;
const legacy = value => value === null || (!!value?.source && typeof value.source.projectId === "string"
  && typeof value.source.collection === "string" && typeof value.source.id === "string" && typeof value.source.recordHash === "string"
  && Object.keys(value).length === 1 && Object.keys(value.source).length === 4);
export const commandPaths = scope => {
  const base = ledgerPaths(scope).account;
  return Object.fromEntries(["agreements","consents","consentOperations","appointments","projects","values","bookings","approvals","approvalUses","readbacks","providerOrders","serviceCompletions","serviceCompletionHeads","serviceApplications","serviceBalances","attendanceReviews"].map(key => [key, `${base}/${key}`]));
};
export const agreementPolicyPath = (scope, ref) => `financialAgreementPolicies/${hash([scope.environment,ref.id,ref.version])}`;
export const principalPath = uid => { check(id(uid),"invalid_actor"); return `financialCommandPrincipals/${uid}`; };
export const auditPath = (scope, action, operationId) => `financialCommandAudits/audit_${hash([accountKey(scope),action,operationId])}`;
function envelope(operation) {
  const {attendance, ...base}=operation;
  record({ command: value => !!value && typeof value === "object" && !Array.isArray(value),
    agreementId: nullableId, acceptanceId: nullableId, approvalId: nullableId, legacy: legacy }, base);
  if(operation.command.type==="redeem")attendanceReference(attendance);
  else check(attendance===undefined,"unexpected_attendance_context");
  check(["receive","redeem","transfer","cancel_membership"].includes(operation.command.type),"command_not_enabled");
  check(id(operation.command.id) && revision(operation.command.expectedRevision),"explicit_revision_required");
  return structuredClone(operation);
}

// No SDK initialization, credentials, routes or network transport here. Supply an
// actual Firebase Admin Auth instance. Emulator tokens are not production proof.
export function createFinancialCommands({ db, auth, projectId, runtime, clock = () => Date.now() }) {
  check(db?.runTransaction && auth?.verifyIdToken && id(projectId),"server_dependencies_required");
  check(!process.env.FIREBASE_AUTH_EMULATOR_HOST || projectId.startsWith("demo-"),"emulator_auth_forbidden_for_real_project");
  const security=createFinancialAuthorization({db,auth,projectId,runtime,clock});
  const {authenticate,live}=security,role=security.authorize,writer=createOwnershipWriter(db,"command");
  const now=()=>new Date(clock()).toISOString();
  const context = (scope,identity,member,at,evidenceId) => ({ actorId:identity.uid, clientId:scope.clientId,environment:scope.environment,
    role:member.role, now:at, authorizationEvidenceId:evidenceId.split("/").at(-1) });
  const audit = (scope,identity,member,action,at,payload) => ({ schemaVersion:1,...scope,actorId:identity.uid,role:member.role,
    roleRevision:member.revision,action,recordedAt:at,payloadHash:hash(payload),payload });

  async function agreementState(tx,scope,requestId) {
    check(id(requestId),"agreement_required"); const paths=commandPaths(scope);
    const request=agreement((await tx.get(db.doc(`${paths.agreements}/${requestId}`))).data());
    check(request.id === requestId && request.clientId === scope.clientId && request.environment === scope.environment,"agreement_scope_mismatch");
    const policy=policyVersion((await tx.get(db.doc(agreementPolicyPath(scope,request.policy)))).data());
    check(same(policyRef(policy),request.policy),"policy_reference_mismatch");
    const appointment=(await tx.get(db.doc(`${paths.appointments}/${request.appointmentId}`))).data();
    check(appointment?.id===request.appointmentId && appointment.clientId===scope.clientId && appointment.environment===scope.environment
      && appointment.revision===request.appointmentRevision && id(appointment.projectId) && timestamp(appointment.startsAt),"stale_appointment");
    await requireOwnership(tx,db,"booking",`${paths.agreements}/${requestId}`,request);
    await requireOwnership(tx,db,"policy",agreementPolicyPath(scope,request.policy),policy);
    await requireOwnership(tx,db,"booking",`${paths.appointments}/${request.appointmentId}`,appointment);
    return {request,policy,appointment};
  }
  async function acceptedState(tx,scope,operation,ctx) {
    const state=await agreementState(tx,scope,operation.agreementId), paths=commandPaths(scope);
    check(id(operation.acceptanceId),"acceptance_required");
    const stored=(await tx.get(db.doc(`${paths.consents}/${operation.acceptanceId}`))).data();
    check(stored?.receipt?.id===operation.acceptanceId && stored.policyDefinitionHash===hash(state.policy)
      && hash(stored.requestSnapshot)===hash(state.request) && hash(stored.policySnapshot)===hash(state.policy)
      && same(stored.appointmentSnapshot,state.appointment),"trusted_acceptance_required");
    requireAcceptance(state.request,state.policy,stored.receipt,ctx);
    const evidence=(await tx.get(db.doc(`financialCommandAudits/${stored.receipt.authorizationEvidenceId}`))).data();
    check(stored.receipt.authorizationEvidenceId===auditPath(scope,"accept_policy",stored.operationId).split("/").at(-1)
      && evidence?.action==="accept_policy" && evidence.actorId===scope.clientId && evidence.clientId===scope.clientId
      && evidence.environment===scope.environment && evidence.payloadHash===hash(stored),"acceptance_audit_required");
    await requireOwnership(tx,db,"consent",`${paths.consents}/${operation.acceptanceId}`,stored);
    await requireOwnership(tx,db,"audit",`financialCommandAudits/${stored.receipt.authorizationEvidenceId}`,evidence);
    return {...state,acceptance:stored.receipt};
  }
  async function currentValue(tx,scope,lotId,accountRevision) {
    const paths=commandPaths(scope);
    const value=(await tx.get(db.doc(`${paths.values}/${lotId}`))).data();
    const lot=(await tx.get(db.doc(`${ledgerPaths(scope).lots}/${lotId}`))).data();
    check(value?.credit && lot?.type==="purchased" && lot.id===lotId,"eligible_value_required");
    const credit=purchasedCredit(value.credit);
    check(id(value.fundingJournalId),"funding_journal_required");
    const funding=(await tx.get(db.doc(`${ledgerPaths(scope).journal}/${value.fundingJournalId}`))).data();
    check(funding?.command?.type==="receive"&&funding.clientId===scope.clientId&&funding.environment===scope.environment
      &&funding.command.payment.evidenceId===credit.fundingEvidenceId&&funding.command.request.id===value.requestId
      &&funding.command.payment.paymentId===lot.funding.paymentId&&funding.command.payment.merchantId===lot.funding.merchantId,"funding_provenance_mismatch");
    await requireOwnership(tx,db,"journal",`${ledgerPaths(scope).journal}/${value.fundingJournalId}`,funding);
    const remaining=add(lot.fundedCents,-add(add(lot.usedCents,lot.refundedCents),lot.transferredCents||0));
    const reserved=lot.disputes.length ? remaining : Object.values(lot.refundHolds).reduce(add,0);
    check(credit.id===lotId && credit.clientId===scope.clientId && credit.environment===scope.environment
      && credit.remainingCents===remaining && credit.reservedCents===reserved && credit.projectId===lot.projectId
      && credit.revision<=accountRevision,"value_projection_mismatch");
    return {value,credit:{...credit,revision:accountRevision},lot};
  }

  return {
    async coordinateFamily(token,scope,input){
      const identity=await authenticate(token),action=`family_${input?.type}`,at=now();
      const evidenceId=auditPath(scope,action,input?.id);
      const coordinator=createFundingFamilyCoordinator({db,authorize:async(principal,{tx})=>{
        check(principal===identity,"verified_principal_required");
        const member=await role(tx,identity,scope,action);
        const family=(await tx.get(db.doc(familyPath(input.familyId)))).data();
        check(family?.clientId===scope.clientId&&family.environment===scope.environment,"family_scope_mismatch");
        if(family.payment.projectId)await role(tx,identity,scope,action,family.payment.projectId);
        return {actorId:identity.uid,authorizationEvidenceId:evidenceId.split("/").at(-1),assertCurrent:()=>live(identity,scope),
          writeAudit:(writeTx,result)=>{const value=audit(scope,identity,member,action,at,{input,result});
            writeTx.create(db.doc(evidenceId),value);writer.seal(writeTx,"audit",evidenceId,value);}};
      }});
      return coordinator.coordinate(scope,input,identity);
    },
    async accept(token,scope,input) {
      const paths=commandPaths(scope);
      record({id,requestId:id,requestHash:v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v),policyAccepted:v=>v===true,
        acceptedOfferTerms:v=>Array.isArray(v)},input);
      const identity=await authenticate(token), at=now(), intent=hash({input,actorId:identity.uid}), evidenceId=auditPath(scope,"accept_policy",input.id);
      return db.runTransaction(async tx=>{
        const member=await role(tx,identity,scope,"accept_policy");
        const state=await agreementState(tx,scope,input.requestId);
        await role(tx,identity,scope,"accept_policy",state.appointment.projectId);
        check(hash(state.request)===input.requestHash,"stale_agreement_view");
        const prior=(await tx.get(db.doc(`${paths.consentOperations}/${input.id}`))).data();
        if(prior){check(prior.intent===intent,"consent_id_collision");await requireOwnership(tx,db,"consent",`${paths.consentOperations}/${input.id}`,prior);return prior.receipt;}
        const receipt=acceptPolicy({request:state.request,policy:state.policy,policyAccepted:input.policyAccepted,acceptedOfferTerms:input.acceptedOfferTerms},
          context(scope,identity,member,at,evidenceId));
        const versionGuard=db.doc(`financialAgreementPolicyGuards/${hash([scope.environment,state.policy.id,state.policy.version])}`);
        const previous=(await tx.get(versionGuard)).data();
        check(!previous||previous.definitionHash===hash(state.policy),"policy_version_collision");
        live(identity);
        if(!previous)tx.create(versionGuard,{schemaVersion:1,definitionHash:hash(state.policy)});
        const stored={schemaVersion:1,receipt,operationId:input.id,policyDefinitionHash:hash(state.policy),
          requestSnapshot:state.request,policySnapshot:state.policy,appointmentSnapshot:state.appointment};
        const acceptanceAudit=audit(scope,identity,member,"accept_policy",at,stored);
        tx.create(db.doc(evidenceId),acceptanceAudit);writer.seal(tx,"audit",evidenceId,acceptanceAudit);
        writer.seal(tx,"consent",`${paths.consents}/${receipt.id}`,stored);
        tx.create(db.doc(`${paths.consents}/${receipt.id}`),stored);
        const consentOperation={schemaVersion:1,intent,receipt};
        tx.create(db.doc(`${paths.consentOperations}/${input.id}`),consentOperation);writer.seal(tx,"consent",`${paths.consentOperations}/${input.id}`,consentOperation);
        return receipt;
      },{maxAttempts:5});
    },

    async approveTransfer(token,scope,input) {
      record({id,operation:v=>!!v&&typeof v==="object",expiresAt:timestamp},input);
      const {id:approvalId,operation,expiresAt}=input;
      check(id(approvalId)&&timestamp(expiresAt),"invalid_approval"); const op=envelope(operation), paths=commandPaths(scope);
      check(op.command.type==="transfer"&&op.approvalId===approvalId&&!op.legacy,"transfer_approval_only");
      const identity=await authenticate(token), at=now();
      check(Date.parse(expiresAt)>clock()&&Date.parse(expiresAt)<=clock()+900000,"approval_expiry_required");
      return db.runTransaction(async tx=>{
        const member=await role(tx,identity,scope,"approve_transfer",op.command.projectId);
        const projection=(await tx.get(db.doc(ledgerPaths(scope).account))).data();
        check(projection?.revision===op.command.expectedRevision,"stale_revision");
        const state=await acceptedState(tx,scope,op,context(scope,identity,member,at,auditPath(scope,"approve_transfer",approvalId)));
        await role(tx,identity,scope,"approve_transfer",state.appointment.projectId);
        check(state.policy.legalReview==="approved"&&state.policy.accountingReview==="approved","transfer_policy_review_required");
        const {credit}=await currentValue(tx,scope,op.command.lotId,projection.revision);
        check(credit.category==="tattoo_credit","tattoo_credit_transfer_only");
        check(op.command.projectId===credit.projectId,"transfer_project_mismatch");
        planStudioTransfer(credit,{id:op.command.id,sourceId:credit.id,amountCents:op.command.amountCents,ownerApprovalId:approvalId},state.policy,
          context(scope,identity,member,at,auditPath(scope,"approve_transfer",approvalId)));
        const approval={schemaVersion:1,id:approvalId,...scope,ownerUid:identity.uid,ownerRoleRevision:member.revision,ownerAuthTime:identity.authTime,ownerRevocationEpoch:member.revocationEpoch,
          operationHash:hash(op),restrictionHash:hash(credit),policyDefinitionHash:hash(state.policy),accountRevision:projection.revision,createdAt:at,expiresAt};
        const ref=db.doc(`${paths.approvals}/${approvalId}`), prior=(await tx.get(ref)).data();
        if(prior){check(same({...prior,createdAt:at},approval),"approval_id_collision");await requireOwnership(tx,db,"approval",ref.path,prior);return prior;}
        live(identity);check(clock()<Date.parse(expiresAt),"approval_expired_before_commit");
        tx.create(ref,approval);writer.seal(tx,"approval",ref.path,approval);
        const approvalPath=auditPath(scope,"approve_transfer",approvalId),approvalAudit=audit(scope,identity,member,"approve_transfer",at,approval);
        tx.create(db.doc(approvalPath),approvalAudit);writer.seal(tx,"audit",approvalPath,approvalAudit);
        return approval;
      },{maxAttempts:5});
    },

    async execute(token,scope,operation) {
      const op=envelope(operation), paths=commandPaths(scope), identity=await authenticate(token), at=now();
      const evidenceId=auditPath(scope,op.command.type,op.command.id), opaque=Object.freeze({nonce:randomUUID()});
      const store=createFirestoreLedger({db,clock:()=>at,intentContext:{requestIntent:hash(op)},
        authorize:async principal=>{check(principal===opaque,"verified_principal_required");return {actorId:identity.uid,authorizationEvidenceId:evidenceId.split("/").at(-1)};},
        transactionalGuard:async ({tx,projection,duplicate})=>{
          const member=await role(tx,identity,scope,op.command.type,op.command.projectId);
          if(duplicate){
            // Receive commands have no project field. Check the immutable entry's
            // original project even if today's agreement/appointment has changed.
            const original=(await tx.get(db.doc(`${ledgerPaths(scope).journal}/${op.command.id}`))).data();
            const project=op.command.projectId||original?.command?.payment?.projectId;
            if(project)await role(tx,identity,scope,op.command.type,project);
            return null;
          }
          if(op.legacy){
            const consumed=(await tx.get(db.doc(`financialLegacyImportSources/${sourceKey(op.legacy)}`))).exists;
            check(!consumed&&op.command.id!==importId(op.legacy),"duplicate_legacy_source");
            throw Error("legacy_import_not_enabled");
          }
          check(!op.command.id.startsWith("legacy_"),"legacy_import_not_enabled");
          const ctx=context(scope,identity,member,at,evidenceId);
          let state=null, booking=null, newCredit=null, transfer=null, existingValue=null, approvalDeadline=null, attendance=null;
          if(op.command.type!=="cancel_membership"){
            state=await acceptedState(tx,scope,op,ctx);
            await role(tx,identity,scope,op.command.type,state.appointment.projectId);
            check(state.request.policy.id===op.command.policyId&&state.request.policy.version===op.command.policyVersion,"command_policy_mismatch");
          }
          if(op.command.type==="receive"){
            check(op.command.requestId===state.request.id&&!op.approvalId,"request_mismatch");
            const payment=validateRecord("providerTransaction",(await tx.get(db.doc(evidencePath(scope,"payments",op.command.paymentEvidenceId)))).data());
            const proof=(await tx.get(db.doc(`${paths.readbacks}/${payment.evidenceId}`))).data();
            const order=(await tx.get(db.doc(`${paths.providerOrders}/${state.request.id}`))).data();
            check(proof?.schemaVersion===1&&proof.paymentHash===hash(payment)&&proof.sourceType==="CARD"&&proof.externalDetailsPresent===false
              && proof.cardStatus==="CAPTURED"&&timestamp(proof.retrievedAt)&&Date.parse(proof.retrievedAt)<=clock()
              && clock()-Date.parse(proof.retrievedAt)<=300000&&id(proof.verifierId),"trusted_provider_readback_required");
            check(order?.clientId===scope.clientId&&order.environment===scope.environment&&order.requestId===state.request.id
              &&order.orderId===payment.orderId&&order.locationId===payment.locationId&&order.merchantId===payment.merchantId
              &&order.amountCents===state.request.totalCents&&order.currency==="CAD"&&payment.projectId===state.appointment.projectId,"provider_order_mismatch");
            await requireOwnership(tx,db,"provider",evidencePath(scope,"payments",op.command.paymentEvidenceId),payment);
            await requireOwnership(tx,db,"provider",`${paths.readbacks}/${payment.evidenceId}`,proof);
            await requireOwnership(tx,db,"provider",`${paths.providerOrders}/${state.request.id}`,order);
            booking=createBooking({request:state.request,policy:state.policy,acceptance:state.acceptance,payment,startsAt:state.appointment.startsAt,lineageId:state.request.id},ctx);
            if(booking.allocations.length===1){const a=booking.allocations[0];newCredit={schemaVersion:1,id:op.command.lotId,...scope,currency:"CAD",revision:projection.revision+1,
              acceptanceEvidenceId:state.acceptance.id,category:a.kind==="tattoo_advance"?"appointment_advance":"appointment_booking_fee",
              remainingCents:payment.amountCents,reservedCents:0,artistId:null,projectId:payment.projectId,appointmentId:state.request.appointmentId,
              fundingEvidenceId:payment.evidenceId,policy:policyRef(state.policy)};}
          } else if(op.command.type==="redeem"){
            existingValue=(await tx.get(db.doc(`${paths.values}/${op.command.lotId}`))).data();
            check(existingValue?.requestId===state.request.id&&existingValue.acceptanceId===state.acceptance.id,"funding_acceptance_mismatch");
            check(!existingValue.originLotId,"transferred_value_redemption_not_enabled");
            const original=(await tx.get(db.doc(`${paths.bookings}/${state.request.id}`))).data();
            check(original&&op.command.purpose==="tattoo_service"&&op.command.creditType==="purchased"
              &&!op.approvalId&&op.command.appointmentId===state.appointment.id&&op.command.projectId===state.appointment.projectId,"attendance_scope_mismatch");
            const completion=serviceCompletion((await tx.get(db.doc(`${paths.serviceCompletions}/${op.attendance.completionId}`))).data());
            const head=completionHead((await tx.get(db.doc(`${paths.serviceCompletionHeads}/${state.appointment.id}`))).data());
            check(completion.id===op.attendance.completionId&&completion.revision===op.attendance.revision
              &&hash(completion)===op.attendance.definitionHash&&head.completionId===completion.id
              &&head.revision===completion.revision&&head.definitionHash===hash(completion),"stale_service_completion");
            check(completion.clientId===scope.clientId&&completion.environment===scope.environment
              &&completion.appointmentId===state.appointment.id&&completion.appointmentRevision===state.appointment.revision
              &&completion.projectId===state.appointment.projectId,"service_completion_scope_mismatch");
            const project=(await tx.get(db.doc(`${paths.projects}/${completion.projectId}`))).data();
            check(project?.artistId===completion.artistId,"service_artist_mismatch");
            const completionAudit=(await tx.get(db.doc(`financialCommandAudits/${completion.auditId}`))).data();
            const author=(await tx.get(db.doc(principalPath(completion.actorId)))).data();
            check(completionAudit?.schemaVersion===1&&completionAudit.recordedAt===completion.authorizedAt
              &&["admin","owner"].includes(completionAudit.role)&&completionAudit.action==="authorize_service_completion"&&completionAudit.actorId===completion.actorId
              &&completionAudit.clientId===scope.clientId&&completionAudit.environment===scope.environment
              &&completionAudit.roleRevision===completion.actorRoleRevision&&completionAudit.payloadHash===hash(completion)
              &&same(completionAudit.payload,completion)&&author?.active===true&&["admin","owner"].includes(author.role)
              &&author.environment===scope.environment&&author.revision===completion.actorRoleRevision
              &&author.actions?.includes("authorize_service_completion")&&author.clientIds?.includes(scope.clientId)
              &&author.projectIds?.includes(completion.projectId)&&author.grants?.some(g=>g.clientId===scope.clientId&&g.projectIds.includes(completion.projectId)),"trusted_service_completion_required");
            await requireOwnership(tx,db,"completion",`${paths.serviceCompletions}/${completion.id}`,completion);
            await requireOwnership(tx,db,"completion",`${paths.serviceCompletionHeads}/${state.appointment.id}`,head);
            await requireOwnership(tx,db,"audit",`financialCommandAudits/${completion.auditId}`,completionAudit);
            await requireOwnership(tx,db,"principal",principalPath(completion.actorId),author);
            check(Date.parse(completion.completedAt)<=Date.parse(completion.authorizedAt)
              &&Date.parse(completion.authorizedAt)<=clock(),"invalid_service_completion_time");
            check(same(original.allocations,existingValue.allocations)&&same(original.allocations,state.request.allocations)
              &&original.fundingEvidenceId&&original.clientId===scope.clientId&&original.environment===scope.environment
              &&original.appointment.id===completion.appointmentId&&original.appointment.revision===completion.appointmentRevision,"booking_provenance_mismatch");
            const lot=(await tx.get(db.doc(`${ledgerPaths(scope).lots}/${op.command.lotId}`))).data();
            const funding=(await tx.get(db.doc(`${ledgerPaths(scope).journal}/${existingValue.fundingJournalId}`))).data();
            check(lot?.type==="purchased"&&!lot.originLotId&&lot.usedCents===0&&lot.refundedCents===0&&!(lot.transferredCents||0)
              &&funding?.command?.type==="receive"&&funding.clientId===scope.clientId&&funding.environment===scope.environment
              &&funding.command.lotId===op.command.lotId&&funding.command.payment.evidenceId===original.fundingEvidenceId&&funding.command.request.id===state.request.id
              &&funding.command.payment.paymentId===lot.funding.paymentId&&funding.command.payment.merchantId===lot.funding.merchantId
              &&lot.fundedCents===state.request.totalCents,"attendance_funding_mismatch");
            await requireOwnership(tx,db,"journal",`${ledgerPaths(scope).journal}/${existingValue.fundingJournalId}`,funding);
            if(existingValue.credit){const credit=purchasedCredit(existingValue.credit);
              check(credit.remainingCents===lot.fundedCents&&credit.reservedCents===0
                &&(!credit.artistId||credit.artistId===completion.artistId)&&(!credit.projectId||credit.projectId===completion.projectId)
                &&(!credit.appointmentId||credit.appointmentId===completion.appointmentId),"attendance_restriction_mismatch");}
            const balanceRef=db.doc(`${paths.serviceBalances}/${completion.appointmentId}`);
            const balance=(await tx.get(balanceRef)).data();
            check(!balance||(balance.schemaVersion===1&&balance.completionHash===hash(completion)
              &&Number.isSafeInteger(balance.appliedCents)&&balance.appliedCents>=0),"service_balance_requires_review");
            check(!(await tx.get(db.doc(`${paths.serviceApplications}/${op.command.id}`))).exists,"service_application_exists");
            const plan=planAttendance(original,completion,op.command.amountCents,balance?.appliedCents||0);
            attendance={completion,plan,balanceRef,appliedBefore:balance?.appliedCents||0};
            booking=structuredClone(original);
            if(plan.outcome==="applied")booking.applications.push({id:op.command.id,completionId:completion.id,completionHash:hash(completion),
              serviceRevision:completion.revision,allocations:plan.allocations,actorId:identity.uid,recordedAt:at});
          } else if(op.command.type==="transfer"){
            check(id(op.approvalId),"owner_approval_required");
            const current=await currentValue(tx,scope,op.command.lotId,projection.revision);existingValue=current.value;
            check(current.credit.category==="tattoo_credit","tattoo_credit_transfer_only");
            check(existingValue.requestId===state.request.id&&current.credit.acceptanceEvidenceId===state.acceptance.id
              &&state.policy.legalReview==="approved"&&state.policy.accountingReview==="approved","transfer_policy_review_required");
            transfer=planStudioTransfer(current.credit,{id:op.command.id,sourceId:op.command.lotId,amountCents:op.command.amountCents,ownerApprovalId:op.approvalId},state.policy,ctx);
            const approval=(await tx.get(db.doc(`${paths.approvals}/${op.approvalId}`))).data();
            const owner=(await tx.get(db.doc(principalPath(approval?.ownerUid||"missing")))).data();
            const approvalAudit=(await tx.get(db.doc(auditPath(scope,"approve_transfer",op.approvalId)))).data();
            check(approval&&approval.operationHash===hash(op)&&approval.ownerUid===identity.uid&&approval.clientId===scope.clientId
              &&approval.environment===scope.environment&&approval.accountRevision===projection.revision
              &&approval.restrictionHash===hash(current.credit)&&approval.policyDefinitionHash===hash(state.policy)
              &&timestamp(approval.createdAt)&&Date.parse(approval.createdAt)<=clock()&&Date.parse(approval.expiresAt)>clock()
              &&owner?.active&&owner.revocationEpoch===approval.ownerRevocationEpoch&&owner.role==="owner"&&owner.revision===approval.ownerRoleRevision&&owner.validAfterSeconds<=approval.ownerAuthTime
              &&approvalAudit?.payloadHash===hash(approval)&&approvalAudit.actorId===identity.uid,"invalid_or_stale_owner_approval");
            await requireOwnership(tx,db,"approval",`${paths.approvals}/${op.approvalId}`,approval);
            await requireOwnership(tx,db,"audit",auditPath(scope,"approve_transfer",op.approvalId),approvalAudit);
            await requireOwnership(tx,db,"principal",principalPath(approval.ownerUid),owner);
            check(!(await tx.get(db.doc(`${paths.approvalUses}/${op.approvalId}`))).exists,"approval_already_consumed");
            approvalDeadline=Date.parse(approval.expiresAt);
            newCredit={...current.credit,id:op.command.targetLotId,category:"studio_credit",revision:projection.revision+1,
              remainingCents:op.command.amountCents,reservedCents:0,artistId:null,projectId:null,appointmentId:null};
          } else {
            check(!op.agreementId&&!op.acceptanceId&&!op.approvalId,"unexpected_consent_context");
            const membership=(await tx.get(db.doc(`${ledgerPaths(scope).account}/memberships/${op.command.membershipId}`))).data();
            check(membership?.clientId===scope.clientId&&membership.environment===scope.environment,"membership_scope_mismatch");
          }
          const writes=(writeTx,entry)=>{
            // This check can still abort all queued SDK writes before commit.
            live(identity);
            check(approvalDeadline===null||clock()<approvalDeadline,"approval_expired_before_commit");
            const payload={operation:op,journalHash:hash(entry),agreementHash:state?hash(state.request):null,
              policyDefinitionHash:state?hash(state.policy):null,acceptanceId:state?.acceptance.id||null,transfer,attendance:attendance?{completion:attendance.completion,plan:attendance.plan}:null};
            const executionAudit=audit(scope,identity,member,op.command.type,at,payload);
            writeTx.create(db.doc(evidenceId),executionAudit);writer.seal(writeTx,"audit",evidenceId,executionAudit);
            if(op.command.type==="receive"){
              writeTx.create(db.doc(`${paths.bookings}/${state.request.id}`),booking);
              writeTx.create(db.doc(`${paths.values}/${op.command.lotId}`),{schemaVersion:1,credit:newCredit,allocations:booking.allocations,
                requestId:state.request.id,acceptanceId:state.acceptance.id,policyDefinitionHash:hash(state.policy),fundingJournalId:entry.id});
            } else if(op.command.type==="redeem"){
              writeTx.set(db.doc(`${paths.bookings}/${state.request.id}`),booking);
              writeTx.create(db.doc(`${paths.serviceApplications}/${op.command.id}`),{schemaVersion:1,...scope,completion:attendance.completion,
                lotId:op.command.lotId,fundingJournalId:existingValue.fundingJournalId,journalId:entry.id,auditId:evidenceId,plan:attendance.plan});
              writeTx.set(attendance.balanceRef,{schemaVersion:1,completionHash:hash(attendance.completion),
                appliedCents:add(attendance.appliedBefore,op.command.amountCents),lastApplicationId:entry.id});
              if(existingValue.credit)writeTx.set(db.doc(`${paths.values}/${op.command.lotId}`),{...existingValue,
                credit:{...existingValue.credit,remainingCents:add(existingValue.credit.remainingCents,-op.command.amountCents),revision:entry.sequence}});
            } else if(op.command.type==="transfer"){
              writeTx.create(db.doc(`${paths.approvalUses}/${op.approvalId}`),{schemaVersion:1,journalId:entry.id,auditId:evidenceId,recordedAt:at});
              writeTx.set(db.doc(`${paths.values}/${op.command.lotId}`),{...existingValue,credit:{...existingValue.credit,
                revision:entry.sequence,remainingCents:add(existingValue.credit.remainingCents,-op.command.amountCents)}});
              writeTx.create(db.doc(`${paths.values}/${op.command.targetLotId}`),{...existingValue,credit:newCredit,originLotId:op.command.lotId});
            }
          };
          if(attendance){
            attendancePermits.set(writes,{tx,commandHash:hash(op.command)});
            if(attendance.plan.outcome==="review_required"){
              writes.review={schemaVersion:1,...scope,operation:op,completion:attendance.completion,plan:attendance.plan,recordedAt:at};
              writes.writeReview=writeTx=>{
                live(identity);
                writeTx.create(db.doc(`${paths.attendanceReviews}/${op.command.id}`),writes.review);
                const reviewAudit=audit(scope,identity,member,"attendance_review_required",at,writes.review);
                writeTx.create(db.doc(evidenceId),reviewAudit);writer.seal(writeTx,"audit",evidenceId,reviewAudit);
              };
            }
          }
          return writes;
        }});
      return store.post(scope,op.command,opaque);
    },
  };
}
