import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import {
  sandboxJournalEnabled, verifyTattooSquareSignature, parseTattooSquareEvent,
  journalId, classifyTattooEvent,
} from "../../lib/payments/tattooSandboxWebhook.mjs";
import { makeTattooSandboxStore, recordSandboxCheckout, journalVerifiedTattooEvent } from "../../lib/payments/tattooSandboxStore.mjs";
import { handleTattooSandboxWebhook } from "../../lib/payments/tattooSandboxWebhookHandler.mjs";

const endpoint = "https://fawcett-test-branch.vercel.app/api/payments/webhooks/tattoo-sandbox";
const env = {
  VERCEL_ENV: "preview", SQUARE_TATTOO_ENVIRONMENT: "sandbox",
  SQUARE_TATTOO_SANDBOX_ENABLED: "true", SQUARE_TATTOO_SANDBOX_WEBHOOKS_ENABLED: "true",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fawcett-website", NEXT_PUBLIC_FIREBASE_API_KEY: "test-web-key",
  SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN: "sandbox-token",
  SQUARE_TATTOO_SANDBOX_LOCATION_ID: "square-sandbox-loc",
  SQUARE_TATTOO_SANDBOX_SIGNATURE_KEY: "fake-test-signature",
  SQUARE_TATTOO_SANDBOX_NOTIFICATION_URL: endpoint,
  SQUARE_TATTOO_SANDBOX_JOURNAL_PROJECT_ID: "fawcett-website-sandbox",
  SQUARE_TATTOO_SANDBOX_JOURNAL_CLIENT_EMAIL: "writer@fawcett-website-sandbox.iam.gserviceaccount.com",
  SQUARE_TATTOO_SANDBOX_JOURNAL_PRIVATE_KEY: "-----BEGIN PRIVATE KEY----- fake for tests -----END PRIVATE KEY-----",
};
const idempotencyKey = "7042e08c-079f-4bee-8a72-ef5ae016c2fd";
const checkout = { idempotencyKey, amountCents: 25000, purpose: "tattoo_deposit" };
const link = { id: "link_123", order_id: "order_abc", url: "https://square.link/u/sandbox-example" };
const fakeStore = () => {
  const documents = new Map();
  const key = (collection, id) => collection + "/" + id;
  return {
    documents,
    now: () => Date.parse("2026-10-17T20:00:00.000Z"),
    async read(collection,id) { return documents.get(key(collection,id)) || null; },
    async commitCreates(rows) {
      for (const row of rows) if (documents.has(key(row.collection,row.id))) throw Error("ALREADY_EXISTS");
      for (const row of rows) documents.set(key(row.collection,row.id),structuredClone(row.data));
    },
  };
};
const event = (type, payload, eventId) => ({
  merchant_id: "test-merchant", environment: "sandbox", event_id: eventId, type,
  data: { object: payload },
});
const charge = event("payment.updated", {
  payment: { id: "payment-123", status: "COMPLETED", location_id: "square-sandbox-loc",
    order_id: "order_abc", amount_money: { amount: 25000, currency: "CAD" } },
}, "event-charge-123");
const signature = raw => createHmac("sha256",env.SQUARE_TATTOO_SANDBOX_SIGNATURE_KEY)
  .update(endpoint + raw, "utf8").digest("base64");
const request = (raw, sig=signature(raw), url=endpoint) => new Request(url, {
  method:"POST",headers:{"content-type":"application/json","x-square-hmacsha256-signature":sig}, body:raw,
});

