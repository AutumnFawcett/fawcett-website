export const DEMO_PROJECT_ID = "demo-fawcett-dev";
export const EMULATOR_HOST = "127.0.0.1";
export const EMULATOR_PORTS = Object.freeze({ auth: 9099, firestore: 8080, storage: 9199 });

// NODE_ENV=production also applies to local Next builds. Only a Vercel
// Production deployment may select live Firebase; all other contexts fail closed.
export function firebaseEnvironment({ mode, nodeEnv, deploymentEnv, config = {} } = {}) {
  const selected = mode || (deploymentEnv === "production" ? "production" : "emulator");
  if (!["emulator", "production"].includes(selected)) throw new Error("Unsupported Firebase mode");
  if (selected === "production") {
    if (deploymentEnv !== "production" || nodeEnv !== "production") {
      throw new Error("Live Firebase is forbidden outside Vercel Production");
    }
    if (!config.projectId || config.projectId.startsWith("demo-") || !config.apiKey) {
      throw new Error("Production Firebase configuration is incomplete");
    }
    return { mode: selected, config };
  }
  if (deploymentEnv === "production") throw new Error("Emulators cannot be used in Vercel Production");
  // Reject supplied live configuration instead of silently ignoring it.
  const expected = {
    apiKey: "demo-fawcett-api-key", authDomain: "localhost",
    projectId: DEMO_PROJECT_ID, storageBucket: `${DEMO_PROJECT_ID}.appspot.com`,
    messagingSenderId: "000000000000", appId: "demo-fawcett-app",
  };
  for (const [key, value] of Object.entries(config)) {
    if (value && value !== expected[key]) throw new Error(`Non-demo Firebase configuration rejected: ${key}`);
  }
  return { mode: selected, config: expected };
}

export function serverFirebaseEnvironment(env) {
  const result = firebaseEnvironment({
    mode: env.NEXT_PUBLIC_FIREBASE_MODE, nodeEnv: env.NODE_ENV,
    deploymentEnv: env.VERCEL_ENV,
    config: { projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY },
  });
  if (result.mode === "emulator") {
    if (env.FIREBASE_ADMIN_PROJECT_ID && env.FIREBASE_ADMIN_PROJECT_ID !== DEMO_PROJECT_ID) {
      throw new Error("Non-demo Firebase Admin project rejected");
    }
    if (env.FIREBASE_ADMIN_CLIENT_EMAIL || env.FIREBASE_ADMIN_PRIVATE_KEY || env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error("Cloud credentials are forbidden in emulator mode");
    }
    for (const [name, expected] of Object.entries({
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    })) {
      if (env[name] && env[name] !== expected) throw new Error(`Non-local emulator endpoint rejected: ${name}`);
    }
  } else if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Emulator overrides forbidden in production");
  }
  return result;
}
