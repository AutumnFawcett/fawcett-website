import { portalProjection } from "../portalProjection.mjs";
import { fencedFirestore } from "./serverFence.mjs";
import { FieldValue } from "firebase-admin/firestore";
import { fingerprint, sourcePath, references, candidateProjection } from "../migration/model.mjs";
const fail = code => { throw new Error(code); };
export async function reviewPublication(firestore, auth, uid, input, publish = false) {
  firestore = fencedFirestore(firestore);
  const [name, id] = sourcePath(input.path);
  const sourceRef = firestore.doc(input.path), viewRef = firestore.doc(`portalRecords/${name}/records/${id}`);
  const policyRef = firestore.doc(`publicationRecords/${name}/records/${id}`);
  if (publish && (input.reviewed !== true || !Array.isArray(input.fields))) fail("explicit_review_required");
  return firestore.runTransaction(async tx => {
    const [admin, source, policy] = await Promise.all([tx.get(firestore.doc(`adminUsers/${uid}`)), tx.get(sourceRef), tx.get(policyRef)]);
    if (admin.data()?.active !== true) fail("access_denied");
    if (!source.exists) fail("source_missing");
    const original = source.data(), sourceHash = fingerprint(original);
    if (typeof original.clientUid !== "string" || !original.clientUid || original.clientUid.includes("/") || (name === "clients" && id !== original.clientUid)) fail("uncertain_owner");
    const owner = await auth.getUser(original.clientUid);
    if (owner.disabled) fail("disabled_owner");
    for (const path of references(original)) if ((await tx.get(firestore.doc(path))).data()?.clientUid !== original.clientUid) fail("relationship_owner_mismatch");
    // Never derive any public value from adminReview. A reviewer must examine
    // all candidate free text and can omit whole fields/maps, including previews.
    let candidate;
    try { candidate = portalProjection(name, original); fingerprint(candidate); } catch { candidate = null; }
    if (!publish) return { path: input.path, sourceHash, candidate: candidate || {}, state: policy.data()?.state || "withheld", requiresCuration: !candidate };
    if (!candidate) fail("record_is_private_or_requires_curation");
    if (input.sourceHash !== sourceHash) fail("source_changed_review_again");
    if (input.fields.some(key => !Object.hasOwn(candidate, key)) || !input.fields.includes("clientUid")) fail("invalid_review_fields");
    const approved = Object.fromEntries(input.fields.map(key => [key, candidate[key]]));
    // Relationship/identity keys cannot be redacted independently of ownership.
    for (const key of ["clientUid", "conversationId", "projectId", "applicationId", "consultRequestId", "membershipChangeRequestId", "membershipOfferResponseId", "appointmentId", "paymentId", "source", "sourceId", "sourceType", "clientVisible", "entryType"]) if (key in candidate && !(key in approved)) fail("relationship_field_required");
    candidateProjection(name, approved); // Selected values must pass the strict privacy/type tripwires.
    const projectionHash = fingerprint(approved), revision = (policy.data()?.revision || 0) + 1;
    tx.set(viewRef, approved);
    tx.set(policyRef, { schemaVersion: 1, state: "approved", mode: "admin_review", actorUid: uid, sourceHash, projectionHash, revision, approved, reviewedAt: FieldValue.serverTimestamp() });
    tx.create(policyRef.collection("history").doc(), { action: "publication_approved", actorUid: uid, sourceHash, projectionHash, revision, createdAt: FieldValue.serverTimestamp() });
    return { published: true, path: input.path, revision };
  });
}

export async function withdrawPublication(firestore, uid, input) {
  firestore = fencedFirestore(firestore);
  const [name, id] = sourcePath(input.path);
  if (input.reviewed !== true) fail("explicit_review_required");
  return firestore.runTransaction(async tx => {
    const policyRef = firestore.doc(`publicationRecords/${name}/records/${id}`);
    const [admin, source, policy] = await Promise.all([tx.get(firestore.doc(`adminUsers/${uid}`)), tx.get(firestore.doc(input.path)), tx.get(policyRef)]);
    if (admin.data()?.active !== true) fail("access_denied");
    if (!source.exists || input.sourceHash !== fingerprint(source.data())) fail("source_changed_review_again");
    const revision = (policy.data()?.revision || 0) + 1;
    tx.delete(firestore.doc(`portalRecords/${name}/records/${id}`));
    tx.set(policyRef, { schemaVersion: 1, state: "withheld", actorUid: uid, revision, sourceHash: input.sourceHash, withdrawnAt: FieldValue.serverTimestamp() });
    tx.create(policyRef.collection("history").doc(), { action: "publication_withdrawn", actorUid: uid, sourceHash: input.sourceHash, revision, createdAt: FieldValue.serverTimestamp() });
    return { withdrawn: true, path: input.path, revision };
  });
}
