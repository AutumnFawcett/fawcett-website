// Standalone owner executable; deliberately does not load app env, Firebase Admin,
// migration code, deployment tooling, provider SDKs or production settings.
import fs from "node:fs/promises";
import { cloudShellReaders } from "./cloud-shell.mjs";
import { audit } from "./engine.mjs";
import { check } from "./contracts.mjs";
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
let output;
try {
  check(process.execArgv.length === 0);
  const args = process.argv.slice(2);
  check(args.length === 3 && args[0] === "--iam-reviewed-read-only" && args[1] === "--output" && args[2]);
  output = await fs.open(args[2], "wx", 0o600);
  const report = await audit(cloudShellReaders({ acknowledged: true, signal: controller.signal }), { signal: controller.signal });
  await output.writeFile(`${JSON.stringify(report, null, 2)}\n`); await output.sync();
  console.log("Read-only audit completed. Review the private aggregate report; no upgrade is approved.");
} catch {
  // Never emit exception messages, stacks, HTTP bodies, credentials or identifiers.
  if (output) { await output.writeFile(`${JSON.stringify({ schemaVersion: 1, scanComplete: false, upgradeApproved: false, error: "AUDIT_INCOMPLETE" })}\n`).catch(() => {}); await output.sync().catch(() => {}); }
  console.error("Audit incomplete. No migration or upgrade is approved. Follow the protected owner review procedure."); process.exitCode = 1;
} finally { if (output) await output.close(); }
