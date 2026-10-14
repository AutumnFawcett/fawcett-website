import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { serverFirebaseEnvironment, DEMO_PROJECT_ID } from "../firebaseEnvironment.mjs";

function required(name, env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

export function getFirebaseAdmin({ env = process.env } = {}) {
  const environment = serverFirebaseEnvironment(env);
  if (environment.mode === "emulator") {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    const name = "fawcett-emulator-admin";
    const app = getApps().find((item) => item.name === name) || initializeApp({ projectId: DEMO_PROJECT_ID }, name);
    if (app.options.projectId !== DEMO_PROJECT_ID) throw new Error("Firebase Admin project mismatch");
    return { app, auth: getAuth(app), firestore: getFirestore(app) };
  }
  const app = getApps().some((item) => item.name === "[DEFAULT]")
    ? getApp()
    : initializeApp({
        projectId: required("FIREBASE_ADMIN_PROJECT_ID", env),
        credential: cert({
          projectId: required("FIREBASE_ADMIN_PROJECT_ID", env),
          clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL", env),
          privateKey: required("FIREBASE_ADMIN_PRIVATE_KEY", env).replace(/\\n/g, "\n"),
        }),
      });

  if (app.options.projectId !== required("FIREBASE_ADMIN_PROJECT_ID", env)) throw new Error("Firebase Admin project mismatch");
  return { app, auth: getAuth(app), firestore: getFirestore(app) };
}
