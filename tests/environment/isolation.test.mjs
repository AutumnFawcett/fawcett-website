import test from "node:test";
import assert from "node:assert/strict";
import { firebaseEnvironment, serverFirebaseEnvironment, DEMO_PROJECT_ID } from "../../lib/firebaseEnvironment.mjs";

for (const nodeEnv of ["development", "test", "production"]) {
  test(`local ${nodeEnv} defaults to demo emulators`, () => {
    assert.equal(firebaseEnvironment({ nodeEnv }).config.projectId, DEMO_PROJECT_ID);
  });
  test(`local ${nodeEnv} rejects explicit live mode`, () => {
    assert.throws(() => firebaseEnvironment({ nodeEnv, mode: "production", config: { projectId: "real-project", apiKey: "real-key" } }));
  });
}
test("preview rejects live mode and live public configuration", () => {
  assert.throws(() => firebaseEnvironment({ deploymentEnv: "preview", nodeEnv: "production", mode: "production" }));
  for (const key of ["projectId", "apiKey", "authDomain", "storageBucket", "appId", "messagingSenderId"]) {
    assert.throws(() => firebaseEnvironment({ config: { [key]: "live-value" } }));
  }
});
test("production retains live config and rejects emulator mode", () => {
  const config = { projectId: "live-project", apiKey: "live-key" };
  assert.deepEqual(firebaseEnvironment({ nodeEnv: "production", deploymentEnv: "production", config }).config, config);
  assert.throws(() => firebaseEnvironment({ nodeEnv: "production", deploymentEnv: "production", mode: "emulator" }));
  assert.throws(() => firebaseEnvironment({ nodeEnv: "test", deploymentEnv: "production", config }));
});
test("Admin cannot use live projects, credentials or remote emulator endpoints locally", () => {
  for (const key of ["FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]) {
    assert.throws(() => serverFirebaseEnvironment({ [key]: "live-value" }));
  }
  assert.equal(serverFirebaseEnvironment({ FIREBASE_ADMIN_PROJECT_ID: DEMO_PROJECT_ID, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }).mode, "emulator");
});

test("Next config derives the browser boundary and rejects live settings before a build", async () => {
  const { spawnSync } = await import("node:child_process");
  const clean = { ...process.env, NODE_ENV: "production" };
  for (const key of Object.keys(clean)) {
    if (key.startsWith("NEXT_PUBLIC_FIREBASE_") || key.startsWith("FIREBASE_ADMIN_") || ["GOOGLE_APPLICATION_CREDENTIALS", "VERCEL_ENV", "FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "SQUARE_PAYMENTS_ENABLED"].includes(key)) delete clean[key];
  }
  const run = (extra, source = "await import('./next.config.mjs')") => spawnSync(process.execPath, ["--input-type=module", "-e", source], { cwd: process.cwd(), env: { ...clean, ...extra }, encoding: "utf8" });
  assert.equal(run({ NEXT_PUBLIC_FIREBASE_DEPLOYMENT_ENV: "production" }, "const {default:c}=await import('./next.config.mjs'); if(c.env.NEXT_PUBLIC_FIREBASE_DEPLOYMENT_ENV !== 'local') process.exit(1)").status, 0);
  assert.notEqual(run({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "live-project" }).status, 0);
  assert.notEqual(run({ FIREBASE_ADMIN_PROJECT_ID: "live-project" }).status, 0);
  assert.notEqual(run({ SQUARE_PAYMENTS_ENABLED: "true" }).status, 0);
  assert.notEqual(run({ NEXT_PUBLIC_FIREBASE_MODE: "production", VERCEL_ENV: "preview" }).status, 0);
});

test("seed refuses cloud project configuration before making any SDK request", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(process.execPath, ["scripts/seed-emulators.mjs"], { env: { ...process.env, FIREBASE_ADMIN_PROJECT_ID: "live-project" }, encoding: "utf8", timeout: 5000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Non-demo Firebase Admin project rejected/);
});
