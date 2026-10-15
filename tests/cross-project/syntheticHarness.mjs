// Test-only simulation. No project arguments, credentials, files or live adapter.
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, DocumentReference, Timestamp, GeoPoint } from "firebase-admin/firestore";
import { assertEmulators, requireValue, fingerprint, candidateProjection, references } from "../../lib/migration/model.mjs";
import { syntheticSources, APPROVED_PATHS, OWNER, REVIEWER } from "../../lib/migration/fixtures.mjs";
export { OWNER, REVIEWER, APPROVED_PATHS };
export const SOURCE = "demo-fawcett-cross-source", TARGET = "demo-fawcett-cross-target";
export const SYNTHETIC_PASSWORD = "Synthetic-only-123!";
const sessions = new WeakSet();
export function guard(env = process.env) {
  assertEmulators(env);
  requireValue(env.FIREBASE_STORAGE_EMULATOR_HOST === "127.0.0.1:9199" && (!env.STORAGE_EMULATOR_HOST || env.STORAGE_EMULATOR_HOST === "http://127.0.0.1:9199"), "local_storage_required");
}
export function createPair() {
  guard();
  const apps = [SOURCE, TARGET].map(projectId => initializeApp({ projectId }, `cross-${projectId}-${crypto.randomUUID()}`));
  const pair = Object.freeze({ source: Object.freeze({ auth: getAuth(apps[0]), db: getFirestore(apps[0]) }), target: Object.freeze({ auth: getAuth(apps[1]), db: getFirestore(apps[1]) }), close: () => Promise.all(apps.map(deleteApp)) });
  sessions.add(pair); return pair;
}
function check(pair) {
  guard(); requireValue(sessions.has(pair) && pair.source.db.projectId === SOURCE && pair.target.db.projectId === TARGET, "untrusted_pair");
}
export async function seedSource(pair) {
  check(pair);
  for (const uid of [OWNER, REVIEWER, "rehearsal-bob", "rehearsal-disabled"]) {
    await pair.source.auth.createUser({ uid, email: `${uid}@example.test`, displayName: `Synthetic ${uid}`, emailVerified: true, disabled: uid === "rehearsal-disabled", password: SYNTHETIC_PASSWORD });
  }
  const imported = await pair.source.auth.importUsers([{ uid: "rehearsal-federated", email: "federated@example.test", emailVerified: true, phoneNumber: "+15555550199", providerData: [{ providerId: "google.com", uid: "synthetic-google-subject", email: "federated@example.test" }] }]);
  requireValue(imported.failureCount === 0, "synthetic_provider_seed_failed");
  await pair.source.auth.setCustomUserClaims(OWNER, { accountType: "synthetic-client", admin: true });
  const records = { ...syntheticSources(), [`adminUsers/${REVIEWER}`]: { active: true }, "studioClients/rehearsal-studio/audit/original-event": { action: "client_created", actorUid: REVIEWER, createdAt: new Timestamp(1700000000, 123456000) }, "projects/rehearsal-reference": { clientUid: OWNER, projectName: "Synthetic typed reference", originalRef: pair.source.db.doc("consultRequests/rehearsal-consult"), point: new GeoPoint(0, 0), bytes: Buffer.from("synthetic"), createdAt: new Timestamp(1700000000, 123456000) } };
  for (const [path, data] of Object.entries(records)) await pair.source.db.doc(path).create(data);
  return Object.keys(records);
}
// Logical equality for the fixture, including an explicitly approved project rebind.
export function logical(value) {
  if (value instanceof DocumentReference) return { referencePath: value.path };
  if (value instanceof Timestamp) return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (Buffer.isBuffer(value)) return { bytes: value.toString("base64") };
  if (Array.isArray(value)) return value.map(logical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, logical(nested)]));
  return value;
}
export function rebind(value, targetDb) {
  if (value instanceof DocumentReference) { requireValue(value.firestore.projectId === SOURCE, "foreign_reference"); return targetDb.doc(value.path); }
  if (value instanceof Timestamp || value instanceof GeoPoint || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(v => rebind(v, targetDb));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, rebind(nested, targetDb)]));
  return value;
}
export async function planCopy(pair, paths) {
  check(pair);
  const sourceUsers = (await pair.source.auth.listUsers()).users, targetUsers = (await pair.target.auth.listUsers()).users;
  const collisions = [];
  for (const user of sourceUsers) for (const target of targetUsers) {
    if (user.uid === target.uid || user.email && user.email.toLowerCase() === target.email?.toLowerCase() || user.phoneNumber && user.phoneNumber === target.phoneNumber || user.providerData.some(p => p.providerId !== "password" && target.providerData.some(t => t.providerId === p.providerId && t.uid === p.uid))) collisions.push({ type: "auth_collision", uid: user.uid });
  }
  for (const path of paths) if ((await pair.target.db.doc(path).get()).exists) collisions.push({ type: "document_collision", path });
  return { sourceProject: SOURCE, targetProject: TARGET, syntheticOnly: true, authUsers: sourceUsers.length, originalDocuments: paths.length, withheldAdminRoles: paths.filter(p => p.startsWith("adminUsers/")).length, collisions };
}
export async function copyFixture(pair, paths, confirmation) {
  check(pair); requireValue(confirmation === "COPY_SYNTHETIC_FIXTURE", "confirmation_required");
  const plan = await planCopy(pair, paths);
  requireValue(plan.collisions.length === 0, "destination_collision");
  const sourceUsers = (await pair.source.auth.listUsers()).users;
  // Emulator hashes are NOT real Firebase SCRYPT hashes. Import identity/metadata
  // only; the test separately sets known synthetic passwords to exercise sign-in.
  const users = sourceUsers.map(u => ({ uid: u.uid, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName, disabled: u.disabled, ...(u.phoneNumber ? { phoneNumber: u.phoneNumber } : {}), metadata: { creationTime: u.metadata.creationTime, lastSignInTime: u.metadata.lastSignInTime }, providerData: u.providerData.filter(p => p.providerId !== "password"), customClaims: u.customClaims?.accountType ? { accountType: u.customClaims.accountType } : {} }));
  const result = await pair.target.auth.importUsers(users);
  requireValue(result.failureCount === 0, "auth_import_error");
  let copied = 0;
  for (const path of paths) {
    if (path.startsWith("adminUsers/")) continue; // Privileges require a separate gate.
    const original = await pair.source.db.doc(path).get();
    await pair.target.db.doc(path).create(rebind(original.data(), pair.target.db)); copied++;
  }
  return { ...plan, copiedAuth: result.successCount, copiedOriginals: copied };
}
export async function publishApprovedFixture(pair, paths, confirmation) {
  check(pair); requireValue(confirmation === "PUBLISH_REVIEWED_SYNTHETIC_VIEWS", "confirmation_required");
  let published = 0;
  for (const path of APPROVED_PATHS) {
    requireValue(paths.includes(path), "fixture_not_reviewed");
    const source = (await pair.source.db.doc(path).get()).data(), target = (await pair.target.db.doc(path).get()).data();
    requireValue(fingerprint(source) === fingerprint(syntheticSources()[path]) && fingerprint(target) === fingerprint(source), "fixture_changed");
    for (const relationship of references(target)) requireValue((await pair.target.db.doc(relationship).get()).data()?.clientUid === target.clientUid, "uncertain_relationship");
    requireValue(!(await pair.target.auth.getUser(target.clientUid)).disabled, "disabled_owner");
    const [name, id] = path.split("/");
    await pair.target.db.doc(`portalRecords/${name}/records/${id}`).create(candidateProjection(name, target)); published++;
  }
  return { published, withheld: paths.filter(p => !APPROVED_PATHS.includes(p)).length };
}
