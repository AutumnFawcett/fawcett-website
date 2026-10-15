// Development fixture only, deliberately outside the read/write operator adapter.
// This does not issue a grant or approve a migration manifest.
import fs from "node:fs/promises";
import { createRehearsalRuntime } from "../lib/migration/runtime.mjs";
import { seed, tokenFor, operator, reviewed } from "../tests/operator/fixtures.mjs";
import { inventory, prepareManifest, prepareApproval } from "../operator/operations.mjs";
import { requireValue } from "../lib/migration/model.mjs";
import { OWNER } from "../lib/migration/fixtures.mjs";
const [confirm, outputDir, ...extra] = process.argv.slice(2);
requireValue(confirm === "SYNTHETIC_OPERATOR_SETUP_ONLY" && outputDir && !extra.length, "synthetic_fixture_confirmation_and_new_directory_required");
const raw = createRehearsalRuntime(); let runtime;
try {
  await fs.mkdir(outputDir, { mode: 0o700 });
  await seed(raw); const token = await tokenFor(); runtime = operator(token);
  const snapshot = await inventory(runtime);
  // Reuse only synthetic evidence construction, never its approved decisions.
  const evidence = (await reviewed(runtime, [])).evidence;
  const draft = prepareManifest(snapshot, "synthetic-operator-demo", evidence);
  const candidate = await prepareApproval(runtime, snapshot, `clients/${OWNER}`, ["clientUid", "clientName", "status", "createdAt", "updatedAt"]);
  for (const [name, data] of Object.entries({ "operator-token.txt": token, "inventory.json": snapshot, "evidence.json": evidence, "manifest-draft.json": draft, "client-review.json": candidate })) {
    await fs.writeFile(`${outputDir}/${name}`, typeof data === "string" ? `${data}\n` : `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  }
  console.log("Known fictional fixtures and private draft artifacts prepared. All manifest decisions remain withheld; no authorization was issued.");
} finally { if (runtime) await runtime.close(); await raw.close(); }
