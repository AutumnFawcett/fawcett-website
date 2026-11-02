import { add, canonical, id, positiveCents, validateRecord } from "./schemas.mjs";

const COMMAND_FIELDS = {
  receive: ["lotId", "purpose", "payment", "request"], promote: ["lotId", "projectId", "amountCents"],
  redeem: ["lotId", "projectId", "appointmentId", "amountCents", "purpose", "creditType"],
  reserve_refund: ["lotId", "caseId", "amountCents"], release_refund: ["lotId", "caseId"],
  freeze_dispute: ["lotId", "caseId"], release_dispute: ["lotId", "caseId"],
  complete_refund: ["lotId", "caseId", "amountCents", "verifiedRefund"],
  cancel_membership: ["membershipId"], reverse: ["originalId"],
  transfer: ["lotId", "targetLotId", "projectId", "amountCents"],
};
const LIABILITY = { purchased: "purchasedLiability", promotional: "promotionalLiability" };
const ACCOUNTS = ["squareClearing", "purchasedLiability", "promotionalLiability", "promotionExpense", "tattooRevenue", "supplyRevenue"];
const assert = (condition, reason) => { if (!condition) throw Error(reason); };
const sum = values => values.reduce(add, 0);
export function emptyAccount({ clientId, environment }) {
  assert(id(clientId) && ["sandbox", "production"].includes(environment), "invalid_scope");
  return { schemaVersion: 1, clientId, environment, currency: "CAD", revision: 0,
    lots: {}, balances: Object.fromEntries(ACCOUNTS.map(key => [key, 0])), entries: [], sources: {} };
}
function refundHeld(lot) { return sum(Object.values(lot.refundHolds)); }
function remaining(lot) { return add(lot.fundedCents, -add(add(lot.usedCents, lot.refundedCents), lot.transferredCents || 0)); }
function reserved(lot) { return lot.disputes.length ? remaining(lot) : refundHeld(lot); }
function available(lot) { return add(remaining(lot), -reserved(lot)); }
function validateLot(lot) {
  assert(remaining(lot) >= 0 && available(lot) >= 0 && refundHeld(lot) <= remaining(lot), "insufficient_credit");
}
function fingerprint(command, policy) { return canonical({ command, policy }); }
function line(account, debitCents, creditCents) { return { account, debitCents, creditCents }; }
function movement(account, delta) { return delta > 0 ? line(account, delta, 0) : line(account, 0, -delta); }
export function validateJournal(entry) {
  assert(entry?.schemaVersion === 1 && id(entry.id) && id(entry.clientId)
    && ["sandbox", "production"].includes(entry.environment) && entry.currency === "CAD"
    && Number.isSafeInteger(entry.sequence) && entry.sequence > 0 && Array.isArray(entry.lines), "invalid_journal");
  validateRecord("policy", entry.policy);
  assert(entry.lines.every(l => ACCOUNTS.includes(l.account) && Number.isSafeInteger(l.debitCents)
    && Number.isSafeInteger(l.creditCents) && l.debitCents >= 0 && l.creditCents >= 0
    && (l.debitCents === 0 || l.creditCents === 0)), "invalid_lines");
  assert(sum(entry.lines.map(l => l.debitCents)) === sum(entry.lines.map(l => l.creditCents)), "unbalanced_journal");
  return structuredClone(entry);
}
// Pure preparation. Caller must supply trusted server-side provider evidence;
// schemas/booleans are NOT authentication. No real credit can be issued here.
export function post(state, command, suppliedPolicy) {
  const policy = validateRecord("policy", suppliedPolicy);
  assert(command && id(command.id) && typeof command.type === "string", "invalid_command");
  const fields = COMMAND_FIELDS[command.type];
  assert(fields && Object.keys(command).length === fields.length + 4
    && ["id", "type", "actorId", "recordedAt", ...fields].every(k => Object.hasOwn(command, k)), "invalid_command_fields");
  assert(id(command.actorId) && typeof command.recordedAt === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(command.recordedAt)
    && Number.isFinite(Date.parse(command.recordedAt)), "invalid_audit_context");
  const digest = fingerprint(command, policy);
  const duplicate = state.entries.find(e => e.id === command.id);
  if (duplicate) {
    assert(duplicate.fingerprint === digest, "posting_id_collision");
    return { state: structuredClone(state), entry: structuredClone(duplicate), duplicate: true };
  }
  // A policy ID/version has immutable meaning within an account history.
  for (const entry of state.entries) {
    if (entry.policy.id === policy.id && entry.policy.version === policy.version) {
      assert(canonical(entry.policy) === canonical(policy), "policy_version_collision");
    }
  }
  const next = structuredClone(state);
  const lines = [];
  let allocation = null, sourceKey = null, reverses = null;
  const beforeLots = structuredClone(next.lots);
  const creditType = command.creditType || "purchased";
  const amount = command.amountCents;
  const getLot = () => { assert(id(command.lotId) && Object.hasOwn(next.lots, command.lotId), "unknown_lot"); return next.lots[command.lotId]; };
  const money = () => assert(positiveCents(amount), "invalid_amount");
  const scope = lot => assert(lot.projectId === null || lot.projectId === command.projectId, "project_scope_mismatch");
  switch (command.type) {
    case "receive": {
      const payment = validateRecord("providerTransaction", command.payment);
      const request = validateRecord("paymentRequest", command.request);
      assert(request.status === "open" && request.clientId === state.clientId && request.environment === state.environment
        && request.id === payment.requestId && request.projectId === payment.projectId
        && request.purpose === command.purpose && request.policyId === policy.id && request.policyVersion === policy.version
        && payment.amountCents <= request.amountCents, "request_mismatch");
      assert(payment.environment === state.environment && payment.clientId === state.clientId, "payment_scope_mismatch");
      assert(payment.status === "COMPLETED" && payment.sourceType === "CARD" && payment.readbackVerified
        && payment.verificationVersion === 1, "provider_verification_required");
      assert(id(command.lotId) && !Object.hasOwn(next.lots, command.lotId), "lot_exists");
      assert(command.purpose === "monthly" || command.purpose === "project_deposit", "invalid_funding_purpose");
      assert(command.purpose !== "project_deposit" || payment.projectId !== null, "deposit_requires_project");
      sourceKey = canonical([payment.environment, payment.provider, payment.merchantId, payment.paymentId]);
      assert(!Object.hasOwn(next.sources, sourceKey), "duplicate_provider_payment");
      next.sources[sourceKey] = command.id;
      next.lots[command.lotId] = { id: command.lotId, type: "purchased", projectId: payment.projectId,
        funding: { merchantId: payment.merchantId, paymentId: payment.paymentId },
        fundedCents: payment.amountCents, usedCents: 0, refundedCents: 0, refundHolds: {}, disputes: [] };
      lines.push(line("squareClearing", payment.amountCents, 0), line("purchasedLiability", 0, payment.amountCents));
      break;
    }
    case "promote":
      money();
      assert(id(command.lotId) && !Object.hasOwn(next.lots, command.lotId), "lot_exists");
      assert(command.projectId === null || id(command.projectId), "invalid_project");
      next.lots[command.lotId] = { id: command.lotId, type: "promotional", projectId: command.projectId,
        funding: null, fundedCents: amount, usedCents: 0, refundedCents: 0, refundHolds: {}, disputes: [] };
      lines.push(line("promotionExpense", amount, 0), line("promotionalLiability", 0, amount));
      break;
    case "redeem": {
      money();
      const lot = getLot(); scope(lot);
      assert(command.creditType === lot.type && LIABILITY[creditType], "explicit_credit_type_required");
      assert(available(lot) >= amount, "insufficient_credit");
      assert(["tattoo_service", "supply_fee"].includes(command.purpose), "invalid_allocation");
      assert(id(command.appointmentId), "appointment_required");
      lot.usedCents = add(lot.usedCents, amount);
      allocation = validateRecord("allocation", { schemaVersion: 1, id: command.id, environment: state.environment,
        currency: "CAD", journalId: command.id, lotId: lot.id, clientId: state.clientId,
        projectId: command.projectId, appointmentId: command.appointmentId, amountCents: amount, purpose: command.purpose });
      lines.push(line(LIABILITY[lot.type], amount, 0), line(command.purpose === "supply_fee" ? "supplyRevenue" : "tattooRevenue", 0, amount));
      break;
    }
    case "reserve_refund": {
      money(); const lot = getLot();
      assert(lot.type === "purchased", "promotional_cash_refund_forbidden");
      assert(id(command.caseId) && !Object.hasOwn(lot.refundHolds, command.caseId), "refund_hold_exists");
      assert(add(refundHeld(lot), amount) <= remaining(lot), "insufficient_credit");
      lot.refundHolds[command.caseId] = amount;
      break;
    }
    case "transfer": {
      money(); const lot = getLot(); scope(lot);
      assert(lot.type === "purchased" && id(command.targetLotId) && !Object.hasOwn(next.lots, command.targetLotId), "invalid_transfer_target");
      assert(available(lot) >= amount, "insufficient_credit");
      lot.transferredCents = add(lot.transferredCents || 0, amount);
      next.lots[command.targetLotId] = { id: command.targetLotId, type: "purchased", projectId: null,
        funding: structuredClone(lot.funding), originLotId: lot.id, fundedCents: amount, usedCents: 0, refundedCents: 0, refundHolds: {}, disputes: [] };
      // Purchased liability moves between lots, with no new cash or earned revenue.
      lines.push(line("purchasedLiability", amount, 0), line("purchasedLiability", 0, amount));
      break;
    }
    case "release_refund": {
      const lot = getLot(); assert(id(command.caseId) && Object.hasOwn(lot.refundHolds, command.caseId), "unknown_refund_hold");
      delete lot.refundHolds[command.caseId]; break;
    }
    case "freeze_dispute": {
      const lot = getLot(); assert(lot.type === "purchased" && id(command.caseId), "invalid_dispute");
      assert(!lot.disputes.includes(command.caseId), "dispute_exists");
      lot.disputes.push(command.caseId); lot.disputes.sort(); break;
    }
    case "release_dispute": {
      const lot = getLot(); assert(id(command.caseId) && lot.disputes.includes(command.caseId), "unknown_dispute");
      lot.disputes = lot.disputes.filter(key => key !== command.caseId); break;
    }
    case "complete_refund": {
      const lot = getLot(); money();
      assert(lot.type === "purchased" && lot.refundHolds[command.caseId] >= amount, "refund_reservation_required");
      const refund = validateRecord("providerRefund", command.verifiedRefund);
      assert(refund.environment === state.environment && refund.amountCents === amount
        && refund.merchantId === lot.funding.merchantId && refund.paymentId === lot.funding.paymentId, "refund_scope_mismatch");
      sourceKey = canonical([state.environment, refund.provider, refund.merchantId, "refund", refund.id]);
      assert(!Object.hasOwn(next.sources, sourceKey), "duplicate_refund"); next.sources[sourceKey] = command.id;
      lot.refundHolds[command.caseId] -= amount;
      if (!lot.refundHolds[command.caseId]) delete lot.refundHolds[command.caseId];
      lot.refundedCents = add(lot.refundedCents, amount);
      lines.push(line("purchasedLiability", amount, 0), line("squareClearing", 0, amount)); break;
    }
    case "cancel_membership":
      assert(id(command.membershipId), "invalid_membership"); break;
    case "reverse": {
      assert(id(command.originalId), "invalid_reversal");
      const original = state.entries.find(e => e.id === command.originalId);
      assert(original && original.command.type !== "reverse" && !state.entries.some(e => e.reverses === original.id), "invalid_reversal");
      for (const [lotId, change] of Object.entries(original.lotChanges)) {
        assert(canonical(next.lots[lotId] || null) === canonical(change.after), "reverse_dependents_first");
        if (change.before === null) delete next.lots[lotId]; else next.lots[lotId] = structuredClone(change.before);
      }
      lines.push(...original.lines.map(l => line(l.account, l.creditCents, l.debitCents)));
      reverses = original.id; break;
    }
    default: throw Error("unsupported_command");
  }
  Object.values(next.lots).forEach(validateLot);
  for (const l of lines) next.balances[l.account] = add(next.balances[l.account], add(l.debitCents, -l.creditCents));
  const lotChanges = {};
  for (const key of new Set([...Object.keys(beforeLots), ...Object.keys(next.lots)])) {
    if (canonical(beforeLots[key] || null) !== canonical(next.lots[key] || null)) {
      lotChanges[key] = { before: beforeLots[key] || null, after: structuredClone(next.lots[key] || null) };
    }
  }
  const entry = validateJournal({ schemaVersion: 1, id: command.id, clientId: state.clientId,
    environment: state.environment, currency: "CAD", sequence: add(state.revision, 1),
    actorId: command.actorId, recordedAt: command.recordedAt,
    command: structuredClone(command), policy, fingerprint: digest, lines, allocation, lotChanges, sourceKey, reverses });
  next.revision = entry.sequence; next.entries.push(entry);
  assert(sum(Object.values(next.balances)) === 0, "unbalanced_account");
  assert(-next.balances.purchasedLiability === sum(Object.values(next.lots).filter(l => l.type === "purchased").map(remaining)), "liability_drift");
  assert(-next.balances.promotionalLiability === sum(Object.values(next.lots).filter(l => l.type === "promotional").map(remaining)), "liability_drift");
  return { state: next, entry, duplicate: false };
}
export function balances(state) {
  const lots = Object.values(state.lots);
  const purchased = lots.filter(l => l.type === "purchased"), promo = lots.filter(l => l.type === "promotional");
  const reversed = new Set(state.entries.filter(e => e.reverses).map(e => e.reverses));
  return { collectedPaymentsCents: sum(state.entries.filter(e => e.command.type === "receive" && !reversed.has(e.id)).map(e => e.command.payment.amountCents)),
    netCollectedCents: state.balances.squareClearing, prepaidLiabilityCents: 0 - state.balances.purchasedLiability,
    availablePurchasedCents: sum(purchased.map(available)), reservedPurchasedCents: sum(purchased.map(reserved)),
    availablePromotionalCents: sum(promo.map(available)), reservedPromotionalCents: sum(promo.map(reserved)),
    earnedTattooRevenueCents: 0 - state.balances.tattooRevenue, earnedSupplyRevenueCents: 0 - state.balances.supplyRevenue };
}
export function rebuild(scope, entries) {
  let state = emptyAccount(scope);
  for (const original of entries) {
    validateJournal(original);
    assert(original.sequence === state.revision + 1 && original.clientId === scope.clientId
      && original.environment === scope.environment, "journal_sequence_or_scope");
    const prepared = post(state, original.command, original.policy);
    assert(!prepared.duplicate && canonical(prepared.entry) === canonical(original), "journal_reconstruction_mismatch");
    state = prepared.state;
  }
  return state;
}
