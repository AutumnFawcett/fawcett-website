// Deliberately accepts NO input files or project arguments. Synthetic fixture only.
import { reconcileLegacy } from "../lib/ledger/import/reconcile.mjs";
import { sourceKey } from "../lib/ledger/import/manifest.mjs";
import { manifest, row, usage, source, provider } from "../tests/legacy-import/fixtures.mjs";
if (process.argv.length !== 2) throw Error("synthetic_demo_accepts_no_arguments");
const receipt = row();
const mirror = row({ source: source("reviewed_mirror", "creditLedger"), mirrorOf: sourceKey(receipt), mirrorApprovalId: "synthetic_mirror_review" });
const external = row({ source: source("external_simulator", "tattooSandboxTransactions", "synthetic_sandbox"), environment: "sandbox", method: "square",
  manualEvidenceId: null, provider: provider({ environment: "sandbox", sourceType: "EXTERNAL", externalDetailsPresent: true }) });
const report = reconcileLegacy(manifest([receipt, usage(), mirror, external]));
console.log(JSON.stringify(report, null, 2));