test("Sandbox webhook and order journal cannot run in production or wrong project", () => {
  assert.equal(sandboxJournalEnabled(env),true);
  for (const override of [
    {VERCEL_ENV:"production"}, {SQUARE_TATTOO_ENVIRONMENT:"production"},
    {SQUARE_TATTOO_SANDBOX_WEBHOOKS_ENABLED:"false"},
    {SQUARE_TATTOO_SANDBOX_JOURNAL_PROJECT_ID:"fawcett-website"},
    {NEXT_PUBLIC_FIREBASE_PROJECT_ID:"fawcett-website-sandbox"},
    {SQUARE_TATTOO_SANDBOX_JOURNAL_CLIENT_EMAIL:"wrong@fawcett-website.iam.gserviceaccount.com"},
  ]) assert.equal(sandboxJournalEnabled({...env,...override}),false);
});

test("Square signature requires exact configured notification URL and raw bytes", () => {
  const raw=JSON.stringify(charge);
  assert.equal(verifyTattooSquareSignature(raw,signature(raw),env),true);
  assert.equal(verifyTattooSquareSignature(raw+" ",signature(raw),env),false);
  assert.equal(verifyTattooSquareSignature(raw,"AAAA",env),false);
  assert.equal(verifyTattooSquareSignature(raw,signature(raw),{...env,VERCEL_ENV:"production"}),false);
  assert.equal(parseTattooSquareEvent(raw).event_id,charge.event_id);
  assert.equal(parseTattooSquareEvent("{broken"),null);
  assert.equal(parseTattooSquareEvent(JSON.stringify({...charge,environment:"production"})),null);
});

test("checkout persists exact order + provider index atomically and refuses changed retries",async()=>{
  const store=fakeStore();
  const one=await recordSandboxCheckout({store,input:checkout,link,locationId:"square-sandbox-loc"});
  assert.equal(one.duplicate,false);
  assert.equal(store.documents.size,2);
  const again=await recordSandboxCheckout({store,input:checkout,link,locationId:"square-sandbox-loc"});
  assert.equal(again.duplicate,true);
  assert.equal(store.documents.size,2);
  await assert.rejects(recordSandboxCheckout({store,input:{...checkout,amountCents:26000},link,locationId:"square-sandbox-loc"}),/collision/);
});

test("signed matching COMPLETED payment creates only a sandbox transaction, never credit",async()=>{
  const store=fakeStore();
  await recordSandboxCheckout({store,input:checkout,link,locationId:"square-sandbox-loc"});
  const raw=JSON.stringify(charge);
  const result=await handleTattooSandboxWebhook(request(raw),{env,getStore:()=>store});
  assert.equal(result.status,200);
  assert.equal((await result.json()).outcome,"confirmed_charge");
  const tx=await store.read("tattooSandboxTransactions",journalId("charge","payment-123"));
  assert.equal(tx.amountCents,25000);
  assert.equal(tx.providerConfirmed,true);
  assert.equal(tx.studioCreditIssued,false);
  assert.equal((await store.read("tattooSandboxOrders",journalId("checkout",idempotencyKey))).providerConfirmed,false);
  const repeat=await handleTattooSandboxWebhook(request(raw),{env,getStore:()=>store});
  assert.equal(repeat.status,200);
  assert.equal(store.documents.size,4);
  assert.equal((await repeat.json()).outcome,"confirmed_charge");
  const updated=JSON.stringify({...charge,event_id:"event-charge-124"});
  const more=await handleTattooSandboxWebhook(request(updated),{env,getStore:()=>store});
  assert.equal(more.status,200);
  assert.equal(store.documents.size,5);
});

test("invalid/unsigned and mismatched money never create confirmed receipts",async()=>{
  const store=fakeStore();
  await recordSandboxCheckout({store,input:checkout,link,locationId:"square-sandbox-loc"});
  const tampered=await handleTattooSandboxWebhook(request(JSON.stringify(charge),"wrong"),{env,getStore:()=>store});
  assert.equal(tampered.status,401);
  const wrong={...charge,event_id:"event-wrong-amount",data:{object:{payment:{...charge.data.object.payment,amount_money:{currency:"CAD",amount:30000}}}}};
  const res=await handleTattooSandboxWebhook(request(JSON.stringify(wrong)),{env,getStore:()=>store});
  assert.equal((await res.json()).outcome,"unlinked");
  assert.equal(await store.read("tattooSandboxTransactions",journalId("charge","payment-123")),null);
  const wrongUrl=await handleTattooSandboxWebhook(request(JSON.stringify(charge),signature(JSON.stringify(charge)),endpoint+"?foo=1"),{env,getStore:()=>store});
  assert.equal(wrongUrl.status,403);
});

