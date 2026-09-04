import test from "node:test";
import assert from "node:assert/strict";
import { verifyFirebaseBearerToken } from "../../lib/payments/firebaseBearerAuth.js";

const req = (value) => new Request("https://example.test", { headers: value ? { authorization: value } : {} });
test("bearer verification rejects missing, malformed, and invalid tokens generically", async () => {
  for (const value of [null, "token", "Basic abc", "Bearer two parts"]) await assert.rejects(verifyFirebaseBearerToken(req(value), async () => ({ uid: "uid" })), /^Error: authentication_required$/);
  await assert.rejects(verifyFirebaseBearerToken(req("Bearer raw-secret"), async () => { throw new Error("firebase raw-secret detail"); }), /^Error: authentication_required$/);
});
test("bearer verification requests revocation checking and returns only verified uid", async () => {
  let call; const uid = await verifyFirebaseBearerToken(req("Bearer token"), async (...args) => { call = args; return { uid: "verified", email: "private" }; });
  assert.equal(uid, "verified"); assert.deepEqual(call, ["token", true]);
});
