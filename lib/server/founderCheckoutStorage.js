import "server-only";
import { createHash } from "node:crypto";

const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

export function createFounderCheckoutStorage(firestore, orderStorage) {
  return {
    ...orderStorage,
    async reserveCheckoutRequest({ requestId, order, timestamp }) {
      const requestKey = createHash("sha256").update(`${order.provider}:${order.environment}:${requestId}`).digest("hex");
      const uidKey = createHash("sha256").update(`${order.environment}:${order.clientUid}`).digest("hex");
      const requestRef = firestore.collection("paymentCheckoutRequests").doc(requestKey);
      const orderRef = firestore.collection("paymentOrders").doc(order.orderId);
      const rateRef = firestore.collection("paymentCheckoutRateLimits").doc(uidKey);
      return firestore.runTransaction(async (tx) => {
        const existing = await tx.get(requestRef);
        if (existing.exists) {
          const data = existing.data();
          if (data.clientUid !== order.clientUid || data.offerId !== order.offerId || data.provider !== order.provider || data.environment !== order.environment) return { outcome: "conflict" };
          const saved = await tx.get(firestore.collection("paymentOrders").doc(data.orderId));
          if (!saved.exists) throw new Error("checkout_request_inconsistent");
          return { outcome: "existing", order: saved.data() };
        }
        const rateSnap = await tx.get(rateRef);
        const nowMs = timestamp instanceof Date ? timestamp.getTime() : Date.now();
        const rate = rateSnap.exists ? rateSnap.data() : null;
        const windowStartMs = rate?.windowStartMs;
        const active = Number.isSafeInteger(windowStartMs) && nowMs - windowStartMs < WINDOW_MS;
        const count = active && Number.isSafeInteger(rate.count) ? rate.count : 0;
        if (count >= LIMIT) return { outcome: "rate_limited" };
        tx.create(orderRef, order);
        tx.create(requestRef, { requestId, orderId: order.orderId, clientUid: order.clientUid, offerId: order.offerId, provider: order.provider, environment: order.environment, createdAt: timestamp });
        tx.set(rateRef, { clientUid: order.clientUid, environment: order.environment, windowStartMs: active ? windowStartMs : nowMs, count: count + 1, updatedAt: timestamp });
        return { outcome: "created", order };
      });
    },
  };
}
