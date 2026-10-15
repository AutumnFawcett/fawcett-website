import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { fencedFirestore, assertServerWritesOpen } from "../safety/serverFence.mjs";
import { requireClientAdmin } from "../clients/clientService.mjs";
import { ClientError, fail, recordId, text } from "../clients/clientModel.mjs";
import { fingerprint } from "../migration/model.mjs";
import { createAndAttach } from "../payments/checkoutService.js";
import { assertSquareCheckoutConfig } from "../payments/squareCheckoutConfig.js";
import { isSafeSquareCheckoutUrl } from "../payments/founderCheckoutValidation.js";

export const MANUAL_METHODS = ["cash", "etransfer", "debit", "credit_card", "square_dashboard", "other"];
const stamp = () => FieldValue.serverTimestamp();
const hash = value => createHash("sha256").update(value).digest("hex");
function inputRecord(input) {
  const allowed = ["action", "requestId", "studioClientId", "clientUid", "projectId", "amountCents", "currency", "paymentMethod", "receivedDate", "reference", "notes", "kind", "reviewed"];
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) fail("unsupported_field");
  if (!["manual", "checkout"].includes(input.action) || input.reviewed !== true) fail("review_required");
  const requestId = recordId(input.requestId);
  if (requestId.length < 16) fail("invalid_request_id");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 10000000 || input.currency !== "CAD") fail("invalid_money");
  if (["clientUid", "projectId"].some(key => input[key] !== undefined && input[key] !== null && (typeof input[key] !== "string" || !input[key]))) fail("invalid_identity");
  const data = { action: input.action, studioClientId: recordId(input.studioClientId), clientUid: input.clientUid ? recordId(input.clientUid) : null,
    projectId: input.projectId ? recordId(input.projectId) : null, amountCents: input.amountCents, currency: "CAD", kind: input.kind };
  if (!["deposit", "tattoo_payment"].includes(data.kind)) fail("invalid_kind");
  if (input.action === "manual") {
    if (!MANUAL_METHODS.includes(input.paymentMethod)) fail("invalid_payment_method");
    if (typeof input.receivedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.receivedDate) || !Number.isFinite(Date.parse(`${input.receivedDate}T12:00:00Z`)) || new Date(`${input.receivedDate}T12:00:00Z`).toISOString().slice(0, 10) !== input.receivedDate) fail("invalid_date");
    Object.assign(data, { paymentMethod: input.paymentMethod, receivedDate: input.receivedDate, reference: text(input.reference, 200), notes: text(input.notes, 4000) });
  } else if (["paymentMethod", "receivedDate", "reference", "notes"].some(k => k in input)) fail("unsupported_field");
  return { data, requestId };
}
export async function reviewIdentity(tx, db, auth, uid, data) {
  await requireTxAdmin(tx, db, uid);
  const client = await tx.get(db.doc(`studioClients/${data.studioClientId}`));
  if (!client.exists || client.data().status === "archived") fail("studio_client_unavailable", 409);
  if (data.clientUid) {
    // No link creation endpoint is supplied. This independently reviewed, server-only
    // evidence must pre-exist; neither email equality nor a document ID is proof.
    const link = await tx.get(db.doc(`studioVerifiedAccountLinks/${data.studioClientId}`));
    const evidence = link.data();
    if (!link.exists || evidence.state !== "verified" || evidence.studioClientId !== data.studioClientId || evidence.clientUid !== data.clientUid || !evidence.reviewedBy || !evidence.reviewedAt) fail("verified_account_link_required", 409);
    let account;
    try { account = await auth.getUser(data.clientUid); } catch { fail("verified_account_link_required", 409); }
    if (account.disabled || account.metadata.creationTime !== evidence.accountCreatedAt) fail("verified_account_link_required", 409);
    const claims = await tx.get(db.collection("studioVerifiedAccountLinks").where("clientUid", "==", data.clientUid).limit(2));
    if (claims.size !== 1 || claims.docs[0].id !== data.studioClientId) fail("account_link_conflict", 409);
  }
  if (data.projectId) {
    const project = await tx.get(db.doc(`projects/${data.projectId}`));
    const association = await tx.get(db.doc(`studioProjectAssociations/${data.projectId}`));
    const evidence = association.data();
    if (!project.exists || !association.exists || evidence.state !== "approved" || evidence.studioClientId !== data.studioClientId || evidence.projectId !== data.projectId || !evidence.reviewedBy || !evidence.reviewedAt || evidence.projectFingerprint !== fingerprint(project.data()) || (project.data().studioClientId && project.data().studioClientId !== data.studioClientId) || (project.data().clientUid && project.data().clientUid !== data.clientUid)) fail("reviewed_project_association_required", 409);
    return fingerprint(evidence);
  }
  return null;
}
async function requireTxAdmin(tx, db, uid) {
  const admin = await tx.get(db.doc(`adminUsers/${recordId(uid)}`));
  if (!admin.exists || admin.data().active !== true) fail("access_denied", 403);
}
export async function recordStudioPayment({ firestore, auth, uid, input, config, provider, orderStorage }) {
  const db = fencedFirestore(firestore);
  await requireClientAdmin(db, uid);
  const { data, requestId } = inputRecord(input);
  if (data.action === "checkout") {
    if (!config?.paymentsEnabled) fail("payments_disabled", 503);
    assertSquareCheckoutConfig(config);
  }
  const environment = data.action === "checkout" ? config.environment : "manual";
  const id = hash(`studio:${requestId}`).slice(0, 32);
  const ref = db.doc(`studioPaymentRequests/${id}`);
  const digest = fingerprint({ ...data, environment });
  const reservation = await db.runTransaction(async tx => {
    const projectAssociationHash = await reviewIdentity(tx, db, auth, uid, data);
    const existing = await tx.get(ref);
    const destination = db.doc(`${data.action === "manual" ? "studioPayments" : "paymentOrders"}/${id}`);
    const current = await tx.get(destination);
    if (existing.exists) {
      if (existing.data().inputHash !== digest || existing.data().actorUid !== uid || existing.data().destination !== destination.path || !current.exists || current.data().projectAssociationHash !== projectAssociationHash) fail("request_conflict", 409);
      if (data.action === "checkout") {
        const order = current.data();
        if (order.orderId !== id || order.studioClientId !== data.studioClientId || order.clientUid !== data.clientUid || order.projectId !== data.projectId || order.amountCents !== data.amountCents || order.currency !== "CAD" || order.purpose !== "tattoo_payment" || order.kind !== data.kind || order.offerId !== "studio-tattoo-v1" || order.offerVersion !== 1 || order.itemName !== (data.kind === "deposit" ? "Tattoo deposit" : "Tattoo payment") || order.environment !== environment || order.idempotencyKey !== `fawcett-${id}`) fail("order_identity_conflict", 409);
      }
      return current.data();
    }
    if (current.exists) fail("destination_conflict", 409);
    const referenceRef = data.action === "manual" && data.reference ? db.doc(`studioPaymentReferenceLocks/${hash(`${data.paymentMethod}:${data.reference.normalize("NFKC").trim()}`)}`) : null;
    if (referenceRef && (await tx.get(referenceRef)).exists) fail("reference_already_recorded", 409);
    // Per-admin rate limit serializes concurrent new links; retries do not consume it.
    const rateRef = db.doc(`studioPaymentRateLimits/${hash(uid)}`);
    const rate = await tx.get(rateRef);
    const now = Date.now(), recent = (rate.data()?.requests || []).filter(t => t > now - 3600000);
    if (data.action === "checkout" && recent.length >= 20) fail("rate_limited", 429);
    const base = { studioClientId: data.studioClientId, clientUid: data.clientUid, projectId: data.projectId, projectAssociationHash,
      amountCents: data.amountCents, currency: "CAD", kind: data.kind, createdBy: uid, createdAt: stamp(), updatedAt: stamp() };
    const value = data.action === "manual" ? { ...base, origin: "manual", status: "recorded", providerConfirmed: false,
      paymentMethod: data.paymentMethod, receivedDate: data.receivedDate, reference: data.reference, notes: data.notes }
      : { ...base, orderId: id, provider: "square", environment, purpose: "tattoo_payment", offerId: "studio-tattoo-v1", offerVersion: 1,
        itemName: data.kind === "deposit" ? "Tattoo deposit" : "Tattoo payment", idempotencyKey: `fawcett-${id}`, status: "creating",
        providerOrderId: null, providerPaymentLinkId: null, checkoutUrl: null, failureCode: null };
    if (referenceRef) tx.create(referenceRef, { paymentId: id, createdAt: stamp() });
    tx.create(destination, value);
    tx.create(ref, { inputHash: digest, actorUid: uid, destination: destination.path, createdAt: stamp() });
    tx.create(destination.collection("audit").doc("created"), { action: data.action === "manual" ? "manual_payment_recorded" : "hosted_checkout_requested", actorUid: uid, createdAt: stamp(), studioClientId: data.studioClientId });
    if (data.action === "checkout") tx.set(rateRef, { requests: [...recent, now] });
    return value;
  });
  if (data.action === "manual") return { id, status: "recorded", providerConfirmed: false };
  if (["pending", "paid", "refunded", "disputed"].includes(reservation.status)) {
    if (!isSafeSquareCheckoutUrl(reservation.checkoutUrl, environment)) fail("order_identity_conflict", 409);
    return { id, status: reservation.status, ...(reservation.status === "pending" ? { checkoutUrl: reservation.checkoutUrl } : {}) };
  }
  if (reservation.status !== "creating") fail("reconciliation_required", 409);
  // Reuse the existing provider call, URL/money validation and conditional attachment.
  await assertServerWritesOpen(db);
  const result = await createAndAttach({ order: reservation, offer: { itemName: reservation.itemName }, config, storage: orderStorage, provider, now: () => new Date() });
  return { id, status: result.status, checkoutUrl: result.checkoutUrl };
}
export async function listStudioPayments(firestore, uid, after = "") {
  await requireClientAdmin(firestore, uid);
  let query = firestore.collection("studioPayments").orderBy("__name__").limit(100);
  if (after) query = query.startAfter(recordId(after));
  const rows = await query.get();
  const payments = await Promise.all(rows.docs.map(async doc => ({ ...doc.data(), id: doc.id, createdAt: doc.data().createdAt?.toDate?.().toISOString() || null,
    updatedAt: doc.data().updatedAt?.toDate?.().toISOString() || null,
    audit: (await doc.ref.collection("audit").orderBy("createdAt", "desc").limit(20).get()).docs.map(row => ({ action: row.data().action, actorUid: row.data().actorUid, createdAt: row.data().createdAt?.toDate?.().toISOString() || null })) })));
  const orders = await firestore.collection("paymentOrders").where("purpose", "==", "tattoo_payment").limit(100).get();
  const hosted = orders.docs.map(doc => { const row = doc.data(); return { id: doc.id, studioClientId: row.studioClientId, amountCents: row.amountCents, currency: row.currency, status: row.status, environment: row.environment,
    ...(row.status === "pending" && isSafeSquareCheckoutUrl(row.checkoutUrl, row.environment) ? { checkoutUrl: row.checkoutUrl } : {}) }; });
  const ledger = await firestore.collection("paymentTransactions").where("purpose", "==", "tattoo_payment").limit(100).get();
  const transactions = ledger.docs.map(doc => { const row = doc.data(); return { id: doc.id, studioClientId: row.studioClientId, projectId: row.projectId || null, orderId: row.orderId, amountCents: row.amountCents, currency: row.currency, type: row.type, status: row.status, providerTransactionId: row.providerTransactionId, parentTransactionId: row.parentTransactionId || null, createdAt: row.createdAt?.toDate?.().toISOString() || null }; });
  return { payments, hosted, transactions, nextCursor: rows.size === 100 ? rows.docs.at(-1).id : null };
}
export async function handleStudioPaymentRequest(request, dependencies) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  try {
    let uid;
    try { uid = await dependencies.authenticate(request); } catch { fail("access_denied", 403); }
    await requireClientAdmin(dependencies.firestore, recordId(uid));
    if (request.method === "GET") return Response.json(await listStudioPayments(dependencies.firestore, uid, new URL(request.url).searchParams.get("after") || ""), { headers });
    if (request.method !== "POST") fail("method_not_allowed", 405);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") fail("invalid_content_type", 415);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 12000) fail("request_too_large", 413);
    let input;
    try { input = JSON.parse(raw); } catch { fail("invalid_json"); }
    inputRecord(input);
    const checkout = input.action === "checkout" ? await dependencies.checkoutDependencies() : {};
    return Response.json(await recordStudioPayment({ ...dependencies, ...checkout, uid, input }), { headers });
  } catch (error) {
    return Response.json({ error: error.code === "maintenance" ? "maintenance" : error instanceof ClientError ? error.message : "payment_operation_requires_review" }, { status: error.code === "maintenance" ? 503 : error instanceof ClientError ? error.status : 503, headers });
  }
}
