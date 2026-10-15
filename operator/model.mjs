import { fingerprint, sourcePath, candidateProjection, requireValue } from "../lib/migration/model.mjs";
import { portalProjection } from "../lib/portalProjection.mjs";
import { IDENTITY, SOURCE_ROOTS } from "./runtime.mjs";
export const OPERATOR_VERSION = "phase6b-v1";
export const REQUIRED_KEYS = ["clientUid", "conversationId", "projectId", "applicationId", "consultRequestId", "membershipChangeRequestId", "membershipOfferResponseId", "appointmentId", "paymentId", "source", "sourceId", "sourceType", "clientVisible", "entryType"];
export const safeReason = error => /^[a-z][a-z0-9_]+$/.test(error.message) ? error.message : "operator_assessment_failed";
export const viewPath = path => { const [name, id] = sourcePath(path); return `portalRecords/${name}/records/${id}`; };
export const policyPath = path => { const [name, id] = sourcePath(path); return `publicationRecords/${name}/records/${id}`; };
export const journalPath = (manifest, path) => `operatorRuns/${manifest.runId}/records/${fingerprint(path)}`;
export function exactKeys(value, keys) { requireValue(value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), "unexpected_schema_keys"); }
export function identifier(value) { requireValue(typeof value === "string" && value.length > 0 && value.length <= 80 && !/[^A-Za-z0-9_-]/.test(value), "invalid_identifier"); return value; }
export function digest(value) { requireValue(typeof value === "string" && value.length === 64 && !/[^a-f0-9]/.test(value), "invalid_digest"); }
export function candidate(name, original, fields) {
  requireValue(Array.isArray(fields) && fields.length > 0 && new Set(fields).size === fields.length && fields.every(key => typeof key === "string"), "explicit_field_selection_required");
  const available = portalProjection(name, original);
  requireValue(available && fields.every(key => Object.hasOwn(available, key)), "private_or_unknown_candidate_field");
  requireValue(REQUIRED_KEYS.every(key => !(key in available) || fields.includes(key)), "relationship_field_required");
  const chosen = Object.fromEntries(fields.map(key => [key, available[key]]));
  candidateProjection(name, chosen); // Conservative type/content tripwires, never automatic approval.
  return chosen;
}
export function sealManifest(value) {
  // Manifests contain JSON metadata/hashes/field selections, never SDK values or
  // content. Copy before async work so a caller cannot mutate the reviewed scope.
  const copy = JSON.parse(JSON.stringify(value));
  function freeze(item) { if (item && typeof item === "object") { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } return item; }
  return freeze(copy);
}
export function validateInventory(snapshot, requireFrozen = true) {
  exactKeys(snapshot, ["schemaVersion", "syntheticOnly", "adapterVersion", "identity", "frozen", "fence", "roots", "unrecognizedRoots", "records", "destinations", "snapshotHash"]);
  requireValue(snapshot.schemaVersion === 1 && snapshot.syntheticOnly === true && snapshot.adapterVersion === OPERATOR_VERSION && fingerprint(snapshot.identity) === fingerprint(IDENTITY), "invalid_inventory_scope");
  requireValue(!requireFrozen || snapshot.frozen === true && snapshot.fence, "frozen_inventory_required");
  requireValue(Array.isArray(snapshot.unrecognizedRoots) && snapshot.unrecognizedRoots.length === 0, "unrecognized_collections_require_scope_review");
  const { snapshotHash, ...body } = snapshot; digest(snapshotHash); requireValue(fingerprint(body) === snapshotHash, "inventory_digest_changed");
  const version = item => {
    exactKeys(item, ["seconds", "nanoseconds"]);
    requireValue(Number.isSafeInteger(item.seconds) && Number.isInteger(item.nanoseconds) && item.nanoseconds >= 0 && item.nanoseconds < 1e9, "invalid_inventory_timestamp");
  };
  if (snapshot.fence) { exactKeys(snapshot.fence, ["epoch", "controlHash", "version"]); identifier(snapshot.fence.epoch); digest(snapshot.fence.controlHash); version(snapshot.fence.version); }
  requireValue(Array.isArray(snapshot.roots) && new Set(snapshot.roots).size === snapshot.roots.length && snapshot.roots.every(root => SOURCE_ROOTS.includes(root) || root === "systemControls"), "invalid_inventory_roots");
  requireValue(Array.isArray(snapshot.records) && snapshot.records.length <= 5000 && new Set(snapshot.records.map(row => row.path)).size === snapshot.records.length, "invalid_inventory_records");
  for (const row of snapshot.records) {
    exactKeys(row, ["path", "sourceHash", "version", "disposition", "children"]);
    requireValue(typeof row.path === "string" && row.path.split("/").length === 2 && SOURCE_ROOTS.includes(row.path.split("/")[0]), "invalid_inventory_source_path");
    requireValue(["supported", "unsupported_type", "unexpanded_subcollections", "studio_private", "private_business_record"].includes(row.disposition) && Array.isArray(row.children) && row.children.every(child => typeof child === "string"), "invalid_source_disposition");
    if (row.sourceHash !== null) digest(row.sourceHash);
    exactKeys(row.version, ["created", "updated"]); version(row.version.created); version(row.version.updated);
  }
  requireValue(snapshot.records.every(row => row.children.length === 0), "unexpanded_subcollections_require_scope_review");
  requireValue(Array.isArray(snapshot.destinations) && snapshot.destinations.length <= 10000 && new Set(snapshot.destinations.map(row => row.path)).size === snapshot.destinations.length, "invalid_destination_inventory");
  for (const row of snapshot.destinations) {
    exactKeys(row, ["path", "hash", "version"]);
    const [root, name, records, id, extra] = row.path.split("/");
    requireValue(["portalRecords", "publicationRecords"].includes(root) && records === "records" && !extra, "invalid_destination_path"); sourcePath(`${name}/${id}`);
    if (row.hash !== null) digest(row.hash);
    exactKeys(row.version, ["created", "updated"]); version(row.version.created); version(row.version.updated);
  }
  return snapshot;
}
export function validateManifest(manifest) {
  exactKeys(manifest, ["schemaVersion", "syntheticOnly", "adapterVersion", "identity", "runId", "inventory", "evidence", "decisions"]);
  requireValue(manifest.schemaVersion === 2 && manifest.syntheticOnly === true && manifest.adapterVersion === OPERATOR_VERSION && fingerprint(manifest.identity) === fingerprint(IDENTITY), "invalid_operator_manifest_scope");
  identifier(manifest.runId);
  exactKeys(manifest.evidence, ["ownerUid", "reviewerUid", "operatorUid", "backupEvidenceId", "writerShutdownEvidenceId", "callbackReplayEvidenceId", "appCommit", "rulesHash", "reviewedAt", "expiresAt"]);
  const e = manifest.evidence;
  for (const key of ["ownerUid", "reviewerUid", "operatorUid", "backupEvidenceId", "writerShutdownEvidenceId", "callbackReplayEvidenceId"]) identifier(e[key]);
  requireValue(new Set([e.ownerUid, e.reviewerUid, e.operatorUid]).size === 3, "independent_operator_owner_reviewer_required");
  requireValue(typeof e.appCommit === "string" && e.appCommit.length === 40 && /^[a-f0-9]{40}$/.test(e.appCommit), "reviewed_commit_required"); digest(e.rulesHash);
  requireValue(Number.isSafeInteger(e.reviewedAt) && Number.isSafeInteger(e.expiresAt) && e.expiresAt > e.reviewedAt && e.expiresAt - e.reviewedAt <= 86400000, "bounded_review_lifetime_required");
  validateInventory(manifest.inventory);
  requireValue(Array.isArray(manifest.decisions) && manifest.decisions.length === manifest.inventory.records.length && manifest.decisions.length <= 5000, "complete_decisions_required");
  const paths = new Set();
  for (const decision of manifest.decisions) {
    requireValue(decision && !paths.has(decision.path), "duplicate_decision"); paths.add(decision.path);
    const row = manifest.inventory.records.find(row => row.path === decision.path);
    requireValue(row && decision.sourceHash === row.sourceHash, "decision_inventory_mismatch");
    if (decision.state === "withheld") {
      exactKeys(decision, ["path", "sourceHash", "state", "reason"]); identifier(decision.reason);
    } else {
      exactKeys(decision, ["path", "sourceHash", "state", "fields", "candidateHash", "clientUid", "accountHash", "ownerConfirmed", "contentReviewed", "reviewerUid"]);
      sourcePath(decision.path); requireValue(decision.state === "approved" && decision.ownerConfirmed === true && decision.contentReviewed === true && decision.reviewerUid === e.reviewerUid && typeof decision.clientUid === "string" && decision.clientUid.length > 0, "explicit_human_review_required");
      requireValue(row.disposition === "supported" && Array.isArray(decision.fields), "unsupported_source_withheld"); digest(decision.candidateHash); digest(decision.accountHash);
    }
  }
  const approvedCount = manifest.decisions.filter(d => d.state === "approved").length;
  requireValue(approvedCount > 0 && approvedCount <= 500, "explicit_nonempty_approval_scope_required");
  return manifest;
}
