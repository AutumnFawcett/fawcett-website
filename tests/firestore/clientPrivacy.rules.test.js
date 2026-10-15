import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
let env, admin, portal, projection;
const db = (uid = "alice") => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
const source = (database, name, id = "record") => doc(database, name, id);
const view = (database, name, id = "record") => doc(database, "portalRecords", name, "records", id);
const identity = { clientUid: "alice", clientName: "Synthetic Alice", clientEmail: "alice@example.test" };
const now = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
async function seed(name, id, data, withView = true) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const database = ctx.firestore();
    await setDoc(source(database, name, id), data);
    const publicData = projection.portalProjection(name, data);
    if (withView && publicData) await setDoc(view(database, name, id), publicData);
  });
}
before(async () => {
  admin = await import("../../lib/adminFirestore.js");
  portal = await import("../../lib/portalFirestore.js");
  projection = await import("../../lib/portalProjection.mjs");
  env = await initializeTestEnvironment({ projectId: "demo-fawcett-privacy", firestore: { rules: fs.readFileSync(path.resolve("firestore.rules"), "utf8") } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "adminUsers", "admin"), { active: true });
    await setDoc(doc(ctx.firestore(), "adminUsers", "inactive"), { active: false });
  });
});
after(async () => env.cleanup());

for (const name of ["clients", "consultRequests", "membershipApplications", "projects", "appointments", "payments", "membershipOffers", "membershipOfferResponses", "membershipChangeRequests", "creditLedger", "conversations", "messages", "projectTimeline"]) {
  test(`${name}: original/legacy data is private and portal data is owner-scoped`, async () => {
    const data = { ...identity, ...now(), adminReview: { internalNotes: "Private synthetic review", reviewedBy: "staff@example.test" }, readiness: { healthDetails: "Synthetic health detail" }, createdBy: "staff@example.test", reference: "private-reference", ...(name === "membershipOffers" ? { status: "membership_offer_sent" } : {}), ...(name === "projectTimeline" ? { clientVisible: true, entryType: "client_update", body: "Approved update" } : {}) };
    await seed(name, "record", data);
    for (const uid of [null, "alice", "bob", "inactive"]) await assertFails(getDoc(source(db(uid), name)));
    await assertSucceeds(getDoc(source(db("admin"), name)));
    const result = await assertSucceeds(getDoc(view(db(), name)));
    assert.equal(result.data().adminReview, undefined);
    assert.equal(result.data().readiness, undefined);
    assert.equal(result.data().createdBy, undefined);
    assert.equal(result.data().reference, undefined);
    for (const uid of [null, "bob", "inactive"]) await assertFails(getDoc(view(db(uid), name)));
    await assertSucceeds(getDoc(view(db("admin"), name)));
    await assertFails(updateDoc(view(db(), name), { adminReview: { internalNotes: "Injected" } }));
    await assertFails(deleteDoc(view(db(), name)));
  });
}

test("private originals and unconstrained portal collection queries are denied", async () => {
  await seed("projects", "alice-project", { ...identity, projectName: "Own synthetic project" });
  await seed("projects", "bob-project", { clientUid: "bob", projectName: "Other synthetic project" });
  await assertFails(getDocs(query(collection(db(), "projects"), where("clientUid", "==", "alice"))));
  await assertFails(getDocs(portal.collection(db(), "projects")));
  const snap = await assertSucceeds(getDocs(query(portal.collection(db(), "projects"), where("clientUid", "==", "alice"))));
  assert.deepEqual(snap.docs.map((d) => d.id), ["alice-project"]);
});

