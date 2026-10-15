import { FieldValue } from "firebase-admin/firestore";
import { clientInput, duplicateKeys, duplicateReview, digest, fail, recordId, text } from "./clientModel.mjs";

// All access is through the authenticated admin API. Never project these records.
export async function requireClientAdmin(firestore, uid) {
  const snap = await firestore.collection("adminUsers").doc(uid).get();
  if (!snap.exists || snap.data().active !== true) fail("access_denied", 403);
}
async function transactionAdmin(tx, firestore, uid) {
  const snap = await tx.get(firestore.collection("adminUsers").doc(uid));
  if (!snap.exists || snap.data().active !== true) fail("access_denied", 403);
}
function plain(snap) {
  const data = snap.data();
  return { ...data, id: snap.id, createdAt: data.createdAt?.toDate?.().toISOString() || null, updatedAt: data.updatedAt?.toDate?.().toISOString() || null };
}
export async function listStudioClients(firestore, uid, { after = "", search = "" } = {}) {
  await requireClientAdmin(firestore, uid);
  // Paginate by immutable ID; search applies to the current page in the UI.
  if (search) fail("unsupported_search");
  let query = firestore.collection("studioClients").orderBy("__name__").limit(100);
  if (after) query = query.startAfter(recordId(after));
  const snap = await query.get();
  return { clients: snap.docs.map(plain), nextCursor: snap.size === 100 ? snap.docs.at(-1).id : null };
}
export async function readStudioClient(firestore, uid, id) {
  await requireClientAdmin(firestore, uid);
  const ref = firestore.collection("studioClients").doc(recordId(id));
  const [snap, audit, associations] = await Promise.all([ref.get(), ref.collection("audit").orderBy("createdAt", "desc").limit(100).get(), firestore.collection("studioConsultAssociations").where("studioClientId", "==", id).get()]);
  if (!snap.exists) fail("client_not_found", 404);
  return { client: plain(snap), audit: audit.docs.map(plain), associations: associations.docs.map(plain) };
}
export async function saveStudioClient(firestore, uid, input) {
  const data = clientInput(input.client);
  const keys = duplicateKeys(data);
  const ref = input.id ? firestore.collection("studioClients").doc(recordId(input.id)) : firestore.collection("studioClients").doc();
  const auditRef = ref.collection("audit").doc();
  return firestore.runTransaction(async tx => {
    await transactionAdmin(tx, firestore, uid);
    const existing = await tx.get(ref);
    if (input.id && !existing.exists) fail("client_not_found", 404);
    const previous = existing.data();
    if (existing.exists && input.revision !== previous.revision) fail("record_changed_reload", 409);
    // Shared contact locks serialize competing writes, including concurrent creates.
    const locks = [...new Set([...keys, ...(previous?.duplicateKeys || [])])].sort().map(key => firestore.collection("studioClientDuplicateLocks").doc(digest(key)));
    for (const lock of locks) await tx.get(lock);
    const matches = await tx.get(firestore.collection("studioClients").where("duplicateKeys", "array-contains-any", keys));
    const candidates = matches.docs.filter(d => d.id !== ref.id).map(d => ({ ...d.data(), id: d.id }));
    const review = duplicateReview(keys, candidates, input.duplicateReview);
    const changedFields = Object.keys(data).filter(key => data[key] !== previous?.[key]);
    if (!changedFields.length) return { id: ref.id, revision: previous.revision };
    const revision = (previous?.revision || 0) + 1;
    tx.set(ref, { ...data, duplicateKeys: keys, revision, createdAt: previous?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    // Store changed keys rather than extra copies of medical/private note text.
    tx.create(auditRef, { action: existing.exists ? "client_updated" : "client_created", actorUid: uid, changedFields, revision, duplicateReview: review, createdAt: FieldValue.serverTimestamp() });
    for (const lock of locks) tx.set(lock, { touchedAt: FieldValue.serverTimestamp() });
    return { id: ref.id, revision };
  });
}
export async function associateConsult(firestore, uid, input) {
  const id = recordId(input.id), consultId = recordId(input.consultId);
  const reason = text(input.reason, 1000, true);
  if (reason.length < 10 || input.reviewed !== true) fail("association_review_required");
  const clientRef = firestore.collection("studioClients").doc(id);
  const consultRef = firestore.collection("consultRequests").doc(consultId);
  const association = firestore.collection("studioConsultAssociations").doc(consultId);
  const audit = clientRef.collection("audit").doc();
  return firestore.runTransaction(async tx => {
    await transactionAdmin(tx, firestore, uid);
    const [client, consult, existing] = await Promise.all([tx.get(clientRef), tx.get(consultRef), tx.get(association)]);
    if (!client.exists || !consult.exists) fail("record_not_found", 404);
    if (client.data().revision !== input.revision || digest(consult.data()) !== input.consultReviewToken) fail("record_changed_reload", 409);
    if (existing.exists) {
      if (existing.data().studioClientId === id) return { id, consultId, unchanged: true };
      fail("consult_already_associated", 409);
    }
    tx.create(association, { studioClientId: id, consultId, reason, reviewedBy: uid, createdAt: FieldValue.serverTimestamp() });
    tx.create(audit, { action: "consult_associated", actorUid: uid, consultId, reason, createdAt: FieldValue.serverTimestamp() });
    return { id, consultId };
  });
}
export async function reviewConsult(firestore, uid, id) {
  await requireClientAdmin(firestore, uid);
  const snap = await firestore.collection("consultRequests").doc(recordId(id)).get();
  if (!snap.exists) fail("consult_not_found", 404);
  const data = snap.data();
  // Only contact/context needed for explicit review; never copy submission data.
  return { consult: { id: snap.id, clientName: data.clientName || "", clientEmail: data.clientEmail || "", phone: data.phone || "", clientUid: data.clientUid || "", status: data.status || "", createdAt: data.createdAt?.toDate?.().toISOString() || null }, consultReviewToken: digest(data) };
}
