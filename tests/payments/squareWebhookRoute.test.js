import test from "node:test";
import assert from "node:assert/strict";
import { handleFirebaseAdminConnectivityRequest, handleSquareWebhookRequest } from "../../lib/payments/squareWebhookRoute.js";

function dependencies(overrides = {}) {
  const entries = [];
  return {
    entries,
    value: {
      getConfig: () => ({ environment: "sandbox" }),
      getFirebaseAdmin: () => ({ firestore: {} }),
      handleWebhook: async () => ({ status: 200, body: { outcome: "processed" } }),
      now: () => "timestamp",
      logger: { error: (entry) => entries.push(entry) },
      ...overrides,
    },
  };
}

function setVercelEnvironment(value) {
  const original = process.env.VERCEL_ENV;
  if (value === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = value;
  return () => {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  };
}

test("Preview configuration failures return the same safe diagnostic used by formatted logging", async () => {
  const restoreEnvironment = setVercelEnvironment("preview");
  const secret = "configuration-private-value";
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = secret;
  try {
    const deps = dependencies({
      getConfig: () => { const error = new Error(`invalid signature key=${secret}`); error.name = "ConfigError"; error.code = "SQUARE_CONFIG"; throw error; },
    });

    const result = await handleSquareWebhookRequest(new Request("https://example.test/hook"), deps.value);

    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), {
      outcome: "retryable",
      reason: "server_configuration_unavailable",
      diagnostic: { stage: "configuration", name: "ConfigError", code: "SQUARE_CONFIG", message: "invalid [redacted]" },
    });
    assert.deepEqual(deps.entries, [
      '[square-webhook-failure] {"stage":"configuration","name":"ConfigError","code":"SQUARE_CONFIG","message":"invalid [redacted]"}',
    ]);
    assert.equal(typeof deps.entries[0], "string");
    assert.equal(deps.entries[0].includes(secret), false);
  } finally {
    delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    restoreEnvironment();
  }
});

for (const environment of ["production", undefined]) {
  test(`${environment ?? "local"} processing failures keep the response generic`, async () => {
    const restoreEnvironment = setVercelEnvironment(environment);
    try {
      const deps = dependencies({
        handleWebhook: async () => { const error = new Error("database temporarily unavailable"); error.name = "FirestoreError"; error.code = "unavailable"; throw error; },
      });
      const request = new Request("https://example.test/hook", { method: "POST", headers: { authorization: "Bearer request-token" }, body: JSON.stringify({ customer: "private-customer" }) });

      const result = await handleSquareWebhookRequest(request, deps.value);

      assert.equal(result.status, 503);
      assert.deepEqual(await result.json(), { outcome: "retryable", reason: "processing_unavailable" });
      assert.deepEqual(deps.entries, [
        '[square-webhook-failure] {"stage":"processing","name":"FirestoreError","code":"unavailable","message":"database temporarily unavailable"}',
      ]);
      assert.equal(deps.entries[0].includes("request-token"), false);
      assert.equal(deps.entries[0].includes("private-customer"), false);
    } finally {
      restoreEnvironment();
    }
  });
}

for (const result of [
  { status: 200, body: { outcome: "processed" } },
  { status: 400, body: { outcome: "invalid", reason: "malformed_json" } },
]) {
  test(`Preview ${result.status} webhook responses do not include diagnostics`, async () => {
    const restoreEnvironment = setVercelEnvironment("preview");
    try {
      const deps = dependencies({ handleWebhook: async () => result });
      const response = await handleSquareWebhookRequest(new Request("https://example.test/hook"), deps.value);

      assert.equal(response.status, result.status);
      assert.deepEqual(await response.json(), result.body);
      assert.deepEqual(deps.entries, []);
    } finally {
      restoreEnvironment();
    }
  });
}

test("Preview Firebase Admin connectivity performs one harmless read", async () => {
  const calls = [];
  const response = await handleFirebaseAdminConnectivityRequest({
    vercelEnvironment: "preview",
    getFirebaseAdmin: () => ({
      firestore: {
        collection: (name) => {
          calls.push(["collection", name]);
          return {
            doc: (id) => {
              calls.push(["doc", id]);
              return { get: async () => { calls.push(["get"]); } };
            },
          };
        },
      },
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, [["collection", "fawcett_diagnostics"], ["doc", "firebase-admin-connection"], ["get"]]);
});

test("Preview Firebase Admin connectivity failures return only a sanitized diagnostic", async () => {
  const secret = "firebase-private-value";
  process.env.FIREBASE_ADMIN_PRIVATE_KEY = secret;
  try {
    const response = await handleFirebaseAdminConnectivityRequest({
      vercelEnvironment: "preview",
      getFirebaseAdmin: () => {
        const error = new Error(`private key=${secret}`);
        error.name = "FirebaseError";
        error.code = "admin/unavailable";
        error.stack = "sensitive stack";
        throw error;
      },
    });

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), {
      ok: false,
      diagnostic: {
        stage: "firebase_connectivity",
        name: "FirebaseError",
        code: "admin/unavailable",
        message: "[redacted]",
      },
    });
  } finally {
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  }
});

test("non-Preview Firebase Admin connectivity remains unavailable without initialization", async () => {
  for (const vercelEnvironment of ["production", undefined]) {
    let initialized = false;
    const response = await handleFirebaseAdminConnectivityRequest({
      vercelEnvironment,
      getFirebaseAdmin: () => { initialized = true; throw new Error("must not initialize"); },
    });

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { error: "method_not_allowed" });
    assert.equal(initialized, false);
  }
});
