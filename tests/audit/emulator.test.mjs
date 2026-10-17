import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { audit } from "../../audit/engine.mjs";
import { restReader } from "../../audit/rest-reader.mjs";
import { fingerprint } from "../../lib/migration/model.mjs";
import { DEMOS, data } from "./fixtures.mjs";
test("two isolated Auth/Firestore emulator datasets are audited with zero writes and no content output", async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  const apps = DEMOS.map((p, i) => initializeApp({ projectId: p.projectId }, `readonly-audit-${i}`)), calls = [];
  const fixture = data(); fixture["studioClients/missing-parent/audit/private-entry"] = { note: "PRIVATE_CANARY_MISSING" };
  async function state() {
    const result = [];
    for (const app of apps) {
      const docs = [];
      for (const path of Object.keys(fixture)) { const s = await getFirestore(app).doc(path).get(); docs.push({ path, data: s.data(), created: s.createTime, updated: s.updateTime }); }
      const accounts = (await getAuth(app).listUsers()).users.map(u => ({ uid: u.uid, email: u.email, disabled: u.disabled, created: u.metadata.creationTime }));
      result.push(fingerprint({ docs, accounts }));
    }
    return result;
  }
  try {
    for (const app of apps) {
      const id = app.options.projectId;
      assert.ok((await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${id}/databases/(default)/documents`, { method: "DELETE" })).ok);
      await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${id}/accounts`, { method: "DELETE" });
      await getAuth(app).createUser({ uid: "synthetic-a", email: "PRIVATE_CANARY@example.test", password: "Synthetic-only-123!" });
      for (const [path, fields] of Object.entries(fixture)) await getFirestore(app).doc(path).set(fields);
    }
    const before = await state();
    const readers = DEMOS.map(identity => restReader(identity, async request => {
      calls.push({ method: request.method, path: request.path });
      if (request.host === "resource") return { projectId: identity.projectId, name: `projects/${identity.projectNumber}`, state: "ACTIVE" };
      if (request.path === `v1/projects/${identity.projectId}/databases/(default)`) return { name: `projects/${identity.projectId}/databases/(default)`, locationId: "nam5", type: "FIRESTORE_NATIVE" };
      const url = request.host === "auth" ? `http://127.0.0.1:9099/identitytoolkit.googleapis.com/${request.path}` : `http://127.0.0.1:8080/${request.path}`;
      const response = await fetch(url, { method: request.method, headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, ...(request.body && { body: JSON.stringify(request.body) }) });
      assert.equal(response.status, 200); return response.json();
    }, { synthetic: true }));
    const report = await audit(readers);
    assert.equal(report.scanComplete, true); assert.equal(report.projects[0].issues.missingParents, 1);
    assert.equal(report.projects[0].authUserCount, 1); assert.equal(report.potentialCrossProjectCollisions.authUids, 1);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_CANARY|synthetic-a|synthetic-order|10001|\.test/);
    assert.deepEqual(await state(), before);
    assert.ok(calls.every(r => r.method === "GET" || r.method === "POST" && r.path.endsWith(":listCollectionIds")));
  } finally { await Promise.all(apps.map(deleteApp)); }
});