test("admin helper writes private review/health and a safe linked projection atomically", async () => {
  const ref = await assertSucceeds(admin.addDoc(collection(db("admin"), "projects"), {
    ...identity, ...now(), consultRequestId: "consult", applicationId: "application", projectName: "Synthetic project",
    readiness: { healthDetails: "Private health", healthConsiderations: "yes" },
    estimate: { estimateLowCents: 10000, updatedBy: "staff@example.test" },
    adminReview: { internalNotes: "Private", clientProjectSummary: "Approved summary" },
  }));
  await assertSucceeds(admin.updateDoc(ref, { "adminReview.internalNotes": "Changed private", "estimate.estimateHighCents": 20000 }));
  const privateData = (await getDoc(ref)).data();
  assert.equal(privateData.adminReview.internalNotes, "Changed private");
  const publicData = (await getDoc(view(db(), "projects", ref.id))).data();
  assert.equal(publicData.clientProjectSummary, "Approved summary");
  assert.equal(publicData.consultRequestId, "consult");
  assert.equal(publicData.applicationId, "application");
  assert.equal(publicData.estimate.estimateHighCents, 20000);
  assert.equal(publicData.estimate.updatedBy, undefined);
  assert.equal(publicData.readiness, undefined);
  assert.equal(publicData.adminReview, undefined);
});

test("failed private write cannot leave a forged public record", async () => {
  await assertFails(portal.setDoc(portal.doc(db(), "projects", "forged"), { ...identity, projectName: "Forged" }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    assert.equal((await getDoc(view(ctx.firestore(), "projects", "forged"))).exists(), false);
    assert.equal((await getDoc(source(ctx.firestore(), "projects", "forged"))).exists(), false);
  });
});

test("even active browser admins cannot put private fields or misassigned relationships into projections", async () => {
  await seed("projects", "record", { ...identity, projectName: "Original", adminReview: { internalNotes: "Private" }, estimate: { estimateLowCents: 10000, updatedBy: "staff@example.test" } });
  for (const extra of [{ adminReview: {} }, { readiness: { healthDetails: "Private" } }, { projectId: "other-client-project" }, { estimate: { estimateLowCents: 10000, updatedBy: "staff@example.test" } }, { clientUid: "bob" }, { unknownSecret: "Private" }]) {
    const existing = (await getDoc(view(db("admin"), "projects"))).data();
    await assertFails(setDoc(view(db("admin"), "projects"), { ...existing, ...extra }));
  }
});

test("legacy admin edits never backfill portal records or expose old message bodies", async () => {
  await seed("messages", "legacy", { ...identity, senderRole: "client", body: "Old synthetic health summary" }, false);
  await assertSucceeds(admin.updateDoc(source(db("admin"), "messages", "legacy"), { "adminReview.internalNotes": "Private review" }));
  const result = await getDoc(view(db("admin"), "messages", "legacy"));
  assert.equal(result.exists(), false);
  await assertFails(getDoc(source(db(), "messages", "legacy")));
});

test("private and health timeline entries have no portal projection; publication can be withdrawn", async () => {
  const database = db("admin");
  const health = await assertSucceeds(admin.addDoc(collection(database, "projectTimeline"), { ...identity, entryType: "health_skin_note", clientVisible: true, body: "Private synthetic health note" }));
  assert.equal((await getDoc(view(database, "projectTimeline", health.id))).exists(), false);
  const normal = await admin.addDoc(collection(database, "projectTimeline"), { ...identity, entryType: "client_update", clientVisible: true, body: "Approved update", createdBy: "staff@example.test" });
  assert.equal((await getDoc(view(db(), "projectTimeline", normal.id))).data().createdBy, undefined);
  await admin.updateDoc(normal, { clientVisible: false });
  assert.equal((await getDoc(view(database, "projectTimeline", normal.id))).exists(), false);
  assert.equal((await getDoc(normal)).data().body, "Approved update");
});

