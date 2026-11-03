// Inert coordination contracts; no provider requests, SDK or business activation.
import {balances,validateJournal} from "./engine.mjs";
import {createHash} from "node:crypto";
import {canonical,add,id,cents,positiveCents,validateRecord} from "./schemas.mjs";
const check=(ok,why)=>{if(!ok)throw Error(why);};
export const familyHash=value=>createHash("sha256").update(canonical(value)).digest("hex");
export const FAMILY_LIMITS=Object.freeze({members:32,cases:64,bytes:131072});
export function fundingFamilyId(payment){
  const p=validateRecord("providerTransaction",payment);
  return `family_${familyHash([1,p.environment,p.provider,p.merchantId,p.paymentId])}`;
}
const sum=values=>values.reduce(add,0);
const remaining=lot=>add(lot.fundedCents,-add(add(lot.usedCents,lot.refundedCents),lot.transferredCents||0));
const lotReserved=lot=>lot.disputes.length?remaining(lot):sum(Object.values(lot.refundHolds));
export function familyTotals(family){
  const lots=Object.values(family.members).filter(m=>m.lot).map(m=>m.lot);
  const unspent=sum(lots.map(remaining)),used=sum(lots.map(l=>l.usedCents)),refunded=sum(lots.map(l=>l.refundedCents));
  const refundReserved=sum(Object.values(family.refundHolds).map(h=>h.amountCents));
  const disputed=Object.keys(family.disputes).length?unspent:0;
  const reserved=Math.max(refundReserved,disputed),mirroredReserved=sum(lots.map(lotReserved));
  return {originalCents:family.originalCents,usedCents:used,refundedCents:refunded,reversedCents:family.reversedCents,
    unspentCents:unspent,refundReservedCents:refundReserved,disputedCents:disputed,reservedCents:reserved,
    availableCents:add(unspent,-reserved),extraReservedCents:add(reserved,-mirroredReserved)};
}
export function validateFamily(f,scope){
  check(f?.schemaVersion===1&&f.id===fundingFamilyId(f.payment)&&f.clientId===scope.clientId&&f.environment===scope.environment
    &&f.payment.clientId===scope.clientId&&f.payment.environment===scope.environment&&f.currency==="CAD"
    &&id(f.rootLotId)&&f.originalCents===f.payment.amountCents&&cents(f.reversedCents)&&cents(f.revision)&&f.revision>0,"invalid_funding_family");
  check(Object.keys(f.members).length<=FAMILY_LIMITS.members&&Object.keys(f.refundHolds).length<=FAMILY_LIMITS.cases
    &&Object.keys(f.disputes).length<=FAMILY_LIMITS.cases,"funding_family_limit");
  for(const [key,m] of Object.entries(f.members)){
    check(id(key)&&id(m.createdBy)&&id(m.authorizationEvidenceId),"invalid_family_member");
    if(m.lot)check(m.lot.id===key&&m.lot.type==="purchased"&&m.lot.funding.merchantId===f.payment.merchantId
      &&m.lot.funding.paymentId===f.payment.paymentId&&remaining(m.lot)>=0,"family_member_provenance_mismatch");
  }
  const totals=familyTotals(f);
  check(Object.values(totals).every(cents)&&sum([totals.usedCents,totals.refundedCents,totals.unspentCents,totals.reversedCents])===f.originalCents
    &&totals.reservedCents<=totals.unspentCents,"funding_family_conservation");
  check(canonical(totals)===canonical(f.totals),"funding_family_projection_drift");
  check(Buffer.byteLength(canonical(f))<=FAMILY_LIMITS.bytes,"funding_family_size_limit");
  return f;
}
function finish(f,scope){f.revision=add(f.revision,1);f.totals=familyTotals(f);return validateFamily(f,scope);}
export function coordinatePosting(prior,entry,authorizationEvidenceId,original=null){
  validateJournal(entry);
  const scope={clientId:entry.clientId,environment:entry.environment},command=entry.command;
  let next;
  if(command.type==="receive"){
    check(!prior,"funding_family_exists");
    const payment=validateRecord("providerTransaction",command.payment);
    check(payment.status==="COMPLETED"&&payment.sourceType==="CARD"&&payment.readbackVerified&&payment.verificationVersion===1,"verified_family_funding_required");
    next={schemaVersion:1,id:fundingFamilyId(payment),...scope,currency:"CAD",payment,rootLotId:command.lotId,originalCents:payment.amountCents,
      reversedCents:0,revision:0,members:{},refundHolds:{},disputes:{}};
  }else{
    validateFamily(prior,scope);next=structuredClone(prior);
    if(command.type==="transfer")check(!next.totals.reservedCents,"family_hold_blocks_transfer");
    if(command.type==="redeem"){
      check(!next.members[command.lotId]?.lot?.originLotId,"transferred_value_redemption_not_enabled");
      check(command.amountCents<=next.totals.availableCents,"family_value_requires_review");
    }
    if(command.type==="reverse"){
      check(original&&original.id===command.originalId,"family_original_journal_required");
      const riskTypes=["reserve_refund","release_refund","freeze_dispute","release_dispute"];
      check(riskTypes.includes(original.command.type)||!next.totals.reservedCents,"family_hold_blocks_reversal");
      check(original.command.type!=="complete_refund","family_reversal_requires_review");
      const c=original.command,lotId=c.lotId;
      if(c.type==="reserve_refund"){
        check(next.refundHolds[c.caseId]?.lotId===lotId&&next.refundHolds[c.caseId].amountCents===c.amountCents,"family_reversal_requires_review");
        delete next.refundHolds[c.caseId];
      }
      if(c.type==="release_refund"){
        check(!next.refundHolds[c.caseId],"family_reversal_requires_review");
        next.refundHolds[c.caseId]={amountCents:original.lotChanges[lotId].before.refundHolds[c.caseId],lotId,authorizationEvidenceId};
      }
      if(c.type==="freeze_dispute"){
        check(next.disputes[c.caseId]?.lotId===lotId,"family_reversal_requires_review");delete next.disputes[c.caseId];
      }
      if(c.type==="release_dispute"){
        check(!next.disputes[c.caseId],"family_reversal_requires_review");next.disputes[c.caseId]={lotId,authorizationEvidenceId};
      }
    }
  }
  for(const [lotId,change] of Object.entries(entry.lotChanges)){
    check(!change.before||change.before.type==="purchased","purchased_family_only");
    const member=next.members[lotId];
    check(canonical(member?.lot||null)===canonical(change.before),"family_lot_projection_mismatch");
    if(!member)check(!change.before&&change.after,"unknown_family_member");
    next.members[lotId]={...(member||{createdBy:entry.id,authorizationEvidenceId,parentLotId:change.after.originLotId||null}),
      lot:structuredClone(change.after),lastJournalId:entry.id};
  }
  if(command.type==="reserve_refund"){
    check(!next.refundHolds[command.caseId],"duplicate_family_reservation");
    next.refundHolds[command.caseId]={amountCents:command.amountCents,lotId:command.lotId,authorizationEvidenceId};
  }
  if(command.type==="release_refund"||command.type==="complete_refund"){
    const held=next.refundHolds[command.caseId];
    check(held&&held.lotId===command.lotId,"family_refund_reservation_required");
    if(command.type==="release_refund")delete next.refundHolds[command.caseId];
    else {check(held.amountCents>=command.amountCents,"family_refund_reservation_required");held.amountCents=add(held.amountCents,-command.amountCents);
      if(!held.amountCents)delete next.refundHolds[command.caseId];}
  }
  if(command.type==="freeze_dispute"){
    check(!next.disputes[command.caseId],"duplicate_family_dispute");
    next.disputes[command.caseId]={lotId:command.lotId,authorizationEvidenceId};
  }
  if(command.type==="release_dispute"){
    check(next.disputes[command.caseId]?.lotId===command.lotId,"family_dispute_required");delete next.disputes[command.caseId];
  }
  if(command.type==="reverse"){
    // Risk-command reversals need explicit case semantics; never infer a release.
    const before=familyTotals(next);
    const missing=add(next.originalCents,-sum([before.usedCents,before.refundedCents,before.unspentCents]));
    check(missing===0||missing===next.originalCents,"family_reversal_requires_review");next.reversedCents=missing;
  }
  return finish(next,scope);
}
export function coordinateRisk(prior,scope,command,authorizationEvidenceId){
  validateFamily(prior,scope);check(id(command.caseId)&&id(authorizationEvidenceId),"invalid_family_case");
  const next=structuredClone(prior),{type,caseId}=command;
  if(type==="reserve"){
    check(positiveCents(command.amountCents),"invalid_family_reservation");
    check(!next.refundHolds[caseId],"duplicate_family_reservation");
    if(command.amountCents>next.totals.unspentCents-next.totals.refundReservedCents)
      return {outcome:"review_required",reason:"insufficient_unspent_family_value"};
    next.refundHolds[caseId]={amountCents:command.amountCents,lotId:null,authorizationEvidenceId};
  }else if(type==="release_reservation"){
    check(next.refundHolds[caseId]?.lotId===null,"family_coordinator_reservation_required");delete next.refundHolds[caseId];
  }else if(type==="freeze"){
    check(!next.disputes[caseId],"duplicate_family_dispute");next.disputes[caseId]={lotId:null,authorizationEvidenceId};
  }else if(type==="release_dispute"){
    check(next.disputes[caseId]?.lotId===null,"family_coordinator_dispute_required");delete next.disputes[caseId];
  }else throw Error("family_command_not_enabled");
  const family=finish(next,scope);
  return type==="freeze"&&family.totals.usedCents>0
    ?{outcome:"review_required",reason:"dispute_includes_consumed_value",family}
    :{outcome:"coordinated",family};
}
export function rebuildFundingFamily(scope,events){
  let family=null;
  for(const e of events){
    check(e.schemaVersion===1&&e.beforeHash===familyHash(family),"family_event_chain_mismatch");
    const next=e.kind==="posting"?coordinatePosting(family,e.entry,e.authorizationEvidenceId,e.original||null):coordinateRisk(family,scope,e.command,e.authorizationEvidenceId).family;
    check(next&&e.afterHash===familyHash(next),"family_reconstruction_mismatch");family=next;
  }
  return validateFamily(family,scope);
}

// Reconstruct monetary journals first, then apply independently rebuilt family
// protection. No purchased lot may be omitted or assigned to two families.
export function protectedBalances(state,families){
  const summary=balances(state),seen=new Set();let extra=0;
  for(const f of families){validateFamily(f,state);extra=add(extra,f.totals.extraReservedCents);
    for(const [key,m] of Object.entries(f.members))if(m.lot){
      check(!seen.has(key)&&canonical(state.lots[key])===canonical(m.lot),"family_reconciliation_mismatch");seen.add(key);
    }
  }
  check(Object.values(state.lots).filter(l=>l.type==="purchased").every(l=>seen.has(l.id)),"missing_funding_family");
  summary.availablePurchasedCents=add(summary.availablePurchasedCents,-extra);
  summary.reservedPurchasedCents=add(summary.reservedPurchasedCents,extra);
  check(summary.availablePurchasedCents>=0,"family_reconciliation_mismatch");return summary;
}
