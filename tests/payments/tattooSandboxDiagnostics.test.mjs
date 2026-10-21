import test from "node:test";
import assert from "node:assert/strict";
import { reportTattooSandboxFailure } from "../../lib/payments/tattooSandboxDiagnostics.mjs";

const failure = (overrides = {}) => Object.assign(new Error("sandbox_firestore_commit_failed"), {
  httpStatus: 403, googleReason: "IAM_PERMISSION_DENIED", missingPermission: "datastore.entities.create",
}, overrides);
const preview = { VERCEL_ENV: "preview" };

test("Preview logs one JSON event containing exactly the returned sanitized diagnostic", () => {
  const logs = [];
  const diagnostic = reportTattooSandboxFailure("sandbox_journal_write", failure(), { env: preview, logger: (...args) => logs.push(args) });
  assert.deepEqual(diagnostic, {
    stage: "sandbox_journal_write", reason: "sandbox_firestore_commit_failed", httpStatus: 403,
    missingPermission: "datastore.entities.create", googleReason: "IAM_PERMISSION_DENIED",
  });
  assert.deepEqual(logs, [[JSON.stringify({ event: "tattoo_sandbox_checkout_failure", ...diagnostic })]]);
});
test("Production, development and absent Vercel environment never emit diagnostic logs", () => {
  for (const VERCEL_ENV of ["production", "development", undefined, "Preview"]) {
    const logs = [];
    reportTattooSandboxFailure("sandbox_journal_write", failure(), {
      env: { VERCEL_ENV }, logger: line => logs.push(line),
    });
    assert.deepEqual(logs, []);
  }
});
test("unknown Google fields and extra secrets never enter logs or responses", () => {
  const secret = "SYNTHETIC_PRIVATE_VALUE";
  const error = failure({
    googleReason: secret, missingPermission: secret, token: secret,
    idempotencyKey: secret, providerId: secret, responseBody: secret, credentials: secret, stack: secret,
    toJSON: () => { throw Error("Exception serialization is forbidden"); },
  });
  const logs = [];
  const diagnostic = reportTattooSandboxFailure("sandbox_journal_write", error, { env: preview, logger: line => logs.push(line) });
  assert.deepEqual(diagnostic, { stage: "sandbox_journal_write", reason: "sandbox_firestore_commit_failed", httpStatus: 403 });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes(secret), false);
  const unexpected = reportTattooSandboxFailure(secret, { ...error, message: secret }, { env: preview, logger: line => logs.push(line) });
  assert.deepEqual(unexpected, { stage: "unknown_stage", reason: "unexpected_failure" });
  assert.equal(logs[1].includes(secret), false);
});
test("generic 403 does not invent a Google reason or missing permission", () => {
  const diagnostic = reportTattooSandboxFailure("sandbox_journal_write", failure({ googleReason: undefined, missingPermission: undefined }), { env: preview, logger: () => {} });
  assert.deepEqual(diagnostic, { stage: "sandbox_journal_write", reason: "sandbox_firestore_commit_failed", httpStatus: 403 });
});
test("HTTP status and permission details are restricted to the matching commit-failure stage", () => {
  for (const httpStatus of ["403", 200, 600, NaN, undefined]) {
    assert.deepEqual(reportTattooSandboxFailure("sandbox_journal_write", failure({ httpStatus })), {
      stage: "sandbox_journal_write", reason: "sandbox_firestore_commit_failed",
    });
  }
  assert.deepEqual(reportTattooSandboxFailure("sandbox_journal_read", failure()), {
    stage: "sandbox_journal_read", reason: "sandbox_firestore_commit_failed",
  });
  assert.deepEqual(reportTattooSandboxFailure("sandbox_journal_write", failure({ httpStatus: 500 })), {
    stage: "sandbox_journal_write", reason: "sandbox_firestore_commit_failed", httpStatus: 500,
  });
});
test("unavailable logger never changes the controlled failure response", () => {
  const diagnostic = reportTattooSandboxFailure("sandbox_journal_write", failure(), { env: preview, logger: () => { throw Error("synthetic logging outage"); } });
  assert.equal(diagnostic.httpStatus, 403);
});
