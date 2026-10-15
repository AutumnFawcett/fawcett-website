import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, setDoc, serverTimestamp } from "firebase/firestore";
import { createRehearsalRuntime } from "../../lib/migration/runtime.mjs";
import { fingerprint } from "../../lib/migration/model.mjs";
import { syntheticSources, OWNER } from "../../lib/migration/fixtures.mjs";
import { firebaseEnvironment } from "../../lib/firebaseEnvironment.mjs";
import { createSyntheticOperator, createProductionOperator, IDENTITY } from "../../operator/runtime.mjs";
import { inventory, prepareManifest, prepareApproval, reconcile, execute } from "../../operator/operations.mjs";
import { validateManifest, viewPath, policyPath } from "../../operator/model.mjs";
import { operator, seed, reviewed, grant, tokenFor, identities } from "./fixtures.mjs";
let raw, runtime, token, browser, auth, database;
const closed = { schemaVersion: 1, state: "maintenance", epoch: "synthetic-operator-fence", writerProtocol: 1 };
const clone = value => JSON.parse(JSON.stringify(value));
const apply = (manifest, grantId = "synthetic-apply", options = {}) => execute(runtime, manifest, { operation: "apply", grantId, ...options });
const withdraw = (manifest, grantId = "synthetic-withdraw", options = {}) => execute(runtime, manifest, { operation: "withdraw", grantId, ...options });
async function originals() {
  const records = {};
  for (const path of Object.keys(syntheticSources())) { const snap = await raw.firestore.doc(path).get(); records[path] = fingerprint({ data: snap.data(), created: snap.createTime, updated: snap.updateTime }); }
  return records;
}
async function noViews() {
  const records = (await raw.firestore.collectionGroup("records").get()).docs.filter(snap => ["portalRecords", "publicationRecords", "operatorRuns"].includes(snap.ref.path.split("/")[0]));
  assert.equal(records.length, 0); assert.equal((await raw.firestore.collection("operatorRuns").get()).size, 0);
}
async function approved() { const manifest = await reviewed(runtime); await grant(raw, runtime, manifest); return manifest; }
before(async () => {
  raw = createRehearsalRuntime();
  browser = initializeApp(firebaseEnvironment().config, "operator-privacy-tests"); auth = getAuth(browser); database = getFirestore(browser);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(database, "127.0.0.1", 8080);
});
beforeEach(async () => {
  if (runtime) await runtime.close();
  assert.ok((await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-fawcett-dev/databases/(default)/documents", { method: "DELETE" })).ok);
  await seed(raw); token = await tokenFor(); runtime = operator(token);
});
after(async () => { if (runtime) await runtime.close(); await deleteApp(browser); await raw.close(); });

test("production factory and unexpected project/database/options fail before any connection", async () => {
  assert.throws(() => createProductionOperator(), /production_execution_disabled/);
  for (const patch of [{ projectId: "fawcett-website-sandbox" }, { projectId: "fawcett-website" }, { databaseId: "other" }, { enableProduction: true }, { intendedProductionProject: "fawcett-website" }]) assert.throws(() => createSyntheticOperator({ ...IDENTITY, ...patch }), /required|unexpected_runtime_option/);
  const previous = process.env.FIRESTORE_EMULATOR_HOST;
  try { process.env.FIRESTORE_EMULATOR_HOST = "remote.example.test:8080"; assert.throws(() => operator(token), /Non-local|local_emulators_required/); }
  finally { process.env.FIRESTORE_EMULATOR_HOST = previous; }
  await assert.rejects(inventory({ identity: IDENTITY }), /untrusted_operator_runtime/);
});
test("read-only inventory is complete within its declared scope and drafts withhold every record", async () => {
  const before = await originals(), snapshot = await inventory(runtime);
  assert.equal(snapshot.records.length, 26); assert.deepEqual(await inventory(runtime), snapshot);
  assert.doesNotMatch(JSON.stringify(snapshot), /Synthetic medical|@example.test|PRIVATE_SYNTHETIC/);
  const draft = prepareManifest(snapshot, "draft", {}); assert.ok(draft.decisions.every(row => row.state === "withheld"));
  await assert.rejects(apply(draft), /unexpected_schema_keys/);
  assert.deepEqual(await originals(), before); await noViews();
});
test("approval preparation is per-record, explicit-field and never a human approval", async () => {
  const snapshot = await inventory(runtime), path = `clients/${OWNER}`;
  const prepared = await prepareApproval(runtime, snapshot, path, ["clientUid", "clientName"]);
  assert.equal(prepared.ownerConfirmed, false); assert.equal(prepared.contentReviewed, false); assert.equal(prepared.reviewerUid, null);
  assert.equal(prepared.candidateHash, fingerprint(prepared.candidate));
  await assert.rejects(prepareApproval(runtime, snapshot, path, ["clientUid", "adminReview"]), /private_or_unknown_candidate_field/);
  await assert.rejects(prepareApproval(runtime, snapshot, path), /explicit_field_selection_required/);
  await noViews();
});
test("apply preserves source bytes, server timestamps, all Auth users and monetary aliases; resume is idempotent", async () => {
  const manifest = await approved(), before = await originals(), accounts = fingerprint(JSON.parse(JSON.stringify((await raw.auth.listUsers()).users.map(user => user.toJSON()))));
  const report = await apply(manifest); assert.equal(report.counts.created, 2, JSON.stringify(report)); assert.equal(report.counts.error, 0);
  assert.equal((await apply(manifest)).counts.already_committed, 2);
  const view = (await raw.firestore.doc(viewPath("payments/rehearsal-payment")).get()).data();
  assert.equal(view.amountCents, 12345); assert.equal(view.amount, "123.45"); assert.equal(view.paymentAmount, "123.45"); assert.equal(view.receivedAt.nanoseconds, 123456000); assert.equal(view.reference, undefined);
  assert.deepEqual(await originals(), before); assert.equal(fingerprint(JSON.parse(JSON.stringify((await raw.auth.listUsers()).users.map(user => user.toJSON())))), accounts);
  assert.equal((await reconcile(runtime, manifest)).counts.already_committed, 2);
});
test("missing authorization, wrong operation, wrong token and self-declared actor cannot write", async () => {
  const manifest = await reviewed(runtime);
  await assert.rejects(apply(manifest), /operator_grant_required/);
  await grant(raw, runtime, manifest, "withdraw"); await assert.rejects(apply(manifest, "synthetic-withdraw"), /operator_grant_mismatch/);
  await grant(raw, runtime, manifest);
  const anonymous = operator(), wrong = operator(await tokenFor(identities.ownerUid));
  try { await assert.rejects(execute(anonymous, manifest, { operation: "apply", grantId: "synthetic-apply" }), /authenticated_operator_required/); await assert.rejects(execute(wrong, manifest, { operation: "apply", grantId: "synthetic-apply" }), /operator_grant_mismatch/); }
  finally { await anonymous.close(); await wrong.close(); }
  await noViews();
});
for (const [label, patch] of [["disabled", { enabled: false }], ["expired", { notBefore: Date.now() - 60000, expiresAt: Date.now() - 1000 }], ["future", { notBefore: Date.now() + 3600000, expiresAt: Date.now() + 7200000 }], ["digest", { manifestHash: "0".repeat(64) }]]) test(`${label} operator grant fails closed`, async () => {
  const manifest = await reviewed(runtime); await grant(raw, runtime, manifest, "apply", patch); await assert.rejects(apply(manifest), /grant/); await noViews();
});
for (const [label, value] of [["missing", null], ["open", { ...closed, state: "open" }], ["invalid", { ...closed, writerProtocol: 2 }], ["new epoch", { ...closed, epoch: "different-epoch" }]]) test(`${label} fence stops apply`, async () => {
  const manifest = await approved(); if (value) await raw.firestore.doc("systemControls/writeFence").set(value); else await raw.firestore.doc("systemControls/writeFence").delete();
  await assert.rejects(apply(manifest), /fence/); await noViews();
});
test("operator role revocation and disabled owners stop the entire preflight", async () => {
  const manifest = await approved(); await raw.firestore.doc(`adminUsers/${identities.reviewerUid}`).update({ active: false });
  await assert.rejects(apply(manifest), /operator_role_inactive/); await noViews();
  await raw.firestore.doc(`adminUsers/${identities.reviewerUid}`).update({ active: true }); await raw.auth.updateUser(OWNER, { disabled: true });
  try { const report = await apply(manifest); assert.ok(report.counts.error > 0); await noViews(); } finally { await raw.auth.updateUser(OWNER, { disabled: false }); }
});
test("edited manifests, missing decisions, implicit review and duplicate records are rejected", async () => {
  const manifest = await approved();
  for (const mutate of [copy => copy.decisions.pop(), copy => { copy.decisions[0].contentReviewed = false; }, copy => { copy.decisions[1] = copy.decisions[0]; }, copy => { copy.identity.projectId = "fawcett-website-sandbox"; }]) { const copy = clone(manifest); mutate(copy); assert.throws(() => validateManifest(copy)); }
  const changed = clone(manifest); changed.decisions.find(row => row.state === "approved").candidateHash = "0".repeat(64);
  await assert.rejects(apply(changed), /operator_grant_mismatch/); await noViews();
});
test("frozen source edits and new sources invalidate the whole inventory", async () => {
  const manifest = await approved(), path = "projects/rehearsal-project";
  await raw.firestore.doc(path).update({ "adminReview.internalNotes": "Changed synthetic private review" });
  const report = await apply(manifest); assert.equal(report.counts.error, 1); assert.equal(report.records.find(row => row.state === "error").reason, "frozen_inventory_changed"); await noViews();
  await raw.firestore.doc("projects/new-late").set({ clientUid: OWNER, projectName: "Synthetic late" }); assert.ok((await reconcile(runtime, manifest)).counts.error);
});
test("partial execution survives process/runtime replacement and concurrent resumes cannot duplicate writes", async () => {
  const manifest = await approved(), first = await apply(manifest, "synthetic-apply", { limit: 1 });
  assert.equal(first.counts.created, 1); assert.equal(first.counts.pending, 1); assert.equal(first.stopped, true);
  await runtime.close(); runtime = operator(token);
  const reports = await Promise.all([apply(manifest), apply(manifest)]);
  assert.equal(reports.reduce((sum, report) => sum + report.counts.created, 0), 1, JSON.stringify(reports));
  assert.equal((await reconcile(runtime, manifest)).counts.already_committed, 2);
  assert.equal((await raw.firestore.collection(`operatorRuns/${manifest.runId}/records`).get()).size, 2);
});
test("a privileged late edit after a partial commit stops resume and retains the first journal", async () => {
  const manifest = await approved(); await apply(manifest, "synthetic-apply", { limit: 1 });
  await raw.firestore.doc("payments/rehearsal-payment").update({ amountCents: 54321 });
  const report = await apply(manifest); assert.equal(report.stopped, true); assert.equal(report.counts.error, 1);
  assert.equal((await raw.firestore.collection(`operatorRuns/${manifest.runId}/records`).get()).size, 1);
  assert.equal((await raw.firestore.doc(viewPath("payments/rehearsal-payment")).get()).exists, false);
  assert.equal((await raw.firestore.doc("payments/rehearsal-payment").get()).data().amountCents, 54321);
});
test("unexpected views, orphan views and stale publication metadata are never overwritten", async () => {
  const manifest = await approved(), path = manifest.decisions.find(row => row.state === "approved").path;
  await raw.firestore.doc(viewPath(path)).set({ clientUid: OWNER, clientName: "Existing reviewed or unknown destination" });
  const report = await apply(manifest); assert.ok(report.counts.error); assert.equal((await raw.firestore.collection(`operatorRuns/${manifest.runId}/records`).get()).size, 0);
  await raw.firestore.doc("portalRecords/projects/records/orphan").set({ clientUid: OWNER }); assert.ok((await reconcile(runtime, manifest)).counts.error);
});
test("withheld and sensitive free text cannot be bulk-approved or smuggled through field selection", async () => {
  const snapshot = await inventory(runtime);
  for (const [path, fields] of [["messages/rehearsal-sensitive-message", ["clientUid", "conversationId", "consultRequestId", "body", "senderRole"]], ["consultRequests/rehearsal-consult", ["clientUid", "readiness"]], ["projects/rehearsal-project", ["clientUid", "adminReview"]], ["projectTimeline/rehearsal-health-timeline", ["clientUid", "clientVisible", "body", "entryType", "projectId"]]]) await assert.rejects(prepareApproval(runtime, snapshot, path, fields));
  await noViews();
});
test("relationship ownership and missing Auth identity fail before any record is published", async () => {
  await raw.firestore.doc("projects/rehearsal-project").update({ clientUid: "rehearsal-bob" });
  const manifest = await reviewed(runtime, [`clients/${OWNER}`]);
  // Approve the payment only after manually completing its review, which must
  // still fail when its linked project's ownership is uncertain.
  await assert.rejects(prepareApproval(runtime, manifest.inventory, "payments/rehearsal-payment", ["clientUid", "projectId", "appointmentId", "amountCents", "currency"]), /relationship_owner_mismatch/);
  await raw.firestore.doc("clients/orphan").set({ clientUid: "missing-auth-uid" }); const snapshot = await inventory(runtime);
  await assert.rejects(prepareApproval(runtime, snapshot, "clients/orphan", ["clientUid"])); await noViews();
});
test("rollback requires its own grant, preserves all originals and is restartable and terminal", async () => {
  const manifest = await approved(), before = await originals(); await apply(manifest);
  await assert.rejects(withdraw(manifest), /operator_grant_required/); await grant(raw, runtime, manifest, "withdraw");
  const first = await withdraw(manifest, "synthetic-withdraw", { limit: 1 }); assert.equal(first.counts.withdrawn, 1, JSON.stringify(first));
  const second = await withdraw(manifest); assert.equal(second.counts.withdrawn, 1); assert.equal(second.counts.already_withdrawn, 1);
  assert.equal((await withdraw(manifest)).counts.already_withdrawn, 2); assert.deepEqual(await originals(), before);
  assert.equal((await apply(manifest)).records[0].reason, "withdrawn_run_is_terminal");
});
test("later identical-content reapproval and client edits conflict with withdrawal instead of being deleted", async () => {
  const manifest = await approved(); await apply(manifest); await grant(raw, runtime, manifest, "withdraw");
  const path = viewPath(manifest.decisions.find(row => row.state === "approved").path), ref = raw.firestore.doc(path);
  await ref.set((await ref.get()).data()); await raw.firestore.doc(policyPath(manifest.decisions.find(row => row.state === "approved").path)).update({ revision: 99, reviewedAt: new Date() }); const report = await withdraw(manifest);
  assert.ok(report.counts.error); assert.equal((await ref.get()).exists, true);
});
test("a new closed epoch permits separately authorized withdrawal but never resumes the old apply approval", async () => {
  const manifest = await approved(); await apply(manifest);
  await raw.firestore.doc("systemControls/writeFence").set({ ...closed, epoch: "new-closed-epoch" });
  await grant(raw, runtime, manifest, "apply"); await assert.rejects(apply(manifest), /manifest_fence_changed/);
  await grant(raw, runtime, manifest, "withdraw"); assert.equal((await withdraw(manifest)).counts.withdrawn, 2);
});
test("capability adapter cannot write originals, roles, authorizations, payments or unapproved projections", async () => {
  const manifest = await approved(), context = { manifest, grantId: "synthetic-apply", operation: "apply" };
  for (const path of ["clients/forged", "adminUsers/forged", "migrationOperatorAuthorizations/forged", "payments/forged", "portalRecords/projects/records/unapproved"]) await assert.rejects(runtime.transaction(context, tx => tx.set(path, { clientUid: OWNER })), /write_path_denied/);
  await assert.rejects(runtime.transaction(context, tx => tx.create(viewPath(manifest.decisions.find(row => row.state === "approved").path), { clientUid: OWNER, body: "Injected content" })), /reviewed_candidate_write_required/); await noViews();
});
test("subcollections and unsupported SDK types are disclosed as unexpanded/withheld, not silently approved", async () => {
  await raw.firestore.doc("projects/with-children").set({ clientUid: OWNER }); await raw.firestore.doc("projects/with-children/private/record").set({ studioNotes: "Synthetic private child" });
  await raw.firestore.doc("projects/unsupported").set({ clientUid: OWNER, location: raw.firestore.doc("clients/private") });
  const snapshot = await inventory(runtime); assert.equal(snapshot.records.find(row => row.path === "projects/with-children").disposition, "unexpanded_subcollections"); assert.equal(snapshot.records.find(row => row.path === "projects/unsupported").disposition, "unsupported_type");
  await assert.rejects(prepareApproval(runtime, snapshot, "projects/with-children", ["clientUid"]), /unexpanded_subcollections_require_scope_review/);
});
test("reviewed portal projections work with existing client sessions and private originals stay denied", async () => {
  const manifest = await approved(); await signInWithEmailAndPassword(auth, `${OWNER}@example.test`, "Synthetic-only-123!"); const token = await auth.currentUser.getIdToken();
  await apply(manifest);
  assert.equal((await getDocFromServer(doc(database, viewPath(`clients/${OWNER}`)))).data().clientUid, OWNER);
  await assert.rejects(getDocFromServer(doc(database, `clients/${OWNER}`)), { code: "permission-denied" });
  assert.equal(await auth.currentUser.getIdToken(), token);
  await grant(raw, runtime, manifest, "withdraw"); await withdraw(manifest); assert.equal((await raw.firestore.doc(policyPath(`clients/${OWNER}`)).get()).data().state, "withheld");
});
test("CLI enforces private new reports, exact identity and rejects live execution switches", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-cli-"));
  const run = args => spawnSync(process.execPath, ["operator/cli.mjs", ...args], { cwd: process.cwd(), encoding: "utf8", timeout: 30000 });
  try {
    const output = path.join(dir, "inventory.json"), common = ["--project", "demo-fawcett-dev", "--database", "(default)", "--report", output];
    const first = run(["inventory", ...common]); assert.equal(first.status, 0, first.stderr); assert.equal((await fs.stat(output)).mode & 0o077, 0); assert.equal(JSON.parse(await fs.readFile(output)).records.length, 26);
    assert.equal(run(["inventory", ...common]).status, 1); assert.equal(run(["inventory", ...common, "--production", "true"]).status, 1);
    assert.equal(run(["inventory", "--project", "fawcett-website-sandbox", "--database", "(default)", "--report", path.join(dir, "forbidden.json")]).status, 1);
    await assert.rejects(fs.stat(path.join(dir, "forbidden.json")));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("open or missing controls permit read-only inventory but cannot produce executable approvals", async () => {
  for (const control of [{ ...closed, state: "open" }, null]) {
    if (control) await raw.firestore.doc("systemControls/writeFence").set(control); else await raw.firestore.doc("systemControls/writeFence").delete();
    const snapshot = await inventory(runtime); assert.equal(snapshot.frozen, false); assert.equal(snapshot.records.length, 26);
    await assert.rejects(prepareApproval(runtime, snapshot, `clients/${OWNER}`, ["clientUid"]), /frozen_inventory_required/);
    await noViews();
  }
});
test("unknown collections stop executable scope rather than being silently excluded", async () => {
  await raw.firestore.doc("unknownLegacyHistory/record").set({ note: "Synthetic private record" });
  const snapshot = await inventory(runtime); assert.deepEqual(snapshot.unrecognizedRoots, ["unknownLegacyHistory"]);
  await assert.rejects(prepareApproval(runtime, snapshot, `clients/${OWNER}`, ["clientUid"]), /unrecognized_collections_require_scope_review/); await noViews();
});
test("private financial collections are inventoried without projection and late callback writes stop execution", async () => {
  await raw.firestore.doc("paymentTransactions/synthetic-transaction").set({ amountCents: 45678, currency: "CAD", clientUid: OWNER, createdAt: new Date() });
  const manifest = await reviewed(runtime); await grant(raw, runtime, manifest);
  const row = manifest.inventory.records.find(row => row.path === "paymentTransactions/synthetic-transaction"); assert.equal(row.disposition, "private_business_record");
  await raw.firestore.doc(row.path).update({ amountCents: 45679 });
  assert.ok((await apply(manifest)).counts.error); await noViews(); assert.equal((await raw.firestore.doc(row.path).get()).data().amountCents, 45679);
});
test("negative credit amounts and their source relationships are preserved exactly", async () => {
  const manifest = await reviewed(runtime, ["creditLedger/rehearsal-credit"]); await grant(raw, runtime, manifest);
  const before = await originals(); assert.equal((await apply(manifest)).counts.created, 1);
  const view = (await raw.firestore.doc(viewPath("creditLedger/rehearsal-credit")).get()).data(); assert.equal(view.deltaCents, -2345); assert.equal(view.paymentId, "rehearsal-payment"); assert.equal(view.reference, undefined); assert.deepEqual(await originals(), before);
});
test("browser admins cannot self-issue operator grants or alter the operator journal", async () => {
  await signInWithEmailAndPassword(auth, `${identities.ownerUid}@example.test`, "Synthetic-operator-only-123!");
  for (const path of ["migrationOperatorAuthorizations/forged", "operatorRuns/forged"]) await assert.rejects(setDoc(doc(database, path), { enabled: true }), { code: "permission-denied" });
});
test("revoked authority stops a partial run without erasing earlier commits", async () => {
  const manifest = await approved(); await apply(manifest, "synthetic-apply", { limit: 1 });
  await raw.firestore.doc("migrationOperatorAuthorizations/synthetic-apply").update({ enabled: false });
  await assert.rejects(apply(manifest), /operator_grant_mismatch/); assert.equal((await raw.firestore.collection(`operatorRuns/${manifest.runId}/records`).get()).size, 1);
});
test("a bounded resume advances past earlier committed records instead of repeating the first chunk forever", async () => {
  const manifest = await approved(); assert.equal((await apply(manifest, "synthetic-apply", { limit: 1 })).counts.created, 1);
  const second = await apply(manifest, "synthetic-apply", { limit: 1 }); assert.equal(second.counts.created, 1); assert.equal(second.counts.pending, 0); assert.equal(second.stopped, false);
});
test("caller-side manifest mutation cannot alter an in-flight reviewed run", async () => {
  const manifest = await approved(), execution = apply(manifest);
  manifest.decisions.find(row => row.state === "approved").candidateHash = "f".repeat(64);
  const report = await execution; assert.equal(report.counts.created, 2); assert.equal(report.counts.error, 0);
});
test("operator conversation metadata remains compatible with the client SDK after reopening", async () => {
  const portal = await import("../../lib/portalFirestore.js");
  const manifest = await reviewed(runtime, ["conversations/rehearsal-conversation"]); await grant(raw, runtime, manifest);
  assert.equal((await apply(manifest)).counts.created, 1);
  await signInWithEmailAndPassword(auth, `${OWNER}@example.test`, "Synthetic-only-123!");
  await raw.firestore.doc("systemControls/writeFence").set({ ...closed, state: "open", epoch: "new-client-epoch" });
  await portal.updateDoc(portal.doc(database, "conversations/rehearsal-conversation"), { unreadForClient: false, updatedAt: serverTimestamp() });
  const view = await getDocFromServer(portal.doc(database, "conversations/rehearsal-conversation")); assert.equal(view.data().unreadForClient, false);
  await raw.firestore.doc("systemControls/writeFence").set({ ...closed, epoch: "new-rollback-epoch" }); await grant(raw, runtime, manifest, "withdraw");
  const report = await withdraw(manifest); assert.ok(report.counts.error); assert.equal((await raw.firestore.doc(viewPath("conversations/rehearsal-conversation")).get()).exists, true);
});

test("authorization preparation is read-only and disabled until a separate owner grant", async () => {
  const { prepareAuthorization } = await import("../../operator/operations.mjs");
  const manifest = await reviewed(runtime), prepared = await prepareAuthorization(runtime, manifest, "apply");
  assert.equal(prepared.enabled, false); assert.equal(prepared.manifestHash, fingerprint(manifest));
  assert.equal((await raw.firestore.collection("migrationOperatorAuthorizations").get()).size, 0); await noViews();
});
test("reissuing a grant cannot mutate an existing run's immutable manifest", async () => {
  const manifest = await approved(); await apply(manifest, "synthetic-apply", { limit: 1 });
  const changed = clone(manifest); changed.decisions.find(row => row.state === "withheld").reason = "independently_re_reviewed";
  await grant(raw, runtime, changed); const report = await apply(changed);
  assert.ok(report.counts.error); assert.ok(report.records.some(row => row.reason === "immutable_run_changed"));
  assert.equal((await raw.firestore.collection(`operatorRuns/${manifest.runId}/records`).get()).size, 1);
});
test("concurrent privileged source changes cannot publish the changed unreviewed amount", async () => {
  const manifest = await approved();
  await Promise.all([apply(manifest), raw.firestore.doc("payments/rehearsal-payment").update({ amountCents: 54321 })]);
  const view = await raw.firestore.doc(viewPath("payments/rehearsal-payment")).get();
  if (view.exists) assert.equal(view.data().amountCents, 12345);
  assert.equal((await raw.firestore.doc("payments/rehearsal-payment").get()).data().amountCents, 54321);
  assert.ok((await reconcile(runtime, manifest)).counts.error);
});
test("opening the fence concurrently cannot leave operator commits after the opening commit", async () => {
  const manifest = await approved();
  await Promise.allSettled([apply(manifest), raw.firestore.doc("systemControls/writeFence").set({ ...closed, state: "open", epoch: "concurrent-open" })]);
  const boundary = (await raw.firestore.doc("systemControls/writeFence").get()).updateTime;
  for (const journal of (await raw.firestore.collection(`operatorRuns/${manifest.runId}/records`).get()).docs) assert.ok(journal.createTime.seconds < boundary.seconds || journal.createTime.seconds === boundary.seconds && journal.createTime.nanoseconds <= boundary.nanoseconds);
  await assert.rejects(apply(manifest), /verified_maintenance_fence_required/);
});

test("journals retain the exact verified grant version and actor for apply and withdrawal", async () => {
  const { journalPath } = await import("../../operator/model.mjs");
  const manifest = await approved(); await apply(manifest); const decision = manifest.decisions.find(row => row.state === "approved");
  let journal = (await raw.firestore.doc(journalPath(manifest, decision.path)).get()).data();
  assert.equal(journal.authorization.grantId, "synthetic-apply"); assert.equal(journal.authorization.operatorUid, identities.operatorUid);
  assert.equal(journal.authorization.grantHash, fingerprint((await raw.firestore.doc("migrationOperatorAuthorizations/synthetic-apply").get()).data()));
  await grant(raw, runtime, manifest, "withdraw"); await withdraw(manifest);
  journal = (await raw.firestore.doc(journalPath(manifest, decision.path)).get()).data(); assert.equal(journal.authorization.operation, "apply"); assert.equal(journal.withdrawalAuthorization.operation, "withdraw");
});
test("republication after withdrawal needs a new reviewed manifest and run", async () => {
  const old = await approved(); await apply(old); await grant(raw, runtime, old, "withdraw"); await withdraw(old);
  const manifest = await reviewed(runtime); manifest.runId = "synthetic-new-review"; await grant(raw, runtime, manifest);
  assert.equal((await apply(manifest)).counts.created, 2); assert.equal((await raw.firestore.doc(`operatorRuns/${old.runId}`).get()).exists, true);
});

test("a deleted/recreated Auth UID is not treated as the originally reviewed account", async () => {
  const manifest = await approved(); await raw.auth.deleteUser(OWNER);
  await raw.auth.createUser({ uid: OWNER, email: `${OWNER}@example.test`, password: "Synthetic-only-123!", emailVerified: true });
  const report = await apply(manifest); assert.ok(report.records.some(row => row.reason === "auth_identity_changed")); await noViews();
});

test("synthetic CLI walkthrough reserves private reports, applies in chunks, reconciles and withdraws", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-walkthrough-"));
  const run = args => spawnSync(process.execPath, ["operator/cli.mjs", ...args], { cwd: process.cwd(), encoding: "utf8", timeout: 30000 });
  try {
    const setup = path.join(dir, "fixture");
    const seeded = spawnSync(process.execPath, ["scripts/seed-operator-fixture.mjs", "SYNTHETIC_OPERATOR_SETUP_ONLY", setup], { cwd: process.cwd(), encoding: "utf8", timeout: 30000 });
    assert.equal(seeded.status, 0, seeded.stderr);
    const draft = JSON.parse(await fs.readFile(path.join(setup, "manifest-draft.json"), "utf8")); assert.ok(draft.decisions.every(row => row.state === "withheld"));
    assert.equal((await raw.firestore.collection("migrationOperatorAuthorizations").get()).size, 0);
    const manifest = await approved(), manifestFile = path.join(dir, "reviewed-manifest.json"), tokenFile = path.join(setup, "operator-token.txt");
    await fs.writeFile(manifestFile, JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
    const base = ["--project", "demo-fawcett-dev", "--database", "(default)", "--manifest", manifestFile], write = ["--operator-token-file", tokenFile];
    const occupied = path.join(setup, "inventory.json");
    assert.equal(run(["apply", ...base, ...write, "--grant-id", "synthetic-apply", "--report", occupied]).status, 1); await noViews();
    await fs.chmod(manifestFile, 0o644);
    assert.equal(run(["apply", ...base, ...write, "--grant-id", "synthetic-apply", "--report", path.join(dir, "bad-mode.json")]).status, 1); await noViews(); await fs.chmod(manifestFile, 0o600);
    const first = path.join(dir, "first.json"); const attempt = run(["apply", ...base, ...write, "--grant-id", "synthetic-apply", "--limit", "1", "--report", first]); assert.equal(attempt.status, 1, attempt.stderr);
    assert.equal(JSON.parse(await fs.readFile(first)).counts.created, 1);
    const second = run(["apply", ...base, ...write, "--grant-id", "synthetic-apply", "--limit", "1", "--report", path.join(dir, "second.json")]); assert.equal(second.status, 0, second.stderr);
    assert.equal(run(["reconcile", ...base, "--report", path.join(dir, "reconcile.json")]).status, 0);
    const authorization = path.join(dir, "authorization-draft.json"); assert.equal(run(["prepare-authorization", ...base, "--for-operation", "withdraw", "--report", authorization]).status, 0);
    assert.equal(JSON.parse(await fs.readFile(authorization)).enabled, false);
    await grant(raw, runtime, manifest, "withdraw");
    const rolled = run(["withdraw", ...base, ...write, "--grant-id", "synthetic-withdraw", "--report", path.join(dir, "withdraw.json")]); assert.equal(rolled.status, 0, rolled.stderr);
    assert.equal(run(["withdraw", ...base, ...write, "--grant-id", "synthetic-withdraw", "--report", path.join(dir, "withdraw-again.json")]).status, 0);
    assert.equal((await fs.stat(tokenFile)).mode & 0o077, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("unknown fields in a pre-existing withheld policy are not silently overwritten", async () => {
  const path = `clients/${OWNER}`; await raw.firestore.doc(policyPath(path)).set({ schemaVersion: 1, state: "withheld", privateLegacyNote: "Synthetic private metadata" });
  const manifest = await reviewed(runtime); await grant(raw, runtime, manifest); const report = await apply(manifest);
  assert.ok(report.records.some(row => row.reason === "unexpected_publication_policy_shape"));
  assert.equal((await raw.firestore.doc(policyPath(path)).get()).data().privateLegacyNote, "Synthetic private metadata");
  assert.equal((await raw.firestore.collection(`operatorRuns/${manifest.runId}/records`).get()).size, 0);
});
