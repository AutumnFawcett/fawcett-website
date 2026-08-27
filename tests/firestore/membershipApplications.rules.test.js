const fs = require("node:fs");
const path = require("node:path");
const { after, before, beforeEach, test } = require("node:test");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const projectId = "demo-fawcett-membership-application-rules";
let testEnv;
let sequence = 0;

function validApplication(clientUid = "client-one") {
  return {
    programName: "Tattoo Project Membership Program",
    applicationType: "founding_member_interest",
    clientUid,
    clientEmail: `${clientUid}@example.test`,
    clientName: "Test Client",
    phone: "555-0100",
    instagram: "@testclient",
    preferredContactMethod: "email",
    status: "new",
    preferredArtist: "not_sure",
    project: {
      projectType: "full_sleeve",
      tattooIdea: "A complete botanical sleeve.",
      colourPreference: "not_sure",
      placement: "Left arm",
      bodySide: "left",
      sizeCategory: "full_sleeve",
      detailLevel: "high_detail",
    },
    coverUp: { isCoverUp: "no", coverUpDescription: "" },
    budget: {
      tierInterest: "starter",
      monthlyComfort: "150",
      paymentStyle: "monthly",
    },
    timeline: {
      planningTimeline: "1_3_months",
      completionWindow: "yes",
      availability: "Weekdays and Saturdays.",
    },
    readiness: {
      readyForConsult: "yes",
      healthConsiderations: "no",
      healthDetails: "",
    },
    acknowledgements: {
      applicationOnly: true,
      noPaymentCollected: true,
      noGuarantee: true,
      notInvestmentLoanDiscount: true,
      mandatoryCostsBeforeEnrollment: true,
      termsBeforeEnrollment: true,
      studioPolicy: true,
      informationAccurate: true,
      contactPermission: true,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function applicationRef(uid, id = `application-${sequence++}`) {
  const firestore = uid
    ? testEnv.authenticatedContext(uid).firestore()
    : testEnv.unauthenticatedContext().firestore();
  return doc(firestore, "membershipApplications", id);
}

async function seedApplication(id, data = validApplication()) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "membershipApplications", id), data);
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
    firestore: { rules: fs.readFileSync(path.resolve("firestore.rules"), "utf8") },
  });
});

beforeEach(async () => testEnv.clearFirestore());
after(async () => testEnv.cleanup());

test("authenticated client creates a complete application for their own UID", async () => {
  await assertSucceeds(setDoc(applicationRef("client-one"), validApplication()));
});

test("all legitimate optional contact and detail fields may be populated or empty", async () => {
  const populated = validApplication();
  populated.coverUp.coverUpDescription = "Existing dark line work.";
  populated.readiness.healthDetails = "Details for studio review.";
  await assertSucceeds(setDoc(applicationRef("client-one"), populated));

  const empty = validApplication();
  empty.instagram = "";
  empty.coverUp.coverUpDescription = "";
  empty.readiness.healthDetails = "";
  await assertSucceeds(setDoc(applicationRef("client-one"), empty));
});

test("client reads their own application but not another client's", async () => {
  await seedApplication("owned");
  await assertSucceeds(getDoc(applicationRef("client-one", "owned")));
  await assertFails(getDoc(applicationRef("client-two", "owned")));
});

test("active admin reads and updates applications, including historical records", async () => {
  await seedAdmin("admin", true);
  await seedApplication("current");
  await seedApplication("legacy", { clientUid: "legacy-client", legacyField: true });
  const current = applicationRef("admin", "current");
  await assertSucceeds(getDoc(current));
  await assertSucceeds(updateDoc(current, { status: "reviewing" }));
  await assertSucceeds(getDoc(applicationRef("admin", "legacy")));
});

test("unauthenticated creation and the wrong clientUid are denied", async () => {
  await assertFails(setDoc(applicationRef(null), validApplication()));
  await assertFails(setDoc(applicationRef("client-two"), validApplication("client-one")));
});

test("missing, unexpected, and administrative top-level fields are denied", async () => {
  const missing = validApplication();
  delete missing.project;
  await assertFails(setDoc(applicationRef("client-one"), missing));

  for (const [field, value] of [
    ["unexpected", true], ["adminReview", {}], ["reviewerUid", "admin"],
    ["reviewedBy", "admin"], ["decision", "approved"], ["approvedTier", "starter"],
    ["customPlan", {}], ["membershipOffer", { termsSummary: "terms" }],
    ["offerTerms", "terms"], ["assignedInbox", "general"], ["assignedArtistId", null],
    ["images", Array(11).fill("https://example.test/image.jpg")],
    ["references", ["not-the-format-produced-by-the-form"]],
    ["internalNotes", "notes"], ["approvedAt", serverTimestamp()],
    ["priceCents", 100], ["balanceCents", 100], ["creditCents", 100],
  ]) {
    await assertFails(setDoc(applicationRef("client-one"), { ...validApplication(), [field]: value }));
  }
});

