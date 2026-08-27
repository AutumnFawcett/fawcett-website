const fs = require("node:fs");
const path = require("node:path");
const { after, before, beforeEach, test } = require("node:test");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");

const projectId = "demo-fawcett-membership-offer-response-rules";
let testEnv;

function validResponse(clientUid = "client-one", applicationId = "application-one") {
  return {
    clientUid,
    applicationId,
    responseType: "request_accept_offer",
    responseStatus: "new",
    clientNote: "I would like to move forward.",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

function responseRef(uid, responseId = "response-one") {
  return doc(
    testEnv.authenticatedContext(uid).firestore(),
    "membershipOfferResponses",
    responseId
  );
}

async function seedApplication(applicationId = "application-one", clientUid = "client-one") {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "membershipApplications", applicationId), {
      clientUid,
    });
  });
}

async function seedResponse(responseId = "response-one") {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "membershipOfferResponses", responseId),
      validResponse()
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

beforeEach(async () => testEnv.clearFirestore());
after(async () => testEnv.cleanup());

test("authenticated client creates a valid response for their own application", async () => {
  await seedApplication();
  await assertSucceeds(setDoc(responseRef("client-one"), validResponse()));
});

test("unauthenticated creation is denied", async () => {
  await seedApplication();
  const ref = doc(testEnv.unauthenticatedContext().firestore(), "membershipOfferResponses", "response-one");
  await assertFails(setDoc(ref, validResponse()));
});

test("wrong clientUid is denied", async () => {
  await seedApplication();
  await assertFails(setDoc(responseRef("client-two"), validResponse("client-one")));
});

test("another client's application and a nonexistent application are denied", async () => {
  await seedApplication("other-application", "client-two");
  await assertFails(setDoc(responseRef("client-one", "other-client"), validResponse("client-one", "other-application")));
  await assertFails(setDoc(responseRef("client-one", "missing"), validResponse("client-one", "missing-application")));
});

test("snapshot, admin, financial, and unexpected fields are denied", async () => {
  await seedApplication();
  for (const [field, value] of [
    ["offerSnapshot", { tier: "gold" }],
    ["adminReview", { reviewedBy: "client" }],
    ["initialPaymentCents", 10000],
    ["monthlyPaymentCents", 5000],
    ["minimumProjectValueCents", 100000],
    ["paymentAmount", 100],
    ["offerTerms", "client supplied"],
    ["unexpected", true],
  ]) {
    await assertFails(setDoc(responseRef("client-one", field), {
      ...validResponse(),
      [field]: value,
    }));
  }
});

test("client acknowledgement fields, including false or unexpected nested values, are denied", async () => {
  await seedApplication();
  await assertFails(setDoc(responseRef("client-one", "false-ack"), {
    ...validResponse(),
    clientAcknowledgement: { understandsOffer: false },
  }));
  await assertFails(setDoc(responseRef("client-one", "nested-ack"), {
    ...validResponse(),
    clientAcknowledgement: { unexpected: true },
  }));
});

test("invalid response type and initial status are denied", async () => {
  await seedApplication();
  await assertFails(setDoc(responseRef("client-one", "bad-type"), {
    ...validResponse(), responseType: "counter_offer",
  }));
  await assertFails(setDoc(responseRef("client-one", "bad-status"), {
    ...validResponse(), responseStatus: "approved_to_move_forward",
  }));
});

test("invalid field types are denied", async () => {
  await seedApplication();
  for (const [field, value] of [
    ["clientUid", true],
    ["applicationId", 123],
    ["responseType", true],
    ["responseStatus", 1],
    ["clientNote", false],
    ["createdAt", "now"],
    ["updatedAt", "now"],
  ]) {
    await assertFails(setDoc(responseRef("client-one", `bad-${field}`), {
      ...validResponse(), [field]: value,
    }));
  }
});

test("client reads their response but cannot update or delete it", async () => {
  await seedResponse();
  const ref = responseRef("client-one");
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(ref, { clientNote: "Changed" }));
  await assertFails(deleteDoc(ref));
});

test("cross-client read is denied", async () => {
  await seedResponse();
  await assertFails(getDoc(responseRef("client-two")));
});

test("active admin reads and updates a response", async () => {
  await seedResponse();
  await seedAdmin("active-admin", true);
  const ref = responseRef("active-admin");
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { responseStatus: "reviewing" }));
});

test("inactive admin and user without admin record cannot use administrative access", async () => {
  await seedResponse();
  await seedAdmin("inactive-admin", false);
  for (const uid of ["inactive-admin", "not-an-admin"]) {
    const ref = responseRef(uid);
    await assertFails(getDoc(ref));
    await assertFails(updateDoc(ref, { responseStatus: "reviewing" }));
  }
});
