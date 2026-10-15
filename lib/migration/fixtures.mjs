import { Timestamp } from "firebase-admin/firestore";
import { assertRuntime } from "./runtime.mjs";
import { candidateProjection, DEMO_PROJECT_ID, fingerprint, requireValue, validateManifest } from "./model.mjs";
export const REVIEWER = "rehearsal-admin", OWNER = "rehearsal-alice";
export function syntheticSources() {
  const at = new Timestamp(1700000000, 123456000);
  const own = { clientUid: OWNER, clientName: "Synthetic Rehearsal Alice", clientEmail: "rehearsal-alice@example.test", createdAt: at, updatedAt: at };
  return {
    [`clients/${OWNER}`]: { ...own, status: "lead", phone: "555-0100", adminReview: { internalNotes: "Private synthetic notes" }, stats: { consultCount: 1 } },
    "consultRequests/rehearsal-consult": { ...own, status: "new", projectId: "rehearsal-project", conversationId: "rehearsal-conversation", request: { tattooIdea: "Synthetic botanical design", placement: "Arm", referenceLinks: "" }, readiness: { healthNotes: "Synthetic medical history" }, adminReview: { internalNotes: "Private synthetic review" } },
    "membershipApplications/rehearsal-application": { ...own, status: "new", project: { tattooIdea: "Synthetic floral design" }, readiness: { healthDetails: "Synthetic allergy" }, membershipOffer: { offerStatus: "membership_offer_draft", clientMessage: "Private draft" } },
    "conversations/rehearsal-conversation": { ...own, consultRequestId: "rehearsal-consult", applicationId: null, sourceType: "consultRequest", sourceId: "rehearsal-consult", subject: "Synthetic consultation", lastMessagePreview: "Approved synthetic reply", lastMessageAt: at, unreadForAdmin: false, unreadForClient: true },
    "messages/rehearsal-message": { clientUid: OWNER, conversationId: "rehearsal-conversation", consultRequestId: "rehearsal-consult", senderRole: "admin", senderUid: REVIEWER, senderName: "Studio", body: "Your synthetic design is ready to review.", createdAt: at, adminReview: { internalNotes: "Private synthetic review" } },
    "projects/rehearsal-project": { ...own, consultRequestId: "rehearsal-consult", applicationId: "rehearsal-application", projectName: "Synthetic botanical project", status: "active", source: { sourceType: "consultRequest", sourceId: "rehearsal-consult" }, estimate: { estimateLowCents: 25000, updatedAt: at, updatedBy: REVIEWER }, adminReview: { internalNotes: "Private synthetic plan", clientProjectSummary: "Do not automatically publish review-derived text" }, readiness: { healthNotes: "Synthetic medical details" } },
    "appointments/rehearsal-appointment": { ...own, projectId: "rehearsal-project", title: "Synthetic appointment", status: "booked", startAt: at, endAt: new Timestamp(at.seconds + 3600, at.nanoseconds), clientVisibleNotes: "Bring reference drawings.", internalNotes: "Private synthetic scheduling note" },
    "payments/rehearsal-payment": { ...own, projectId: "rehearsal-project", appointmentId: "rehearsal-appointment", amountCents: 12345, amount: "123.45", paymentAmount: "123.45", amountDisplay: "123.45", currency: "CAD", status: "received", receivedAt: at, reference: "PRIVATE_SYNTHETIC_REFERENCE" },
    "creditLedger/rehearsal-credit": { ...own, paymentId: "rehearsal-payment", projectId: "rehearsal-project", deltaCents: -2345, currency: "CAD", entryType: "usage", description: "Synthetic credit movement", reference: "PRIVATE_SYNTHETIC_LEDGER" },
    "membershipOffers/rehearsal-offer": { ...own, applicationId: "rehearsal-application", offerStatus: "membership_offer_sent", initialPaymentCents: 10000, monthlyPaymentCents: 5000, termsSummary: "Synthetic published terms", updatedBy: REVIEWER },
    "membershipOfferResponses/rehearsal-response": { clientUid: OWNER, applicationId: "rehearsal-application", responseType: "interested", responseStatus: "new", clientNote: "Synthetic response", createdAt: at },
    "membershipChangeRequests/rehearsal-change": { ...own, requestType: "pause", requestStatus: "new", reason: "Synthetic schedule change", clientAcknowledgement: { understandsThisIsARequest: true } },
    "projectTimeline/rehearsal-timeline": { ...own, projectId: "rehearsal-project", entryType: "client_update", clientVisible: true, body: "Synthetic sketch complete", createdBy: REVIEWER },
    "messages/rehearsal-sensitive-message": { clientUid: OWNER, conversationId: "rehearsal-conversation", consultRequestId: "rehearsal-consult", senderRole: "client", senderName: "Alice", body: "Health / Notes: synthetic medication and allergy details", createdAt: at },
    "conversations/rehearsal-sensitive-preview": { ...own, subject: "Synthetic consultation", lastMessagePreview: "Medical details for internal notes" },
    "projects/rehearsal-orphan": { projectName: "Synthetic orphan", createdAt: at },
    "projects/rehearsal-cross-owner": { ...own, consultRequestId: "rehearsal-bob-consult", projectName: "Synthetic disputed link" },
    "consultRequests/rehearsal-bob-consult": { ...own, clientUid: "rehearsal-bob", clientName: "Synthetic Bob", clientEmail: "rehearsal-bob@example.test" },
    "projectTimeline/rehearsal-health-timeline": { ...own, projectId: "rehearsal-project", clientVisible: true, entryType: "health_skin_note", body: "Synthetic health note" },
    "membershipOffers/rehearsal-draft": { ...own, offerStatus: "membership_offer_draft", clientMessage: "Synthetic draft" },
    "payments/rehearsal-ambiguous-payment": { ...own, amount: "unknown", status: "received" },
    "studioClients/rehearsal-studio": { name: "Synthetic walk-in", email: "walkin@example.test", phone: "555-0101", instagram: "", preferredArtist: "ben", status: "lead", studioNotes: "Private synthetic studio note", revision: 1, createdAt: at, updatedAt: at },
  };
}
export const APPROVED_PATHS = Object.keys(syntheticSources()).slice(0, 13);
export async function seedSyntheticRehearsal(runtime, confirmation) {
  assertRuntime(runtime); requireValue(confirmation === "SYNTHETIC_ONLY", "seed_confirmation_required");
  for (const uid of [REVIEWER, OWNER, "rehearsal-bob"]) {
    try { await runtime.auth.getUser(uid); }
    catch (e) { if (e.code !== "auth/user-not-found") throw e; await runtime.auth.createUser({ uid, email: `${uid}@example.test`, password: "Synthetic-only-123!", emailVerified: true }); }
  }
  for (const [path, data] of Object.entries({ [`adminUsers/${REVIEWER}`]: { active: true }, ...syntheticSources() })) {
    const ref = runtime.firestore.doc(path);
    const snap = await ref.get();
    requireValue(!snap.exists || fingerprint(snap.data()) === fingerprint(data), "synthetic_fixture_conflict");
    if (!snap.exists) await ref.create(data);
  }
  return { syntheticOnly: true, sourceRecords: Object.keys(syntheticSources()).length };
}
// This generates approvals ONLY for exact, checked-in, known synthetic fixtures.
// There is deliberately no generic approve-all inventory operation.
export async function syntheticManifest(runtime, runId, confirmation) {
  assertRuntime(runtime); requireValue(confirmation === "SYNTHETIC_ONLY", "sample_confirmation_required");
  const fixtures = syntheticSources(), approvals = [];
  for (const path of APPROVED_PATHS) {
    const source = await runtime.firestore.doc(path).get();
    requireValue(source.exists && fingerprint(source.data()) === fingerprint(fixtures[path]), "synthetic_fixture_conflict");
    const projection = candidateProjection(path.split("/")[0], source.data());
    approvals.push({ path, clientUid: OWNER, reviewerUid: REVIEWER, reviewedAt: "2026-01-01T00:00:00Z", ownerConfirmed: true, contentReviewed: true, sourceHash: fingerprint(source.data()), projectionHash: fingerprint(projection) });
  }
  return validateManifest({ schemaVersion: 1, projectId: DEMO_PROJECT_ID, syntheticOnly: true, runId, approvals });
}