test("draft offers and staff identifiers stay private; sent offer terms remain usable", async () => {
  const data = { ...identity, membershipOffer: { tier: "starter_member", initialPaymentCents: 10000, offerStatus: "membership_offer_draft", updatedBy: "staff@example.test" } };
  await seed("membershipApplications", "application", data);
  assert.equal((await getDoc(view(db(), "membershipApplications", "application"))).data().membershipOffer, undefined);
  await admin.updateDoc(source(db("admin"), "membershipApplications", "application"), { "membershipOffer.offerStatus": "membership_offer_sent", "membershipOffer.sentBy": "staff@example.test", "membershipOffer.sentAt": serverTimestamp() });
  const offer = (await getDoc(view(db(), "membershipApplications", "application"))).data().membershipOffer;
  assert.equal(offer.initialPaymentCents, 10000);
  assert.equal(offer.updatedBy, undefined);
  assert.equal(offer.sentBy, undefined);
});

function consultData() {
  return { ...identity, ...now(), clientName: "Synthetic Alice", phone: "555-0100", instagram: "", preferredContactMethod: "email", preferredArtist: "not_sure", assignedInbox: "general", assignedArtistId: null, status: "new", request: { tattooIdea: "Synthetic tattoo" }, coverUp: { isCoverUp: "no", coverUpDescription: "" }, timeline: { timeline: "planning_ahead", isUrgent: "no" }, readiness: { healthNotes: "Synthetic private health" }, acknowledgements: { acknowledgementAccurate: true, acknowledgementNoGuarantee: true, acknowledgementPolicy: true } };
}
test("consult submission and portal messaging still work without client reads of private originals", async () => {
  const database = db();
  const consult = await assertSucceeds(portal.addDoc(portal.collection(database, "consultRequests"), consultData()));
  const publicConsult = await getDoc(consult);
  assert.equal(publicConsult.data().readiness, undefined);
  const conversation = await assertSucceeds(portal.addDoc(portal.collection(database, "conversations"), { ...identity, ...now(), consultRequestId: consult.id, applicationId: null, status: "new", subject: "Synthetic consult", lastMessagePreview: "Synthetic", unreadForAdmin: true, unreadForClient: false }));
  const message = await assertSucceeds(portal.addDoc(portal.collection(database, "messages"), { clientUid: "alice", conversationId: conversation.id, consultRequestId: consult.id, applicationId: null, senderUid: "alice", senderRole: "client", senderName: "Synthetic Alice", body: "Synthetic reply", createdAt: serverTimestamp() }));
  assert.equal((await getDoc(message)).data().body, "Synthetic reply");
  await assertSucceeds(portal.updateDoc(conversation, { lastMessagePreview: "Synthetic reply", updatedAt: serverTimestamp(), unreadForAdmin: true }));
  const original = await getDoc(source(db("admin"), "consultRequests", consult.id));
  assert.equal(original.data().readiness.healthNotes, "Synthetic private health");
  await assertFails(getDoc(source(database, "consultRequests", consult.id)));
  await assertFails(portal.updateDoc(conversation, { clientUid: "bob" }));
  await assertFails(portal.updateDoc(conversation, { assignedInbox: "ben" }));
});

test("cross-client/missing links, sender impersonation and immutable-message edits are denied", async () => {
  await seed("conversations", "bob-thread", { clientUid: "bob" });
  await seed("membershipApplications", "bob-app", { clientUid: "bob" });
  for (const conversationId of ["bob-thread", "missing"]) {
    await assertFails(portal.addDoc(portal.collection(db(), "messages"), { clientUid: "alice", conversationId, senderUid: "alice", senderRole: "client", body: "Forged", createdAt: serverTimestamp() }));
  }
  await assertFails(portal.addDoc(portal.collection(db(), "conversations"), { ...identity, ...now(), applicationId: "bob-app" }));
  await seed("conversations", "own-thread", { ...identity });
  for (const forged of [{ senderRole: "admin" }, { senderUid: "bob" }, { clientUid: "bob" }, { adminReview: { internalNotes: "Injected" } }]) {
    await assertFails(portal.addDoc(portal.collection(db(), "messages"), { clientUid: "alice", conversationId: "own-thread", senderUid: "alice", senderRole: "client", body: "Forged", createdAt: serverTimestamp(), ...forged }));
  }
  await seed("messages", "history", { ...identity, senderRole: "client", body: "Original message" });
  await assertFails(updateDoc(source(db("admin"), "messages", "history"), { body: "Changed" }));
});

