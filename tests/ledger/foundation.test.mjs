import test from "node:test";
import assert from "node:assert/strict";
import { emptyAccount, post, balances, rebuild, validateJournal } from "../../lib/ledger/engine.mjs";
import { validateRecord, canonical } from "../../lib/ledger/schemas.mjs";
import { postAtomically, reconcile } from "../../lib/ledger/transaction.mjs";
import { memoryStore } from "./memoryStore.mjs";
const audit = command => ({ actorId: "admin_test", recordedAt: "2026-11-01T00:00:00.000Z", ...command });
const scope = { clientId: "client_test", environment: "sandbox" };
const policy = { schemaVersion: 1, id: "terms", version: 1, status: "draft", currency: "CAD", depositScope: "project",
  purchasedExpiry: "never", cancellationCredit: "retain", supplyFees: "separate", promotionUse: "explicit", disputeFreeze: "remaining_funding_lot" };
const payment = { schemaVersion: 1, id: "provider_row", environment: "sandbox", currency: "CAD", provider: "square",
  merchantId: "merchant_test", paymentId: "payment_test", orderId: "order_test", locationId: "location_test",
  requestId: "request_test", clientId: scope.clientId, projectId: "project_test", amountCents: 30000,
  status: "COMPLETED", sourceType: "CARD", readbackVerified: true, verificationVersion: 1, evidenceId: "evidence_test" };
const request = { schemaVersion: 1, id: payment.requestId, environment: "sandbox", currency: "CAD", clientId: scope.clientId,
  projectId: "project_test", projectApproved: true, appointmentId: null, purpose: "project_deposit", amountCents: 30000,
  policyId: "terms", policyVersion: 1, status: "open" };
const receive = (patch = {}) => ({ id: "receipt_1", type: "receive", lotId: "lot_1", purpose: "project_deposit", payment, request, ...patch, actorId: "admin_test", recordedAt: "2026-11-01T00:00:00.000Z" });
const redeem = (patch = {}) => ({ id: "session_1", type: "redeem", lotId: "lot_1", projectId: "project_test",
  appointmentId: "appointment_1", creditType: "purchased", purpose: "tattoo_service", amountCents: 10000, ...patch, actorId: "admin_test", recordedAt: "2026-11-01T00:00:00.000Z" });
const funded = () => post(emptyAccount(scope), receive(), policy).state;
const apply = (state, command, terms = policy) => post(state, audit(command), terms).state;
const hold = (id, type, patch = {}) => ({ id, type, lotId: "lot_1", caseId: "case_1", ...patch });
const refund = { schemaVersion: 1, id: "refund_1", environment: "sandbox", currency: "CAD", provider: "square",
  merchantId: payment.merchantId, paymentId: payment.paymentId, amountCents: 5000, status: "COMPLETED",
  readbackVerified: true, verificationVersion: 1, evidenceId: "refund_evidence" };

test("versioned record contracts reject currency, unsafe cents, unknown fields and unapproved deposits", () => {
  assert.deepEqual(validateRecord("providerTransaction", payment), payment);
  for (const patch of [{ currency: "USD" }, { amountCents: 0.5 }, { amountCents: Number.MAX_SAFE_INTEGER + 1 }, { token: "must_not_store" }, { schemaVersion: 2 }, { id: "__proto__" }]) {
    assert.throws(() => validateRecord("providerTransaction", { ...payment, ...patch }));
  }
  assert.throws(() => validateRecord("paymentRequest", { ...request, projectApproved: false }), /deposit/);
  assert.throws(() => apply(funded(), { ...redeem(), authorization: "secret" }), /command_fields/);
  assert.throws(() => validateRecord("policy", { ...policy, purchasedExpiry: "one_year" }));
  assert.throws(() => validateJournal({ schemaVersion: 2 }));
});

