import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { assertEmulators, DEMO_PROJECT_ID, requireValue } from "./model.mjs";
const runtimes = new WeakSet();
export function createRehearsalRuntime() {
  assertEmulators();
  const app = initializeApp({ projectId: DEMO_PROJECT_ID }, `migration-rehearsal-${crypto.randomUUID()}`);
  const runtime = Object.freeze({ firestore: getFirestore(app), auth: getAuth(app), close: () => deleteApp(app) });
  runtimes.add(runtime);
  return runtime;
}
export function assertRuntime(runtime) {
  assertEmulators();
  requireValue(runtimes.has(runtime) && runtime.firestore.projectId === DEMO_PROJECT_ID, "untrusted_runtime");
}
