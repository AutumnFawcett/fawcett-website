import "server-only";
import { canAttachProviderIdentity } from "../payments/paymentOrderState.js";

export function createPaymentOrderStorage(firestore) {
  const ref = (id) => firestore.collection("paymentOrders").doc(id);
  return {
    async getOrder(orderId) {
      const snap = await ref(orderId).get();
      return snap.exists ? snap.data() : null;
    },
    async createOrder(order) { await ref(order.orderId).create(order); },
    async attachProviderIdentity(orderId, identity, timestamp) {
      await firestore.runTransaction(async (tx) => {
        const orderRef = ref(orderId); const snap = await tx.get(orderRef);
        if (!snap.exists) throw new Error("order_not_found");
        const data = snap.data();
        if (!canAttachProviderIdentity(data)) throw new Error("provider_identity_conflict");
        tx.update(orderRef, { ...identity, status: "pending", updatedAt: timestamp, failureCode: null });
      });
    },
    async markCreationFailed(orderId, failureCode, timestamp) {
      await firestore.runTransaction(async (tx) => {
        const orderRef = ref(orderId); const snap = await tx.get(orderRef);
        if (snap.exists && snap.data().status === "creating") tx.update(orderRef, { status: "creation_failed", failureCode, updatedAt: timestamp });
      });
    },
  };
}