test("receipt is a balanced clearing asset / purchased liability, not earned revenue", () => {
  const state = funded(), b = balances(state);
  assert.equal(b.collectedPaymentsCents, 30000); assert.equal(b.netCollectedCents, 30000);
  assert.equal(b.prepaidLiabilityCents, 30000); assert.equal(b.availablePurchasedCents, 30000);
  assert.equal(b.earnedTattooRevenueCents, 0);
  assert.equal(state.entries[0].lines.reduce((n,l) => n+l.debitCents-l.creditCents,0),0);
  assert.deepEqual(rebuild(scope, state.entries), state);
});

test("immutable posting IDs replay once and different IDs cannot duplicate a provider payment", () => {
  const state = funded(), before = canonical(state);
  assert.equal(post(state, receive(), policy).duplicate, true);
  assert.throws(() => apply(state, receive({ id: "another", lotId: "another_lot" })), /duplicate_provider/);
  assert.throws(() => apply(state, receive({ purpose: "monthly" })), /collision/);
  assert.equal(canonical(state), before);
});

test("failed monthly installments and unverified/external receipts add no credit", () => {
  for (const patch of [{ status: "FAILED" }, { status: "PENDING" }, { sourceType: "EXTERNAL" }, { readbackVerified: false }, { verificationVersion: 2 }]) {
    const state = emptyAccount(scope);
    assert.throws(() => apply(state, receive({ purpose: "monthly", request: { ...request, purpose: "monthly" }, payment: { ...payment, ...patch } })));
    assert.equal(balances(state).availablePurchasedCents, 0);
  }
  assert.throws(() => apply(emptyAccount(scope), receive({ payment: { ...payment, clientId: "other" } })), /scope/);
  assert.throws(() => apply(emptyAccount(scope), receive({ request: { ...request, policyVersion: 2 } })), /request_mismatch/);
});

test("partial session redemption and supply allocation do not receive new money", () => {
  let state = apply(funded(), redeem());
  state = apply(state, redeem({ id: "supply_1", purpose: "supply_fee", amountCents: 5000 }));
  assert.equal(balances(state).availablePurchasedCents,15000);
  assert.equal(balances(state).collectedPaymentsCents,30000);
  assert.equal(balances(state).earnedTattooRevenueCents,10000);
  assert.equal(balances(state).earnedSupplyRevenueCents,5000);
  assert.equal(state.entries[1].allocation.appointmentId,"appointment_1");
  assert.throws(() => apply(state, redeem({ id: "too_much", amountCents: 16000 })), /insufficient/);
  assert.throws(() => apply(state, redeem({ id: "wrong_project", projectId: "other" })), /project_scope/);
  assert.deepEqual(rebuild(scope,state.entries),state);
});

test("membership cancellation retains purchased credit; policy versions do not rewrite history", () => {
  let state = funded();
  state = apply(state, { id: "cancel", type: "cancel_membership", membershipId: "membership_1" });
  assert.equal(balances(state).availablePurchasedCents,30000);
  const next = { ...policy, version: 2, status: "approved" };
  state = apply(state, redeem(), next);
  assert.equal(state.entries[0].policy.status,"draft");
  assert.equal(state.entries[2].policy.version,2);
  assert.throws(() => apply(state, redeem({ id: "changed_terms" }), { ...policy, status: "approved" }), /policy_version_collision/);
  assert.deepEqual(rebuild(scope,state.entries),state);
});

test("promotional credit is separate, explicitly selected and not cash refundable", () => {
  let state = apply(funded(), { id: "promo", type: "promote", lotId: "promo_lot", projectId: null, amountCents: 5000 });
  assert.equal(balances(state).availablePromotionalCents,5000);
  assert.equal(balances(state).prepaidLiabilityCents,30000);
  state = apply(state, redeem({ lotId: "promo_lot", creditType: "promotional", amountCents: 1000 }));
  assert.equal(balances(state).availablePromotionalCents,4000);
  assert.equal(balances(state).availablePurchasedCents,30000);
  assert.throws(() => apply(state, hold("refund_promo", "reserve_refund", { lotId: "promo_lot", amountCents: 1000 })), /promotional/);
  assert.deepEqual(rebuild(scope,state.entries),state);
});

