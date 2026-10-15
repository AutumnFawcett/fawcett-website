import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, getDoc, getDocs, query, where, collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseEnvironment } from "../../lib/firebaseEnvironment.mjs";
import { createRehearsalRuntime } from "../../lib/migration/runtime.mjs";
import { planMigration, applyMigration, rollbackMigration } from "../../lib/migration/engine.mjs";
import { syntheticSources, seedSyntheticRehearsal, syntheticManifest, REVIEWER, OWNER, APPROVED_PATHS } from "../../lib/migration/fixtures.mjs";
import { candidateProjection, fingerprint, DEMO_PROJECT_ID } from "../../lib/migration/model.mjs";
import { saveStudioClient } from "../../lib/clients/clientService.mjs";
let runtime, env, app, auth, db, portal;
const apply = manifest => applyMigration(runtime, manifest, "APPLY_APPROVED_SYNTHETIC_PROJECTIONS");
const rollback = manifest => rollbackMigration(runtime, manifest, "WITHDRAW_REHEARSAL_PROJECTIONS");
const view = path => { const [name, id] = path.split("/"); return `portalRecords/${name}/records/${id}`; };
async function manifest(id = "rehearsal-test") { return syntheticManifest(runtime, id, "SYNTHETIC_ONLY"); }
async function approve(path) {
  const source = (await runtime.firestore.doc(path).get()).data();
  return { path, clientUid: source.clientUid, reviewerUid: REVIEWER, reviewedAt: "2026-01-01T00:00:00Z", ownerConfirmed: true, contentReviewed: true, sourceHash: fingerprint(source), projectionHash: fingerprint(candidateProjection(path.split("/")[0], source)) };
}
async function sourceHashes() {
  const result = {};
  for (const path of Object.keys(syntheticSources())) result[path] = fingerprint((await runtime.firestore.doc(path).get()).data());
  return result;
}
async function login(uid = OWNER) { await signInWithEmailAndPassword(auth, `${uid}@example.test`, "Synthetic-only-123!"); }
before(async () => {
  runtime = createRehearsalRuntime();
  env = await initializeTestEnvironment({ projectId: DEMO_PROJECT_ID, firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  app = initializeApp(firebaseEnvironment().config, "migration-browser"); auth = getAuth(app); db = getFirestore(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(db, "127.0.0.1", 8080);
  portal = await import("../../lib/portalFirestore.js");
});
beforeEach(async () => { await signOut(auth); await env.clearFirestore(); await seedSyntheticRehearsal(runtime, "SYNTHETIC_ONLY"); });
after(async () => { await signOut(auth); await deleteApp(app); await env.cleanup(); await runtime.close(); });

test("inventory is read-only, complete and withholds every record without explicit review", async () => {
  const before = await sourceHashes();
  const result = await planMigration(runtime, { ...(await manifest()), approvals: [] });
  assert.equal(result.total, 22); assert.equal(result.counts.eligible, 0); assert.equal(result.counts.withheld, 22);
  assert.deepEqual(await sourceHashes(), before);
  for (const path of APPROVED_PATHS) assert.equal((await runtime.firestore.doc(view(path)).get()).exists, false);
  const serialized = JSON.stringify(result);
  for (const text of ["Private synthetic", "Synthetic medical", "@example.test", "123.45"]) assert.equal(serialized.includes(text), false);
});

test("approved rehearsal preserves all originals, UIDs, relationships, timestamps and financial aliases", async () => {
  const before = await sourceHashes(), users = (await runtime.auth.listUsers()).users.map(u => u.uid).sort();
  const approved = await manifest();
  const plan = await planMigration(runtime, approved);
  assert.equal(plan.counts.eligible, 13); assert.equal(plan.counts.withheld, 9); assert.equal(plan.counts.error, 0);
  const result = await apply(approved);
  assert.equal(result.counts.migrated, 13);
  assert.deepEqual(await sourceHashes(), before);
  assert.deepEqual((await runtime.auth.listUsers()).users.map(u => u.uid).sort(), users);
  for (const approval of approved.approvals) assert.equal(fingerprint((await runtime.firestore.doc(view(approval.path)).get()).data()), approval.projectionHash);
  const original = (await runtime.firestore.doc("payments/rehearsal-payment").get()).data();
  const projected = (await runtime.firestore.doc(view("payments/rehearsal-payment")).get()).data();
  for (const key of ["amountCents", "amount", "paymentAmount", "amountDisplay", "projectId", "appointmentId", "clientUid"]) assert.deepEqual(projected[key], original[key]);
  assert.equal(projected.createdAt.nanoseconds, 123456000);
  assert.equal(projected.reference, undefined);
  assert.equal((await runtime.firestore.doc(view("projects/rehearsal-project")).get()).data().clientProjectSummary, undefined);
  assert.equal((await runtime.firestore.doc(view("consultRequests/rehearsal-consult")).get()).data().readiness, undefined);
  const again = await apply(approved);
  assert.equal(again.counts.already_migrated, 13); assert.equal(again.counts.migrated, 0);
});

test("uncertain ownership, source mismatches, cross-client links and missing Auth accounts block publication", async () => {
  const base = await manifest();
  const path = "projects/rehearsal-cross-owner";
  const cross = await planMigration(runtime, { ...base, approvals: [await approve(path)] });
  assert.equal(cross.records.find(r => r.path === path).reason, "missing_or_cross_client_relationship");
  await assert.rejects(apply({ ...base, approvals: [await approve(path)] }), /plan_has_errors/);
  const mismatch = { ...base, approvals: [{ ...base.approvals[0], clientUid: "rehearsal-bob" }] };
  assert.equal((await planMigration(runtime, mismatch)).counts.error, 1);
  const missingPath = "projects/rehearsal-no-account";
  await runtime.firestore.doc(missingPath).set({ clientUid: "rehearsal-no-account", projectName: "Synthetic missing account" });
  assert.equal((await planMigration(runtime, { ...base, approvals: [await approve(missingPath)] })).records.find(r => r.path === missingPath).reason, "missing_or_unavailable_account");
  const idMismatch = "clients/rehearsal-wrong-id";
  await runtime.firestore.doc(idMismatch).set({ clientUid: OWNER, clientName: "Synthetic" });
  assert.equal((await planMigration(runtime, { ...base, approvals: [await approve(idMismatch)] })).records.find(r => r.path === idMismatch).reason, "profile_id_owner_mismatch");
});

test("sensitive legacy message, preview, health timeline and draft offer cannot be approved into visibility", async () => {
  const base = await manifest();
  for (const path of ["messages/rehearsal-sensitive-message", "conversations/rehearsal-sensitive-preview", "projectTimeline/rehearsal-health-timeline", "membershipOffers/rehearsal-draft"]) {
    const source = (await runtime.firestore.doc(path).get()).data();
    const approval = { ...base.approvals[0], path, sourceHash: fingerprint(source), projectionHash: "a".repeat(64) };
    const result = await planMigration(runtime, { ...base, approvals: [approval] });
    assert.equal(result.counts.error, 1);
    await assert.rejects(apply({ ...base, approvals: [approval] }), /plan_has_errors/);
    assert.equal((await runtime.firestore.doc(view(path)).get()).exists, false);
  }
});

test("explicit gates, reviewed hashes, enabled reviewer and immutable run identity reject unsafe retries", async () => {
  const base = await manifest();
  await assert.rejects(applyMigration(runtime, base), /apply_confirmation_required/);
  await assert.rejects(rollbackMigration(runtime, base), /rollback_confirmation_required/);
  await runtime.firestore.doc("adminUsers/rehearsal-admin").update({ active: false });
  assert.ok((await planMigration(runtime, base)).counts.error > 0);
  await runtime.firestore.doc("adminUsers/rehearsal-admin").update({ active: true });
  const changed = { ...base, approvals: [{ ...base.approvals[0], sourceHash: "a".repeat(64) }] };
  await assert.rejects(apply(changed), /plan_has_errors/);
  await apply(base);
  await assert.rejects(apply({ ...base, approvals: base.approvals.slice(1) }), /run_manifest_changed/);
});

test("existing destinations and edited projections are never overwritten or rolled back", async () => {
  const base = await manifest();
  await runtime.firestore.doc(view(base.approvals[0].path)).set({ clientUid: OWNER, clientName: "Existing view" });
  await assert.rejects(apply(base), /plan_has_errors/);
  await runtime.firestore.doc(view(base.approvals[0].path)).delete();
  await apply(base);
  await runtime.firestore.doc(view("projects/rehearsal-project")).update({ projectName: "Later approved synthetic edit" });
  const result = await rollback(base);
  assert.equal(result.counts.error, 1);
  assert.equal((await runtime.firestore.doc(view("projects/rehearsal-project")).get()).data().projectName, "Later approved synthetic edit");
});

test("partial committed runs resume without duplicate writes and preserve withheld history", async () => {
  const base = await manifest();
  const approval = base.approvals[0];
  const tx = runtime.firestore.batch();
  tx.create(runtime.firestore.doc(`migrationRuns/${base.runId}`), { manifestHash: fingerprint(base), syntheticOnly: true });
  tx.create(runtime.firestore.doc(view(approval.path)), candidateProjection("clients", (await runtime.firestore.doc(approval.path).get()).data()));
  tx.create(runtime.firestore.doc(`publicationRecords/clients/records/${approval.path.split("/")[1]}`), { schemaVersion: 1, state: "approved", runId: base.runId, sourceHash: approval.sourceHash, projectionHash: approval.projectionHash, approved: candidateProjection("clients", (await runtime.firestore.doc(approval.path).get()).data()) });
  tx.create(runtime.firestore.doc(`migrationRuns/${base.runId}/records/${fingerprint(approval.path)}`), { path: approval.path, state: "committed", manifestHash: fingerprint(base), sourceHash: approval.sourceHash, projectionHash: approval.projectionHash, reviewerUid: REVIEWER });
  await tx.commit();
  const result = await apply(base);
  assert.equal(result.counts.already_migrated, 1); assert.equal(result.counts.migrated, 12);
  assert.equal((await runtime.firestore.doc(view("messages/rehearsal-sensitive-message")).get()).exists, false);
});

test("rollback withdraws only run-created projections, is restartable and leaves all original records intact", async () => {
  const base = await manifest(), before = await sourceHashes();
  await apply(base);
  const result = await rollback(base);
  assert.equal(result.counts.rolled_back, 13);
  assert.deepEqual(await sourceHashes(), before);
  assert.equal((await rollback(base)).counts.already_rolled_back, 13);
  await assert.rejects(apply(base), /plan_has_errors/);
  for (const path of APPROVED_PATHS) assert.equal((await runtime.firestore.doc(view(path)).get()).exists, false);
});

test("legacy account safely sees no history before review and only approved own views after rehearsal", async () => {
  await login();
  assert.equal((await getDoc(portal.doc(db, "clients", OWNER))).exists(), false);
  await assert.rejects(getDoc(doc(db, "clients", OWNER)), { code: "permission-denied" });
  const base = await manifest(); await apply(base);
  assert.equal((await getDoc(portal.doc(db, "clients", OWNER))).data().adminReview, undefined);
  const messages = await getDocs(query(portal.collection(db, "messages"), where("clientUid", "==", OWNER), where("conversationId", "==", "rehearsal-conversation")));
  assert.deepEqual(messages.docs.map(d => d.id), ["rehearsal-message"]);
  await login("rehearsal-bob");
  await assert.rejects(getDoc(portal.doc(db, "clients", OWNER)), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(db, "migrationRuns", base.runId)), { code: "permission-denied" });
});

test("newly registered client creates only its own profile/intake pair and cannot take over legacy data", async () => {
  const credential = await createUserWithEmailAndPassword(auth, `new-${crypto.randomUUID()}@example.test`, "Synthetic-only-123!");
  const uid = credential.user.uid;
  await portal.setDoc(portal.doc(db, "clients", uid), { clientUid: uid, clientName: "New synthetic client", clientEmail: credential.user.email, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  assert.equal((await getDoc(portal.doc(db, "clients", uid))).data().clientUid, uid);
  await assert.rejects(portal.setDoc(portal.doc(db, "clients", OWNER), { clientUid: uid, clientName: "Forged" }), { code: "permission-denied" });
  const consult = await portal.addDoc(portal.collection(db, "consultRequests"), { clientUid: uid, clientName: "New synthetic client", clientEmail: credential.user.email, status: "new", readiness: { healthNotes: "Synthetic health detail remains private" }, request: { tattooIdea: "Synthetic new design" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  assert.equal((await getDoc(consult)).data().clientUid, uid);
  await assert.rejects(getDoc(doc(db, "consultRequests", consult.id)), { code: "permission-denied" });
});

test("studio-managed client files stay private and manual creation does not create Auth accounts", async () => {
  const users = (await runtime.auth.listUsers()).users.map(u => u.uid).sort();
  const created = await saveStudioClient(runtime.firestore, REVIEWER, { client: { name: "Synthetic independent studio file", email: "studio-rehearsal@example.test", phone: "5551112222", instagram: "studio_rehearsal", preferredArtist: "ben", status: "lead", studioNotes: "Private synthetic studio notes" } });
  assert.deepEqual((await runtime.auth.listUsers()).users.map(u => u.uid).sort(), users);
  await apply(await manifest());
  const report = await planMigration(runtime, await manifest());
  assert.equal(report.records.find(r => r.path === `studioClients/${created.id}`).reason, "studio_record_private");
  assert.equal((await runtime.firestore.doc(`portalRecords/clients/records/${created.id}`).get()).exists, false);
  await login();
  await assert.rejects(getDoc(doc(db, "studioClients", created.id)), { code: "permission-denied" });
  await assert.rejects(setDoc(doc(db, "migrationRuns", "forged"), { syntheticOnly: true }), { code: "permission-denied" });
});

test("changed source and disabled account invalidate approval without modifying any projection", async () => {
  const base = await manifest();
  await runtime.firestore.doc("projects/rehearsal-project").update({ "adminReview.internalNotes": "Changed private synthetic note" });
  const report = await planMigration(runtime, base);
  assert.equal(report.records.find(r => r.path === "projects/rehearsal-project").reason, "reviewed_record_changed");
  await assert.rejects(apply(base), /plan_has_errors/);
  assert.equal((await runtime.firestore.doc(view(base.approvals[0].path)).get()).exists, false);
  await runtime.auth.updateUser(OWNER, { disabled: true });
  try {
    const one = { ...base, approvals: [base.approvals[0]] };
    assert.equal((await planMigration(runtime, one)).records.find(r => r.path === one.approvals[0].path).reason, "disabled_account");
  } finally { await runtime.auth.updateUser(OWNER, { disabled: false }); }
});

test("synthetic approval generator refuses changed fixture content and uncertain message senders", async () => {
  await runtime.firestore.doc("messages/rehearsal-message").update({ body: "Changed message cannot inherit sample approval" });
  await assert.rejects(manifest(), /synthetic_fixture_conflict/);
  const path = "messages/rehearsal-disputed-sender";
  await runtime.firestore.doc(path).set({ clientUid: OWNER, senderUid: "rehearsal-bob", senderRole: "client", conversationId: "rehearsal-conversation", consultRequestId: "rehearsal-consult", body: "Synthetic text with disputed origin" });
  const approval = await approve(path);
  const report = await planMigration(runtime, { schemaVersion: 1, projectId: DEMO_PROJECT_ID, syntheticOnly: true, runId: "sender-check", approvals: [approval] });
  assert.equal(report.records.find(r => r.path === path).reason, "uncertain_message_sender");
});


test("CLI requires explicit gates and new private reports; plan, resume and rollback reconcile known fixtures", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fawcett-rehearsal-"));
  const script = path.resolve("scripts/rehearse-migration.mjs");
  const run = (...args) => promisify(execFile)(process.execPath, [script, ...args], { env: process.env });
  const approvalFile = path.join(folder, "approvals.json");
  try {
    await run("sample-manifest", "--run-id", "cli-review", "--confirm", "SYNTHETIC_ONLY", "--report", approvalFile);
    assert.equal(fs.statSync(approvalFile).mode & 0o777, 0o600);
    const before = await sourceHashes();
    const planned = path.join(folder, "plan.json");
    const result = await run("plan", "--manifest", approvalFile, "--report", planned);
    assert.equal(result.stdout.includes("@example.test"), false);
    assert.equal(JSON.parse(fs.readFileSync(planned)).counts.eligible, 13);
    await assert.rejects(run("apply", "--manifest", approvalFile, "--report", approvalFile, "--confirm", "APPLY_APPROVED_SYNTHETIC_PROJECTIONS"));
    await assert.rejects(run("apply", "--manifest", approvalFile, "--report", path.join(folder, "denied.json")));
    assert.equal((await runtime.firestore.doc(view(APPROVED_PATHS[0])).get()).exists, false);
    await assert.rejects(run("plan", "--project", "production", "--manifest", approvalFile, "--report", path.join(folder, "unknown.json")));
    const applied = path.join(folder, "apply.json");
    await run("apply", "--manifest", approvalFile, "--report", applied, "--confirm", "APPLY_APPROVED_SYNTHETIC_PROJECTIONS");
    assert.equal(JSON.parse(fs.readFileSync(applied)).counts.migrated, 13);
    const resumed = path.join(folder, "resume.json");
    await run("apply", "--manifest", approvalFile, "--report", resumed, "--confirm", "APPLY_APPROVED_SYNTHETIC_PROJECTIONS");
    assert.equal(JSON.parse(fs.readFileSync(resumed)).counts.already_migrated, 13);
    const rolledBack = path.join(folder, "rollback.json");
    await run("rollback", "--manifest", approvalFile, "--report", rolledBack, "--confirm", "WITHDRAW_REHEARSAL_PROJECTIONS");
    assert.equal(JSON.parse(fs.readFileSync(rolledBack)).counts.rolled_back, 13);
    assert.deepEqual(await sourceHashes(), before);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test("migration approvals are durable and rollback cannot withdraw a later independent publication", async () => {
  const base = await manifest(); await apply(base);
  const first = base.approvals[0], [name, id] = first.path.split("/");
  const policy = runtime.firestore.doc(`publicationRecords/${name}/records/${id}`);
  assert.equal((await policy.get()).data().state, "approved");
  await policy.update({ runId: "later-reviewed-publication" });
  assert.equal((await planMigration(runtime, base)).records.find(row => row.path === first.path).reason, "publication_policy_changed");
  const result = await rollback(base);
  assert.equal(result.records.find(row => row.path === first.path).state, "error");
  assert.equal((await runtime.firestore.doc(view(first.path)).get()).exists, true);
  const rolled = base.approvals[1], [otherName, otherId] = rolled.path.split("/");
  assert.equal((await runtime.firestore.doc(`publicationRecords/${otherName}/records/${otherId}`).get()).data().state, "withheld");
});
