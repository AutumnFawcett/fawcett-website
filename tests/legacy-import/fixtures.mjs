import { digest, sourceKey, recordSetHash } from "../../lib/ledger/import/manifest.mjs";
export const policy = { id: "synthetic_terms", version: 1, contentHash: digest("synthetic accepted terms"), acceptanceEvidenceId: "synthetic_acceptance" };
export const allocation = (amountCents = 30000, patch = {}) => ({ id: "allocation_1", kind: "tattoo_credit", amountCents,
  projectId: "project_1", artistId: "artist_1", appointmentId: null, policy: structuredClone(policy), ...patch });
export const row = (patch = {}) => ({ source: { projectId: "synthetic_production", collection: "payments", id: "payment_1", recordHash: digest("synthetic_record_1") },
  environment: "production", kind: "receipt", originalClientUid: "client_1", resolvedClientUid: "client_1", emailKey: digest("synthetic_identity_1"), identityEvidenceId: "identity_1",
  amountCents: 30000, currency: "CAD", status: "paid", originalTimestamp: "2026-10-01T12:00:00.000Z", timestampBasis: "manual",
  method: "cash", paymentType: "membership_monthly_payment", creditEffect: "add", projectId: "project_1", artistId: "artist_1", appointmentId: null,
  provider: null, manualEvidenceId: "synthetic_cash_receipt", adjustmentApprovalId: null, relatedSourceKey: null, mirrorOf: null, mirrorApprovalId: null,
  allocations: [allocation()], ...patch });
export const provider = (patch = {}) => ({ name: "square", merchantId: "synthetic_merchant", paymentId: "synthetic_payment", environment: "production",
  status: "COMPLETED", sourceType: "CARD", externalDetailsPresent: false, verification: "readback_verified", evidenceId: "synthetic_readback",
  readbackHash: digest("synthetic_readback"), clientUid: "client_1", amountCents: 30000, currency: "CAD", ...patch });
export const manifest = (records = [row()], patch = {}) => ({ schemaVersion: 1, mode: "shadow_only", environment: "production", cutoffAt: "2026-11-01T00:00:00.000Z",
  snapshot: { id: "synthetic_snapshot", capturedAt: "2026-11-01T00:00:00.000Z", recordCount: records.length, recordSetHash: recordSetHash(records), complete: true, coverageEvidenceId: "synthetic_coverage_review" },
  sourceProjects: [{ projectId: "synthetic_production", environment: "production", evidenceId: "source_attestation" }, { projectId: "synthetic_sandbox", environment: "sandbox", evidenceId: "sandbox_attestation" }],
  records, identities: [{ uid: "client_1", emailKey: digest("synthetic_identity_1"), evidenceId: "identity_1" }],
  projects: [{ id: "project_1", clientUid: "client_1", artistId: "artist_1" }], appointments: [], strategies: [{ clientUid: "client_1", mode: "opening_balance" }],
  existingImports: [], existingAccounts: [], observations: [{ clientUid: "client_1", creditPageCents: 30000, adminLedgerCents: 30000, dashboardCents: 0 }], exclusions: [], ...patch });
export const source = (id, collection = "payments", projectId = "synthetic_production") => ({ projectId, collection, id, recordHash: digest(["synthetic",id,collection]) });
export const usage = (amount = 10000, patch = {}) => row({ source: source("use_1"), kind: "credit_use", method: "in_studio_credit", paymentType: "tattoo_session_payment",
  creditEffect: "use", manualEvidenceId: "synthetic_service_event", amountCents: amount, relatedSourceKey: sourceKey(row()), originalTimestamp: "2026-10-02T12:00:00.000Z", allocations: [allocation(amount)], ...patch });
