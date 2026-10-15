import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { seedSyntheticRehearsal, OWNER } from "../../lib/migration/fixtures.mjs";
import { fingerprint } from "../../lib/migration/model.mjs";
import { createSyntheticOperator, IDENTITY } from "../../operator/runtime.mjs";
import { inventory, prepareManifest, prepareApproval } from "../../operator/operations.mjs";
export const identities = { ownerUid: "operator-owner", reviewerUid: "operator-reviewer", operatorUid: "operator-runner" };
export async function seed(raw) {
  await seedSyntheticRehearsal(raw, "SYNTHETIC_ONLY");
  for (const uid of Object.values(identities)) {
    try { await raw.auth.getUser(uid); }
    catch (error) { if (error.code !== "auth/user-not-found") throw error; await raw.auth.createUser({ uid, email: `${uid}@example.test`, password: "Synthetic-operator-only-123!" }); }
    await raw.firestore.doc(`adminUsers/${uid}`).set({ active: true });
  }
  await raw.firestore.doc("systemControls/writeFence").set({ schemaVersion: 1, state: "maintenance", epoch: "synthetic-operator-fence", writerProtocol: 1 });
}
export async function tokenFor(uid = identities.operatorUid) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-fawcett-api-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@example.test`, password: "Synthetic-operator-only-123!", returnSecureToken: true }) });
  if (!response.ok) throw new Error("synthetic_operator_login_failed"); return (await response.json()).idToken;
}
export const operator = token => createSyntheticOperator({ ...IDENTITY, ...(token ? { operatorToken: token } : {}) });
export const selected = {
  "creditLedger/rehearsal-credit": ["clientUid", "projectId", "paymentId", "deltaCents", "currency", "entryType", "description", "createdAt", "updatedAt"],
  "conversations/rehearsal-conversation": ["clientUid", "consultRequestId", "applicationId", "sourceType", "sourceId", "subject", "lastMessagePreview", "lastMessageAt", "unreadForAdmin", "unreadForClient", "createdAt", "updatedAt"],
  [`clients/${OWNER}`]: ["clientUid", "clientName", "status", "createdAt", "updatedAt"],
  "payments/rehearsal-payment": ["clientUid", "projectId", "appointmentId", "amountCents", "amount", "paymentAmount", "amountDisplay", "currency", "status", "receivedAt", "createdAt", "updatedAt"],
};
export async function reviewed(runtime, paths = [`clients/${OWNER}`, "payments/rehearsal-payment"]) {
  const snapshot = await inventory(runtime), now = Date.now();
  const evidence = { ...identities, backupEvidenceId: "synthetic-backup", writerShutdownEvidenceId: "synthetic-writers-paused", callbackReplayEvidenceId: "synthetic-callbacks-paused", appCommit: "a".repeat(40), rulesHash: createHash("sha256").update(readFileSync("firestore.rules")).digest("hex"), reviewedAt: now - 1000, expiresAt: now + 3600000 };
  const manifest = prepareManifest(snapshot, "synthetic-operator-run", evidence);
  for (const path of paths) {
    const prepared = await prepareApproval(runtime, snapshot, path, selected[path]);
    const index = manifest.decisions.findIndex(row => row.path === path);
    manifest.decisions[index] = { path, sourceHash: prepared.sourceHash, state: "approved", fields: prepared.fields, candidateHash: prepared.candidateHash, clientUid: prepared.clientUid, accountHash: prepared.accountHash, ownerConfirmed: true, contentReviewed: true, reviewerUid: identities.reviewerUid };
  }
  return manifest;
}
export async function grant(raw, runtime, manifest, operation = "apply", patch = {}) {
  const { closedFence } = await import("../../operator/authorization.mjs");
  const now = Date.now(), grantId = `synthetic-${operation}`;
  await raw.firestore.doc(`migrationOperatorAuthorizations/${grantId}`).set({ schemaVersion: 1, syntheticOnly: true, identity: runtime.identity, enabled: true, runId: manifest.runId, manifestHash: fingerprint(manifest), operation, ...identities, fence: closedFence(await runtime.read("systemControls/writeFence")), notBefore: now - 1000, expiresAt: now + 3600000, ...patch });
  return grantId;
}
