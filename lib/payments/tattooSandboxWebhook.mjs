import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TATTOO_SANDBOX_PROJECT = "fawcett-website-sandbox";
export const WEBHOOK_MAX_BYTES = 65536;

export function sandboxJournalEnabled(env = {}) {
  let target;
  try { target = new URL(env.SQUARE_TATTOO_SANDBOX_NOTIFICATION_URL || ""); }
  catch { return false; }
  return env.VERCEL_ENV === "preview"
    && env.SQUARE_TATTOO_ENVIRONMENT === "sandbox"
    && env.SQUARE_TATTOO_SANDBOX_ENABLED === "true"
    && env.SQUARE_TATTOO_SANDBOX_WEBHOOKS_ENABLED === "true"
    && env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "fawcett-website"
    && env.SQUARE_TATTOO_SANDBOX_JOURNAL_PROJECT_ID === TATTOO_SANDBOX_PROJECT
    && /^[^@\s]+@fawcett-website-sandbox\.iam\.gserviceaccount\.com$/.test(env.SQUARE_TATTOO_SANDBOX_JOURNAL_CLIENT_EMAIL || "")
    && (env.SQUARE_TATTOO_SANDBOX_JOURNAL_PRIVATE_KEY || "").includes("PRIVATE KEY")
    && !!env.SQUARE_TATTOO_SANDBOX_SIGNATURE_KEY?.trim()
    && !!env.SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN?.trim()
    && !!env.SQUARE_TATTOO_SANDBOX_LOCATION_ID?.trim()
    && !!env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()
    && target.protocol === "https:"
    && !target.username && !target.password && !target.search && !target.hash
    && target.pathname === "/api/payments/webhooks/tattoo-sandbox"
    && !["localhost", "127.0.0.1"].includes(target.hostname);
}

export function webhookDigest(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
export function journalId(prefix, value) {
  return prefix + "_" + webhookDigest(value);
}

export function verifyTattooSquareSignature(raw, signature, env) {
  if (typeof raw !== "string" || !signature || !sandboxJournalEnabled(env)) return false;
  const expected = createHmac("sha256", env.SQUARE_TATTOO_SANDBOX_SIGNATURE_KEY)
    .update(env.SQUARE_TATTOO_SANDBOX_NOTIFICATION_URL + raw, "utf8").digest();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const eventIdPattern = /^[A-Za-z0-9_-]{3,160}$/;
export function parseTattooSquareEvent(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > WEBHOOK_MAX_BYTES) return null;
  let event;
  try { event = JSON.parse(raw); } catch { return null; }
  if (!event || Array.isArray(event) || !eventIdPattern.test(event.event_id || "")
    || typeof event.type !== "string" || event.type.length > 100
    || event.environment?.toLowerCase() !== "sandbox") return null;
  return event;
}

// Trusted order identity must come from our journal, not a webhook-supplied client
// name, email, member reference or self-asserted Studio Credit instructions.
export function classifyTattooEvent(event, lookup, order, charge = null) {
  const type = event.type;
  const obj = event.data?.object || {};
  if (type === "payment.created" || type === "payment.updated") {
    const p = obj.payment;
    if (!p || p.status !== "COMPLETED") return { kind: "ignored", reason: "not_completed" };
    if (!lookup || !order || lookup.orderId !== order.orderId
      || order.providerOrderId !== p.order_id || order.environment !== "sandbox"
      || order.provider !== "square" || order.currency !== "CAD"
      || !Number.isSafeInteger(order.amountCents)
      || p.location_id !== order.locationId || p.amount_money?.currency !== "CAD"
      || p.amount_money?.amount !== order.amountCents
      || !/^[A-Za-z0-9_-]{1,160}$/.test(p.id || "")) {
      return { kind: "unlinked", reason: "untrusted_order_or_amount" };
    }
    return { kind: "confirmed_charge", providerId: p.id, orderId: order.orderId,
      amountCents: order.amountCents, providerOrderId: order.providerOrderId, locationId: order.locationId, status: "COMPLETED" };
  }
  if (type === "refund.created" || type === "refund.updated") {
    const p = obj.refund;
    if (!p || p.status !== "COMPLETED") return { kind: "ignored", reason: "refund_not_completed" };
    if (!charge || charge.kind !== "confirmed_charge" || charge.providerId !== p.payment_id ||
      p.amount_money?.currency !== "CAD" || !Number.isSafeInteger(p.amount_money?.amount)
      || p.amount_money.amount < 0 || p.amount_money.amount > charge.amountCents
      || (p.order_id && p.order_id !== charge.providerOrderId)
      || !/^[A-Za-z0-9_-]{1,160}$/.test(p.id || "")) {
      return { kind: "unlinked", reason: "untrusted_refund" };
    }
    return { kind: "refund_review", providerId: p.id, paymentId: p.payment_id, orderId: charge.orderId,
      amountCents: p.amount_money.amount, status: p.status };
  }
  if (type.startsWith("dispute.")) {
    const p = obj.dispute;
    const paymentId = p?.disputed_payment?.payment_id;
    if (!p || !paymentId || !charge || charge.kind !== "confirmed_charge" ||
      charge.providerId !== paymentId || p.amount_money?.currency !== "CAD"
      || !Number.isSafeInteger(p.amount_money?.amount) || p.amount_money.amount < 0
      || p.amount_money.amount > charge.amountCents || !/^[A-Za-z0-9_-]{1,160}$/.test(p.id || "")) {
      return { kind: "unlinked", reason: "untrusted_dispute" };
    }
    return { kind: "dispute_review", providerId: p.id, paymentId, orderId: charge.orderId,
      amountCents: p.amount_money.amount, status: String(p.state || "unknown").slice(0, 60) };
  }
  return { kind: "ignored", reason: "unsupported_event" };
}
