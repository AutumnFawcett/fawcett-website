const fs = require("node:fs");
const path = require("node:path");
const { after, before, beforeEach, test } = require("node:test");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const { Timestamp, doc, getDoc, setDoc, updateDoc, deleteDoc } = require("firebase/firestore");

const projectId = "demo-fawcett-dev";
let testEnv;

function validRequest(clientUid = "client-one") {
  return {
    clientUid,
    clientEmail: `${clientUid}@example.test`,
    clientName: "Test Client",
    requestType: "pause_monthly_payments",
    requestStatus: "new",
    reason: "Please pause my payments.",
    clientAcknowledgement: {
      understandsThisIsARequest: true,
      understandsStudioMustReview: true,
      understandsCreditBalanceDoesNotAutomaticallyDisappear: true,
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

function requestRef(uid, requestId = "request-one") {
  return doc(
    testEnv.authenticatedContext(uid).firestore(),
    "membershipChangeRequests",
    requestId
  );
}

async function seedRequest(requestId = "request-one") {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "membershipChangeRequests", requestId),
      validRequest()
    );
  });
}

async function seedAdmin(uid, active) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "adminUsers", uid), { active });
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.resolve("firestore.rules"), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "systemControls/writeFence"), { schemaVersion: 1, state: "open", epoch: "test", writerProtocol: 1 }));
});
after(async () => testEnv.cleanup());

test("authenticated client creates a valid request for their own UID", async () => {
  await assertSucceeds(createPaired(requestRef("client-one"), validRequest()));
});

test("unauthenticated creation is denied", async () => {
  const ref = doc(testEnv.unauthenticatedContext().firestore(), "membershipChangeRequests", "request-one");
  await assertFails(setDoc(ref, validRequest()));
});

test("creation for another clientUid is denied", async () => {
  await assertFails(setDoc(requestRef("client-two"), validRequest("client-one")));
});

test("adminReview and unexpected fields are denied", async () => {
  await assertFails(setDoc(requestRef("client-one", "admin-review"), {
    ...validRequest(),
    adminReview: {},
  }));
  await assertFails(setDoc(requestRef("client-one", "unexpected"), {
    ...validRequest(),
    unexpected: true,
  }));
});

test("financial and balance snapshot fields are denied", async () => {
  for (const field of [
    "currentCreditBalanceCents",
    "totalCreditAddedCents",
    "totalCreditUsedCents",
    "totalCreditRemovedCents",
    "balanceCents",
  ]) {
    await assertFails(setDoc(requestRef("client-one", field), {
      ...validRequest(),
      [field]: 100,
    }));
  }
});

test("invalid request type and initial status are denied", async () => {
  await assertFails(setDoc(requestRef("client-one", "bad-type"), {
    ...validRequest(),
    requestType: "refund_credit",
  }));
  await assertFails(setDoc(requestRef("client-one", "bad-status"), {
    ...validRequest(),
    requestStatus: "approved",
  }));
});

test("client cannot read, update or delete the private original request", async () => {
  await seedRequest();
  const ref = requestRef("client-one");
  await assertFails(getDoc(ref));
  await assertFails(updateDoc(ref, { reason: "Changed" }));
  await assertFails(deleteDoc(ref));
});

test("cross-client read is denied", async () => {
  await seedRequest();
  await assertFails(getDoc(requestRef("client-two")));
});

test("active admin reads and updates a request", async () => {
  await seedRequest();
  await seedAdmin("active-admin", true);
  const ref = requestRef("active-admin");
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { requestStatus: "reviewed" }));
});

test("inactive admin administrative access is denied", async () => {
  await seedRequest();
  await seedAdmin("inactive-admin", false);
  const ref = requestRef("inactive-admin");
  await assertFails(getDoc(ref));
  await assertFails(updateDoc(ref, { requestStatus: "reviewed" }));
});

test("user without an adminUsers record cannot perform administrative access", async () => {
  await seedRequest();
  const ref = requestRef("not-an-admin");
  await assertFails(getDoc(ref));
  await assertFails(updateDoc(ref, { requestStatus: "reviewed" }));
});

async function createPaired(ref, data) {
  const { writeBatch } = require("firebase/firestore");
  const { portalProjection } = await import("../../lib/portalProjection.mjs");
  const name = ref.parent.id, approved = portalProjection(name, data);
  const batch = writeBatch(ref.firestore);
  batch.set(ref, data);
  batch.set(doc(ref.firestore, "portalRecords", name, "records", ref.id), approved);
  batch.set(doc(ref.firestore, "publicationRecords", name, "records", ref.id), { schemaVersion: 1, state: "approved", mode: "client_origin", actorUid: data.clientUid, reviewedAt: require("firebase/firestore").serverTimestamp(), fenceEpoch: "test", approved });
  return batch.commit();
}
