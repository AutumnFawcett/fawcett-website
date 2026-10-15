import { collection as sdkCollection, doc as sdkDoc, writeBatch } from "firebase/firestore";
import { PORTAL_FIELDS, portalProjection } from "./portalProjection.mjs";
import { portalRecordRef } from "./adminFirestore.js";

function pathForPortal(parts) {
  const [name, ...rest] = parts.join("/").split("/");
  if (!PORTAL_FIELDS[name]) throw new Error("Unsupported portal collection");
  return ["portalRecords", name, "records", ...rest];
}
export function collection(db, ...parts) { return sdkCollection(db, ...pathForPortal(parts)); }
export function doc(dbOrCollection, ...parts) {
  return parts.length ? sdkDoc(dbOrCollection, ...pathForPortal(parts)) : sdkDoc(dbOrCollection);
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
  const source = sourceRef(ref);
  const projection = portalProjection(source.parent.id, data);
  if (!projection) throw new Error("Record is not client-visible");
  const batch = writeBatch(ref.firestore);
  batch.set(source, data);
  batch.set(ref, projection);
  await batch.commit();
}
export async function updateDoc(ref, patch) {
  const source = sourceRef(ref);
  // Clients only update conversation previews/read state; rules enforce the
  // exact field list and require both records to agree atomically.
  if (source.parent.id !== "conversations") throw new Error("Portal update not supported");
  const batch = writeBatch(ref.firestore);
  batch.update(source, patch);
  batch.update(portalRecordRef(source), patch);
  await batch.commit();
}