test("a trusted refund or dispute is flagged for review, never auto-credited",async()=>{
  const store=fakeStore();
  await recordSandboxCheckout({store,input:checkout,link,locationId:"square-sandbox-loc"});
  await journalVerifiedTattooEvent({store,event:charge,raw:JSON.stringify(charge)});
  const refund=event("refund.updated", {refund:{id:"refund-1",payment_id:"payment-123",
    status:"COMPLETED",amount_money:{amount:5000,currency:"CAD"}}}, "event-refund-1");
  const r=await journalVerifiedTattooEvent({store,event:refund,raw:JSON.stringify(refund)});
  assert.equal(r.outcome,"refund_review");
  const receipt=await store.read("tattooSandboxTransactions",journalId("refund","refund-1"));
  assert.equal(receipt.providerConfirmed,false);
  assert.equal(receipt.studioCreditIssued,false);
  const dispute=event("dispute.created",{dispute:{id:"dispute-1",state:"EVIDENCE_REQUIRED",
    disputed_payment:{payment_id:"payment-123"},amount_money:{amount:25000,currency:"CAD"}}},"event-dispute-1");
  assert.equal((await journalVerifiedTattooEvent({store,event:dispute,raw:JSON.stringify(dispute)})).outcome,"dispute_review");
  assert.equal((await store.read("tattooSandboxTransactions",journalId("dispute","dispute-1"))).studioCreditIssued,false);
});

test("journal unavailable returns retryable response without falsely confirming payment",async()=>{
  const raw=JSON.stringify(charge);
  const failed=await handleTattooSandboxWebhook(request(raw),{
    env,getStore:()=>({read:async()=>{throw Error("Firestore not available");}}),
  });
  assert.equal(failed.status,503);
  assert.equal((await failed.json()).outcome,"sandbox_journal_unavailable");
  const disabled=await handleTattooSandboxWebhook(request(raw),{env:{...env,VERCEL_ENV:"production"}});
  assert.equal(disabled.status,503);
});

test("Firestore 403 diagnostic exposes only an allowlisted permission identifier", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const testEnv = { ...env, SQUARE_TATTOO_SANDBOX_JOURNAL_PRIVATE_KEY:
    privateKey.export({ type: "pkcs8", format: "pem" }) };
  const getStore = responseBody => makeTattooSandboxStore({
    env: testEnv,
    now: () => Date.parse("2026-10-20T20:00:00Z"),
    fetcher: async url => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "synthetic-token", expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify(responseBody), { status: 403 });
    },
  });
  const attempt = store => store.commitCreates([{
    collection: "tattooSandboxOrders",
    id: journalId("checkout", idempotencyKey),
    data: { status: "test", providerConfirmed: false },
  }]);
  await assert.rejects(attempt(getStore({error: {
    message: "Permission 'datastore.entities.create' denied on resource",
    details: [{ metadata: { permission: "datastore.entities.create" } }],
  }})), error => {
    assert.equal(error.message, "sandbox_firestore_commit_failed");
    assert.equal(error.httpStatus, 403);
    assert.equal(error.missingPermission, "datastore.entities.create");
    return true;
  });
  await assert.rejects(attempt(getStore({error: {
    message: "private service credential and client email should never be echoed",
    details: [{metadata: {permission: "secrets.admin"}}],
  }})), error => {
    assert.equal(error.httpStatus, 403);
    assert.equal(error.missingPermission, null);
    assert.equal(JSON.stringify(error).includes("service credential"), false);
    return true;
  });
});
