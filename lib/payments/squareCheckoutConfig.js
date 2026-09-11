const ENVIRONMENTS = new Set(["sandbox", "production"]);

export function assertSquareCheckoutConfig(config) {
  if (!config || !ENVIRONMENTS.has(config.environment)) throw new Error("invalid_square_environment");
  if (typeof config.locationId !== "string" || !config.locationId.trim()) {
    throw new Error("missing_square_location");
  }
  if (typeof config.redirectUrl !== "string" || !config.redirectUrl.startsWith("https://") && !config.redirectUrl.startsWith("http://localhost")) throw new Error("invalid_redirect_url");
  if (typeof config.acknowledgementVersion !== "string" || !config.acknowledgementVersion) throw new Error("invalid_acknowledgement_version");
}
