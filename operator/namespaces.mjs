import { COLLECTIONS } from "../lib/migration/model.mjs";
export const NAMESPACE_VERSION = "launch-namespaces-v1";
export const SOURCE_ROOTS = Object.freeze([...COLLECTIONS,
  "adminUsers", "paymentOrders", "paymentTransactions", "paymentWebhookEvents", "founderProfiles", "founderContributions", "founderCounters", "paymentCheckoutRequests", "paymentCheckoutRateLimits",
  "studioConsultAssociations", "studioClientDuplicateLocks", "studioPayments", "studioPaymentRequests", "studioPaymentReferenceLocks", "studioPaymentRateLimits", "studioVerifiedAccountLinks", "studioProjectAssociations",
  "schedulingConfig", "schedulingControls", "schedulingRequests", "scheduleReservations", "scheduleLegacySnapshots", "schedulingPolicyAudit", "schedulingHolidayPolicies",
  "authVerificationRateLimits", "adminConversationReceipts", "notificationConfiguration", "notificationScanCursors", "notificationMessageReceipts", "notificationQueue", "notificationWebhookEvents", "notificationSuppressions", "migrationRuns"]);
export const TECHNICAL_ROOTS = ["portalRecords", "publicationRecords", "operatorRuns", "migrationOperatorAuthorizations", "systemControls", "portalSubmissions"];
export const ALL_ROOTS = [...SOURCE_ROOTS, ...TECHNICAL_ROOTS];
const projected = name => COLLECTIONS.includes(name) && name !== "studioClients";
export function knownCollection(path) {
  const p = path.split("/");
  if (p.length === 1) return ALL_ROOTS.includes(p[0]);
  if (p.length === 3) {
    if (["portalRecords", "publicationRecords"].includes(p[0])) return projected(p[1]) && p[2] === "records";
    if (["operatorRuns", "migrationRuns"].includes(p[0])) return p[2] === "records";
    if (p[0] === "portalSubmissions") return p[2] === "requests";
    return ({ studioClients: "audit", studioPayments: "audit", paymentOrders: "audit", appointments: "scheduleAudit", schedulingHolidayPolicies: "audit" })[p[0]] === p[2];
  }
  return p.length === 5 && p[0] === "publicationRecords" && projected(p[1]) && p[2] === "records" && p[4] === "history";
}
export const containerPath = path => {
  const p = path.split("/");
  return p.length === 2 && (["portalRecords", "publicationRecords"].includes(p[0]) && projected(p[1]) || p[0] === "portalSubmissions");
};
// Grants and run journals have independent authorization/version checks. Only the
// approved top-level destinations may change during apply/withdraw.
export function frozenDiscovery(nodes, runId) {
  return nodes.filter(n => n.path !== "systemControls/writeFence"
    && n.path.split("/")[0] !== "migrationOperatorAuthorizations"
    && !(n.path === `operatorRuns/${runId}` || n.path.startsWith(`operatorRuns/${runId}/`))
    && !(!n.exists && containerPath(n.path))
    && !(n.path.split("/").length === 4 && ["portalRecords", "publicationRecords"].includes(n.path.split("/")[0])));
}
