import { restReader, REQUIRED_PERMISSIONS } from "../../audit/rest-reader.mjs";
import { check } from "../../audit/contracts.mjs";
export const DEMOS = [
  { projectId: "demo-fawcett-audit-one", projectNumber: "100000000001", database: "(default)", region: "nam5" },
  { projectId: "demo-fawcett-audit-two", projectNumber: "100000000002", database: "(default)", region: "nam5" }
];
export const encode = value => value === null ? { nullValue: null } : typeof value === "boolean" ? { booleanValue: value } : typeof value === "number" ? { integerValue: String(value) } : typeof value === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } } : { stringValue: value };
export const data = () => ({
  "clients/synthetic-a": { clientUid: "synthetic-a", clientEmail: "PRIVATE_CANARY@example.test", name: "PRIVATE_CANARY_NAME", health: "PRIVATE_CANARY_HEALTH" },
  "consultRequests/synthetic-consult": { clientUid: "synthetic-a", clientId: "synthetic-a", request: { tattooIdea: "PRIVATE_CANARY_TATTOO" } },
  "conversations/synthetic-chat": { clientUid: "synthetic-a", consultRequestId: "synthetic-consult", subject: "PRIVATE_CANARY_SUBJECT" },
  "messages/synthetic-message": { clientUid: "synthetic-a", conversationId: "synthetic-chat", body: "PRIVATE_CANARY_BODY" },
  "projects/synthetic-project": { clientUid: "synthetic-a", consultRequestId: "synthetic-consult" },
  "appointments/synthetic-appointment": { clientUid: "synthetic-a", projectId: "synthetic-project" },
  "studioClients/synthetic-studio": { notes: "PRIVATE_CANARY_NOTES" },
  "studioClients/synthetic-studio/audit/synthetic-audit": { notes: "PRIVATE_CANARY_AUDIT" },
  "portalRecords/clients/records/synthetic-a": { clientUid: "synthetic-a", privateLegacyNote: "PRIVATE_CANARY_EXPOSED" },
  "paymentOrders/synthetic-order": { provider: "square", environment: "sandbox", clientUid: "synthetic-a", amountCents: 10001, providerOrderId: "PRIVATE_CANARY_ORDER" },
  "paymentTransactions/synthetic-charge": { provider: "square", environment: "sandbox", type: "charge", clientUid: "synthetic-a", amountCents: 10001, currency: "CAD", orderId: "synthetic-order", providerTransactionId: "PRIVATE_CANARY_PAYMENT", providerPaymentId: "PRIVATE_CANARY_PAYMENT_ID", providerOrderId: "PRIVATE_CANARY_ORDER" }
});
export const users = () => [{ localId: "synthetic-a", email: "PRIVATE_CANARY@example.test", providerUserInfo: [{ providerId: "password", rawId: "PRIVATE_CANARY@example.test" }] }];
export function fakeReader(identity, { records = data(), accounts = users(), pageSize = 2, permissions = [...REQUIRED_PERMISSIONS], mutate, metadata = {}, updateTimes = {} } = {}) {
  const calls = [], base = `v1/projects/${identity.projectId}/databases/${identity.database}`, docPrefix = `${base}/documents`;
  let serial = 0;
  const transport = async request => {
    calls.push(request); if (mutate) { const override = mutate(request, ++serial); if (override) return override; }
    const u = new URL(`http://synthetic.test/${request.path}`), path = decodeURIComponent(u.pathname.slice(1));
    if (request.host === "resource" && request.method === "GET") return { projectId: identity.projectId, name: `projects/${identity.projectNumber}`, state: "ACTIVE", ...metadata.project };
    if (request.host === "resource" && request.method === "POST") return { permissions };
    if (request.host === "firestore" && path === base) return { name: base.slice(3), locationId: identity.region, type: "FIRESTORE_NATIVE", ...metadata.database };
    const offset = Number(request.body?.pageToken || u.searchParams.get("pageToken") || 0);
    const page = (key, rows) => ({ [key]: rows.slice(offset, offset + pageSize), ...(offset + pageSize < rows.length && { nextPageToken: String(offset + pageSize) }) });
    if (request.host === "auth") return page("users", accounts);
    if (request.method === "POST" && path.endsWith(":listCollectionIds")) {
      const parent = path.slice(docPrefix.length).replace(/^\//, "").replace(/:listCollectionIds$/, ""), prefix = parent ? `${parent}/` : "";
      return page("collectionIds", [...new Set(Object.keys(records).filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length).split("/")[0]))].sort());
    }
    check(request.method === "GET" && path.startsWith(`${docPrefix}/`));
    const collection = path.slice(docPrefix.length + 1), prefix = `${collection}/`;
    const paths = [...new Set(Object.keys(records).filter(p => p.startsWith(prefix)).map(p => `${prefix}${p.slice(prefix.length).split("/")[0]}`))].sort();
    return page("documents", paths.map(p => ({ name: `${docPrefix.slice(3)}/${p}`, ...(Object.hasOwn(records, p) && { createTime: "2026-01-01T00:00:00.000000001Z", updateTime: updateTimes[p] || "2026-01-01T00:00:00.000000002Z", fields: Object.fromEntries(Object.entries(records[p]).map(([k, v]) => [k, encode(v)])) }) })));
  };
  return { reader: restReader(identity, transport), transport, calls, records };
}
