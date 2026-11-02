import { spawnSync } from "node:child_process";
const project="demo-fawcett-ledger";
const result=spawnSync(process.execPath,["node_modules/firebase-tools/lib/bin/firebase.js","emulators:exec","--config","firebase.commands-emulator.json",
  "--project",project,"--only","auth,firestore","node --conditions=react-server --test --test-concurrency=1 tests/financial-commands/*.test.mjs"],
{stdio:"inherit",env:{...process.env,CI:"true",GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FIRESTORE_EMULATOR_HOST:"127.0.0.1:8087",
  FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9097",FIREBASE_CLI_DISABLE_UPDATE_CHECK:"true"}});
process.exit(result.status??1);
