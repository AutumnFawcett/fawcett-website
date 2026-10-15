// Local synthetic queue tick only. Production operators must use the separately
// approved scheduled route; this script has no live delivery mode.
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { DEMO_PROJECT_ID, serverFirebaseEnvironment } from "../lib/firebaseEnvironment.mjs";
import { runNotifications } from "../lib/notifications/worker.mjs";
if (serverFirebaseEnvironment(process.env).mode !== "emulator" || ![undefined, "off", "test"].includes(process.env.NOTIFICATIONS_MODE)) throw new Error("Synthetic emulator notifications only");
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const app = initializeApp({ projectId: DEMO_PROJECT_ID }, "test-notifications");
try { console.log(JSON.stringify(await runNotifications(getFirestore(app), getAuth(app)))); }
finally { await deleteApp(app); }