test("refund/dispute overlap freezes once and a completed refund reduces liability once", () => {
  let state = apply(funded(), hold("reserve", "reserve_refund", { amountCents: 10000 }));
  assert.equal(balances(state).reservedPurchasedCents,10000);
  state = apply(state, hold("dispute", "freeze_dispute"));
  assert.equal(balances(state).reservedPurchasedCents,30000);
  assert.equal(balances(state).availablePurchasedCents,0);
  assert.throws(() => apply(state, redeem()), /insufficient/);
  state = apply(state, hold("refund_complete", "complete_refund", { amountCents: 5000, verifiedRefund: refund }));
  assert.equal(balances(state).reservedPurchasedCents,25000);
  assert.equal(balances(state).netCollectedCents,25000);
  assert.equal(balances(state).collectedPaymentsCents,30000);
  state = apply(state, hold("dispute_release", "release_dispute"));
  assert.equal(balances(state).reservedPurchasedCents,5000);
  assert.equal(balances(state).availablePurchasedCents,20000);
  state = apply(state, hold("refund_release", "release_refund"));
  assert.equal(balances(state).availablePurchasedCents,25000);
  assert.deepEqual(rebuild(scope,state.entries),state);
});

test("multiple refunds cannot exceed remaining value; wrong funding and duplicate refunds reject", () => {
  let state = apply(funded(), hold("reserve", "reserve_refund", { amountCents: 20000 }));
  assert.throws(() => apply(state, hold("reserve2", "reserve_refund", { caseId: "other", amountCents: 15000 })), /insufficient/);
  assert.throws(() => apply(state, hold("wrong_refund", "complete_refund", { amountCents: 5000, verifiedRefund: { ...refund, paymentId: "other" } })), /scope_mismatch/);
  state = apply(state, hold("refund_done", "complete_refund", { amountCents: 5000, verifiedRefund: refund }));
  assert.throws(() => apply(state, hold("duplicate_refund", "complete_refund", { amountCents: 5000, verifiedRefund: refund })), /duplicate_refund/);
});

test("corrections append exact reversals, block dependent reversals and retain dedup tombstones", () => {
  const original = funded();
  let state = apply(original, redeem());
  assert.throws(() => apply(state, { id: "reverse_receipt", type: "reverse", originalId: "receipt_1" }), /dependents/);
  state = apply(state, { id: "reverse_session", type: "reverse", originalId: "session_1" });
  assert.equal(balances(state).earnedTattooRevenueCents,0);
  state = apply(state, { id: "reverse_receipt", type: "reverse", originalId: "receipt_1" });
  assert.equal(balances(state).availablePurchasedCents,0);
  assert.equal(balances(state).netCollectedCents,0);
  assert.throws(() => apply(state, receive({ id: "again", lotId: "new_lot" })), /duplicate_provider/);
  assert.throws(() => apply(state, { id: "again_reverse", type: "reverse", originalId: "receipt_1" }), /invalid_reversal/);
  assert.deepEqual(state.entries[0], original.entries[0]);
  assert.deepEqual(rebuild(scope,state.entries),state);
});

test("journal reconstruction detects tampering, missing/duplicate entries, and projection drift", () => {
  const state = apply(funded(), redeem());
  assert.equal(reconcile(scope,state.entries,state).matches,true);
  assert.equal(reconcile(scope,state.entries,{ ...state, revision: 99 }).matches,false);
  const changed = structuredClone(state.entries); changed[1].lines[0].debitCents++;
  assert.throws(() => rebuild(scope,changed), /unbalanced/);
  const changedPolicy = structuredClone(state.entries); changedPolicy[0].lotChanges.lot_1.after.fundedCents++;
  assert.throws(() => rebuild(scope,changedPolicy), /reconstruction/);
  assert.throws(() => rebuild(scope,[state.entries[1]]), /sequence/);
  assert.throws(() => rebuild(scope,[...state.entries,state.entries[1]]), /sequence/);
});

