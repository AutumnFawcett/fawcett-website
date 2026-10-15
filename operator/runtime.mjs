import { FieldValue } from "firebase-admin/firestore";
import { createRehearsalRuntime, assertRuntime } from "../lib/migration/runtime.mjs";
import { COLLECTIONS, requireValue } from "../lib/migration/model.mjs";
const trusted = new WeakSet();
export const SOURCE_ROOTS = Object.freeze([...COLLECTIONS, "adminUsers", "paymentOrders", "paymentTransactions", "paymentWebhookEvents", "founderProfiles", "founderContributions", "founderCounters", "paymentCheckoutRequests", "paymentCheckoutRateLimits", "studioConsultAssociations", "studioClientDuplicateLocks", "authVerificationRateLimits", "notificationConfiguration", "notificationScanCursors", "notificationMessageReceipts", "notificationQueue", "notificationWebhookEvents", "notificationSuppressions", "migrationRuns"]);
export const PRODUCTION_PROJECT = "fawcett-website-sandbox";
export const IDENTITY = Object.freeze({ projectId: "demo-fawcett-dev", databaseId: "(default)", intendedProductionProject: PRODUCTION_PROJECT });
export function createProductionOperator() {
  // No credential selection, SDK initialization, environment override or live
  // connection exists. A separate implementation/security review is required.
  throw new Error("production_execution_disabled_pending_separate_review");
}
const segment = value => typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\s/]/.test(value);
function readable(path) {
  const parts = path.split("/");
  return parts.every(segment) && (parts.length === 2 && [...SOURCE_ROOTS, "migrationOperatorAuthorizations", "operatorRuns", "systemControls"].includes(parts[0])
    || parts.length === 4 && ["portalRecords", "publicationRecords", "operatorRuns"].includes(parts[0]));
}
function writable(path) {
  const p = path.split("/");
  return p.every(segment) && (p.length === 2 && p[0] === "operatorRuns"
    || p.length === 4 && (["portalRecords", "publicationRecords"].includes(p[0]) && COLLECTIONS.includes(p[1]) && p[1] !== "studioClients" && p[2] === "records"
      || p[0] === "operatorRuns" && p[2] === "records"));
}
function snapshot(snap) {
  return { exists: snap.exists, path: snap.ref.path, data: snap.exists ? snap.data() : null,
    created: snap.exists ? { seconds: snap.createTime.seconds, nanoseconds: snap.createTime.nanoseconds } : null,
    updated: snap.exists ? { seconds: snap.updateTime.seconds, nanoseconds: snap.updateTime.nanoseconds } : null };
}
export function createSyntheticOperator(options) {
  requireValue(options && Object.keys(options).every(key => ["projectId", "databaseId", "intendedProductionProject", "operatorToken"].includes(key)), "unexpected_runtime_option");
  requireValue(Object.entries(IDENTITY).every(([key, value]) => options[key] === value), "explicit_demo_database_identity_required");
  const backend = createRehearsalRuntime();
  const operatorToken = options.operatorToken;
  const check = () => { assertRuntime(backend); requireValue(backend.firestore.databaseId === IDENTITY.databaseId, "operator_database_changed"); };
  const ref = path => { check(); requireValue(readable(path), "operator_read_path_denied"); return backend.firestore.doc(path); };
  const runtime = Object.freeze({
    identity: IDENTITY,
    async read(path) { return snapshot(await ref(path).get()); },
    async roots() { check(); return (await backend.firestore.listCollections()).map(ref => ref.id).sort(); },
    async scan(name) {
      check(); requireValue(SOURCE_ROOTS.includes(name) || /^(portalRecords|publicationRecords)\/[A-Za-z]+\/records$/.test(name) && COLLECTIONS.includes(name.split("/")[1]), "operator_scan_denied");
      const records = []; let cursor;
      while (true) {
        let query = backend.firestore.collection(name).orderBy("__name__").limit(100);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        records.push(...page.docs.map(snapshot)); requireValue(records.length <= 5000, "inventory_limit_exceeded");
        if (page.size < 100) return records;
        cursor = page.docs.at(-1);
      }
    },
    async children(path) { return (await ref(path).listCollections()).map(ref => ref.id).sort(); },
    async account(uid) {
      check(); requireValue(segment(uid), "invalid_account_uid");
      const user = await backend.auth.getUser(uid);
      return { uid: user.uid, disabled: user.disabled, createdAt: user.metadata.creationTime };
    },
    async identifyOperator() {
      check(); requireValue(typeof operatorToken === "string" && operatorToken.length > 0, "authenticated_operator_required");
      const claims = await backend.auth.verifyIdToken(operatorToken, true);
      return claims.uid;
    },
    async transaction(context, callback) {
      check();
      return backend.firestore.runTransaction(async tx => {
        check();
        const read = async path => snapshot(await tx.get(ref(path)));
        const { authorize } = await import("./authorization.mjs");
        const permit = await authorize(runtime, context, { read });
        const writer = Object.freeze({
          read, authorization: permit.authorization,
          create(path, value) { permit.check("create", path, value); requireValue(writable(path), "operator_write_path_denied"); tx.create(ref(path), value); },
          set(path, value) { permit.check("set", path, value); requireValue(writable(path), "operator_write_path_denied"); tx.set(ref(path), value); },
          update(path, value) { permit.check("update", path, value); requireValue(writable(path), "operator_write_path_denied"); tx.update(ref(path), value); },
          remove(path) { permit.check("remove", path); requireValue(/^portalRecords\/[A-Za-z]+\/records\/[^/]+$/.test(path) && writable(path), "operator_delete_path_denied"); tx.delete(ref(path)); },
          timestamp: () => FieldValue.serverTimestamp(),
        });
        return callback(writer);
      });
    },
    close: () => backend.close(),
  });
  trusted.add(runtime); return runtime;
}
export function assertOperator(runtime) {
  requireValue(trusted.has(runtime), "untrusted_operator_runtime");
  requireValue(Object.entries(IDENTITY).every(([key, value]) => runtime.identity[key] === value), "operator_identity_changed");
}
