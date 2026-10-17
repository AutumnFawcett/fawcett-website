export const VERSION = "two-project-audit-v1";
export const PROJECTS = Object.freeze([
  Object.freeze({ projectId: "fawcett-website", projectNumber: "723963949221", database: "(default)", region: "nam5" }),
  Object.freeze({ projectId: "fawcett-website-sandbox", projectNumber: "625305990122", database: "(default)", region: "nam5" })
]);
export const ROOTS = Object.freeze(["clients", "consultRequests", "membershipApplications", "conversations", "messages", "projects", "appointments", "payments", "creditLedger", "membershipOffers", "membershipOfferResponses", "membershipChangeRequests", "projectTimeline", "studioClients", "adminUsers", "paymentOrders", "paymentTransactions", "paymentWebhookEvents", "founderProfiles", "founderContributions", "founderCounters", "paymentCheckoutRequests", "paymentCheckoutRateLimits", "studioConsultAssociations", "studioClientDuplicateLocks", "studioPayments", "studioPaymentRequests", "studioPaymentReferenceLocks", "studioPaymentRateLimits", "studioVerifiedAccountLinks", "studioProjectAssociations", "schedulingConfig", "schedulingControls", "schedulingRequests", "scheduleReservations", "scheduleLegacySnapshots", "schedulingPolicyAudit", "schedulingHolidayPolicies", "authVerificationRateLimits", "adminConversationReceipts", "notificationConfiguration", "notificationScanCursors", "notificationMessageReceipts", "notificationQueue", "notificationWebhookEvents", "notificationSuppressions", "migrationRuns", "operatorRuns", "migrationOperatorAuthorizations", "portalRecords", "publicationRecords", "portalSubmissions", "systemControls"]);
export const CRM = Object.freeze(["clients", "consultRequests", "membershipApplications", "conversations", "messages", "projects", "appointments", "payments", "creditLedger", "membershipOffers", "membershipOfferResponses", "membershipChangeRequests", "projectTimeline"]);
export const LINKS = Object.freeze({ consultRequestId: "consultRequests", applicationId: "membershipApplications", conversationId: "conversations", projectId: "projects", appointmentId: "appointments", paymentId: "payments", membershipChangeRequestId: "membershipChangeRequests", membershipOfferResponseId: "membershipOfferResponses", studioClientId: "studioClients", orderId: "paymentOrders", parentTransactionId: "paymentTransactions", transactionId: "paymentTransactions", profileId: "founderProfiles" });
// No names, bodies, health fields, notes, reference URLs, credential hashes or amounts
// in output. These masks minimize the data read; selected identities/amounts remain
// transiently in memory for comparisons only.
export const MASK = Object.freeze(["clientUid", "clientId", ...Object.keys(LINKS), "source.sourceId", "source.sourceType", "sourceId", "sourceType", "provider", "environment", "providerOrderId", "providerPaymentId", "providerTransactionId", "providerRefundId", "providerDisputeId", "type", "amountCents", "deltaCents", "currency"]);
export function check(value) { if (!value) throw new AuditError(); }
export class AuditError extends Error { constructor() { super("AUDIT_INCOMPLETE"); } }
export function collectionClass(path) {
  const p = path.split("/");
  if (p.length === 1) { check(ROOTS.includes(p[0])); return p[0]; }
  if (p.length === 3) {
    if (["portalRecords", "publicationRecords"].includes(p[0])) { check(CRM.includes(p[1]) && p[2] === "records"); return `${p[0]}.${p[1]}`; }
    if (["operatorRuns", "migrationRuns"].includes(p[0])) { check(p[2] === "records"); return `${p[0]}.journal`; }
    if (p[0] === "portalSubmissions") { check(p[2] === "requests"); return "portalSubmissions.receipts"; }
    check(({ studioClients: "audit", studioPayments: "audit", paymentOrders: "audit", appointments: "scheduleAudit", schedulingHolidayPolicies: "audit" })[p[0]] === p[2]); return `${p[0]}.audit`;
  }
  check(p.length === 5 && p[0] === "publicationRecords" && CRM.includes(p[1]) && p[2] === "records" && p[4] === "history"); return `publicationRecords.${p[1]}.history`;
}
export function expectedContainer(path) { const p = path.split("/"); return p.length === 2 && (["portalRecords", "publicationRecords"].includes(p[0]) && CRM.includes(p[1]) || p[0] === "portalSubmissions"); }