test("transaction port serializes simultaneous redemptions and atomically rejects overspend", async () => {
  const store = memoryStore();
  await postAtomically(store,scope,receive(),policy);
  const results = await Promise.allSettled(["a","b"].map(key => postAtomically(store,scope,redeem({ id: key, amountCents: 20000 }),policy)));
  assert.equal(results.filter(r => r.status === "fulfilled").length,1);
  assert.equal(results.filter(r => r.status === "rejected").length,1);
  const history = store.entries(scope);
  assert.equal(history.length,2);
  assert.equal(balances(rebuild(scope,history)).availablePurchasedCents,10000);
});

test("transaction port handles simultaneous receipt retries without duplicate postings", async () => {
  const store = memoryStore();
  const results = await Promise.all([1,2].map(() => postAtomically(store,scope,receive(),policy)));
  assert.equal(results.filter(r=>r.duplicate).length,1);
  assert.equal(store.entries(scope).length,1);
});

test("overflow and fractional amounts fail before changing the caller state", () => {
  const state = funded(), before = canonical(state);
  for (const amountCents of [1.5, NaN, Infinity, -1, 0, Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(() => apply(state, redeem({ amountCents })));
  }
  const large = { ...payment, amountCents: Number.MAX_SAFE_INTEGER, paymentId: "huge" };
  assert.throws(() => apply(state, receive({ id: "huge", lotId: "huge_lot", payment: large, request: { ...request, amountCents: large.amountCents } })), /overflow/);
  assert.equal(canonical(state),before);
});


test("a provider payment cannot be posted to two different client accounts concurrently", async () => {
  const store = memoryStore(), other = { ...scope, clientId: "client_other" };
  const command = receive({ payment: { ...payment, clientId: other.clientId }, request: { ...request, clientId: other.clientId } });
  const results = await Promise.allSettled([
    postAtomically(store, scope, receive(), policy), postAtomically(store, other, command, policy),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(store.entries(scope).length + store.entries(other).length, 1);
});

test("transaction callback failure rolls back staged journal and dedup records", async () => {
  const store = memoryStore();
  await assert.rejects(store.transaction(scope, async tx => {
    const result = post(emptyAccount(scope), receive(), policy);
    await tx.append(result.entry, 0);
    throw Error("commit_aborted");
  }), /commit_aborted/);
  assert.equal(store.entries(scope).length, 0);
  assert.equal((await postAtomically(store, scope, receive(), policy)).duplicate, false);
});

test("all declared public contracts accept representative version-one records", () => {
  assert.ok(validateRecord("paymentAttempt", { schemaVersion: 1, id: "attempt", environment: "sandbox", currency: "CAD",
    requestId: request.id, channel: "pos", idempotencyKey: "durable_key", status: "prepared" }));
  assert.ok(validateRecord("creditAccount", { schemaVersion: 1, id: "account", environment: "sandbox", currency: "CAD",
    clientId: scope.clientId, revision: 0, availableCents: 0, reservedCents: 0, purchasedCents: 0, promotionalCents: 0 }));
});

test("replay is deterministic across many partial allocations and detects balanced tampering", () => {
  let state = funded();
  for (let i=0; i<60; i++) state = apply(state, redeem({ id: "use_"+i, amountCents: 500 }));
  assert.equal(balances(state).availablePurchasedCents,0);
  assert.equal(balances(state).earnedTattooRevenueCents,30000);
  assert.deepEqual(rebuild(scope,state.entries),state);
  const bad = structuredClone(state.entries);
  bad[1].lines[0].debitCents = 600; bad[1].lines[1].creditCents = 600;
  assert.throws(() => rebuild(scope,bad), /reconstruction/);
});

test("a concurrent refund reservation and redemption cannot allocate the same credit", async () => {
  const store = memoryStore(); await postAtomically(store,scope,receive(),policy);
  const commands = [audit(hold("reserve_race", "reserve_refund", { amountCents: 20000 })), redeem({ id: "spend_race", amountCents: 20000 })];
  const results = await Promise.allSettled(commands.map(command => postAtomically(store,scope,command,policy)));
  assert.equal(results.filter(r=>r.status === "fulfilled").length,1);
  const b = balances(rebuild(scope,store.entries(scope)));
  assert.equal(b.availablePurchasedCents,10000);
});