test("inactive admins cannot read or alter private data; unknown namespaces are denied", async () => {
  await seed("projects", "record", { ...identity });
  await assertFails(admin.updateDoc(source(db("inactive"), "projects"), { adminReview: { internalNotes: "Forged" } }));
  await assertFails(setDoc(doc(db("inactive"), "adminUsers", "inactive"), { active: true }));
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(view(ctx.firestore(), "unknown"), { ...identity }));
  await assertFails(getDoc(view(db(), "unknown")));
});

test("absent own profiles are readable but other missing profiles are not", async () => {
  assert.equal((await assertSucceeds(getDoc(portal.doc(db(), "clients", "alice")))).exists(), false);
  await assertFails(getDoc(portal.doc(db(), "clients", "bob")));
});

test("nested private maps cannot be smuggled into scalar public fields", async () => {
  await seed("projects", "record", { ...identity, project: { tattooIdea: "Safe text" } });
  await env.withSecurityRulesDisabled(async (ctx) => updateDoc(source(ctx.firestore(), "projects"), { project: { tattooIdea: { internalNotes: "Hidden nested field" } } }));
  await assertFails(setDoc(view(db("admin"), "projects"), { ...identity, project: { tattooIdea: { internalNotes: "Hidden nested field" } } }));
});

function applicationData() {
  return { ...identity, phone: "555-0100", instagram: "", ...now(), programName: "Tattoo Project Membership Program", applicationType: "founding_member_interest", preferredContactMethod: "email", status: "new", preferredArtist: "not_sure", project: { projectType: "other", tattooIdea: "Synthetic project", colourPreference: "not_sure", placement: "Arm", bodySide: "left", sizeCategory: "palm_sized", detailLevel: "moderate" }, coverUp: { isCoverUp: "no", coverUpDescription: "" }, budget: { tierInterest: "not_sure", monthlyComfort: "not_sure", paymentStyle: "not_sure" }, timeline: { planningTimeline: "planning_ahead", completionWindow: "artist_estimate", availability: "Weekdays" }, readiness: { readyForConsult: "yes", healthConsiderations: "yes", healthDetails: "Private synthetic health details" }, acknowledgements: Object.fromEntries(["applicationOnly", "noPaymentCollected", "noGuarantee", "notInvestmentLoanDiscount", "mandatoryCostsBeforeEnrollment", "termsBeforeEnrollment", "studioPolicy", "informationAccurate", "contactPermission"].map(k => [k, true])) };
}
test("complete membership intake, offer response, and change requests retain links without exposing review/health", async () => {
  const database = db();
  const app = await assertSucceeds(portal.addDoc(portal.collection(database, "membershipApplications"), applicationData()));
  assert.equal((await getDoc(app)).data().readiness, undefined);
  assert.equal((await getDoc(source(db("admin"), "membershipApplications", app.id))).data().readiness.healthDetails, "Private synthetic health details");
  const response = await assertSucceeds(portal.addDoc(portal.collection(database, "membershipOfferResponses"), { clientUid: "alice", applicationId: app.id, responseType: "ask_question", responseStatus: "new", clientNote: "Synthetic question", ...now() }));
  await assertSucceeds(admin.updateDoc(source(db("admin"), "membershipOfferResponses", response.id), { "adminReview.internalNotes": "Private review", responseStatus: "reviewed" }));
  const publicResponse = (await getDoc(response)).data();
  assert.equal(publicResponse.applicationId, app.id);
  assert.equal(publicResponse.responseStatus, "reviewed");
  assert.equal(publicResponse.adminReview, undefined);
  const request = await assertSucceeds(portal.addDoc(portal.collection(database, "membershipChangeRequests"), { ...identity, requestType: "pause_monthly_payments", requestStatus: "new", reason: "Synthetic request", clientAcknowledgement: { understandsThisIsARequest: true, understandsStudioMustReview: true, understandsCreditBalanceDoesNotAutomaticallyDisappear: true }, ...now() }));
  assert.equal((await getDoc(request)).data().requestStatus, "new");
});

