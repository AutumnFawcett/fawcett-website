import { createHash } from "node:crypto";
import { assertReader } from "./rest-reader.mjs";
import { VERSION, ROOTS, CRM, LINKS, MASK, collectionClass, expectedContainer, check } from "./contracts.mjs";
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = value => typeof value === "string" && value.length > 0 ? value : null;
const cents = value => typeof value === "number" ? Number.isSafeInteger(value) : typeof value === "string" && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value));
const normalized = value => text(value)?.trim().toLowerCase() || null;
const sourceTypes = { consult: "consultRequests", consultRequest: "consultRequests", application: "membershipApplications", membershipApplication: "membershipApplications", offer_response: "membershipOfferResponses", membershipOfferResponse: "membershipOfferResponses", membership_request: "membershipChangeRequests", membershipChangeRequest: "membershipChangeRequests", message: "messages" };
function decode(v) {
  check(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1);
  if (typeof v.stringValue === "string") return v.stringValue;
  if (typeof v.integerValue === "string" && /^-?\d+$/.test(v.integerValue)) { const n = Number(v.integerValue); return Number.isSafeInteger(n) ? n : { unsafeInteger: v.integerValue }; }
  if (typeof v.booleanValue === "boolean") return v.booleanValue;
  check(Object.hasOwn(v, "nullValue")); return null;
}
function fields(raw = {}) {
  const result = {};
  for (const key of MASK.filter(k => !k.includes("."))) if (Object.hasOwn(raw, key)) result[key] = decode(raw[key]);
  if (raw.source?.mapValue?.fields) result.source = Object.fromEntries(["sourceId", "sourceType"].filter(k => Object.hasOwn(raw.source.mapValue.fields, k)).map(k => [k, decode(raw.source.mapValue.fields[k])]));
  return result;
}
async function pages(read, key, signal) {
  const rows = [], tokens = new Set(); let token = "";
  for (let i = 0; i < 1000; i++) {
    signal?.throwIfAborted(); const page = await read(token); check(page && typeof page === "object" && !Array.isArray(page) && !Object.hasOwn(page, "error"));
    const values = page[key] ?? []; check(Array.isArray(values) && values.length <= (key === "users" ? 1000 : 100));
    const next = page.nextPageToken ?? ""; check(typeof next === "string" && next.length <= 8192 && (!next || values.length > 0 && !tokens.has(next)));
    rows.push(...values); check(rows.length <= 10000);
    if (!next) return rows;
    tokens.add(next); token = next;
  }
  check(false);
}
async function observation(reader, signal) {
  const records = new Map(), collections = new Map(), prefix = `projects/${reader.identity.projectId}/databases/${reader.identity.database}/documents/`;
  async function walk(parent, depth) {
    signal?.throwIfAborted(); check(depth <= 6);
    const ids = await pages(t => reader.collections(parent, t), "collectionIds", signal);
    check(new Set(ids).size === ids.length);
    for (const id of ids) {
      check(typeof id === "string" && id.length > 0 && !/[\/\u0000-\u001f]/.test(id));
      const collection = parent ? `${parent}/${id}` : id, kind = collectionClass(collection);
      collections.set(collection, kind); check(collections.size <= 10000);
      const docs = await pages(t => reader.documents(collection, t), "documents", signal);
      for (const doc of docs) {
        check(typeof doc.name === "string" && doc.name.startsWith(prefix));
        const path = doc.name.slice(prefix.length), parts = path.split("/");
        check(parts.length % 2 === 0 && parts.every(p => p.length > 0 && !/[\u0000-\u001f]/.test(p)) && parts.slice(0, -1).join("/") === collection && !records.has(path));
        const exists = typeof doc.updateTime === "string" && typeof doc.createTime === "string";
        check(exists ? Number.isFinite(Date.parse(doc.updateTime)) && Number.isFinite(Date.parse(doc.createTime)) : !doc.updateTime && !doc.createTime && !doc.fields);
        check(doc.fields === undefined || doc.fields && typeof doc.fields === "object" && !Array.isArray(doc.fields));
        records.set(path, { path, kind, exists, created: doc.createTime ?? null, updated: doc.updateTime ?? null, data: fields(doc.fields) }); check(records.size <= 10000);
        await walk(path, depth + 1);
      }
    }
  }
  await walk("", 0);
  const accounts = await pages(t => reader.accounts(t), "users", signal), users = new Map();
  for (const user of accounts) {
    check(text(user.localId) && !users.has(user.localId));
    check(user.providerUserInfo === undefined || Array.isArray(user.providerUserInfo));
    users.set(user.localId, { uid: user.localId, email: normalized(user.email), disabled: user.disabled === true, createdAt: user.createdAt ?? null,
      providers: (user.providerUserInfo || []).map(p => { check(text(p.providerId) && text(p.rawId)); return [p.providerId, p.rawId]; }).sort() });
  }
  return { records, collections, users };
}
const signature = s => digest({ records: [...s.records].sort(([a], [b]) => a.localeCompare(b)), collections: [...s.collections].sort(([a], [b]) => a.localeCompare(b)), users: [...s.users].sort(([a], [b]) => a.localeCompare(b)) });
const duplicateKeys = values => { const counts = new Map(); for (const key of values.filter(Boolean)) counts.set(key, (counts.get(key) || 0) + 1); return [...counts.values()].filter(n => n > 1).length; };
const providerKeys = user => user.providers.map(p => JSON.stringify(p));
const financial = row => ["payments", "paymentOrders", "paymentTransactions", "studioPayments", "creditLedger", "founderContributions"].includes(row.path.split("/")[0]) && row.path.split("/").length === 2;
function transactionKey(row, includeEnvironment = true) {
  const d = row.data;
  if (row.path.split("/")[0] !== "paymentTransactions") return null;
  const id = text(d.providerTransactionId) || text(d.providerRefundId) || text(d.providerDisputeId) || text(d.providerPaymentId);
  return id ? JSON.stringify([d.provider || "unknown", ...(includeEnvironment ? [d.environment || "unknown"] : []), d.type || "unknown", id]) : null;
}
function providerReference(row, field, includeEnvironment = false) {
  const d = row.data; return text(d[field]) && text(d.provider) ? JSON.stringify([d.provider, ...(includeEnvironment ? [d.environment || "unknown"] : []), d[field]]) : null;
}
function analyse(snapshot, identity) {
  const counters = Object.fromEntries(["missingParents", "missingRelationships", "invalidRelationships", "conflictingOwners", "missingAuthOwners", "ambiguousOwnership", "disabledOwners", "orphanProjections", "projectionOwnerMismatches", "financialMissingReferences", "financialInvalidAmounts", "financialUnknownEnvironment", "financialEnvironmentMismatch", "financialParentMismatch", "financialAmountReviewRequired", "unverifiedProviderClaims"].map(k => [k, 0]));
  const counts = {}, classes = { privateOnly: 0, sourceReviewRequired: 0, projectionReviewRequired: 0, conflicting: 0 };
  const profiles = new Map();
  for (const row of snapshot.records.values()) if (row.exists && row.path.split("/")[0] === "clients" && row.path.split("/").length === 2 && text(row.data.clientUid)) profiles.set(row.data.clientUid, (profiles.get(row.data.clientUid) || 0) + 1);
  for (const row of snapshot.records.values()) {
    const p = row.path.split("/"), d = row.data;
    if (!row.exists) { if (!expectedContainer(row.path)) counters.missingParents++; continue; }
    const before = Object.values(counters).reduce((a, b) => a + b, 0);
    counts[row.kind] = (counts[row.kind] || 0) + 1;
    const isSource = p.length === 2 && CRM.includes(p[0]), isView = p.length === 4 && p[0] === "portalRecords";
    const needsOwner = isSource || isView;
    const uid = text(d.clientUid);
    const studio = text(d.studioClientId) && snapshot.records.get(`studioClients/${d.studioClientId}`)?.exists;
    if (needsOwner && !uid && !studio) counters.ambiguousOwnership++;
    if (uid && needsOwner) {
      if (!snapshot.users.has(uid)) counters.missingAuthOwners++;
      if (snapshot.users.get(uid)?.disabled) counters.disabledOwners++;
      if ((profiles.get(uid) || 0) !== 1 || p[0] === "clients" && p[1] !== uid) counters.ambiguousOwnership++;
    }
    if (isSource || isView || financial(row) || ["studioConsultAssociations", "studioVerifiedAccountLinks", "studioProjectAssociations"].includes(p[0]) && p.length === 2) {
      const links = [...Object.entries(LINKS), ["clientId", "clients"]];
      for (const [field, root] of links) if (Object.hasOwn(d, field) && d[field] !== null && d[field] !== "") {
        if (!text(d[field]) || d[field].includes("/")) { counters.invalidRelationships++; continue; }
        const linked = snapshot.records.get(`${root}/${d[field]}`);
        if (!linked?.exists) { counters.missingRelationships++; continue; }
        if (uid && text(linked.data.clientUid) && linked.data.clientUid !== uid) counters.conflictingOwners++;
      }
      for (const context of [d, d.source]) if (context && (context.sourceId !== undefined && context.sourceId !== null && context.sourceId !== "" || context.sourceType !== undefined && context.sourceType !== null && context.sourceType !== "")) {
        const root = Object.hasOwn(sourceTypes, context.sourceType) ? sourceTypes[context.sourceType] : null, id = text(context.sourceId);
        if (!root || !id || id.includes("/")) counters.invalidRelationships++;
        else if (!snapshot.records.get(`${root}/${id}`)?.exists) counters.missingRelationships++;
        else if (uid && snapshot.records.get(`${root}/${id}`).data.clientUid && snapshot.records.get(`${root}/${id}`).data.clientUid !== uid) counters.conflictingOwners++;
      }
      if (p[0] === "messages" && !text(d.conversationId)) counters.missingRelationships++;
    }
    if (isView) {
      const source = snapshot.records.get(`${p[1]}/${p[3]}`);
      if (!source?.exists) counters.orphanProjections++;
      else if (!uid || source.data.clientUid !== uid) counters.projectionOwnerMismatches++;
    }
    if (financial(row)) {
      if (!Object.hasOwn(d, "amountCents") && !Object.hasOwn(d, "deltaCents")) counters.financialAmountReviewRequired++;
      if (Object.hasOwn(d, "deltaCents") && !cents(d.deltaCents)) counters.financialInvalidAmounts++;
      if (Object.hasOwn(d, "amountCents") && (!cents(d.amountCents) || p[0] !== "creditLedger" && Number(d.amountCents) < 0)) counters.financialInvalidAmounts++;
      if (["paymentOrders", "paymentTransactions", "founderContributions"].includes(p[0])) {
        if (!["sandbox", "production"].includes(d.environment)) counters.financialUnknownEnvironment++;
        // A Firebase project name never establishes provider environment or settlement.
        if (d.provider !== "square") counters.unverifiedProviderClaims++;
      }
      if (p[0] === "paymentTransactions") {
        const order = snapshot.records.get(`paymentOrders/${d.orderId}`);
        if (!text(d.orderId) || !order?.exists) counters.financialMissingReferences++;
        else if (order.data.environment !== d.environment || order.data.provider !== d.provider) counters.financialEnvironmentMismatch++;
        if (["refund", "chargeback", "dispute"].includes(d.type)) {
          const parent = snapshot.records.get(`paymentTransactions/${d.parentTransactionId}`);
          if (!text(d.parentTransactionId) || !parent?.exists) counters.financialMissingReferences++;
          else if (parent.data.type !== "charge" || parent.data.provider !== d.provider || parent.data.providerPaymentId !== d.providerPaymentId || parent.data.providerOrderId !== d.providerOrderId || parent.data.projectId !== d.projectId || parent.data.environment !== d.environment || parent.data.currency !== d.currency || parent.data.orderId !== d.orderId || parent.data.studioClientId !== d.studioClientId || parent.data.clientUid !== d.clientUid) counters.financialParentMismatch++;
        }
      }
    }
    if (Object.values(counters).reduce((a, b) => a + b, 0) > before) classes.conflicting++;
    else if (isView) classes.projectionReviewRequired++;
    else if (isSource) classes.sourceReviewRequired++;
    else classes.privateOnly++;
  }
  const users = [...snapshot.users.values()], rows = [...snapshot.records.values()].filter(r => r.exists);
  const environments = { sandbox: 0, production: 0, unknown: 0 };
  for (const row of rows.filter(financial)) environments[["sandbox", "production"].includes(row.data.environment) ? row.data.environment : "unknown"]++;
  return { project: identity, collections: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))), collectionCount: snapshot.collections.size,
    topLevelCollectionCount: [...snapshot.collections.keys()].filter(p => !p.includes("/")).length, topLevelDocumentCount: rows.filter(r => r.path.split("/").length === 2).length,
    documentCount: rows.length, authUserCount: users.length, classes, issues: counters, providerEnvironmentLabels: environments,
    duplicateAuthEmailGroups: duplicateKeys(users.map(u => u.email)), duplicateAuthProviderGroups: duplicateKeys(users.flatMap(providerKeys)),
    duplicateProviderTransactionGroups: duplicateKeys(rows.map(r => transactionKey(r))),
    duplicateProviderOrderGroups: duplicateKeys(rows.filter(r => r.path.split("/")[0] === "paymentOrders" && r.path.split("/").length === 2).map(r => providerReference(r, "providerOrderId", true))), contentReviewRequired: true };
}
const intersect = (a, b) => { const second = new Set(b.filter(Boolean)); return new Set(a.filter(k => k && second.has(k))).size; };
export async function audit(readers, { signal } = {}) {
  check(Array.isArray(readers) && readers.length === 2 && readers[0].identity.projectId !== readers[1].identity.projectId);
  readers.forEach(assertReader);
  // Verify BOTH project numbers/databases and permission boundaries before any data.
  for (const reader of readers) { signal?.throwIfAborted(); await reader.verify(); }
  const snapshots = [];
  for (const reader of readers) snapshots.push(await observation(reader, signal));
  for (let i = 0; i < readers.length; i++) check(signature(snapshots[i]) === signature(await observation(readers[i], signal)));
  for (const reader of readers) await reader.verify();
  signal?.throwIfAborted();
  const [a, b] = snapshots, usersA = [...a.users.values()], usersB = [...b.users.values()], rowsA = [...a.records.values()].filter(r => r.exists), rowsB = [...b.records.values()].filter(r => r.exists);
  return { schemaVersion: 1, auditVersion: VERSION, scanComplete: true, upgradeApproved: false, independentOwnerReviewRequired: true,
    projects: snapshots.map((s, i) => analyse(s, readers[i].identity)),
    potentialCrossProjectCollisions: { authUids: intersect([...a.users.keys()], [...b.users.keys()]), authEmails: intersect(usersA.map(u => u.email), usersB.map(u => u.email)), providerSubjects: intersect(usersA.flatMap(providerKeys), usersB.flatMap(providerKeys)), documentLocations: intersect(rowsA.map(r => r.path), rowsB.map(r => r.path)), providerTransactions: intersect(rowsA.map(r => transactionKey(r)), rowsB.map(r => transactionKey(r))), providerPaymentIdentifiersAcrossEnvironments: intersect(rowsA.map(r => providerReference(r, "providerPaymentId")), rowsB.map(r => providerReference(r, "providerPaymentId"))), providerOrderIdentifiersAcrossEnvironments: intersect(rowsA.map(r => providerReference(r, "providerOrderId")), rowsB.map(r => providerReference(r, "providerOrderId"))), providerIdentifiersAcrossEnvironments: intersect(rowsA.map(r => transactionKey(r, false)), rowsB.map(r => transactionKey(r, false))) } };
}
