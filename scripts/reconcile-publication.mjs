import { createRehearsalRuntime } from "../lib/migration/runtime.mjs";
import { reconcilePublication } from "../lib/safety/reconciliation.mjs";
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--frozen-at") throw new Error("Usage: node scripts/reconcile-publication.mjs --frozen-at ISO_TIMESTAMP (synthetic emulators only)");
const runtime = createRehearsalRuntime();
try { console.log(JSON.stringify(await reconcilePublication(runtime, { frozenAt: args[1] }), null, 2)); }
finally { await runtime.close(); }
