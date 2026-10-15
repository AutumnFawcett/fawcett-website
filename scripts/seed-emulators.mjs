import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";
import { serverFirebaseEnvironment, DEMO_PROJECT_ID } from "../lib/firebaseEnvironment.mjs";

import { PORTAL_FIELDS, portalProjection } from "../lib/portalProjection.mjs";

export async function seedEmulators() {
  const environment = serverFirebaseEnvironment(process.env);
  if (environment.mode !== "emulator") throw new Error("Seeding is emulator-only");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  const app = initializeApp({ projectId: DEMO_PROJECT_ID }, `seed-${Date.now()}`);
  try {
    const auth = getAuth(app), db = getFirestore(app);
    for (const [uid, email, displayName] of [
      ["synthetic-admin", "admin@example.test", "Synthetic Admin"],
      ["synthetic-client", "client@example.test", "Synthetic Client"],
    ]) {
      try { await auth.getUser(uid); }
      catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
        await auth.createUser({ uid, email, displayName, emailVerified: true, password: "Synthetic-only-123!" });
      }
    }
    const now = Timestamp.now();
    const identity = { clientUid: "synthetic-client", clientName: "Synthetic Client", clientEmail: "client@example.test", phone: "555-0100", instagram: "", createdAt: now, updatedAt: now };
    const records = {
      "adminUsers/synthetic-admin": { active: true },
      "clients/synthetic-client": { ...identity, status: "lead", source: "synthetic_emulator" },
      "consultRequests/synthetic-consult": { ...identity, preferredContactMethod: "email", preferredArtist: "not_sure", assignedInbox: "general", assignedArtistId: null, status: "new", request: { tattooIdea: "Synthetic botanical design", projectType: "other", placement: "Arm", bodySide: "left", approximateSize: "Small", colourPreference: "black_and_grey", styleDirection: "Botanical", budgetRange: "Synthetic budget", availability: "Weekdays", referenceLinks: "" }, coverUp: { isCoverUp: "no", coverUpDescription: "" }, timeline: { timeline: "planning_ahead", isUrgent: "no" }, readiness: { healthNotes: "" }, acknowledgements: { acknowledgementAccurate: true, acknowledgementNoGuarantee: true, acknowledgementPolicy: true } },
      "membershipApplications/synthetic-application": { ...identity, programName: "Tattoo Project Membership Program", applicationType: "founding_member_interest", preferredContactMethod: "email", preferredArtist: "not_sure", status: "new", project: { projectType: "other", tattooIdea: "Synthetic botanical project", colourPreference: "black_and_grey", placement: "Arm", bodySide: "left", sizeCategory: "palm_sized", detailLevel: "moderate" }, coverUp: { isCoverUp: "no", coverUpDescription: "" }, budget: { tierInterest: "not_sure", monthlyComfort: "not_sure", paymentStyle: "not_sure" }, timeline: { planningTimeline: "planning_ahead", completionWindow: "artist_estimate", availability: "Weekdays" }, readiness: { readyForConsult: "yes", healthConsiderations: "no", healthDetails: "" }, acknowledgements: Object.fromEntries(["applicationOnly", "noPaymentCollected", "noGuarantee", "notInvestmentLoanDiscount", "mandatoryCostsBeforeEnrollment", "termsBeforeEnrollment", "studioPolicy", "informationAccurate", "contactPermission"].map((key) => [key, true])) },
      "conversations/synthetic-conversation": { ...identity, sourceType: "consultRequest", sourceId: "synthetic-consult", consultRequestId: "synthetic-consult", applicationId: null, assignedInbox: "general", status: "new", subject: "Synthetic consultation", lastMessagePreview: "Synthetic message", lastMessageAt: now, unreadForAdmin: true, unreadForClient: false },
      "messages/synthetic-message": { clientUid: identity.clientUid, conversationId: "synthetic-conversation", consultRequestId: "synthetic-consult", senderUid: identity.clientUid, senderRole: "client", senderName: identity.clientName, body: "Synthetic message for local testing only", createdAt: now },
    };
    const batch = db.batch();
    for (const [path, value] of Object.entries(records)) {
      batch.set(db.doc(path), value);
      const [name, id] = path.split("/");
      if (PORTAL_FIELDS[name]) {
        const projection = portalProjection(name, value);
        if (projection) batch.set(db.doc(`portalRecords/${name}/records/${id}`), projection);
      }
    }
    await batch.commit();
    return Object.keys(records);
  } finally { await deleteApp(app); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seedEmulators();
  console.log("Seeded only fixed synthetic records in demo-fawcett-dev emulators.");
}
