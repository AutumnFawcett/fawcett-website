import "../financial-commands/local-network.mjs";
import {createLocalFinancialDependencies} from "../../lib/financial-security/runtime.mjs";
import {sealSyntheticRecords} from "../financial-commands/security-fixture.mjs";
import { createFirestoreLedger, evidencePath, policyPath } from "../../lib/ledger/server/firestore.mjs";

export const PROJECT = "demo-fawcett-ledger";
export function emulatorDatabase() {
  // Fail closed before constructing a client; never use ADC or a real project.
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8087"
    || process.env.GCLOUD_PROJECT !== PROJECT || process.env.GOOGLE_CLOUD_PROJECT !== PROJECT) {
    throw Error("local_demo_emulator_required");
  }
  return createLocalFinancialDependencies({requireAuth:false}).db;
}
export const policy = { schemaVersion: 1, id: "terms", version: 1, status: "approved", currency: "CAD", depositScope: "project",
  purchasedExpiry: "never", cancellationCredit: "retain", supplyFees: "separate", promotionUse: "explicit", disputeFreeze: "remaining_funding_lot" };
export const scopeFor = name => ({ clientId: `synthetic_${name}`, environment: "sandbox" });
export const principal = Object.freeze({ session: "synthetic_trusted_session" });
export const operation = (type, patch = {}) => ({ id: `${type}_1`, type, policyId: "terms", policyVersion: 1, expectedRevision: null, ...patch });
export const receive = (patch = {}) => operation("receive", { lotId: "lot_1", purpose: "project_deposit", paymentEvidenceId: "evidence_1", requestId: "request_1", ...patch });
export const redeem = (patch = {}) => operation("redeem", { lotId: "lot_1", projectId: "project_1", appointmentId: "appointment_1", amountCents: 20000, purpose: "tattoo_service", creditType: "purchased", ...patch });
export function ledger(db, scope, database = db) {
  return createFirestoreLedger({ db: database, authorize: async (identity, action) => {
    if (identity !== principal || action.clientId !== scope.clientId || action.environment !== scope.environment) throw Error("unauthorized");
    return { actorId: "synthetic_admin", authorizationEvidenceId: "synthetic_auth_receipt" };
  }, clock: () => "2026-11-02T00:00:00.000Z" });
}
export async function seed(db, scope, paymentPatch = {}, requestPatch = {}) {
  const payment = { schemaVersion: 1, id: "provider_1", environment: "sandbox", currency: "CAD", provider: "square", merchantId: "merchant_1",
    paymentId: `payment_${scope.clientId}`, orderId: "order_1", locationId: "location_1", requestId: "request_1", clientId: scope.clientId,
    projectId: "project_1", amountCents: 30000, status: "COMPLETED", sourceType: "CARD", readbackVerified: true,
    verificationVersion: 1, evidenceId: "evidence_1", ...paymentPatch };
  const request = { schemaVersion: 1, id: "request_1", environment: "sandbox", currency: "CAD", clientId: scope.clientId, projectId: "project_1",
    appointmentId: null, projectApproved: true, purpose: "project_deposit", amountCents: 30000, policyId: "terms", policyVersion: 1, status: "open", ...requestPatch };
  const batch = db.batch();
  batch.set(db.doc(policyPath("sandbox", "terms", 1)), policy);
  batch.set(db.doc(evidencePath(scope, "payments", "evidence_1")), payment);
  batch.set(db.doc(evidencePath(scope, "requests", "request_1")), request);
  await batch.commit();
  await sealSyntheticRecords(db,[policyPath("sandbox","terms",1),evidencePath(scope,"payments","evidence_1"),evidencePath(scope,"requests","request_1")]);
  return payment;
}
