const fs = require("node:fs");
const path = require("node:path");
const { after, afterEach, before, test } = require("node:test");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { deleteDoc, doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: "payment-foundation-rules", firestore: { rules: fs.readFileSync(path.resolve("firestore.rules"), "utf8") } }); });
afterEach(async () => env.clearFirestore());
after(async () => env.cleanup());

async function seed(pathName, id, data) {
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), pathName, id), data));
}

test("clients and browser admins cannot write authoritative payment collections", async () => {
  await seed("adminUsers", "admin", { active: true });
  for (const uid of ["client", "admin"]) for (const collection of ["paymentWebhookEvents", "paymentTransactions"]) {
    const ref = doc(env.authenticatedContext(uid).firestore(), collection, "record");
    await assertFails(setDoc(ref, { clientUid: uid }));
    await seed(collection, "record", { clientUid: uid });
    await assertFails(updateDoc(ref, { status: "changed" }));
    await assertFails(deleteDoc(ref));
  }
});

test("webhook events are unreadable and transactions are admin-read-only", async () => {
  await seed("adminUsers", "admin", { active: true });
  await seed("paymentWebhookEvents", "event", { eventId: "event" });
  await seed("paymentTransactions", "transaction", { clientUid: "client" });
  for (const uid of [null, "client", "other", "admin"]) {
    const db = uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "paymentWebhookEvents", "event")));
  }
  await assertSucceeds(getDoc(doc(env.authenticatedContext("admin").firestore(), "paymentTransactions", "transaction")));
  await assertFails(getDoc(doc(env.authenticatedContext("client").firestore(), "paymentTransactions", "transaction")));
  await assertFails(getDoc(doc(env.authenticatedContext("other").firestore(), "paymentTransactions", "transaction")));
});

test("paymentOrders are inaccessible to unauthenticated and non-admin clients", async () => {
  await seed("paymentOrders", "order", { orderId: "order", status: "pending" });
  for (const db of [env.unauthenticatedContext().firestore(), env.authenticatedContext("client").firestore()]) {
    const ref = doc(db, "paymentOrders", "order");
    await assertFails(getDoc(ref));
    await assertFails(setDoc(doc(db, "paymentOrders", "new-order"), { orderId: "new-order" }));
    await assertFails(updateDoc(ref, { status: "paid" }));
    await assertFails(deleteDoc(ref));
  }
});
