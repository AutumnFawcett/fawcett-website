import test from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { assertEmulators, candidateProjection, fingerprint, references, validateManifest, DEMO_PROJECT_ID } from "../../lib/migration/model.mjs";
const local = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
test("migration guards reject missing/remote emulators, cloud credentials, production modes and project overrides", () => {
  assert.doesNotThrow(() => assertEmulators(local));
  for (const patch of [{ FIRESTORE_EMULATOR_HOST: "" }, { FIREBASE_AUTH_EMULATOR_HOST: "" }, { FIRESTORE_EMULATOR_HOST: "prod.example.test:443" }, { GOOGLE_APPLICATION_CREDENTIALS: "/not-read.json" }, { FIREBASE_ADMIN_PRIVATE_KEY: "not-used" }, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "live" }, { GCLOUD_PROJECT: "live" }, { FIREBASE_CONFIG: '{"projectId":"live"}' }, { VERCEL_ENV: "production" }, { NEXT_PUBLIC_FIREBASE_MODE: "production" }]) assert.throws(() => assertEmulators({ ...local, ...patch }));
});
test("source fingerprints are independent of property order and preserve timestamp nanoseconds and exact financial values", () => {
  const stamp = new Timestamp(1700000000, 123456789);
  assert.equal(fingerprint({ a: 12345, b: stamp }), fingerprint({ b: stamp, a: 12345 }));
  assert.notEqual(fingerprint(stamp), fingerprint(new Timestamp(stamp.seconds, stamp.nanoseconds + 1)));
  assert.notEqual(fingerprint({ amount: "123.45" }), fingerprint({ amount: 123.45 }));
  assert.notEqual(fingerprint(stamp), fingerprint({ $timestamp: [stamp.seconds, stamp.nanoseconds] }));
  assert.notEqual(fingerprint(-0), fingerprint(0));
  for (const number of [NaN, Infinity, -Infinity]) assert.throws(() => fingerprint({ privateValue: number }), /unsupported_source_number/);
});
test("projections exclude private metadata and do not derive text from admin review", () => {
  const result = candidateProjection("projects", { clientUid: "alice", projectName: "Synthetic", readiness: { healthNotes: "private" }, adminReview: { clientProjectSummary: "Clinical details" }, internalNotes: "private", estimate: { estimateLowCents: 12345, updatedBy: "staff@example.test" } });
  assert.deepEqual(result, { clientUid: "alice", projectName: "Synthetic", estimate: { estimateLowCents: 12345 } });
});
test("sensitive text, malformed shapes, missing ownership and ambiguous financial aliases fail closed", () => {
  for (const [name, patch] of [["messages", { body: "Health / Notes: synthetic medication", senderRole: "client", conversationId: "c" }], ["conversations", { lastMessagePreview: "Confidential synthetic detail" }], ["appointments", { clientVisibleNotes: "Allergy detail" }], ["projects", { project: ["unexpected"] }], ["projects", { project: { tattooIdea: { internalNotes: "private" } } }], ["projects", { createdAt: "yesterday" }], ["payments", { amount: "unknown" }], ["projectTimeline", { entryType: "health_skin_note", clientVisible: true }]]) assert.throws(() => candidateProjection(name, { clientUid: "alice", ...patch }));
  assert.throws(() => candidateProjection("clients", { clientName: "No UID" }));
});
test("known legacy source aliases retain relationships; uncertain source references fail", () => {
  for (const alias of ["consultRequest", "consult"]) assert.deepEqual(references({ sourceType: alias, sourceId: "original" }), ["consultRequests/original"]);
  assert.throws(() => references({ sourceType: "unknown", sourceId: "original" }));
  assert.throws(() => references({ projectId: "../elsewhere" }));
});
test("approval manifests reject inferred ownership, missing content review, private namespaces and duplicate paths", () => {
  const approval = { path: "clients/alice", clientUid: "alice", reviewerUid: "reviewer", reviewedAt: "2026-01-01T00:00:00Z", ownerConfirmed: true, contentReviewed: true, sourceHash: "a".repeat(64), projectionHash: "b".repeat(64) };
  const manifest = { schemaVersion: 1, projectId: DEMO_PROJECT_ID, syntheticOnly: true, runId: "reviewed-run", approvals: [approval] };
  assert.doesNotThrow(() => validateManifest(manifest));
  for (const patch of [{ ownerConfirmed: false }, { contentReviewed: false }, { sourceHash: "" }, { clientUid: "" }, { path: "studioClients/private" }, { path: "adminUsers/reviewer" }]) assert.throws(() => validateManifest({ ...manifest, approvals: [{ ...approval, ...patch }] }));
  assert.throws(() => validateManifest({ ...manifest, projectId: "production" }));
  assert.throws(() => validateManifest({ ...manifest, approvals: [approval, approval] }));
});