test("admin replies, appointments and recorded payments retain relationships and private metadata", async () => {
  const database = db("admin");
  const project = await admin.addDoc(collection(database, "projects"), { ...identity, projectName: "Synthetic project" });
  const appointment = await admin.addDoc(collection(database, "appointments"), { ...identity, projectId: project.id, title: "Synthetic appointment", clientVisibleNotes: "Approved note", internalNotes: "Private appointment note" });
  const payment = await admin.addDoc(collection(database, "payments"), { ...identity, projectId: project.id, appointmentId: appointment.id, amountCents: 10000, currency: "CAD", status: "paid", reference: "Private bookkeeping", adminReview: { internalNotes: "Private payment note" } });
  assert.equal((await getDoc(view(db(), "appointments", appointment.id))).data().clientVisibleNotes, "Approved note");
  const safePayment = (await getDoc(view(db(), "payments", payment.id))).data();
  assert.equal(safePayment.projectId, project.id); assert.equal(safePayment.appointmentId, appointment.id);
  assert.equal(safePayment.amountCents, 10000); assert.equal(safePayment.reference, undefined);
  const conversation = await admin.addDoc(collection(database, "conversations"), { ...identity, subject: "Synthetic" });
  const message = await admin.addDoc(collection(database, "messages"), { clientUid: "alice", conversationId: conversation.id, senderUid: "admin", senderRole: "admin", senderName: "Studio", body: "Approved reply", createdAt: serverTimestamp() });
  const safeMessage = (await getDoc(view(db(), "messages", message.id))).data();
  assert.equal(safeMessage.body, "Approved reply"); assert.equal(safeMessage.conversationId, conversation.id);
  assert.equal(safeMessage.senderUid, undefined);
});

test("full admin-created project payload fits the rules budget and hides copied health/review data", async () => {
  const app = applicationData();
  const ref = await assertSucceeds(admin.addDoc(collection(db("admin"), "projects"), {
    ...identity, ...now(), applicationId: "synthetic-application", consultRequestId: null,
    projectName: "Synthetic complete project", assignedInbox: "general", assignedArtistId: null, preferredArtist: "not_sure", status: "review",
    source: { sourceType: "membershipApplication", sourceId: "synthetic-application" },
    membership: { tierInterest: "not_sure", monthlyComfort: "not_sure", paymentStyle: "not_sure", membershipStatus: "review" },
    project: app.project, coverUp: app.coverUp, timeline: app.timeline, readiness: app.readiness,
    estimate: { estimateLowCents: null, estimateHighCents: null, estimatedSessions: null, estimatedHours: null, hourlyRateCents: 20000 },
    mandatoryCosts: Object.fromEntries(["tattooTimeDisclosed", "suppliesDisclosed", "gstDisclosed", "depositDisclosed", "bookingFeeDisclosed", "drawingFeeDisclosed", "processingFeeDisclosed", "otherCostsDisclosed"].map(key => [key, false])),
    adminReview: { internalNotes: "Private copied review", createdBy: "staff@example.test" },
  }));
  const publicData = (await getDoc(view(db(), "projects", ref.id))).data();
  assert.equal(publicData.projectName, "Synthetic complete project");
  assert.equal(publicData.readiness, undefined);
  assert.equal(publicData.adminReview, undefined);
  assert.equal((await getDoc(ref)).data().readiness.healthDetails, "Private synthetic health details");
});

test("every text-map field rejects structured private values in direct admin projection writes", async () => {
  const names = { source: "projects", project: "projects", request: "consultRequests", coverUp: "projects", budget: "membershipApplications", timeline: "projects", membership: "projects" };
  for (const [key, name] of Object.entries(names)) {
    for (const leaf of projection.PORTAL_MAP_FIELDS[key]) {
      for (const value of [{ internalNotes: "Synthetic private nested field" }, [{ internalNotes: "Synthetic private array" }]]) {
        const data = { ...identity, [key]: { [leaf]: value } };
        await env.withSecurityRulesDisabled(async (ctx) => setDoc(source(ctx.firestore(), name, "typed-test"), data));
        await assertFails(setDoc(view(db("admin"), name, "typed-test"), data));
      }
    }
  }
});

