// Offline contracts only: no SDK, filesystem, network, credentials or posting API.
import { createHash } from "node:crypto";
import { canonical, id, cents, positiveCents, add } from "../schemas.mjs";
export const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const nullable = fn => value => value === null || fn(value);
const choice = (...values) => value => values.includes(value);
const text = value => typeof value === "string" && value.length > 0 && value.length <= 200;
const version = value => Number.isSafeInteger(value) && value > 0;
export const iso = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function object(fields, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== Object.keys(fields).length
    || !Object.entries(fields).every(([key, fn]) => Object.hasOwn(value, key) && fn(value[key]))) throw Error("invalid_import_contract");
  return structuredClone(value);
}
const matches = fields => value => { try { object(fields, value); return true; } catch { return false; } };
const list = fn => value => Array.isArray(value) && value.length <= 10000 && value.every(fn);
const environment = choice("production", "sandbox", "unknown");
const identity = matches({ uid: id, emailKey: nullable(hash), evidenceId: id });
const policy = matches({ id, version, contentHash: hash, acceptanceEvidenceId: nullable(id) });
// Original Firestore IDs are provenance, not future ledger document paths.
// Preserve valid legacy characters/length instead of rewriting them to ledger IDs.
const documentId = value => typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 1500
  && !value.includes("/") && ![".", ".."].includes(value);
const source = matches({ projectId: id, collection: documentId, id: documentId, recordHash: hash });
const provider = matches({ name: choice("square", "stripe", "other"), merchantId: nullable(id), paymentId: nullable(id),
  environment, status: choice("COMPLETED", "FAILED", "PENDING", "UNKNOWN"), sourceType: choice("CARD", "EXTERNAL", "UNKNOWN"),
  externalDetailsPresent: value => typeof value === "boolean", verification: choice("readback_verified", "manual", "unverified", "rejected"),
  evidenceId: nullable(id), readbackHash: nullable(hash), clientUid: nullable(id), amountCents: cents, currency: text });
const allocation = matches({ id, kind: choice("appointment_booking_fee", "appointment_advance", "tattoo_credit", "studio_credit", "session", "supply_fee", "other"),
  amountCents: positiveCents, projectId: nullable(id), artistId: nullable(id), appointmentId: nullable(id), policy: nullable(policy) });
const recordFields = {
  source, environment, kind: choice("receipt", "credit_use", "refund", "adjustment", "dispute", "snapshot", "context"),
  originalClientUid: nullable(text), resolvedClientUid: nullable(id), emailKey: nullable(hash), identityEvidenceId: nullable(id),
  amountCents: cents, currency: nullable(text), status: choice("paid", "partial", "refunded", "pending", "failed", "cancelled", "unknown"),
  originalTimestamp: nullable(iso), timestampBasis: choice("server", "provider", "manual", "unknown"),
  method: nullable(text), paymentType: nullable(text), creditEffect: choice("add", "use", "remove", "none"),
  projectId: nullable(id), artistId: nullable(id), appointmentId: nullable(id),
  provider: nullable(provider), manualEvidenceId: nullable(id), adjustmentApprovalId: nullable(id),
  relatedSourceKey: nullable(hash), mirrorOf: nullable(hash), mirrorApprovalId: nullable(id), allocations: list(allocation),
};
export const sourceKey = row => digest([row.source.projectId, row.source.collection, row.source.id]);
export const recordSetHash = rows => digest(rows.map(row => [sourceKey(row), row.source.recordHash]).sort((a,b) => compare(canonical(a),canonical(b))));
export const importId = row => "legacy_" + sourceKey(row);
export const providerKey = row => row.provider?.merchantId && row.provider?.paymentId
  ? digest([row.provider.environment, row.provider.name, row.provider.merchantId, row.provider.paymentId]) : null;
export function validateManifest(value) {
  const m = object({ schemaVersion: v => v === 1, mode: v => v === "shadow_only", environment: choice("production", "sandbox"), cutoffAt: iso,
    snapshot: matches({ id, capturedAt: iso, recordCount: cents, recordSetHash: hash, complete: v => typeof v === "boolean", coverageEvidenceId: nullable(id) }),
    sourceProjects: list(matches({ projectId: id, environment: choice("production", "sandbox"), evidenceId: id })),
    records: list(matches(recordFields)), identities: list(identity),
    projects: list(matches({ id, clientUid: id, artistId: nullable(id) })),
    appointments: list(matches({ id, clientUid: id, projectId: nullable(id), artistId: nullable(id) })),
    strategies: list(matches({ clientUid: id, mode: choice("opening_balance", "replay") })),
    existingImports: list(matches({ sourceKey: hash, importId: id, recordHash: hash, clientUid: id, providerKey: nullable(hash) })),
    existingAccounts: list(matches({ clientUid: id, revision: cents, purchasedCents: cents, journalIds: list(id) })),
    observations: list(matches({ clientUid: id, creditPageCents: Number.isSafeInteger, adminLedgerCents: Number.isSafeInteger, dashboardCents: Number.isSafeInteger })),
    exclusions: list(matches({ sourceKey: hash, reason: choice("historical_external_false_positive", "owner_excluded") })),
  }, value);
  // Canonicalize sets before hashing/reporting; no timestamps or random IDs added.
  for (const key of Object.keys(m)) if (Array.isArray(m[key])) {
    m[key] = m[key].map(row => {
      if (row.allocations) row.allocations.sort((a,b) => compare(a.id, b.id));
      if (row.journalIds) row.journalIds.sort();
      return row;
    }).sort((a,b) => compare(canonical(a), canonical(b)));
  }
  return m;
}
export function allocationTotal(row) { return row.allocations.reduce((total, a) => add(total, a.amountCents), 0); }
export const purchased = kind => ["appointment_booking_fee", "appointment_advance", "tattoo_credit", "studio_credit"].includes(kind);
export const bucketKey = allocation => digest([allocation.kind, allocation.projectId, allocation.artistId,
  allocation.appointmentId, allocation.policy]);
