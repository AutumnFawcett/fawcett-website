import { NAMESPACE_VERSION } from "./namespaces.mjs";
import { requireValue } from "../lib/migration/model.mjs";
const count = (rows, key) => rows.filter(row => row.classification === key).length;
// Explicit output allowlists: never spread an inventory, error, path, UID, hash,
// source content or arbitrary reason string into a shareable summary.
export function inventorySummary(snapshot) {
  requireValue(snapshot?.discovery?.version === NAMESPACE_VERSION && snapshot.discovery.complete === true, "complete_inventory_required");
  const nodes = snapshot.discovery.nodes;
  return { schemaVersion: 1, kind: "inventory_aggregate", namespaceVersion: NAMESPACE_VERSION, syntheticOnly: true,
    complete: true, frozen: snapshot.frozen === true, documents: nodes.filter(n => n.exists).length,
    destinationsPendingReview: count(nodes, "destination_review"), reviewCandidates: count(nodes, "review_candidate"), privateOnly: count(nodes, "private_only"), withheld: count(nodes, "withheld"),
    conflictingRecords: count(nodes, "conflicting"), missingParents: count(nodes, "missing_parent"), unrecognized: count(nodes, "unrecognized"),
    conflicts: snapshot.discovery.issues.length, destinations: snapshot.destinations.length,
    stopped: snapshot.discovery.issues.length > 0 || snapshot.unrecognizedRoots.length > 0 };
}
export function reconciliationSummary(report) {
  const keys = ["eligible", "withheld", "error", "created", "already_committed", "withdrawn", "already_withdrawn", "pending"];
  requireValue(report?.counts && keys.every(k => Number.isSafeInteger(report.counts[k]) && report.counts[k] >= 0), "invalid_reconciliation_report");
  return { schemaVersion: 1, kind: "reconciliation_aggregate", syntheticOnly: true,
    counts: Object.fromEntries(keys.map(k => [k, report.counts[k]])), stopped: report.stopped === true || report.counts.error > 0 };
}
