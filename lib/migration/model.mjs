import { createHash } from "node:crypto";
import { PORTAL_FIELDS, PORTAL_MAP_FIELDS, portalProjection } from "../portalProjection.mjs";
import { DEMO_PROJECT_ID, serverFirebaseEnvironment } from "../firebaseEnvironment.mjs";
export { DEMO_PROJECT_ID };
export const COLLECTIONS = [...Object.keys(PORTAL_FIELDS), "studioClients"];
export const LINKS = { consultRequestId: "consultRequests", applicationId: "membershipApplications", conversationId: "conversations", projectId: "projects", appointmentId: "appointments", paymentId: "payments", membershipChangeRequestId: "membershipChangeRequests", membershipOfferResponseId: "membershipOfferResponses" };
const sourceTypes = { consult: "consultRequests", application: "membershipApplications", offer_response: "membershipOfferResponses", membership_request: "membershipChangeRequests", message: "messages", consultRequest: "consultRequests", membershipApplication: "membershipApplications", membershipChangeRequest: "membershipChangeRequests", membershipOfferResponse: "membershipOfferResponses" };
export function requireValue(value, code) { if (!value) throw new Error(code); }
export function assertEmulators(env = process.env) {
  requireValue(serverFirebaseEnvironment(env).mode === "emulator", "emulator_only");
  requireValue(env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" && env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099", "local_emulators_required");
  for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) requireValue(!env[key] || env[key] === DEMO_PROJECT_ID, "project_override_forbidden");
  if (env.FIREBASE_CONFIG) {
    const config = JSON.parse(env.FIREBASE_CONFIG);
    requireValue(config.projectId === DEMO_PROJECT_ID, "project_override_forbidden");
  }
}
function canonical(value) {
  if (value === null) return ["null"];
  if (typeof value === "string" || typeof value === "boolean") return [typeof value, value];
  if (typeof value === "number") {
    requireValue(Number.isFinite(value), "unsupported_source_number");
    return ["number", Object.is(value, -0) ? "-0" : value];
  }
  requireValue(value && typeof value === "object", "unsupported_source_type");
  if (typeof value.toMillis === "function" && Number.isInteger(value.seconds)) return ["timestamp", value.seconds, value.nanoseconds];
  if (Array.isArray(value)) return ["array", value.map(canonical)];
  requireValue(Object.getPrototypeOf(value) === Object.prototype, "unsupported_source_type");
  return ["map", Object.keys(value).sort().map(key => [key, canonical(value[key])])];
}
export const fingerprint = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export function sourcePath(path) {
  requireValue(typeof path === "string" && /^[A-Za-z]+\/[A-Za-z0-9_-]{1,128}$/.test(path) && Object.hasOwn(PORTAL_FIELDS, path.split("/")[0]), "unsupported_source_path");
  return path.split("/");
}
export function validateManifest(manifest) {
  requireValue(manifest && manifest.schemaVersion === 1 && manifest.projectId === DEMO_PROJECT_ID && manifest.syntheticOnly === true, "invalid_manifest_scope");
  requireValue(typeof manifest.runId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(manifest.runId), "invalid_run_id");
  requireValue(Array.isArray(manifest.approvals) && manifest.approvals.length <= 500, "invalid_approvals");
  requireValue(Object.keys(manifest).every(key => ["schemaVersion", "projectId", "syntheticOnly", "runId", "approvals"].includes(key)), "unknown_manifest_option");
  const paths = new Set();
  for (const approval of manifest.approvals) {
    requireValue(approval && typeof approval === "object" && Object.keys(approval).every(key => ["path", "clientUid", "reviewerUid", "reviewedAt", "ownerConfirmed", "contentReviewed", "sourceHash", "projectionHash"].includes(key)), "unknown_approval_option");
    sourcePath(approval.path);
    requireValue(!paths.has(approval.path), "duplicate_approval"); paths.add(approval.path);
    requireValue(typeof approval.clientUid === "string" && approval.clientUid.length > 0 && approval.ownerConfirmed === true && approval.contentReviewed === true, "explicit_review_required");
    requireValue(typeof approval.reviewerUid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(approval.reviewerUid) && typeof approval.reviewedAt === "string" && Number.isFinite(Date.parse(approval.reviewedAt)), "reviewer_required");
    requireValue(/^[a-f0-9]{64}$/.test(approval.sourceHash) && /^[a-f0-9]{64}$/.test(approval.projectionHash), "review_hash_required");
  }
  return manifest;
}
export function references(data) {
  const refs = Object.entries(LINKS).filter(([key]) => data[key] !== undefined && data[key] !== null && data[key] !== "").map(([key, collection]) => [collection, data[key]]);
  for (const context of [data, data.source]) {
    if (!context || typeof context !== "object" || !context.sourceId) continue;
    requireValue(sourceTypes[context.sourceType], "unknown_source_relationship");
    refs.push([sourceTypes[context.sourceType], context.sourceId]);
  }
  return [...new Set(refs.map(([collection, id]) => {
    const path = `${collection}/${id}`; sourcePath(path); return path;
  }))];
}
// This is a conservative tripwire, never a claim to recognize all sensitive text.
const sensitive = /\b(health|medical|medication|allerg\w*|pregnan\w*|diagnos\w*|blood\w*|confidential|internal\s+notes?|private\s+notes?|staff.only|admin.only)\b/i;
const dates = new Set(["createdAt", "updatedAt", "startAt", "endAt", "receivedAt", "lastMessageAt", "sentAt"]);
const booleans = new Set(["clientVisible", "important", "unreadForAdmin", "unreadForClient"]);
const boolMaps = new Set(["acknowledgements", "clientAcknowledgement", "mandatoryCosts"]);
const numberKeys = new Set(["durationMinutes", "estimatedSessions", "estimatedHours"]);
function validateLeaves(value, key = "", parent = "") {
  if ((!parent && Object.hasOwn(PORTAL_MAP_FIELDS, key) && key !== "source") || (key === "source" && value && typeof value === "object")) {
    requireValue(value && Object.getPrototypeOf(value) === Object.prototype, "invalid_projection_shape");
    for (const [leaf, nested] of Object.entries(value)) {
      requireValue(PORTAL_MAP_FIELDS[key].includes(leaf), "private_projection_key");
      validateLeaves(nested, leaf, key);
    }
    return;
  }
  if (dates.has(key)) { requireValue(value === null || typeof value?.toMillis === "function" && Number.isInteger(value.seconds), "invalid_timestamp"); return; }
  if (booleans.has(key) || boolMaps.has(parent)) { requireValue(typeof value === "boolean", "invalid_boolean"); return; }
  if (key.endsWith("Cents") || numberKeys.has(key)) { requireValue(typeof value === "number" && Number.isFinite(value) && (!key.endsWith("Cents") || Number.isSafeInteger(value)), "invalid_number"); return; }
  if (["amount", "paymentAmount"].includes(key) || key.endsWith("Dollars")) { requireValue(typeof value === "number" && Number.isFinite(value) || typeof value === "string" && /^-?\d+(\.\d{1,2})?$/.test(value), "ambiguous_financial_record"); return; }
  if (key.endsWith("Id") || key === "clientUid") { requireValue(value === null || typeof value === "string", "invalid_relationship_type"); return; }
  requireValue(typeof value === "string", "invalid_projection_shape");
  requireValue(!sensitive.test(value), "sensitive_projected_content");
}
export function candidateProjection(collection, data) {
  requireValue(typeof data.clientUid === "string" && data.clientUid.length > 0, "uncertain_owner");
  // Do not derive any migration text from private admin review objects.
  const publicInput = { ...data };
  delete publicInput.adminReview;
  const projection = portalProjection(collection, publicInput);
  requireValue(projection, "not_published_or_private_timeline");
  for (const [key, value] of Object.entries(projection)) validateLeaves(value, key);
  requireValue(typeof projection.senderName !== "string" || !projection.senderName.includes("@"), "staff_identifier_in_sender_name");
  if (collection === "messages") requireValue(["client", "admin"].includes(data.senderRole) && typeof data.body === "string" && data.conversationId, "uncertain_message_context");
  if (collection === "payments") requireValue(Number.isSafeInteger(data.amountCents) && /^[A-Z]{3}$/.test(data.currency), "ambiguous_financial_record");
  if (collection === "creditLedger") requireValue(Number.isSafeInteger(data.deltaCents) && /^[A-Z]{3}$/.test(data.currency), "ambiguous_financial_record");
  return projection;
}
