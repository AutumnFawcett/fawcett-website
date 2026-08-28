import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleSquareWebhook } from "../../lib/payments/squareWebhookHandler.js";

const config = { environment: "sandbox", webhookSignatureKey: "secret-value", notificationUrl: "https://example.test/hook" };
function request(body, valid = true) {
  const signature = valid ? createHmac("sha256", config.webhookSignatureKey).update(config.notificationUrl + body).digest("base64") : "invalid";
  return new Request(config.notificationUrl, { method: "POST", body, headers: { "x-square-hmacsha256-signature": signature } });
}
const process = async () => ({ outcome: "processed" });
test("malformed JSON is rejected only after a valid signature", async () => assert.deepEqual(await handleSquareWebhook({ request: request("{"), config, process }), { status: 400, body: { outcome: "invalid", reason: "malformed_json" } }));
test("missing event ID or type is rejected", async () => assert.equal((await handleSquareWebhook({ request: request("{}"), config, process })).status, 400));
test("event environment mismatch is rejected", async () => {
  const body = JSON.stringify({ event_id: "e", type: "payment.updated", environment: "production" });
  assert.equal((await handleSquareWebhook({ request: request(body), config, process })).body.reason, "environment_mismatch");
});
test("errors are safe and contain no secrets", async () => {
  const invalid = await handleSquareWebhook({ request: request("{}", false), config, process });
  assert.equal(JSON.stringify(invalid).includes(config.webhookSignatureKey), false);
  const body = JSON.stringify({ event_id: "e", type: "payment.updated" });
  const retry = await handleSquareWebhook({ request: request(body), config, process: async () => { throw new Error("secret-value stack"); } });
  assert.deepEqual(retry, { status: 503, body: { outcome: "retryable", reason: "processing_unavailable" } });
});
