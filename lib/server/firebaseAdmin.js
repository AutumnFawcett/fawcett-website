import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function required(name, env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

export function getFirebaseAdmin({ env = process.env } = {}) {
  const app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: required("FIREBASE_ADMIN_PROJECT_ID", env),
          clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL", env),
          privateKey: required("FIREBASE_ADMIN_PRIVATE_KEY", env).replace(/\\n/g, "\n"),
        }),
      });

  return { app, auth: getAuth(app), firestore: getFirestore(app) };
}
