import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { notificationConfig } from "../../lib/notifications/config.mjs";
import { emailTemplate } from "../../lib/notifications/templates.mjs";
import { notificationTransport } from "../../lib/notifications/transport.mjs";
import { authorizedWorker } from "../../lib/notifications/worker.mjs";
import { verifyResendWebhook } from "../../lib/notifications/webhook.mjs";
const local = { NOTIFICATIONS_MODE: "test", NOTIFICATION_ACTIVATED_AT: "2026-01-01T00:00:00Z" };
test("delivery defaults off; emulator test mode has no provider credentials", () => {
  assert.deepEqual(notificationConfig({}), { mode: "off" });
  assert.equal(notificationConfig(local).mode, "test");
  for (const patch of [{ NOTIFICATIONS_MODE: "resend" }, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fawcett-website-sandbox" }, { NOTIFICATION_STUDIO_RECIPIENTS: "real@studio.com" }, { NOTIFICATION_FROM: "a@example.test\nBCC: bad@example.test" }, { NOTIFICATION_PORTAL_ORIGIN: "https://external.example" }, { NOTIFICATION_PORTAL_ORIGIN: "http://localhost:3000/?email=private" }, { NOTIFICATION_ACTIVATED_AT: "" }]) assert.throws(() => notificationConfig({ ...local, ...patch }));
});
test("live transport requires genuine production context, explicit switch, known backend and valid sender configuration", () => {
  const production = { NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_FIREBASE_MODE: "production", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fawcett-website-sandbox", NEXT_PUBLIC_FIREBASE_API_KEY: "synthetic-not-a-key", FIREBASE_ADMIN_PROJECT_ID: "fawcett-website-sandbox", NOTIFICATIONS_MODE: "resend", NOTIFICATIONS_ENABLED: "true", NOTIFICATION_FROM: "studio@synthetic.example", NOTIFICATION_STUDIO_RECIPIENTS: "owner@synthetic.example", NOTIFICATION_PORTAL_ORIGIN: "https://synthetic.example", NOTIFICATION_ACTIVATED_AT: "2026-01-01", RESEND_API_KEY: "synthetic-not-a-key" };
  assert.equal(notificationConfig(production).audience, "staging");
  for (const patch of [{ NOTIFICATIONS_ENABLED: "false" }, { VERCEL_ENV: "preview" }, { FIREBASE_ADMIN_PROJECT_ID: "fawcett-website" }, { NOTIFICATION_PORTAL_ORIGIN: "http://synthetic.example" }, { NOTIFICATION_PORTAL_ORIGIN: "https://user:password@synthetic.example" }, { RESEND_API_KEY: "" }]) assert.throws(() => notificationConfig({ ...production, ...patch }));
});
test("all branded templates contain generic authenticated links and no source contents", () => {
  for (const kind of ["consult_studio", "application_studio", "consult_client", "application_client", "message_client"]) {
    const output = emailTemplate(kind, "https://synthetic.example");
    assert.match(output.html, /background:#000/); assert.match(output.html, /#1677ff/);
    assert.match(output.text, /https:\/\/synthetic.example\/(tattoo-portal|admin)/);
    assert.doesNotMatch(JSON.stringify(output), /clientUid|conversationId|health|private note|token=/);
  }
  assert.throws(() => emailTemplate("arbitrary", "https://synthetic.example"));
});
test("test transport cannot call fetch or send email", async () => {
  const transport = notificationTransport(notificationConfig(local), { fetcher: () => { throw new Error("NETWORK FORBIDDEN"); } });
  assert.deepEqual(await transport({}, "synthetic-id"), { id: "test_synthetic-id" });
  assert.throws(() => notificationTransport({ mode: "off" }));
});
test("Resend adapter uses fixed endpoint, stable idempotency, timeout and sanitized failures (mock fetch only)", async () => {
  let calls = 0;
  const transport = notificationTransport({ mode: "resend", apiKey: "synthetic" }, { fetcher: async (url, options) => {
    calls++; assert.equal(url, "https://api.resend.com/emails"); assert.equal(options.headers["Idempotency-Key"], "fawcett-synthetic-id"); assert.equal(options.redirect, "error"); assert.ok(options.signal); return Response.json({ id: "synthetic-provider-id" });
  } });
  await transport({ to: ["synthetic@example.test"] }, "synthetic-id"); assert.equal(calls, 1);
  for (const [status, permanent] of [[400, true], [401, true], [409, false], [429, false], [500, false]]) {
    const failure = notificationTransport({ mode: "resend" }, { fetcher: async () => new Response("Sensitive provider details", { status }) });
    await assert.rejects(failure({}, "id"), error => error.permanent === permanent && !error.message.includes("Sensitive"));
  }
});
test("worker endpoint requires a long exact server bearer secret", () => {
  const secret = "synthetic-worker-secret-32-characters";
  const req = value => new Request("http://localhost/api/internal/notifications", { headers: value ? { authorization: value } : {} });
  assert.equal(authorizedWorker(req(`Bearer ${secret}`), secret), true);
  for (const value of [null, "Bearer client-token", `Bearer ${secret}x`]) assert.equal(authorizedWorker(req(value), secret), false);
  assert.equal(authorizedWorker(req("Bearer short"), "short"), false);
});
test("Svix webhook authentication checks signed raw bytes, timestamp, rotation and replay tolerance", () => {
  const secret = `whsec_${Buffer.alloc(32, 1).toString("base64")}`;
  const now = Date.now(), stamp = String(Math.floor(now / 1000)), raw = '{"type":"email.delivered"}';
  const signature = createHmac("sha256", Buffer.alloc(32, 1)).update(`synthetic-event.${stamp}.${raw}`).digest("base64");
  const headers = new Headers({ "svix-id": "synthetic-event", "svix-timestamp": stamp, "svix-signature": `v1,invalid v1,${signature}` });
  assert.equal(verifyResendWebhook(raw, headers, secret, now), "synthetic-event");
  assert.throws(() => verifyResendWebhook(raw + " ", headers, secret, now));
  assert.throws(() => verifyResendWebhook(raw, headers, secret, now + 301000));
  assert.throws(() => verifyResendWebhook(raw, headers, "wrong", now));
});

test("Preview cannot activate real transport even if notification switches and a dummy provider key are supplied", () => {
  const preview = { VERCEL_ENV: "preview", NODE_ENV: "production", NOTIFICATIONS_ENABLED: "true", RESEND_API_KEY: "synthetic-not-a-key" };
  assert.deepEqual(notificationConfig(preview), { mode: "off" });
  assert.throws(() => notificationConfig({ ...preview, NOTIFICATIONS_MODE: "resend" }), /delivery_not_authorized/);
  const config = notificationConfig({ ...preview, NOTIFICATIONS_MODE: "test", NOTIFICATION_ACTIVATED_AT: "2026-01-01" });
  assert.equal(config.mode, "test");
});
