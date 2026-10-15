import { collection as sdkCollection, doc as sdkDoc, writeBatch, runTransaction, serverTimestamp } from "firebase/firestore";
import { applyRecordPatch } from "./portalProjection.mjs";
import { assertBrowserWritesOpen } from "./safety/browserFence.js";
import { PORTAL_FIELDS, portalProjection } from "./portalProjection.mjs";
import { portalRecordRef } from "./adminFirestore.js";

function pathForPortal(parts) {
  const [name, ...rest] = parts.join("/").split("/");
  if (!PORTAL_FIELDS[name]) throw new Error("Unsupported portal collection");
  return ["portalRecords", name, "records", ...rest];
}
export function collection(db, ...parts) { return sdkCollection(db, ...pathForPortal(parts)); }
export function doc(dbOrCollection, ...parts) {
  // SDK collection references already contain the mapped portal path. An ID
  // relative to that reference must never be interpreted as a root collection.
  if (dbOrCollection.type === "collection") {
    const ref = sdkDoc(dbOrCollection, ...parts);
    sourceRef(ref); // Reject private/unmapped or nested collection references.
    return ref;
  }
  return sdkDoc(dbOrCollection, ...pathForPortal(parts));
}
function sourceRef(ref) {
  const parts = ref.path.split("/");
  if (parts.length !== 4 || parts[0] !== "portalRecords" || parts[2] !== "records" || !PORTAL_FIELDS[parts[1]]) throw new Error("Unsupported portal record path");
  return sdkDoc(ref.firestore, parts[1], parts[3]);
}
export async function addDoc(collectionRef, data) {
  const ref = sdkDoc(collectionRef);
  await setDoc(ref, data);
  return ref;
}
export async function setDoc(ref, data) {
  const fence = await assertBrowserWritesOpen(ref.firestore);
  const source = sourceRef(ref);
  const projection = portalProjection(source.parent.id, data);
  if (!projection) throw new Error("Record is not client-visible");
  const batch = writeBatch(ref.firestore);
  batch.set(source, data);
  batch.set(ref, projection);
  batch.set(sdkDoc(ref.firestore, "publicationRecords", source.parent.id, "records", source.id), { schemaVersion: 1, state: "approved", mode: "client_origin", actorUid: data.clientUid, reviewedAt: serverTimestamp(), fenceEpoch: fence.epoch, approved: projection });
  await batch.commit();
}
export async function updateDoc(ref, patch) {
  const source = sourceRef(ref);
  // Clients only update conversation previews/read state; rules enforce the
  // exact field list and require both records to agree atomically.
  if (source.parent.id !== "conversations") throw new Error("Portal update not supported");
  const fence = await assertBrowserWritesOpen(ref.firestore);
  return runTransaction(ref.firestore, async tx => {
    const previous = await tx.get(ref);
    if (!previous.exists()) throw new Error("Conversation is awaiting review");
    const approved = applyRecordPatch(previous.data(), patch);
    tx.update(source, patch);
    tx.update(portalRecordRef(source), patch);
    tx.set(sdkDoc(ref.firestore, "publicationRecords", source.parent.id, "records", source.id), { schemaVersion: 1, mode: "client_origin", actorUid: approved.clientUid, reviewedAt: serverTimestamp(), fenceEpoch: fence.epoch, approved }, { merge: true });
  });
}

// One intake = one atomic commit. The local marker stores IDs only, never form
// content. A durable own receipt resolves retries after an uncertain response.
export function createPortalSubmission(database, { uid, kind }) {
  if (!["consult", "membership"].includes(kind) || !uid) throw new Error("Unsupported submission");
  const key = `fawcett-submission-v1:${uid}:${kind}`;
  const storage = typeof window !== "undefined" ? window.sessionStorage : null;
  const id = storage?.getItem(key) || sdkDoc(sdkCollection(database, "submissionIDs")).id;
  storage?.setItem(key, id);
  const entries = [];
  return {
    async addDoc(collectionRef, data) {
      if (collectionRef.firestore !== database || data.clientUid !== uid) throw new Error("Submission owner mismatch");
      const ref = sdkDoc(collectionRef, `${id}-${entries.length}`);
      sourceRef(ref);
      entries.push({ ref, data });
      return ref;
    },
    async commit() {
      if (entries.length !== 3 || entries[0].ref.parent.parent.id !== (kind === "consult" ? "consultRequests" : "membershipApplications") || entries[1].ref.parent.parent.id !== "conversations" || entries[2].ref.parent.parent.id !== "messages") throw new Error("Incomplete submission");
      const receipt = sdkDoc(database, "portalSubmissions", uid, "requests", id);
      const { getDocFromServer } = await import("firebase/firestore");
      if ((await getDocFromServer(receipt)).exists()) { storage?.removeItem(key); return; }
      const fence = await assertBrowserWritesOpen(database);
      const batch = writeBatch(database);
      for (const { ref, data } of entries) {
        const source = sourceRef(ref), approved = portalProjection(source.parent.id, data);
        batch.set(source, data); batch.set(ref, approved);
        batch.set(sdkDoc(database, "publicationRecords", source.parent.id, "records", source.id), { schemaVersion: 1, state: "approved", mode: "client_origin", actorUid: uid, reviewedAt: serverTimestamp(), fenceEpoch: fence.epoch, approved });
      }
      batch.set(receipt, { clientUid: uid, kind, writerProtocol: 1, sourceId: entries[0].ref.id, conversationId: entries[1].ref.id, messageId: entries[2].ref.id, createdAt: serverTimestamp() });
      try { await batch.commit(); }
      catch (error) { if (!(await getDocFromServer(receipt)).exists()) throw error; }
      storage?.removeItem(key);
    },
  };
}
