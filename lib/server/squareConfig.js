import "server-only";

const ENVIRONMENTS = new Set(["sandbox", "production"]);

function required(name, env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

export function getSquareConfig({ env = process.env } = {}) {
  const environment = required("SQUARE_ENVIRONMENT", env);
  if (!ENVIRONMENTS.has(environment)) {
    throw new Error("SQUARE_ENVIRONMENT must be explicitly sandbox or production");
  }
  return Object.freeze({
    environment,
    accessToken: required("SQUARE_ACCESS_TOKEN", env),
    locationId: required("SQUARE_LOCATION_ID", env),
    webhookSignatureKey: required("SQUARE_WEBHOOK_SIGNATURE_KEY", env),
    notificationUrl: required("SQUARE_WEBHOOK_NOTIFICATION_URL", env),
    paymentsEnabled: env.SQUARE_PAYMENTS_ENABLED === "true",
  });
}
