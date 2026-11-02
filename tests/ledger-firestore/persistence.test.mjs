import test, { after } from "node:test";
import assert from "node:assert/strict";
import { rebuild, balances } from "../../lib/ledger/engine.mjs";
import { ledgerPaths, evidencePath, policyPath } from "../../lib/ledger/server/firestore.mjs";
import { emulatorDatabase, ledger, scopeFor, seed, receive, redeem, operation, principal, policy } from "./fixture.mjs";
const db = emulatorDatabase();
after(() => db.terminate());
const projection = async scope => (await db.doc(ledgerPaths(scope).account).get()).data();
const journal = async scope => (await db.collection(ledgerPaths(scope).journal).orderBy("sequence").get()).docs.map(d => d.data());
async function funded(name) {
  const scope = scopeFor(name); await seed(db, scope); const store = ledger(db, scope);
  await store.post(scope, receive(), principal); return { scope, store };
}
const successes = results => results.filter(r => r.status === "fulfilled").length;

test("simultaneous redemptions cannot overspend a shared account", async () => {
  const { scope, store } = await funded("concurrent");
  const results = await Promise.allSettled(["one", "two"].map(id => store.post(scope, redeem({ id }), principal)));
  assert.equal(successes(results), 1);
  assert.equal((await projection(scope)).summary.availablePurchasedCents, 10000);
  assert.equal((await journal(scope)).length, 2);
});

test("duplicate delivery is idempotent; changed posting IDs cannot repeat provider funds", async () => {
  const scope = scopeFor("duplicate"); await seed(db, scope); const store = ledger(db, scope);
  const results = await Promise.all([store.post(scope, receive(), principal), store.post(scope, receive(), principal)]);
  assert.equal(results.filter(r => r.duplicate).length, 1);
  await assert.rejects(store.post(scope, receive({ id: "new_id", lotId: "new_lot" }), principal), /duplicate_provider_source/);
  await assert.rejects(store.post(scope, receive({ purpose: "monthly" }), principal), /posting_id_collision/);
  assert.equal((await projection(scope)).summary.collectedPaymentsCents, 30000);
});

test("provider uniqueness is global across clients under concurrent delivery", async () => {
  const scopes = [scopeFor("global_a"), scopeFor("global_b")];
  for (const scope of scopes) await seed(db, scope, { paymentId: "shared_synthetic_payment" });
  const results = await Promise.allSettled(scopes.map(scope => ledger(db, scope).post(scope, receive(), principal)));
  assert.equal(successes(results), 1);
  assert.equal((await Promise.all(scopes.map(journal))).flat().length, 1);
});

test("concurrent refund reservation and redemption cannot allocate the same value", async () => {
  const { scope, store } = await funded("reserve_conflict");
  const results = await Promise.allSettled([
    store.post(scope, redeem(), principal),
    store.post(scope, operation("reserve_refund", { lotId: "lot_1", caseId: "refund_case", amountCents: 20000 }), principal),
  ]);
  assert.equal(successes(results), 1);
  const summary = (await projection(scope)).summary;
  assert.equal(summary.availablePurchasedCents, 10000);
  assert.ok(summary.reservedPurchasedCents === 0 || summary.reservedPurchasedCents === 20000);
});

test("dispute and refund overlap reserve once, verified refund deducts once", async () => {
  const { scope, store } = await funded("overlap");
  await Promise.all([
    store.post(scope, operation("freeze_dispute", { lotId: "lot_1", caseId: "dispute_case" }), principal),
    store.post(scope, operation("reserve_refund", { lotId: "lot_1", caseId: "refund_case", amountCents: 5000 }), principal),
  ]);
  assert.equal((await projection(scope)).summary.reservedPurchasedCents, 30000);
  const refund = { schemaVersion: 1, id: "provider_refund", environment: "sandbox", currency: "CAD", provider: "square",
    merchantId: "merchant_1", paymentId: `payment_${scope.clientId}`, amountCents: 5000,
    status: "COMPLETED", readbackVerified: true, verificationVersion: 1, evidenceId: "refund_evidence" };
  await db.doc(evidencePath(scope, "refunds", "refund_evidence")).create(refund);
  const input = operation("complete_refund", { lotId: "lot_1", caseId: "refund_case", amountCents: 5000, refundEvidenceId: "refund_evidence" });
  await store.post(scope, input, principal); await store.post(scope, input, principal);
  assert.equal((await projection(scope)).summary.reservedPurchasedCents, 25000);
  await store.post(scope, operation("reserve_refund", { id: "hold_again", lotId: "lot_1", caseId: "second_case", amountCents: 5000 }), principal);
  await assert.rejects(store.post(scope, { ...input, id: "refund_again", caseId: "second_case" }, principal), /duplicate_provider_source/);
  await store.post(scope, operation("release_dispute", { lotId: "lot_1", caseId: "dispute_case" }), principal);
  await store.post(scope, operation("release_refund", { lotId: "lot_1", caseId: "second_case" }), principal);
  assert.equal((await projection(scope)).summary.availablePurchasedCents, 25000);
});

