import { fingerprint, requireValue } from "../lib/migration/model.mjs";
import { writesOpen, WRITE_FENCE_PATH } from "../lib/safety/writeFence.mjs";
import { sealManifest, validateManifest, exactKeys, identifier, viewPath, policyPath, journalPath } from "./model.mjs";
export function closedFence(snapshot) {
  requireValue(snapshot.exists && snapshot.data.state === "maintenance" && writesOpen({ ...snapshot.data, state: "open" }), "verified_maintenance_fence_required");
  return { epoch: snapshot.data.epoch, controlHash: fingerprint(snapshot.data), version: snapshot.updated };
}
export async function authorize(runtime, context, tx) {
  exactKeys(context, ["manifest", "grantId", "operation"]);
  const manifest = sealManifest(context.manifest); validateManifest(manifest); identifier(context.grantId);
  requireValue(["apply", "withdraw"].includes(context.operation), "unsupported_operator_operation");
  const actorUid = await runtime.identifyOperator();
  const [control, grant] = await Promise.all([tx.read(WRITE_FENCE_PATH), tx.read(`migrationOperatorAuthorizations/${context.grantId}`)]);
  const fence = closedFence(control), mHash = fingerprint(manifest), e = manifest.evidence;
  requireValue(grant.exists, "operator_grant_required");
  const g = grant.data;
  exactKeys(g, ["schemaVersion", "syntheticOnly", "identity", "enabled", "runId", "manifestHash", "operation", "operatorUid", "ownerUid", "reviewerUid", "fence", "notBefore", "expiresAt"]);
  requireValue(g.schemaVersion === 1 && g.syntheticOnly === true && g.enabled === true && fingerprint(g.identity) === fingerprint(runtime.identity)
    && g.runId === manifest.runId && g.manifestHash === mHash && g.operation === context.operation
    && g.operatorUid === actorUid && actorUid === e.operatorUid && g.ownerUid === e.ownerUid && g.reviewerUid === e.reviewerUid, "operator_grant_mismatch");
  requireValue(fingerprint(g.fence) === fingerprint(fence), "fence_evidence_changed");
  if (context.operation === "apply") requireValue(fingerprint(fence) === fingerprint(manifest.inventory.fence), "manifest_fence_changed");
  requireValue(Number.isSafeInteger(g.notBefore) && Number.isSafeInteger(g.expiresAt) && g.expiresAt > g.notBefore && g.expiresAt - g.notBefore <= 86400000, "bounded_grant_lifetime_required");
  const current = () => {
    const now = Date.now();
    requireValue(now >= g.notBefore && now < g.expiresAt, "operator_grant_expired_or_not_active");
    if (context.operation === "apply") requireValue(now >= e.reviewedAt && now < e.expiresAt, "manifest_review_expired_or_not_active");
  };
  current();
  for (const uid of [e.ownerUid, e.reviewerUid, e.operatorUid]) {
    const [role, user] = await Promise.all([tx.read(`adminUsers/${uid}`), runtime.account(uid)]);
    requireValue(role.data?.active === true && !user.disabled, "operator_role_inactive");
  }
  const approved = manifest.decisions.filter(row => row.state === "approved");
  const writes = new Map();
  for (const row of approved) {
    writes.set(viewPath(row.path), { kind: "view", row }); writes.set(policyPath(row.path), { kind: "policy", row }); writes.set(journalPath(manifest, row.path), { kind: "journal", row });
  }
  const authorization = sealManifest({ grantId: context.grantId, grantHash: fingerprint(g), grantVersion: grant.updated, operatorUid: actorUid, operation: context.operation, fence });
  return {
    manifest, actorUid, authorization,
    check(method, path, value) {
      current();
      if (path === `operatorRuns/${manifest.runId}`) {
        requireValue(method === "create" && value.manifestHash === mHash && fingerprint(value.manifest) === mHash, "immutable_run_required"); return;
      }
      const allowed = writes.get(path); requireValue(allowed, "manifest_write_path_denied");
      if (allowed.kind === "view") {
        requireValue(context.operation === "withdraw" ? method === "remove" : method === "create" && fingerprint(value) === allowed.row.candidateHash, "reviewed_candidate_write_required");
      } else if (allowed.kind === "policy") {
        requireValue(method === "set" && value.runId === manifest.runId && (context.operation === "withdraw" ? value.state === "withheld" : value.state === "approved" && fingerprint(value.approved) === allowed.row.candidateHash), "publication_policy_write_denied");
      } else requireValue(value.manifestHash === mHash && value.path === allowed.row.path
        && (context.operation === "apply" ? method === "create" && value.state === "committed" && value.sourceHash === allowed.row.sourceHash && value.candidateHash === allowed.row.candidateHash && fingerprint(value.authorization) === fingerprint(authorization)
          : method === "update" && value.state === "withdrawn" && fingerprint(value.withdrawalAuthorization) === fingerprint(authorization)), "journal_write_denied");
    },
  };
}