test("unexpected nested fields are denied", async () => {
  for (const field of ["project", "coverUp", "budget", "timeline", "readiness", "acknowledgements"]) {
    const data = validApplication();
    data[field] = { ...data[field], unexpected: true };
    await assertFails(setDoc(applicationRef("client-one"), data));
  }
});

test("invalid initial status and every enum category are denied", async () => {
  const cases = [
    ["preferredContactMethod", "fax"], ["preferredArtist", "other_artist"],
    ["project.projectType", "portrait"], ["project.colourPreference", "blue"],
    ["project.bodySide", "upper"], ["project.sizeCategory", "tiny"],
    ["project.detailLevel", "extreme"], ["coverUp.isCoverUp", "unknown"],
    ["budget.tierInterest", "vip"], ["budget.monthlyComfort", "200"],
    ["budget.paymentStyle", "cash"], ["timeline.planningTimeline", "tomorrow"],
    ["timeline.completionWindow", "24_months"], ["readiness.readyForConsult", "later"],
    ["readiness.healthConsiderations", "private"],
  ];
  for (const [pathName, value] of cases) {
    const data = validApplication();
    const parts = pathName.split(".");
    if (parts.length === 1) data[parts[0]] = value;
    else data[parts[0]][parts[1]] = value;
    await assertFails(setDoc(applicationRef("client-one"), data));
  }
  await assertFails(setDoc(applicationRef("client-one"), { ...validApplication(), status: "approved" }));
});

test("invalid types for each field category are denied", async () => {
  const mutations = [
    (d) => { d.clientEmail = 1; }, (d) => { d.status = 1; },
    (d) => { d.project = []; }, (d) => { d.project.tattooIdea = false; },
    (d) => { d.coverUp = "no"; }, (d) => { d.budget = []; },
    (d) => { d.timeline = null; }, (d) => { d.readiness = 1; },
    (d) => { d.acknowledgements = []; },
    (d) => { d.acknowledgements.applicationOnly = "true"; },
    (d) => { d.createdAt = "now"; }, (d) => { d.updatedAt = 123; },
  ];
  for (const mutate of mutations) {
    const data = validApplication();
    mutate(data);
    await assertFails(setDoc(applicationRef("client-one"), data));
  }
});

test("empty required strings and oversized strings are denied", async () => {
  for (const mutate of [
    (d) => { d.clientEmail = ""; }, (d) => { d.clientName = ""; },
    (d) => { d.phone = ""; }, (d) => { d.project.tattooIdea = ""; },
    (d) => { d.project.placement = ""; }, (d) => { d.timeline.availability = ""; },
    (d) => { d.clientName = "   "; }, (d) => { d.project.tattooIdea = "\n\t"; },
    (d) => { d.clientName = "x".repeat(121); }, (d) => { d.clientEmail = "x".repeat(321); },
    (d) => { d.phone = "x".repeat(51); }, (d) => { d.instagram = "x".repeat(101); },
    (d) => { d.project.tattooIdea = "x".repeat(4001); },
    (d) => { d.project.placement = "x".repeat(201); },
    (d) => { d.coverUp.coverUpDescription = "x".repeat(2001); },
    (d) => { d.timeline.availability = "x".repeat(2001); },
    (d) => { d.readiness.healthDetails = "x".repeat(2001); },
  ]) {
    const data = validApplication();
    mutate(data);
    await assertFails(setDoc(applicationRef("client-one"), data));
  }
});

test("all acknowledgements must be boolean true", async () => {
  for (const field of Object.keys(validApplication().acknowledgements)) {
    const data = validApplication();
    data.acknowledgements[field] = false;
    await assertFails(setDoc(applicationRef("client-one"), data));
  }
});

test("timestamps must be server request time", async () => {
  const invalidCreated = validApplication();
  invalidCreated.createdAt = new Date(0);
  await assertFails(setDoc(applicationRef("client-one"), invalidCreated));
  const invalidUpdated = validApplication();
  invalidUpdated.updatedAt = new Date(0);
  await assertFails(setDoc(applicationRef("client-one"), invalidUpdated));
});

test("clients cannot update or delete after submission", async () => {
  await seedApplication("locked");
  const ref = applicationRef("client-one", "locked");
  await assertFails(updateDoc(ref, { phone: "555-9999" }));
  await assertFails(deleteDoc(ref));
});

test("inactive admins and users without active admin records have no administrative access", async () => {
  await seedApplication("admin-only", { clientUid: "client-one", legacyField: true });
  await seedAdmin("inactive", false);
  for (const uid of ["inactive", "not-admin"]) {
    const ref = applicationRef(uid, "admin-only");
    await assertFails(getDoc(ref));
    await assertFails(updateDoc(ref, { status: "reviewing" }));
  }
});
