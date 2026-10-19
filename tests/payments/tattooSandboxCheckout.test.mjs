import test from "node:test";
import assert from "node:assert/strict";
import {
  tattooSquareSandboxEnabled, validateTattooCheckoutInput,
  createTattooSquareRequest, handleTattooSquareSandbox,
} from "../../lib/payments/tattooSandboxCheckout.mjs";

const env = {
  VERCEL_ENV: "preview", SQUARE_TATTOO_SANDBOX_ENABLED: "true",
  SQUARE_TATTOO_ENVIRONMENT: "sandbox",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fawcett-website",
  NEXT_PUBLIC_FIREBASE_API_KEY: "test-key",
  SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN: "sandbox-token",
  SQUARE_TATTOO_SANDBOX_LOCATION_ID: "location-1",
  SQUARE_TATTOO_SANDBOX_WEBHOOKS_ENABLED: "true",
  SQUARE_TATTOO_SANDBOX_NOTIFICATION_URL: "https://preview.example.invalid/api/payments/webhooks/tattoo-sandbox",
  SQUARE_TATTOO_SANDBOX_SIGNATURE_KEY: "test-signature-key",
  SQUARE_TATTOO_SANDBOX_JOURNAL_PROJECT_ID: "fawcett-website-sandbox",
  SQUARE_TATTOO_SANDBOX_JOURNAL_CLIENT_EMAIL: "svc@fawcett-website-sandbox.iam.gserviceaccount.com",
  SQUARE_TATTOO_SANDBOX_JOURNAL_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----fake-----END PRIVATE KEY-----",
};
const input = {
  amountCents: 25000, purpose: "tattoo_deposit",
  idempotencyKey: "7042e08c-079f-4bee-8a72-ef5ae016c2fd", reviewed: true,
};
const request = (data, token = "a".repeat(40)) => new Request("https://preview.example.invalid/api/admin/tattoo-checkout", {
  method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(data),
});
const response = (status, data) => new Response(JSON.stringify(data), { status });
const getStore = () => ({
  now: () => Date.parse("2026-10-17T20:00:00Z"),
  read: async () => null,
  commitCreates: async rows => { assert.equal(rows.length, 2); },
});
test("production and unconfigured deployments always remain disabled", () => {
  assert.equal(tattooSquareSandboxEnabled({ ...env, VERCEL_ENV: "production" }), false);
  assert.equal(tattooSquareSandboxEnabled({ ...env, SQUARE_TATTOO_ENVIRONMENT: "production" }), false);
  assert.equal(tattooSquareSandboxEnabled({ ...env, SQUARE_TATTOO_SANDBOX_ENABLED: undefined }), false);
  assert.equal(tattooSquareSandboxEnabled({ ...env, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fawcett-website-sandbox" }), false);
  assert.equal(tattooSquareSandboxEnabled(env), true);
});
test("only reviewed, bounded CAD amounts and one-time tattoo purposes accepted", () => {
  assert.equal(validateTattooCheckoutInput(input).amountCents, 25000);
  for (const bad of [
    { ...input, reviewed: false }, { ...input, amountCents: 0 },
    { ...input, amountCents: 1.25 }, { ...input, amountCents: 1000001 },
    { ...input, purpose: "membership" }, { ...input, unexpectedField: 1 },
  ]) assert.equal(validateTattooCheckoutInput(bad), null);
  const square = createTattooSquareRequest(validateTattooCheckoutInput(input), "location-1");
  assert.equal(square.quick_pay.price_money.currency, "CAD");
  assert.equal(square.quick_pay.price_money.amount, 25000);
  assert.match(square.idempotency_key, /fawcett-tattoo-sandbox/);
  assert.equal(JSON.stringify(square).includes("clientEmail"), false);
});
test("GET exposes only disabled/enabled state and POST never runs on Production", async () => {
  const check = await handleTattooSquareSandbox(new Request("https://example.invalid", { method: "GET" }), { env });
  assert.equal((await check.json()).sandboxEnabled, true);
  const blocked = await handleTattooSquareSandbox(request(input), { env: { ...env, VERCEL_ENV: "production" },
    fetcher: () => { throw Error("Never called"); } });
  assert.equal(blocked.status, 503);
});
test("requires admin bearer and rejects malformed requests without Square calls", async () => {
  const missing = await handleTattooSquareSandbox(request(input, ""), { env, fetcher: () => { throw Error("Unexpected"); } });
  assert.equal(missing.status, 401);
  const invalid = await handleTattooSquareSandbox(request({ ...input, purpose: "membership" }), { env, fetcher: () => { throw Error("Unexpected"); } });
  assert.equal(invalid.status, 400);
});
test("checks Auth identity and active admin document before creating a Sandbox link", async () => {
  const urls = [];
  const fetcher = async (url, options) => {
    urls.push(url);
    if (url.includes("accounts:lookup")) return response(200, { users: [{ localId: "admin-123", disabled: false }] });
    if (url.includes("/adminUsers/admin-123")) return response(200, { fields: { active: { booleanValue: true } } });
    if (url.includes("connect.squareupsandbox.com")) {
      assert.equal(options.headers["Square-Version"], "2026-09-16");
      return response(200, { payment_link: { id: "link-1", order_id: "order-1", url: "https://square.link/u/EXAMPLE" } });
    }
    throw Error("Unexpected " + url);
  };
  const res = await handleTattooSquareSandbox(request(input), { env, fetcher, getStore });
  assert.equal(res.status, 200);
  assert.deepEqual(urls.length, 3);
  const data = await res.json();
  assert.equal(data.providerConfirmed, false);
  assert.equal(data.studioCreditIssued, false);
  assert.equal(data.environment, "sandbox");
});
test("denies inactive admin and wrong Square URL", async () => {
  const denied = await handleTattooSquareSandbox(request(input), { env, fetcher: async url => url.includes("accounts:lookup")
    ? response(200, { users: [{ localId: "user" }] })
    : response(200, { fields: { active: { booleanValue: false } } }) });
  assert.equal(denied.status, 403);
  const wrong = await handleTattooSquareSandbox(request(input), { env, getStore, fetcher: async url => url.includes("accounts:lookup")
    ? response(200, { users: [{ localId: "admin" }] })
    : url.includes("adminUsers") ? response(200, { fields: { active: { booleanValue: true } } })
    : response(200, { payment_link: { id: "link", url: "https://evil.invalid/pay" } }) });
  assert.equal(wrong.status, 502);
});

test("Sandbox diagnostics identify journal read failures without disclosing credentials", async () => {
  const fetcher = async url => url.includes("accounts:lookup")
    ? response(200, { users: [{ localId: "admin-123" }] })
    : response(200, { fields: { active: { booleanValue: true } } });
  const res = await handleTattooSquareSandbox(request(input), {
    env: { ...env, SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN: "very-secret-token" },
    fetcher,
    getStore: () => ({ read: async () => { throw Error("sandbox_firestore_read_failed"); } }),
  });
  assert.equal(res.status, 503);
  const payload = await res.json();
  assert.deepEqual(payload.diagnostic, {
    stage: "sandbox_journal_read", reason: "sandbox_firestore_read_failed",
  });
  assert.equal(JSON.stringify(payload).includes("very-secret-token"), false);
});

test("unexpected Sandbox errors report only the failed stage, never the raw exception", async () => {
  const fetcher = async url => url.includes("accounts:lookup")
    ? response(200, { users: [{ localId: "admin-123" }] })
    : response(200, { fields: { active: { booleanValue: true } } });
  const res = await handleTattooSquareSandbox(request(input), {
    env, fetcher,
    getStore: () => ({ read: async () => { throw Error("sensitive-internal-path"); } }),
  });
  assert.equal(res.status, 503);
  const payload = await res.json();
  assert.equal(payload.diagnostic.stage, "sandbox_journal_read");
  assert.equal(payload.diagnostic.reason, "unexpected_failure");
  assert.equal(JSON.stringify(payload).includes("sensitive-internal-path"), false);
});

test("Sandbox diagnostics distinguish an order journal commit failure", async () => {
  const fetcher = async url => {
    if (url.includes("accounts:lookup")) return response(200, { users: [{ localId: "admin-123" }] });
    if (url.includes("adminUsers")) return response(200, { fields: { active: { booleanValue: true } } });
    if (url.includes("connect.squareupsandbox.com")) {
      return response(200, { payment_link: {
        id: "link-1", order_id: "order-1", url: "https://square.link/u/EXAMPLE",
      } });
    }
    throw Error("Unexpected request");
  };
  const res = await handleTattooSquareSandbox(request(input), {
    env, fetcher,
    getStore: () => ({
      now: () => Date.parse("2026-10-17T20:00:00Z"),
      read: async () => null,
      commitCreates: async () => { throw Error("sandbox_firestore_commit_failed"); },
    }),
  });
  assert.equal(res.status, 503);
  assert.deepEqual((await res.json()).diagnostic, {
    stage: "sandbox_journal_write", reason: "sandbox_firestore_commit_failed",
  });
});
