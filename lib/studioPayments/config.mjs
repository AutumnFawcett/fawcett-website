import { getFounderLaunchConfig, parsePaymentsEnabled } from "../server/founderLaunchConfig.js";
export function getStudioCheckoutConfig({ env = process.env } = {}) {
  // Both independent switches must be enabled. Founder-only activation cannot
  // accidentally enable studio checkout, or vice versa.
  if (!parsePaymentsEnabled(env.SQUARE_STUDIO_PAYMENTS_ENABLED) || !parsePaymentsEnabled(env.SQUARE_PAYMENTS_ENABLED)) return { paymentsEnabled: false };
  const config = getFounderLaunchConfig({ env });
  return { ...config, redirectUrl: `${config.canonicalOrigin}/payments/return` };
}
