import fs from "node:fs/promises";
import { createRehearsalRuntime } from "../lib/migration/runtime.mjs";
import { applyMigration, planMigration, rollbackMigration } from "../lib/migration/engine.mjs";
import { seedSyntheticRehearsal, syntheticManifest } from "../lib/migration/fixtures.mjs";
import { requireValue } from "../lib/migration/model.mjs";

const [command, ...args] = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  requireValue(["--manifest", "--report", "--confirm", "--run-id"].includes(args[i]) && args[i + 1] && !Object.hasOwn(options, args[i]), "unsupported_or_duplicate_option");
  options[args[i]] = args[i + 1];
}
requireValue(["seed-synthetic", "sample-manifest", "plan", "apply", "rollback"].includes(command), "unsupported_command");
requireValue(command === "seed-synthetic" || options["--report"], "private_report_required");
// No CLI project, credential, remote host, import or production-enable option.
const runtime = createRehearsalRuntime();
let output;
try {
  // Reserve a NEW private output before any writes; never overwrite an approval
  // or discover an unavailable report path after committing projections.
  if (options["--report"]) output = await fs.open(options["--report"], "wx", 0o600);
  let report;
  if (command === "seed-synthetic") report = await seedSyntheticRehearsal(runtime, options["--confirm"]);
  else if (command === "sample-manifest") report = await syntheticManifest(runtime, options["--run-id"], options["--confirm"]);
  else {
    const manifest = JSON.parse(await fs.readFile(options["--manifest"], "utf8"));
    if (command === "rollback") report = await rollbackMigration(runtime, manifest, options["--confirm"]);
    else {
      report = await planMigration(runtime, manifest);
      if (command === "apply" && report.counts.error === 0) report = await applyMigration(runtime, manifest, options["--confirm"]);
    }
  }
  if (output) await output.writeFile(`${JSON.stringify(report, null, 2)}\n`);
  // Do not print names, emails, notes, message bodies or Auth tokens.
  console.log(JSON.stringify({ syntheticOnly: true, command, ...(report.counts ? { counts: report.counts, total: report.total } : { generated: true }) }));
  if (report.counts?.error) process.exitCode = 1;
} catch (error) {
  const code = /^[a-z][a-z0-9_]+$/.test(error.message) ? error.message : "rehearsal_stopped";
  if (output) await output.writeFile(`${JSON.stringify({ syntheticOnly: true, error: code, counts: { error: 1 } })}\n`).catch(() => {});
  console.error("Rehearsal stopped. Check emulator guards, approvals and the private report. No production fallback is available.");
  process.exitCode = 1;
} finally { if (output) await output.close(); await runtime.close(); }
