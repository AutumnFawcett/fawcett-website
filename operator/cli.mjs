import fs from "node:fs/promises";
import { constants } from "node:fs";
import { createSyntheticOperator, PRODUCTION_PROJECT } from "./runtime.mjs";
import { inventory, prepareManifest, prepareApproval, prepareAuthorization, reconcile, execute } from "./operations.mjs";
import { safeReason } from "./model.mjs";
import { requireValue } from "../lib/migration/model.mjs";
import { inventorySummary, reconciliationSummary } from "./reports.mjs";
const [operation, ...args] = process.argv.slice(2), options = {};
const names = ["--project", "--database", "--report", "--inventory", "--manifest", "--evidence", "--run-id", "--path", "--fields", "--grant-id", "--operator-token-file", "--limit", "--for-operation"];
let output, runtime;
async function artifact(path, token = false) {
  requireValue(typeof path === "string", "input_artifact_required");
  const file = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat(); requireValue(stat.isFile() && (stat.mode & 0o077) === 0 && stat.size <= 4194304, "private_bounded_artifact_required");
    const value = await file.readFile("utf8"); return token ? value.trim() : JSON.parse(value);
  } finally { await file.close(); }
}
try {
  requireValue(["inventory", "prepare-manifest", "prepare-approval", "prepare-authorization", "reconcile", "apply", "withdraw", "inventory-summary", "reconcile-summary"].includes(operation), "unsupported_operator_operation");
  for (let i = 0; i < args.length; i += 2) {
    requireValue(names.includes(args[i]) && args[i + 1] && !Object.hasOwn(options, args[i]), "unexpected_or_duplicate_option"); options[args[i]] = args[i + 1];
  }
  const common = ["--project", "--database", "--report"];
  const required = {
    "inventory-summary": [], "reconcile-summary": ["--manifest"], inventory: [], "prepare-manifest": ["--inventory", "--evidence", "--run-id"],
    "prepare-approval": ["--inventory", "--path", "--fields"], "prepare-authorization": ["--manifest", "--for-operation"],
    reconcile: ["--manifest"], apply: ["--manifest", "--grant-id", "--operator-token-file"], withdraw: ["--manifest", "--grant-id", "--operator-token-file"],
  }[operation];
  const allowed = [...common, ...required, ...(["apply", "withdraw"].includes(operation) ? ["--limit"] : [])];
  requireValue(Object.keys(options).every(name => allowed.includes(name)) && [...common, ...required].every(name => options[name]), "operation_specific_options_required");
  // Identity rejected before files, tokens or SDK initialization are accessed.
  requireValue(options["--project"] === "demo-fawcett-dev" && options["--database"] === "(default)", "explicit_demo_database_identity_required");
  requireValue(options["--report"], "new_private_report_required");
  runtime = createSyntheticOperator({ projectId: options["--project"], databaseId: options["--database"], intendedProductionProject: PRODUCTION_PROJECT,
    ...(options["--operator-token-file"] ? { operatorToken: await artifact(options["--operator-token-file"], true) } : {}) });
  // Reserve and sync a new protected report BEFORE any possible write.
  output = await fs.open(options["--report"], "wx", 0o600); await output.sync();
  let report;
  if (operation === "inventory-summary") report = inventorySummary(await inventory(runtime));
  else if (operation === "reconcile-summary") report = reconciliationSummary(await reconcile(runtime, await artifact(options["--manifest"])));
  else if (operation === "inventory") report = await inventory(runtime);
  else if (operation === "prepare-manifest") report = prepareManifest(await artifact(options["--inventory"]), options["--run-id"], await artifact(options["--evidence"]));
  else if (operation === "prepare-approval") report = await prepareApproval(runtime, await artifact(options["--inventory"]), options["--path"], JSON.parse(options["--fields"]));
  else if (operation === "prepare-authorization") report = await prepareAuthorization(runtime, await artifact(options["--manifest"]), options["--for-operation"]);
  else if (operation === "reconcile") report = await reconcile(runtime, await artifact(options["--manifest"]));
  else report = await execute(runtime, await artifact(options["--manifest"]), { operation: operation === "apply" ? "apply" : "withdraw", grantId: options["--grant-id"], ...(options["--limit"] ? { limit: Number(options["--limit"]) } : {}) });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  requireValue(Buffer.byteLength(serialized) <= 4194304, "report_artifact_limit_exceeded");
  await output.writeFile(serialized); await output.sync();
  console.log(JSON.stringify({ syntheticOnly: true, operation, ...(report.counts ? { counts: report.counts } : { prepared: true }) }));
  if (report.stopped || report.counts?.error) process.exitCode = 1;
} catch (error) {
  if (output) { await output.writeFile(`${JSON.stringify({ syntheticOnly: true, error: safeReason(error), stopped: true, counts: { error: 1 } })}\n`).catch(() => {}); await output.sync().catch(() => {}); }
  console.error("Synthetic operator stopped. Inspect the protected report and durable journals. Production execution is disabled."); process.exitCode = 1;
} finally { if (output) await output.close(); if (runtime) await runtime.close(); }
