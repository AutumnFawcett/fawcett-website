import { firebaseEnvironment, serverFirebaseEnvironment } from "./lib/firebaseEnvironment.mjs";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
firebaseEnvironment({ mode: process.env.NEXT_PUBLIC_FIREBASE_MODE, nodeEnv: process.env.NODE_ENV, deploymentEnv: process.env.VERCEL_ENV, config });
const serverEnvironment = serverFirebaseEnvironment(process.env);
if (serverEnvironment.mode === "emulator" && process.env.SQUARE_PAYMENTS_ENABLED === "true") {
  throw new Error("Payments must remain disabled in emulator development");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  agentRules: process.env.VERCEL_ENV === "production" ? undefined : false,
  // Derived from the deployment platform, never a user-supplied public override.
  env: { NEXT_PUBLIC_FIREBASE_DEPLOYMENT_ENV: process.env.VERCEL_ENV || "local" },
};
export default nextConfig;