test("public artist catalog references are preserved but arbitrary staff identifiers are not published", async () => {
  const safe = await admin.addDoc(collection(db("admin"), "projects"), { ...identity, assignedInbox: "autumn", assignedArtistId: "artist_autumn" });
  assert.equal((await getDoc(view(db(), "projects", safe.id))).data().assignedArtistId, "artist_autumn");
  const hidden = await admin.addDoc(collection(db("admin"), "projects"), { ...identity, assignedInbox: "autumn", assignedArtistId: "private-staff-auth-uid" });
  assert.equal((await getDoc(view(db(), "projects", hidden.id))).data().assignedArtistId, undefined);
  await assertFails(updateDoc(view(db("admin"), "projects", hidden.id), { assignedArtistId: "private-staff-auth-uid" }));
});

test("standalone offer drafts stay private until an explicit published-status action", async () => {
  const ref = await admin.addDoc(collection(db("admin"), "membershipOffers"), { ...identity, status: "membership_offer_draft", tier: "starter_member", adminReview: { internalNotes: "Private negotiation" } });
  assert.equal((await getDoc(view(db("admin"), "membershipOffers", ref.id))).exists(), false);
  await admin.updateDoc(ref, { status: "membership_offer_sent", sentAt: serverTimestamp() });
  assert.equal((await getDoc(view(db(), "membershipOffers", ref.id))).data().tier, "starter_member");
});

test("portal signup creates a private profile and an owned safe profile without granting admin privileges", async () => {
  const ref = portal.doc(db(), "clients", "alice");
  await assertSucceeds(portal.setDoc(ref, { ...identity, status: "portal_signup", source: "tattoo_portal_signup", ...now() }));
  assert.equal((await getDoc(ref)).data().clientName, identity.clientName);
  await assertFails(getDoc(source(db(), "clients", "alice")));
  await assertFails(setDoc(doc(db(), "adminUsers", "alice"), { active: true }));
});

test("saving unchanged legacy publication flags does not bypass the migration hold", async () => {
  await seed("projectTimeline", "legacy-visible", { ...identity, clientVisible: true, entryType: "client_update", body: "Legacy content awaiting review" }, false);
  await admin.updateDoc(source(db("admin"), "projectTimeline", "legacy-visible"), { clientVisible: true, status: "reviewed" });
  assert.equal((await getDoc(view(db("admin"), "projectTimeline", "legacy-visible"))).exists(), false);
  await seed("membershipOffers", "legacy-offer", { ...identity, status: "membership_offer_sent", tier: "starter_member" }, false);
  await admin.updateDoc(source(db("admin"), "membershipOffers", "legacy-offer"), { status: "membership_offer_sent", adminReview: { internalNotes: "Still private" } });
  assert.equal((await getDoc(view(db("admin"), "membershipOffers", "legacy-offer"))).exists(), false);
});

test("portal document overloads resolve existing references and auto IDs without remapping IDs", async () => {
  const database = db();
  for (const name of Object.keys(projection.PORTAL_FIELDS)) {
    const records = portal.collection(database, name);
    for (const id of ["existing-record", "messages"]) {
      const expected = `portalRecords/${name}/records/${id}`;
      assert.equal(portal.doc(database, name, id).path, expected);
      assert.equal(portal.doc(database, `${name}/${id}`).path, expected);
      assert.equal(portal.doc(records, id).path, expected);
    }
    const generated = portal.doc(records);
    assert.equal(generated.parent.path, records.path);
    assert.equal(generated.id.length, 20);
  }
  assert.throws(() => portal.doc(collection(database, "clients"), "alice"), /Unsupported portal record path/);
  assert.throws(() => portal.doc(database, "adminUsers", "alice"), /Unsupported portal collection/);
});

