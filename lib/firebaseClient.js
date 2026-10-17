import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import { createFirebaseInitializer } from "./firebaseInitialization.mjs";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let services;

const initialize = createFirebaseInitializer(
  firebaseConfig,
  { getApp, getApps, initializeApp, getAuth, getFirestore, getStorage },
  () => typeof window !== "undefined",
);

export function initializeFirebaseClient() {
  services = initialize();
  return services;
}

// Read inside protected component render, after browser initialization. Do not
// export mutable SDK bindings: compiled effects can capture their initial value.
export function getFirebaseClient() {
  if (!services) throw new Error("Firebase browser services are not initialized.");
  return services;
}
