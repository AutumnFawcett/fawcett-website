import { createHash, sign as rsaSign } from "node:crypto";
import { sandboxJournalEnabled, TATTOO_SANDBOX_PROJECT, journalId, webhookDigest, classifyTattooEvent } from "./tattooSandboxWebhook.mjs";

const ROOT = "https://firestore.googleapis.com/v1/projects/" + TATTOO_SANDBOX_PROJECT + "/databases/(default)/documents";
const COMMIT = ROOT + ":commit";
const ALLOWED_COLLECTIONS = new Set(["tattooSandboxOrders", "tattooSandboxOrderLookup", "tattooSandboxWebhookEvents", "tattooSandboxTransactions"]);
const SAFE_ID = /^[a-z]+_[a-f0-9]{64}$/;

const objectFields = record => Object.fromEntries(Object.entries(record).map(([key, value]) => {
  if (typeof value === "string") return [key, { stringValue: value }];
  if (typeof value === "boolean") return [key, { booleanValue: value }];
  if (Number.isSafeInteger(value)) return [key, { integerValue: String(value) }];
  throw new Error("unsafe_sandbox_field");
}));
const fieldsObject = fields => Object.fromEntries(Object.entries(fields || {}).map(([k,v]) =>
  [k, "stringValue" in v ? v.stringValue : "booleanValue" in v ? v.booleanValue : "integerValue" in v ? Number(v.integerValue) : null]
));