test("selected existing conversation and messages support collection-relative lookups and replies", async () => {
  await seed("conversations", "selected", { ...identity, createdAt: new Date(), updatedAt: new Date(), status: "new", lastMessagePreview: "Existing", unreadForClient: true });
  await seed("messages", "history", { clientUid: "alice", conversationId: "selected", senderRole: "admin", body: "Existing reply", createdAt: serverTimestamp() });
  await seed("conversations", "other", { clientUid: "bob" });
  const database = db();
  const conversations = await getDocs(query(portal.collection(database, "conversations"), where("clientUid", "==", "alice")));
  const selected = conversations.docs[0];
  assert.equal(selected.id, "selected");
  const ref = portal.doc(portal.collection(database, "conversations"), selected.id);
  assert.equal((await getDoc(ref)).data().clientUid, "alice");
  const messages = await getDocs(query(portal.collection(database, "messages"), where("clientUid", "==", "alice"), where("conversationId", "==", selected.id)));
  assert.deepEqual(messages.docs.map(d => d.id), ["history"]);
  assert.equal((await getDoc(portal.doc(portal.collection(database, "messages"), messages.docs[0].id))).data().body, "Existing reply");
  const reply = await portal.addDoc(portal.collection(database, "messages"), { clientUid: "alice", conversationId: ref.id, senderUid: "alice", senderRole: "client", senderName: "Synthetic Alice", body: "New reply", createdAt: serverTimestamp() });
  assert.equal((await getDoc(portal.doc(database, "messages", reply.id))).data().conversationId, selected.id);
  await assertSucceeds(portal.updateDoc(ref, { lastMessagePreview: "New reply", unreadForClient: false, unreadForAdmin: true, updatedAt: serverTimestamp() }));
  assert.equal((await getDoc(source(db("admin"), "conversations", ref.id))).data().lastMessagePreview, "New reply");
  await assertFails(getDoc(portal.doc(portal.collection(database, "conversations"), "other")));
  await assertFails(portal.updateDoc(portal.doc(portal.collection(database, "conversations"), "other"), { unreadForClient: false }));
});

test("setDoc accepts generated and fixed portal document references with matching original IDs", async () => {
  const database = db();
  const client = portal.doc(portal.collection(database, "clients"), "alice");
  await assertSucceeds(portal.setDoc(client, { ...identity, ...now() }));
  assert.equal((await getDoc(portal.doc(database, "clients", "alice"))).data().clientUid, "alice");
  const conversation = portal.doc(portal.collection(database, "conversations"));
  await assertSucceeds(portal.setDoc(conversation, { ...identity, ...now(), status: "new" }));
  assert.equal((await getDoc(source(db("admin"), "conversations", conversation.id))).exists(), true);
});

test("legacy client without projections stays private and cannot be overwritten by portal signup", async () => {
  await seed("clients", "alice", { ...identity, adminReview: { internalNotes: "Private legacy notes" } }, false);
  await seed("conversations", "legacy-thread", { ...identity, lastMessagePreview: "Unreviewed legacy content" }, false);
  const database = db();
  assert.equal((await getDoc(portal.doc(database, "clients", "alice"))).exists(), false);
  assert.equal((await getDocs(query(portal.collection(database, "conversations"), where("clientUid", "==", "alice")))).empty, true);
  await assertFails(getDoc(source(database, "clients", "alice")));
  await assertFails(portal.setDoc(portal.doc(portal.collection(database, "clients"), "alice"), { ...identity, ...now() }));
  await assertSucceeds(admin.setDoc(source(db("admin"), "clients", "alice"), { phone: "555-0100" }, { merge: true }));
  assert.equal((await getDoc(portal.doc(database, "clients", "alice"))).exists(), false);
  assert.equal((await getDoc(source(db("admin"), "clients", "alice"))).data().adminReview.internalNotes, "Private legacy notes");
});