test("exception after queued writes rolls back journal, source guard, lot and projection", async () => {
  const scope = scopeFor("rollback"); await seed(db, scope);
  const broken = { doc: path => db.doc(path), runTransaction: (callback, options) => db.runTransaction(async tx => {
    const wrapped = new Proxy(tx, { get(target, key) {
      if (key === "set") return (...args) => { target.set(...args); throw Error("synthetic_interrupted_write"); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } }); return callback(wrapped);
  }, options) };
  await assert.rejects(ledger(db, scope, broken).post(scope, receive(), principal), /interrupted_write/);
  assert.equal(await projection(scope), undefined); assert.equal((await journal(scope)).length, 0);
  // Guard was not partially committed either.
  await ledger(db, scope).post(scope, receive(), principal);
  assert.equal((await projection(scope)).revision, 1);
});

test("SDK retries ABORTED callbacks without repeated authorization or posting", async () => {
  const scope = scopeFor("retry"); await seed(db, scope); let attempts = 0;
  const retrying = { doc: path => db.doc(path), runTransaction: (callback, options) => db.runTransaction(async tx => {
    const result = await callback(tx); attempts++;
    if (attempts === 1) throw Object.assign(Error("synthetic_aborted"), { code: 10 });
    return result;
  }, options) };
  await ledger(db, scope, retrying).post(scope, receive(), principal);
  assert.equal(attempts, 2); assert.equal((await journal(scope)).length, 1);
});

test("lost commit response is recoverable by replaying the immutable operation ID", async () => {
  const scope = scopeFor("uncertain_commit"); await seed(db, scope);
  const interrupted = { doc: path => db.doc(path), runTransaction: async (...args) => {
    await db.runTransaction(...args); throw Error("synthetic_response_lost");
  } };
  await assert.rejects(ledger(db, scope, interrupted).post(scope, receive(), principal), /response_lost/);
  const recovered = await ledger(db, scope).post(scope, receive(), principal);
  assert.equal(recovered.duplicate, true); assert.equal((await projection(scope)).revision, 1);
});

test("invalid IDs, browser verification flags and forged identities fail closed", async () => {
  const scope = scopeFor("invalid"); await seed(db, scope); const store = ledger(db, scope);
  for (const clientId of ["../other", "__proto__", "", "x/y"]) await assert.rejects(store.post({ ...scope, clientId }, receive(), principal), /invalid_scope/);
  await assert.rejects(store.post(scope, receive({ lotId: "x/y" }), principal), /invalid_identifier/);
  await assert.rejects(store.post(scope, receive({ actorId: "owner" }), principal), /invalid_operation/);
  await assert.rejects(store.post(scope, receive({ payment: { readbackVerified: true } }), principal), /invalid_operation/);
  await assert.rejects(store.post(scope, receive(), { actorId: "synthetic_admin" }), /unauthorized/);
  assert.equal(await projection(scope), undefined);
});

test("account/evidence isolation prevents cross-client funding and redemption", async () => {
  const { scope, store } = await funded("isolated_a"); const other = scopeFor("isolated_b");
  await assert.rejects(store.post(other, receive(), principal), /unauthorized/);
  await seed(db, other, { clientId: scope.clientId });
  await assert.rejects(ledger(db, other).post(other, receive(), principal), /payment_scope_mismatch/);
  await assert.rejects(ledger(db, other).post(other, redeem(), principal), /unknown_lot/);
  assert.equal((await projection(scope)).summary.availablePurchasedCents, 30000);
});

test("insufficient funds and stale revisions fail without partial changes", async () => {
  const { scope, store } = await funded("stale"); const before = await projection(scope);
  await assert.rejects(store.post(scope, redeem({ amountCents: 30001 }), principal), /insufficient_credit/);
  await assert.rejects(store.post(scope, redeem({ expectedRevision: 0 }), principal), /stale_revision/);
  assert.deepEqual(await projection(scope), before);
  await store.post(scope, redeem({ expectedRevision: 1 }), principal);
  assert.equal((await projection(scope)).revision, 2);
});

test("failed monthly and EXTERNAL evidence create no credit", async () => {
  for (const patch of [{ status: "FAILED" }, { status: "PENDING" }, { sourceType: "EXTERNAL" }, { readbackVerified: false }]) {
    const scope = scopeFor(`failed_${Object.values(patch)[0]}`); await seed(db, scope, patch, { purpose: "monthly" });
    await assert.rejects(ledger(db, scope).post(scope, receive({ purpose: "monthly" }), principal), /provider_verification_required/);
    assert.equal(await projection(scope), undefined); assert.equal((await journal(scope)).length, 0);
  }
});

test("membership cancellation and unsupported offer expiry preserve purchased value", async () => {
  const { scope, store } = await funded("retained");
  await store.post(scope, operation("cancel_membership", { membershipId: "membership_1" }), principal);
  assert.equal((await projection(scope)).summary.availablePurchasedCents, 30000);
  // Non-cash offers are owned by sibling PR #61, with no money mutation command.
  for (const type of ["expire_offer", "promote", "transfer_credit"]) await assert.rejects(store.post(scope, operation(type), principal), /invalid_operation/);
  assert.equal((await projection(scope)).summary.availablePurchasedCents, 30000);
  await assert.rejects(store.post(scope, redeem({ projectId: "wrong_project" }), principal), /project_scope_mismatch/);
});

test("immutable journal reconstructs multi-lot projections, allocations, holds and reversals", async () => {
  const { scope, store } = await funded("rebuild");
  await seed(db, scope, { paymentId: "second_rebuild_payment", evidenceId: "evidence_1" });
  await store.post(scope, receive({ id: "second_receipt", lotId: "lot_2" }), principal);
  await store.post(scope, redeem({ amountCents: 10000 }), principal);
  await store.post(scope, operation("reserve_refund", { lotId: "lot_2", caseId: "case_1", amountCents: 5000 }), principal);
  await store.post(scope, operation("reverse", { originalId: "reserve_refund_1" }), principal);
  await store.post(scope, operation("reverse", { id: "reverse_redemption", originalId: "redeem_1" }), principal);
  await assert.rejects(store.post(scope, operation("reverse", { id: "second_reversal", originalId: "redeem_1" }), principal), /already_reversed/);
  const entries = await journal(scope), rebuilt = rebuild(scope, entries), stored = await projection(scope);
  assert.deepEqual(stored.balances, rebuilt.balances); assert.deepEqual(stored.summary, balances(rebuilt));
  assert.equal(stored.revision, entries.length);
  const lots = (await db.collection(ledgerPaths(scope).lots).get()).docs.map(d => d.data());
  assert.deepEqual(Object.fromEntries(lots.map(lot => [lot.id, lot])), rebuilt.lots);
  assert.ok((await db.doc(`${ledgerPaths(scope).allocations}/redeem_1`).get()).exists);
  assert.equal(entries[0].policy.status, "approved");
  assert.equal(entries[0].actorId, "synthetic_admin");
});

test("global policy version guards reject changing previously posted policy semantics", async () => {
  const { scope, store } = await funded("policy_change");
  await db.doc(policyPath("sandbox", "terms", 1)).set({ ...policy, status: "draft" });
  await assert.rejects(store.post(scope, redeem(), principal), /policy_not_approved/);
  await db.doc(policyPath("sandbox", "terms", 1)).set(policy);
});

test("emulator fixture rejects missing host or a non-demo project before client creation", () => {
  const saved = process.env.GCLOUD_PROJECT;
  try { process.env.GCLOUD_PROJECT = "not_a_demo_project"; assert.throws(emulatorDatabase, /local_demo_emulator_required/); }
  finally { process.env.GCLOUD_PROJECT = saved; }
});

test("receipt reversal preserves provider uniqueness and reconstructable history", async () => {
  const { scope, store } = await funded("reverse_receipt");
  await store.post(scope, operation("reverse", { originalId: "receive_1" }), principal);
  assert.equal((await projection(scope)).summary.availablePurchasedCents, 0);
  assert.equal((await projection(scope)).summary.collectedPaymentsCents, 0);
  await assert.rejects(store.post(scope, receive({ id: "recredit", lotId: "lot_2" }), principal), /duplicate_provider_source/);
  assert.deepEqual((await projection(scope)).summary, balances(rebuild(scope, await journal(scope))));
});

test("writes read bounded documents regardless of journal history length", async () => {
  const { scope, store } = await funded("bounded");
  for (let i = 0; i < 8; i++) await store.post(scope, operation("cancel_membership", { id: `cancel_${i}`, membershipId: "membership_1" }), principal);
  let reads = 0;
  const measured = { doc: path => db.doc(path), runTransaction: (callback, options) => db.runTransaction(tx => callback(new Proxy(tx, {
    get(target, key) {
      if (key === "get") return ref => { reads++; return target.get(ref); };
      if (key === "getAll") return (...refs) => { reads += refs.length; return target.getAll(...refs); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    },
  })), options) };
  await ledger(db, scope, measured).post(scope, redeem({ amountCents: 1000 }), principal);
  assert.equal(reads, 5);
  assert.equal((await journal(scope)).length, 10);
});

test("missing trusted evidence and exhausted retries cannot create a receipt", async () => {
  const scope = scopeFor("missing"); await seed(db, scope);
  await assert.rejects(ledger(db, scope).post(scope, receive({ paymentEvidenceId: "missing" }), principal), /invalid_providerTransaction/);
  let attempts = 0;
  const unavailable = { doc: path => db.doc(path), runTransaction: (callback, options) => db.runTransaction(async tx => {
    await callback(tx); attempts++; throw Object.assign(Error("synthetic_retry_exhausted"), { code: 10 });
  }, options) };
  await assert.rejects(ledger(db, scope, unavailable).post(scope, receive(), principal), /retry_exhausted/);
  assert.equal(attempts, 5); assert.equal(await projection(scope), undefined);
});
