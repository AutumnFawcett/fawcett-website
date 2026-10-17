import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { audit } from "../../audit/engine.mjs";
import { REQUIRED_PERMISSIONS, restReader } from "../../audit/rest-reader.mjs";
import { PROJECTS } from "../../audit/contracts.mjs";
import { MASK } from "../../audit/contracts.mjs";
import { assertReadRequest, cloudShellReaders } from "../../audit/cloud-shell.mjs";
import { DEMOS, fakeReader, data, users } from "./fixtures.mjs";
const pair = options => DEMOS.map((p, i) => fakeReader(p, options?.[i]));
const run = p => audit(p.map(v => v.reader));
test("complete paginated audit retains project provenance and exports only static aggregate classes", async () => {
  const p = pair(), before = JSON.stringify(p.map(v => v.records)), report = await run(p);
  assert.equal(report.scanComplete, true); assert.equal(report.upgradeApproved, false);
  assert.equal(report.projects[0].authUserCount, 1); assert.equal(report.projects[0].topLevelDocumentCount, 9);
  assert.equal(report.projects[0].classes.projectionReviewRequired, 1);
  assert.equal(report.potentialCrossProjectCollisions.authUids, 1);
  assert.equal(report.potentialCrossProjectCollisions.providerTransactions, 1);
  assert.equal(JSON.stringify(p.map(v => v.records)), before);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_CANARY|synthetic-a|synthetic-project|10001|clientUid|sourceHash|\.test|health|body|password/);
  assert.ok(p.flatMap(v => v.calls).every(r => r.method === "GET" || r.method === "POST" && /listCollectionIds|testIamPermissions/.test(r.path)));
  const scans = p.flatMap(v => v.calls).filter(r => /showMissing/.test(r.path));
  assert.ok(scans.every(r => MASK.every(field => new URL(`http://test/${r.path}`).searchParams.getAll("mask.fieldPaths").includes(field))));
});
test("both identity gates complete before any Firestore document or Auth account access", async () => {
  const p = pair([{}, { metadata: { project: { name: "projects/WRONG" } } }]);
  await assert.rejects(run(p), /AUDIT_INCOMPLETE/);
  assert.ok(p.every(v => !v.calls.some(r => /documents|accounts:batchGet/.test(r.path))));
  for (const database of [{ locationId: "wrong" }, { name: "projects/wrong/databases/(default)" }, { type: "DATASTORE_MODE" }]) await assert.rejects(run(pair([{ metadata: { database } }, {}])));
});
test("write-capable and incomplete IAM permissions fail before data access", async () => {
  for (const permission of ["datastore.entities.create", "firebaseauth.users.update", "datastore.databases.export"]) {
    const p = pair([{ permissions: [...REQUIRED_PERMISSIONS, permission] }, {}]); await assert.rejects(run(p));
    assert.ok(!p[0].calls.some(r => /documents|accounts:batchGet/.test(r.path)));
  }
  await assert.rejects(run(pair([{ permissions: [] }, {}])));
});
test("missing profile/Auth owners, conflicting project links and orphan projections are counted", async () => {
  const records = data();
  records["clients/synthetic-other"] = { clientUid: "synthetic-other" };
  records["projects/synthetic-other-project"] = { clientUid: "synthetic-other" };
  records["appointments/problem"] = { clientUid: "synthetic-a", projectId: "synthetic-other-project" };
  records["messages/problem"] = { clientUid: "missing-auth", conversationId: "missing-chat" };
  records["consultRequests/ambiguous"] = { clientId: "synthetic-a" };
  records["portalRecords/projects/records/orphan"] = { clientUid: "synthetic-a" };
  const result = (await run(pair([{ records }, {}]))).projects[0];
  assert.ok(result.issues.conflictingOwners > 0); assert.ok(result.issues.missingRelationships > 0);
  assert.ok(result.issues.missingAuthOwners > 0); assert.ok(result.issues.ambiguousOwnership > 0);
  assert.equal(result.issues.orphanProjections, 1);
});
test("known missing-parent audits are counted, expected namespace containers are not missing clients", async () => {
  const records = data(); records["studioClients/missing/audit/entry"] = { note: "PRIVATE_CANARY" };
  const report = (await run(pair([{ records }, {}]))).projects[0];
  assert.equal(report.issues.missingParents, 1); assert.equal(report.collections["studioClients.audit"], 2);
  assert.ok(report.classes.privateOnly > 0);
});
test("unknown roots and nested namespaces stop instead of emitting a partial successful inventory", async () => {
  for (const where of ["PRIVATE_CANARY_COLLECTION/id", "clients/synthetic-a/PRIVATE_CANARY_CHILD/id", "portalRecords/PRIVATE_CANARY_TYPE/records/id"]) {
    const records = data(); records[where] = { name: "PRIVATE_CANARY" }; await assert.rejects(run(pair([{ records }, {}])));
  }
});
test("duplicate provider transactions, bad refund links and environment mismatches require review", async () => {
  const records = data();
  records["paymentTransactions/duplicate"] = { ...records["paymentTransactions/synthetic-charge"] };
  records["paymentTransactions/refund"] = { ...records["paymentTransactions/synthetic-charge"], type: "refund", parentTransactionId: "missing", providerTransactionId: "PRIVATE_CANARY_REFUND" };
  records["paymentTransactions/wrong"] = { ...records["paymentTransactions/synthetic-charge"], environment: "production", providerTransactionId: "PRIVATE_CANARY_OTHER" };
  records["paymentTransactions/wrong-parent"] = { ...records["paymentTransactions/refund"], parentTransactionId: "wrong", providerTransactionId: "PRIVATE_CANARY_DISPUTE", type: "chargeback" };
  const report = (await run(pair([{ records }, {}]))).projects[0];
  assert.equal(report.duplicateProviderTransactionGroups, 1); assert.ok(report.issues.financialMissingReferences > 0);
  assert.ok(report.issues.financialParentMismatch > 0); assert.ok(report.issues.financialEnvironmentMismatch > 0);
  assert.ok(report.providerEnvironmentLabels.production > 0); // Project name was not used.
});
test("matching emails/UIDs/provider subjects are only potential collisions, never merged owners", async () => {
  const accounts = [...users(), { localId: "different-uid", email: users()[0].email, providerUserInfo: users()[0].providerUserInfo }];
  const report = await run(pair([{ accounts }, {}]));
  assert.equal(report.projects[0].duplicateAuthEmailGroups, 1); assert.equal(report.projects[0].duplicateAuthProviderGroups, 1);
  assert.equal(report.potentialCrossProjectCollisions.authEmails, 1); assert.equal(report.projects[0].authUserCount, 2);
  assert.equal(report.projects[1].authUserCount, 1); assert.equal(report.upgradeApproved, false);
});
test("repeated/empty continuation pages, duplicate document pages and permission errors fail closed", async () => {
  const mutations = [
    r => r.path.endsWith(":listCollectionIds") ? { collectionIds: ["clients"], nextPageToken: "repeated" } : null,
    r => r.path.endsWith(":listCollectionIds") ? { collectionIds: [], nextPageToken: "more" } : null,
    r => { if (r.path.includes("showMissing")) throw new Error("PRIVATE_CANARY_PERMISSION_ERROR"); },
    r => { if (r.path.includes("/documents/appointments?")) { const doc = { name: `projects/${DEMOS[0].projectId}/databases/(default)/documents/appointments/synthetic-appointment`, createTime: "2026-01-01T00:00:00Z", updateTime: "2026-01-01T00:00:00Z", fields: {} }; return { documents: [doc, doc] }; } }
  ];
  for (const mutate of mutations) await assert.rejects(run(pair([{ mutate }, {}])));
});
test("interruption and changed observations do not return a complete aggregate report", async () => {
  const controller = new AbortController();
  const pending = audit(pair().map(v => v.reader), { signal: controller.signal }); controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  const during = new AbortController();
  const interrupted = pair([{ mutate: r => { if (r.path.includes("showMissing")) during.abort(); } }, {}]);
  await assert.rejects(audit(interrupted.map(v => v.reader), { signal: during.signal }), { name: "AbortError" });
  assert.equal((await run(pair())).scanComplete, true);
  let scans = 0; const records = data();
  const p = pair([{ records, mutate: r => { if (r.host === "auth" && ++scans === 1) records["clients/new-synthetic"] = { clientUid: "missing" }; } }, {}]);
  await assert.rejects(run(p));
});
test("transport rejects mutation endpoints, unexpected projects and service/user credential overrides", async () => {
  for (const request of [{ host: "firestore", method: "PATCH", path: "v1/projects/fawcett-website/databases/(default)/documents/clients/id" }, { host: "auth", method: "POST", path: "v1/projects/fawcett-website/accounts:update" }, { host: "firestore", method: "POST", path: "v1/projects/fawcett-website/databases/(default):exportDocuments", body: {} }]) assert.throws(() => assertReadRequest(PROJECTS[0], request));
  assert.throws(() => cloudShellReaders({ acknowledged: true, env: {} }));
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIRESTORE_EMULATOR_HOST", "NODE_DEBUG", "CLOUDSDK_AUTH_ACCESS_TOKEN"]) assert.throws(() => cloudShellReaders({ acknowledged: true, env: { CLOUD_SHELL: "true", [key]: "PRIVATE_CANARY" } }));
});
test("Cloud Shell reader uses existing user auth and only read-only HTTP operations (mock transport)", async () => {
  const fixtures = PROJECTS.map(p => fakeReader(p)), calls = [];
  const run = (_, args) => args[0] === "config" ? "(unset)" : args.includes("list") ? JSON.stringify([{ account: "synthetic-operator@example.test" }]) : "synthetic-token-never-print-123456";
  const readers = cloudShellReaders({ acknowledged: true, env: { CLOUD_SHELL: "true" }, run, fetcher: async (url, options) => {
    calls.push(options.method); const identity = PROJECTS.find(p => url.pathname.match(/\/projects\/([^/]+)/)?.[1].split(":")[0] === p.projectId);
    const host = url.hostname.startsWith("cloudresource") ? "resource" : url.hostname.startsWith("identitytoolkit") ? "auth" : "firestore";
    const value = await fixtures[PROJECTS.indexOf(identity)].transport({ host, method: options.method, path: `${url.pathname.slice(1)}${url.search}`, ...(options.body && { body: JSON.parse(options.body) }) });
    return Response.json(value);
  } });
  const report = await audit(readers); assert.equal(report.scanComplete, true); assert.ok(calls.every(m => ["GET", "POST"].includes(m)));
});
test("CLI rejects unsafe invocation without credentials and emits only generic failure artifacts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-cli-"));
  try {
    const output = path.join(dir, "PRIVATE_CANARY.json");
    const result = spawnSync(process.execPath, ["audit/cli.mjs", "--iam-reviewed-read-only", "--output", output], { env: { ...process.env, CLOUD_SHELL: "false" }, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_CANARY|Error:| at |Bearer|token/);
    const report = JSON.parse(await fs.readFile(output)); assert.equal(report.scanComplete, false); assert.equal((await fs.stat(output)).mode & 0o077, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test("raw provider references remain collision candidates even when environment-prefixed transaction IDs differ", async () => {
  const left = data(), right = data();
  left["paymentTransactions/synthetic-charge"].providerTransactionId = "sandbox_charge_PRIVATE_CANARY_PAYMENT_ID";
  right["paymentTransactions/synthetic-charge"].providerTransactionId = "production_charge_PRIVATE_CANARY_PAYMENT_ID";
  right["paymentTransactions/synthetic-charge"].environment = "production";
  right["paymentOrders/synthetic-order"].environment = "production";
  const report = await run(pair([{ records: left }, { records: right }]));
  assert.equal(report.potentialCrossProjectCollisions.providerTransactions, 0);
  assert.equal(report.potentialCrossProjectCollisions.providerPaymentIdentifiersAcrossEnvironments, 1);
  assert.equal(report.potentialCrossProjectCollisions.providerOrderIdentifiersAcrossEnvironments, 1);
  assert.equal(report.projects[0].providerEnvironmentLabels.sandbox, 2);
  assert.equal(report.projects[1].providerEnvironmentLabels.production, 2);
});
test("Founder reference chains, duplicate orders and unsafe cent values are review findings, never repaired", async () => {
  const records = data();
  records["paymentOrders/duplicate-order"] = { ...records["paymentOrders/synthetic-order"] };
  records["founderContributions/synthetic-founder"] = { provider: "square", environment: "sandbox", transactionId: "missing-transaction", profileId: "missing-profile", orderId: "synthetic-order", amountCents: 10001 };
  records["creditLedger/negative-credit"] = { clientUid: "synthetic-a", deltaCents: -1000 };
  records["studioPayments/invalid"] = { amountCents: "999999999999999999999999" };
  const report = (await run(pair([{ records }, {}]))).projects[0];
  assert.equal(report.duplicateProviderOrderGroups, 1); assert.ok(report.issues.missingRelationships >= 2);
  assert.equal(report.issues.financialInvalidAmounts, 1);
});
test("active service accounts, impersonation and credential-file configurations cannot select cloud readers", () => {
  for (const option of ["service-account", "impersonation", "credential-file"]) {
    const run = (_, args) => args.includes("list") ? JSON.stringify([{ account: option === "service-account" ? "synthetic@synthetic.iam.gserviceaccount.com" : "synthetic@example.test" }]) : args[0] === "config" ? option === "impersonation" || option === "credential-file" && args.includes("auth/credential_file_override") ? "PRIVATE_CANARY" : "(unset)" : "synthetic-token-never-print-123456";
    assert.throws(() => cloudShellReaders({ acknowledged: true, env: { CLOUD_SHELL: "true" }, run, fetcher: () => { throw new Error("must not fetch"); } }));
  }
});
test("read-only reader identity is immutable, has no generic mutation capability and synthetic bypass rejects real project IDs", () => {
  assert.throws(() => restReader(PROJECTS[0], () => {}, { synthetic: true }));
  assert.throws(() => restReader({ ...DEMOS[0], privateEmail: "PRIVATE_CANARY" }, () => {}));
  const { reader } = fakeReader(DEMOS[0]); assert.ok(Object.isFrozen(reader.identity));
  assert.deepEqual(Object.keys(reader).sort(), ["accounts", "collections", "documents", "identity", "verify"]);
});
test("masked private-content edits still invalidate a scan through commit metadata", async () => {
  const updateTimes = {}; let altered = false;
  const p = pair([{ updateTimes, mutate: r => { if (r.host === "auth" && !altered) { altered = true; updateTimes["clients/synthetic-a"] = "2026-01-01T00:00:00.000000003Z"; } } }, {}]);
  await assert.rejects(run(p), /AUDIT_INCOMPLETE/);
});
test("checked-in example is reproducible aggregate-only fictional output", async () => {
  assert.deepEqual(JSON.parse(await fs.readFile("docs/examples/two-project-audit-fictional.json")), await run(pair()));
});
test("unsupported relationship value types and error envelopes cannot become a complete scan", async () => {
  for (const value of [{ unexpected: "PRIVATE_CANARY" }, ["PRIVATE_CANARY"]]) {
    const records = data(); records["appointments/synthetic-appointment"].projectId = value;
    await assert.rejects(run(pair([{ records }, {}])), /AUDIT_INCOMPLETE/);
  }
  for (const value of [{ error: { message: "PRIVATE_CANARY" } }, []]) {
    const p = pair([{ mutate: r => r.path.endsWith(":listCollectionIds") ? value : null }, {}]);
    await assert.rejects(run(p), /AUDIT_INCOMPLETE/);
  }
});
test("numeric identifiers do not inherit string UID ownership and zero/negative credit cents remain exact", async () => {
  const records = data(); records["clients/1"] = { clientUid: 1 };
  records["consultRequests/invalid-numeric"] = { clientUid: "synthetic-a", clientId: 1, source: { sourceType: "consultRequest" } };
  records["studioPayments/zero"] = { amountCents: 0 };
  records["creditLedger/negative"] = { clientUid: "synthetic-a", deltaCents: -1000 };
  const report = (await run(pair([{ records, accounts: [...users(), { localId: "1" }] }, {}]))).projects[0];
  assert.ok(report.issues.ambiguousOwnership > 0); assert.ok(report.issues.invalidRelationships >= 2);
  assert.equal(report.issues.financialInvalidAmounts, 0);
});
