import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const PURPOSES = new Set(["founders", "membership", "appointment", "other"]);

export function verifySquareSignature({ rawBody, signature, signatureKey, notificationUrl }) {
  if (!signature || !signatureKey || !notificationUrl) return false;
  const expected = createHmac("sha256", signatureKey)
    .update(notificationUrl + rawBody, "utf8")
    .digest();
  let supplied;
  try { supplied = Buffer.from(signature, "base64"); } catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function hashPayload(rawBody) {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function eventKey(environment, eventId) {
  return `${environment}_${createHash("sha256").update(eventId).digest("hex")}`;
}

function money(value, expectedCurrency = "CAD") {
  if (!value || !Number.isSafeInteger(Number(value.amount)) || Number(value.amount) < 0) {
    throw new Error("invalid_amount");
  }
  if (value.currency !== expectedCurrency) throw new Error("invalid_currency");
  return Number(value.amount);
}

// reference_id is issued by our server, never by a browser: fawcett:<purpose>:<orderId>:<expectedCents>[:<enrollmentId>[:<clientUid>]]
function link(referenceId) {
  if (typeof referenceId !== "string") return null;
  const [namespace, purpose, orderId, expectedCentsValue, enrollmentId, clientUid] = referenceId.split(":");
  const expectedCents = Number(expectedCentsValue);
  if (namespace !== "fawcett" || !PURPOSES.has(purpose) || !orderId || !Number.isSafeInteger(expectedCents) || expectedCents < 0) return null;
  return { purpose, orderId, expectedCents, ...(enrollmentId && { enrollmentId }), ...(clientUid && { clientUid }) };
}

function baseTransaction({ id, environment, eventId, eventType, amountCents, status, type, purpose, paymentId, orderId, parentTransactionId, enrollmentId, clientUid }) {
  return {
    provider: "square", environment, currency: "CAD", amountCents, type, status, purpose,
    providerTransactionId: id, ...(paymentId && { providerPaymentId: paymentId }),
    ...(orderId && { providerOrderId: orderId, orderId }), ...(enrollmentId && { enrollmentId }),
    ...(clientUid && { clientUid }), ...(parentTransactionId && { parentTransactionId }),
    webhookEventId: eventId, webhookEventType: eventType, reconciliationStatus: "unreconciled",
  };
}

export function normalizeSquareEvent(event, environment, parentTransaction = null) {
  const object = event?.data?.object;
  if (["payment.created", "payment.updated"].includes(event.type)) {
    const payment = object?.payment;
    const linked = link(payment?.reference_id);
    if (!payment || !linked) return { outcome: "ignored", reason: "unlinked_payment" };
    if (payment.location_id && payment.location_id !== event.location_id) return { outcome: "invalid", reason: "location_mismatch" };
    const amountCents = money(payment.amount_money);
    if (amountCents !== linked.expectedCents) throw new Error("amount_mismatch");
    const id = `${environment}_charge_${payment.id}`;
    return { outcome: "processed", transactionId: id, transaction: baseTransaction({ id, environment, eventId: event.event_id, eventType: event.type, amountCents, status: String(payment.status || "UNKNOWN").toLowerCase(), type: "charge", paymentId: payment.id, orderId: payment.order_id || linked.orderId, ...linked }) };
  }
  if (["refund.created", "refund.updated"].includes(event.type)) {
    const refund = object?.refund;
    if (!refund || !refund.payment_id || !parentTransaction) return { outcome: "ignored", reason: "unlinked_refund" };
    const linked = { purpose: parentTransaction.purpose, orderId: parentTransaction.orderId, ...(parentTransaction.enrollmentId && { enrollmentId: parentTransaction.enrollmentId }), ...(parentTransaction.clientUid && { clientUid: parentTransaction.clientUid }) };
    const amountCents = money(refund.amount_money);
    const id = `${environment}_refund_${refund.id}`;
    return { outcome: "processed", transactionId: id, transaction: baseTransaction({ id, environment, eventId: event.event_id, eventType: event.type, amountCents, status: String(refund.status || "UNKNOWN").toLowerCase(), type: "refund", paymentId: refund.payment_id, orderId: refund.order_id || linked.orderId, parentTransactionId: `${environment}_charge_${refund.payment_id}`, ...linked }) };
  }
  if (event.type.startsWith("dispute.")) {
    const dispute = object?.dispute;
    const paymentId = dispute?.disputed_payment?.payment_id;
    if (!dispute || !paymentId || !parentTransaction) return { outcome: "ignored", reason: "unlinked_dispute" };
    const linked = { purpose: parentTransaction.purpose, orderId: parentTransaction.orderId, ...(parentTransaction.enrollmentId && { enrollmentId: parentTransaction.enrollmentId }), ...(parentTransaction.clientUid && { clientUid: parentTransaction.clientUid }) };
    const amountCents = money(dispute.amount_money);
    const id = `${environment}_chargeback_${dispute.id}`;
    return { outcome: "processed", transactionId: id, transaction: baseTransaction({ id, environment, eventId: event.event_id, eventType: event.type, amountCents, status: String(dispute.state || "UNKNOWN").toLowerCase(), type: "chargeback", paymentId, orderId: linked.orderId, parentTransactionId: `${environment}_charge_${paymentId}`, ...linked }) };
  }
  return { outcome: "ignored", reason: "unsupported_event" };
}