export function makeTattooSandboxStore({ env, fetcher = fetch, now = () => Date.now() }) {
  if (!sandboxJournalEnabled(env)) throw new Error("sandbox_journal_disabled");
  function name(collection, id) {
    if (!ALLOWED_COLLECTIONS.has(collection) || !SAFE_ID.test(id)) throw new Error("invalid_sandbox_document");
    return ROOT + "/" + collection + "/" + id;
  }
  let access;
  async function token() {
    if (access && access.expires > now() + 60000) return access.value;
    const epoch = Math.floor(now() / 1000);
    const base64 = input => Buffer.from(JSON.stringify(input)).toString("base64url");
    const jwt = base64({ alg: "RS256", typ: "JWT" }) + "." +
      base64({ iss: env.SQUARE_TATTOO_SANDBOX_JOURNAL_CLIENT_EMAIL, scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token", iat: epoch, exp: epoch + 3600 });
    const key = env.SQUARE_TATTOO_SANDBOX_JOURNAL_PRIVATE_KEY.replace(/\\n/g, "\n");
    let signed;
    try {
      signed = jwt + "." + rsaSign("RSA-SHA256", Buffer.from(jwt), key).toString("base64url");
    } catch {
      throw new Error("invalid_sandbox_journal_private_key");
    }
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signed }),
      cache: "no-store", signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error("sandbox_google_token_unavailable");
    const data = await response.json();
    if (!data?.access_token || !Number.isFinite(data.expires_in) || data.expires_in < 60) throw new Error("invalid_sandbox_google_token");
    access = { value: data.access_token, expires: now() + Math.min(data.expires_in, 3600) * 1000 };
    return access.value;
  }
  async function read(collection, id) {
    const response = await fetcher(name(collection,id), { headers: { Authorization: "Bearer " + await token() },
      cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("sandbox_firestore_read_failed");
    const result = await response.json();
    return fieldsObject(result.fields);
  }
  async function commitCreates(rows) {
    const writes = rows.map(({ collection, id, data }) => ({
      update: { name: name(collection,id), fields: objectFields(data) },
      currentDocument: { exists: false },
    }));
    const response = await fetcher(COMMIT, {
      method: "POST", headers: { Authorization: "Bearer " + await token(), "Content-Type": "application/json" },
      body: JSON.stringify({ writes }), cache: "no-store", signal: AbortSignal.timeout(13000),
    });
    if (!response.ok) throw new Error("sandbox_firestore_commit_failed");
  }
  return { read, commitCreates, now };
}

function same(record, expected, keys) {
  return !!record && keys.every(key => record[key] === expected[key]);
}

export async function recordSandboxCheckout({ store, input, link, locationId }) {
  // Never store client identities, membership balances or card details.
  if (!input || !link?.id || !link.order_id || !locationId
    || !/^[A-Za-z0-9_-]{1,160}$/.test(link.id)
    || !/^[A-Za-z0-9_-]{1,160}$/.test(link.order_id)) throw new Error("invalid_provider_order_identity");
  const id = journalId("checkout", input.idempotencyKey);
  const lookupId = journalId("order", link.order_id);
  const record = {
    orderId: id, provider: "square", environment: "sandbox",
    providerOrderId: link.order_id, providerLinkId: link.id,
    checkoutUrl: link.url, locationId, amountCents: input.amountCents, currency: "CAD",
    purpose: input.purpose, status: "link_created", providerConfirmed: false,
    studioCreditIssued: false, createdAt: new Date(store.now()).toISOString(),
  };
  const lookup = { orderId: id, providerOrderId: link.order_id, environment: "sandbox" };
  const existing = await store.read("tattooSandboxOrders", id);
  if (existing) {
    if (!same(existing, record, ["orderId","provider","environment","providerOrderId",
      "providerLinkId","checkoutUrl","locationId","amountCents","currency","purpose","providerConfirmed","studioCreditIssued"])) {
      throw new Error("sandbox_checkout_idempotency_collision");
    }
    const linked = await store.read("tattooSandboxOrderLookup", lookupId);
    if (!same(linked, lookup, ["orderId","providerOrderId","environment"])) throw new Error("sandbox_lookup_mismatch");
    return { orderId: id, duplicate: true };
  }
  await store.commitCreates([
    { collection: "tattooSandboxOrders", id, data: record },
    { collection: "tattooSandboxOrderLookup", id: lookupId, data: lookup },
  ]);
  return { orderId: id, duplicate: false };
}

export async function journalVerifiedTattooEvent({ store, event, raw }) {
  const eventId = journalId("event", event.event_id);
  const payloadHash = webhookDigest(raw);
  const existing = await store.read("tattooSandboxWebhookEvents", eventId);
  if (existing) {
    if (existing.payloadHash !== payloadHash || existing.eventId !== event.event_id) throw new Error("sandbox_event_identity_collision");
    return { outcome: existing.outcome, duplicate: true };
  }
  const payment = event.data?.object?.payment;
  const refund = event.data?.object?.refund;
  const dispute = event.data?.object?.dispute;
  const paymentId = payment?.id || refund?.payment_id || dispute?.disputed_payment?.payment_id;
  let lookup = null, order = null, charge = null;
  if (payment?.order_id) {
    lookup = await store.read("tattooSandboxOrderLookup", journalId("order", payment.order_id));
    if (lookup) order = await store.read("tattooSandboxOrders", lookup.orderId);
  }
  if (paymentId && (refund || dispute)) {
    charge = await store.read("tattooSandboxTransactions", journalId("charge", paymentId));
  }
  const status = classifyTattooEvent(event, lookup, order, charge);
  const eventData = {
    eventId: event.event_id, eventType: event.type, environment: "sandbox",
    payloadHash, signatureValidated: true, outcome: status.kind,
    receivedAt: new Date(store.now()).toISOString(),
    providerConfirmed: false, studioCreditIssued: false,
  };
  if (status.orderId) eventData.orderId = status.orderId;
  if (status.reason) eventData.reason = status.reason;
  const rows = [{ collection: "tattooSandboxWebhookEvents", id: eventId, data: eventData }];
  if (["confirmed_charge","refund_review","dispute_review"].includes(status.kind)) {
    const key = journalId(status.kind === "confirmed_charge" ? "charge" : status.kind === "refund_review" ? "refund" : "dispute", status.providerId);
    const transaction = {
      kind: status.kind, provider: "square", environment: "sandbox",
      providerId: status.providerId, orderId: status.orderId,
      amountCents: status.amountCents, currency: "CAD", status: status.status,
      providerConfirmed: status.kind === "confirmed_charge", studioCreditIssued: false,
      recordedAt: new Date(store.now()).toISOString(),
    };
    if (status.providerOrderId) transaction.providerOrderId = status.providerOrderId;
    if (status.paymentId) transaction.paymentId = status.paymentId;
    if (status.locationId) transaction.locationId = status.locationId;
    const prior = await store.read("tattooSandboxTransactions", key);
    if (!prior) rows.push({ collection: "tattooSandboxTransactions", id: key, data: transaction });
    else if (!same(prior, transaction, ["kind","provider","environment","providerId","orderId","amountCents","currency","providerConfirmed","studioCreditIssued"])) {
      throw new Error("sandbox_transaction_identity_collision");
    }
  }
  await store.commitCreates(rows);
  return { outcome: status.kind, duplicate: false };
}
