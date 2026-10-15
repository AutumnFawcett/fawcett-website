import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { firebaseEnvironment, EMULATOR_HOST, EMULATOR_PORTS } from "./firebaseEnvironment.mjs";

const environment = firebaseEnvironment({
  mode: process.env.NEXT_PUBLIC_FIREBASE_MODE,
  nodeEnv: process.env.NODE_ENV,
  deploymentEnv: process.env.NEXT_PUBLIC_FIREBASE_DEPLOYMENT_ENV,
  config: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  },
});
const existing = getApps().length > 0;
const app = existing ? getApp() : initializeApp(environment.config);
if (app.options.projectId !== environment.config.projectId) throw new Error("Firebase app project mismatch");
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Mark SDK instances to survive module reloads without reconnecting them.
const connected = Symbol.for("fawcett.firebase.emulators.connected");
if (environment.mode === "emulator") {
  if (!auth[connected]) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`);
    auth[connected] = true;
  }
  if (!db[connected]) {
    connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
    db[connected] = true;
  }
  if (!storage[connected]) {
    connectStorageEmulator(storage, EMULATOR_HOST, EMULATOR_PORTS.storage);
    storage[connected] = true;
  }
}
