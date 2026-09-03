import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DISPUTE_FINANCIAL_EFFECT_STATES = new Set([
  "EVIDENCE_REQUIRED",
  "PROCESSING",
  "ACCEPTED",
  "LOST",
]);

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
  if (!value || !Number.isSafeInteger(value.amount) || value.amount < 0) {
    throw new Error("invalid_amount");
  }
  if (value.currency !== expectedCurrency) throw new Error("invalid_currency");
  return value.amount;
}

function baseTransaction({ id, environment, locationId, eventId, eventType, amountCents, status, providerState, type, purpose, paymentId, orderId, providerOrderId, parentTransactionId, enrollmentId, clientUid }) {
  return {
    provider: "square", environment, providerLocationId: locationId, currency: "CAD", amountCents, type, status, purpose,
    providerTransactionId: id, ...(paymentId && { providerPaymentId: paymentId }),
    ...(orderId && { orderId }), ...(providerOrderId && { providerOrderId }), ...(enrollmentId && { enrollmentId }),
    ...(clientUid && { clientUid }), ...(parentTransactionId && { parentTransactionId }),
    webhookEventId: eventId, webhookEventType: eventType, ...(providerState && { providerState }), reconciliationStatus: "unreconciled",
  };
}

function parentIsTrusted(parentTransaction, environment, locationId, paymentId) {
  return parentTransaction?.provider === "square"
    && parentTransaction.environment === environment
    && parentTransaction.providerLocationId === locationId
    && parentTransaction.currency === "CAD"
    && parentTransaction.type === "charge"
    && parentTransaction.status === "completed"
    && parentTransaction.providerPaymentId === paymentId
    && Boolean(parentTransaction.orderId)
    && Boolean(parentTransaction.providerOrderId);
}

function trustedOrder(order, environment, providerOrderId) {
  return order?.provider === "square" && order.environment === environment
    && order.providerOrderId === providerOrderId && order.currency === "CAD"
    && ["pending", "paid", "refunded", "disputed"].includes(order.status)
    && Number.isSafeInteger(order.amountCents) && order.amountCents >= 0
    && typeof order.orderId === "string" && Boolean(order.orderId);
}

export function normalizeSquareEvent(event, environment, locationId, parentTransaction = null, paymentOrder = null) {
  const object = event?.data?.object;
  if (["payment.created", "payment.updated"].includes(event.type)) {
    const payment = object?.payment;
    if (!payment) return { outcome: "ignored", reason: "unlinked_payment" };
    if (payment.status !== "COMPLETED") return { outcome: "ignored", reason: "payment_not_completed" };
    if (!payment.order_id) return { outcome: "invalid", reason: "missing_provider_order_id" };
    if (!paymentOrder) return { outcome: "ignored", reason: "unrecognized_provider_order_id" };
    if (!trustedOrder(paymentOrder, environment, payment.order_id)) return { outcome: "invalid", reason: "order_identity_mismatch" };
    if (payment.location_id !== locationId) return { outcome: "invalid", reason: "location_mismatch" };
    if (payment.reference_id !== undefined && payment.reference_id !== paymentOrder.orderId) return { outcome: "invalid", reason: "reference_id_mismatch" };
    const amountCents = money(payment.amount_money);
    if (amountCents !== paymentOrder.amountCents) throw new Error("amount_mismatch");
    const id = `${environment}_charge_${payment.id}`;
    const linked = { purpose: paymentOrder.purpose, orderId: paymentOrder.orderId, ...(paymentOrder.clientUid && { clientUid: paymentOrder.clientUid }) };
    const paymentOrderStatus = ["refunded", "disputed"].includes(paymentOrder.status) ? paymentOrder.status : "paid";
    return { outcome: "processed", transactionId: id, paymentOrderId: paymentOrder.orderId, paymentOrderStatus, transaction: baseTransaction({ id, environment, locationId, eventId: event.event_id, eventType: event.type, amountCents, status: "completed", type: "charge", paymentId: payment.id, providerOrderId: payment.order_id, ...linked }) };
  }
  if (["refund.created", "refund.updated"].includes(event.type)) {
    const refund = object?.refund;
    if (!refund || !refund.payment_id || !parentIsTrusted(parentTransaction, environment, locationId, refund.payment_id)) return { outcome: "ignored", reason: "unlinked_refund" };
    if (refund.status !== "COMPLETED") return { outcome: "ignored", reason: "refund_not_completed" };
    if (refund.order_id !== undefined && refund.order_id !== parentTransaction.providerOrderId) return { outcome: "invalid", reason: "refund_provider_order_mismatch" };
    const linked = { purpose: parentTransaction.purpose, orderId: parentTransaction.orderId, ...(parentTransaction.enrollmentId && { enrollmentId: parentTransaction.enrollmentId }), ...(parentTransaction.clientUid && { clientUid: parentTransaction.clientUid }) };
    const amountCents = money(refund.amount_money);
    const id = `${environment}_refund_${refund.id}`;
    return { outcome: "processed", transactionId: id, paymentOrderId: parentTransaction.orderId, paymentOrderStatus: "refunded", transaction: baseTransaction({ id, environment, locationId, eventId: event.event_id, eventType: event.type, amountCents, status: "completed", type: "refund", paymentId: refund.payment_id, providerOrderId: parentTransaction.providerOrderId, parentTransactionId: `${environment}_charge_${refund.payment_id}`, ...linked }) };
  }
  if (event.type.startsWith("dispute.")) {
    const dispute = object?.dispute;
    const paymentId = dispute?.disputed_payment?.payment_id;
    if (!dispute || !paymentId || !parentIsTrusted(parentTransaction, environment, locationId, paymentId)) return { outcome: "ignored", reason: "unlinked_dispute" };
    if (!DISPUTE_FINANCIAL_EFFECT_STATES.has(dispute.state)) return { outcome: "ignored", reason: "dispute_without_debit_effect" };
    const linked = { purpose: parentTransaction.purpose, orderId: parentTransaction.orderId, ...(parentTransaction.enrollmentId && { enrollmentId: parentTransaction.enrollmentId }), ...(parentTransaction.clientUid && { clientUid: parentTransaction.clientUid }) };
    const amountCents = money(dispute.amount_money);
    const id = `${environment}_chargeback_${dispute.id}`;
    return { outcome: "processed", transactionId: id, paymentOrderId: parentTransaction.orderId, paymentOrderStatus: "disputed", transaction: baseTransaction({ id, environment, locationId, eventId: event.event_id, eventType: event.type, amountCents, status: "funds_withheld", providerState: dispute.state, type: "chargeback", paymentId, providerOrderId: parentTransaction.providerOrderId, parentTransactionId: `${environment}_charge_${paymentId}`, ...linked }) };
  }
  return { outcome: "ignored", reason: "unsupported_event" };
}
