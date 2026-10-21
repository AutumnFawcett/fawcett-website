const STAGES = new Set([
  "admin_verification", "sandbox_journal_read", "square_link_request", "sandbox_journal_write",
]);
const REASONS = new Set([
  "invalid_sandbox_journal_private_key", "sandbox_google_token_unavailable",
  "invalid_sandbox_google_token", "sandbox_firestore_read_failed", "sandbox_firestore_commit_failed",
]);
const GOOGLE_REASONS = new Set([
  "IAM_PERMISSION_DENIED", "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "SERVICE_DISABLED",
  "BILLING_DISABLED", "VPC_SERVICE_CONTROLS", "ORG_RESTRICTION_VIOLATION", "CONSUMER_INVALID",
]);
const PERMISSIONS = new Set([
  "datastore.entities.create", "datastore.entities.update", "datastore.entities.get",
  "datastore.entities.list", "datastore.databases.get", "datastore.databases.getMetadata",
]);

// Revalidate at the response/log boundary even though the store also filters
// Google details. Never serialize the exception or spread caller-owned fields.
export function reportTattooSandboxFailure(stage, error, {
  env = {}, logger = line => console.warn(line),
} = {}) {
  const diagnostic = {
    stage: STAGES.has(stage) ? stage : "unknown_stage",
    reason: REASONS.has(error?.message) ? error.message : "unexpected_failure",
  };
  if (diagnostic.stage === "sandbox_journal_write" && diagnostic.reason === "sandbox_firestore_commit_failed"
    && Number.isInteger(error?.httpStatus) && error.httpStatus >= 400 && error.httpStatus <= 599) {
    diagnostic.httpStatus = error.httpStatus;
    if (error.httpStatus === 403) {
      if (PERMISSIONS.has(error.missingPermission)) diagnostic.missingPermission = error.missingPermission;
      if (GOOGLE_REASONS.has(error.googleReason)) diagnostic.googleReason = error.googleReason;
    }
  }
  if (env.VERCEL_ENV === "preview") {
    try {
      logger(JSON.stringify({ event: "tattoo_sandbox_checkout_failure", ...diagnostic }));
    } catch {
      // A logging failure must not alter the original controlled response or
      // cause another provider request. No raw-error fallback logging.
    }
  }
  return diagnostic;
}
