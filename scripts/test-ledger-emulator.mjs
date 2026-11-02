import { spawnSync } from "node:child_process";
// Dedicated config/project; do not consume .firebaserc or live Firebase settings.
const project = "demo-fawcett-ledger";
const result = spawnSync(process.execPath, ["node_modules/firebase-tools/lib/bin/firebase.js", "emulators:exec",
  "--config", "firebase.ledger-emulator.json", "--project", project, "--only", "firestore",
  "node --conditions=react-server --test --test-concurrency=1 tests/ledger-firestore/*.test.mjs"], {
  stdio: "inherit", env: { ...process.env, GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project,
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8087", FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true" },
});
process.exit(result.status ?? 1);
