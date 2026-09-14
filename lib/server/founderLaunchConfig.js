export const FOUNDER_ACKNOWLEDGEMENT_VERSION = "founder-terms-2026-09-11";
export const FOUNDER_RETURN_PATH = "/founders/return";
const ENVIRONMENTS = new Set(["sandbox", "production"]);
const PRODUCTION_HOSTS = new Set(["fawcetttattoos.com", "www.fawcetttattoos.com"]);
const PHASE_1I_PREVIEW_ORIGIN = "https://fawcett-website-git-codex-phase-f141c7-autumnfawcetts-projects.vercel.app";
const PHASE_1I_PREVIEW_BRANCH = "codex/phase-1i-founder-sandbox-rehearsal";

function required(env, name) {
  if (typeof env[name] !== "string" || !env[name].trim()) throw new Error("founder_launch_unavailable");
  return env[name].trim();
}

export function parsePaymentsEnabled(value) {
  if (value === "true") return true;
  if (value === "false" || value === undefined) return false;
  throw new Error("founder_launch_unavailable");
}

export function validateCanonicalOrigin(value, {
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
  vercelGitCommitRef = process.env.VERCEL_GIT_COMMIT_REF,
} = {}) {
  if (typeof value !== "string" || value !== value.trim()) throw new Error("founder_launch_unavailable");
  let url;
  try { url = new URL(value); } catch { throw new Error("founder_launch_unavailable"); }
  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  // Temporary, rehearsal-only exception for the controlled Phase 1I Vercel Preview.
  const phase1IPreview = value === PHASE_1I_PREVIEW_ORIGIN
    && nodeEnv === "production"
    && vercelEnv === "preview"
    && vercelGitCommitRef === PHASE_1I_PREVIEW_BRANCH;
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.origin !== value
    || (localhost ? !["development", "test"].includes(nodeEnv) : url.protocol !== "https:")
    || (!localhost && !PRODUCTION_HOSTS.has(url.hostname) && !phase1IPreview)) throw new Error("founder_launch_unavailable");
  return url.origin;
}

export function getFounderLaunchConfig({ env = process.env } = {}) {
  const paymentsEnabled = parsePaymentsEnabled(env.SQUARE_PAYMENTS_ENABLED);
  if (!paymentsEnabled) return Object.freeze({ state: "disabled", paymentsEnabled: false });
  const environment = required(env, "SQUARE_ENVIRONMENT");
  if (!ENVIRONMENTS.has(environment)) throw new Error("founder_launch_unavailable");
  const canonicalOrigin = validateCanonicalOrigin(env.FOUNDER_CANONICAL_ORIGIN, {
    nodeEnv: env.NODE_ENV,
    vercelEnv: env.VERCEL_ENV,
    vercelGitCommitRef: env.VERCEL_GIT_COMMIT_REF,
  });
  return Object.freeze({
    state: "enabled", paymentsEnabled: true, environment, canonicalOrigin,
    redirectUrl: `${canonicalOrigin}${FOUNDER_RETURN_PATH}`,
    accessToken: required(env, "SQUARE_ACCESS_TOKEN"), locationId: required(env, "SQUARE_LOCATION_ID"),
    webhookSignatureKey: required(env, "SQUARE_WEBHOOK_SIGNATURE_KEY"), notificationUrl: required(env, "SQUARE_WEBHOOK_NOTIFICATION_URL"),
    acknowledgementVersion: FOUNDER_ACKNOWLEDGEMENT_VERSION,
  });
}

export function getFounderLaunchState(options) {
  try { return getFounderLaunchConfig(options); } catch { return Object.freeze({ state: "unavailable", paymentsEnabled: false }); }
}
