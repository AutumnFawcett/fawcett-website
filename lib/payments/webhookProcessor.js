import { eventKey, hashPayload, normalizeSquareEvent } from "./squareWebhook.js";

function sameAuthoritativeTransaction(existing, incoming) {
  const fields = [
    "provider", "environment", "providerLocationId", "currency", "amountCents",
    "type", "purpose", "providerTransactionId", "providerPaymentId", "orderId", "providerOrderId",
    "enrollmentId", "clientUid", "parentTransactionId",
  ];
  return fields.every((field) => existing[field] === incoming[field]);
}

export async function processSquareWebhook({ firestore, environment, locationId, event, rawBody, now }) {
  const key = eventKey(environment, event.event_id);
  const payloadHash = hashPayload(rawBody);
  const eventRef = firestore.collection("paymentWebhookEvents").doc(key);
  const transactionRefFor = (id) => firestore.collection("paymentTransactions").doc(id);

  return firestore.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      const data = existing.data();
      if (data.provider !== "square" || data.environment !== environment || data.eventId !== event.event_id || data.payloadHash !== payloadHash) {
        return { outcome: "invalid", reason: "event_id_payload_mismatch" };
      }
      if (data.processingState === "processed" || data.processingState === "ignored") {
        tx.set(eventRef, { ...data, attemptCount: data.attemptCount + 1, lastReceivedAt: now() });
        return { outcome: data.processingState, duplicate: true };
      }
    }

    const refund = event?.data?.object?.refund;
    const dispute = event?.data?.object?.dispute;
    const parentPaymentId = refund?.payment_id || dispute?.disputed_payment?.payment_id;
    let parentTransaction = null;
    if (parentPaymentId) {
      const parentSnap = await tx.get(transactionRefFor(`${environment}_charge_${parentPaymentId}`));
      if (parentSnap.exists) parentTransaction = parentSnap.data();
    }
    const payment = event?.data?.object?.payment;
    let paymentOrder = null;
    if (["payment.created", "payment.updated"].includes(event.type) && payment?.status === "COMPLETED" && payment.order_id) {
      const query = firestore.collection("paymentOrders")
        .where("providerOrderId", "==", payment.order_id)
        .where("provider", "==", "square")
        .where("environment", "==", environment)
        .limit(2);
      const matches = await tx.get(query);
      if (matches.size === 1) paymentOrder = matches.docs[0].data();
      else if (matches.size > 1) paymentOrder = { invalidDuplicate: true };
    }
    let normalized;
    try { normalized = normalizeSquareEvent(event, environment, locationId, parentTransaction, paymentOrder); }
    catch (error) {
      normalized = { outcome: "invalid", reason: error.message };
    }
    const attempts = (existing.exists ? existing.data().attemptCount : 0) + 1;
    const timestamp = now();
    const record = {
      provider: "square", environment, eventId: event.event_id, eventType: event.type,
      payloadHash, signatureValidated: true, processingState: normalized.outcome,
      attemptCount: attempts, firstReceivedAt: existing.exists ? existing.data().firstReceivedAt : timestamp,
      lastReceivedAt: timestamp, processedAt: timestamp, resultReason: normalized.reason || "transaction_recorded",
    };
    if (normalized.outcome === "processed") {
      let orderRef;
      if (normalized.paymentOrderId) {
        orderRef = firestore.collection("paymentOrders").doc(normalized.paymentOrderId);
        const orderSnap = await tx.get(orderRef);
        const order = orderSnap.exists ? orderSnap.data() : null;
        if (!order || order.provider !== "square" || order.environment !== environment || order.providerOrderId !== normalized.transaction.providerOrderId) {
          normalized = { outcome: "invalid", reason: "order_state_mismatch" };
          record.processingState = normalized.outcome; record.resultReason = normalized.reason;
        }
      }
      if (normalized.outcome === "processed") {
        const transactionRef = transactionRefFor(normalized.transactionId);
        const transactionSnap = await tx.get(transactionRef);
        if (transactionSnap.exists && !sameAuthoritativeTransaction(transactionSnap.data(), normalized.transaction)) {
          normalized = { outcome: "invalid", reason: "transaction_identity_collision" };
          record.processingState = normalized.outcome;
          record.resultReason = normalized.reason;
        } else if (!transactionSnap.exists) {
          tx.create(transactionRef, { ...normalized.transaction, createdAt: timestamp, updatedAt: timestamp });
        }
        if (normalized.outcome === "processed" && orderRef) {
          tx.update(orderRef, { status: normalized.paymentOrderStatus, updatedAt: timestamp, failureCode: null });
        }
      }
    }
    tx.set(eventRef, record);
    return normalized;
  });
}
