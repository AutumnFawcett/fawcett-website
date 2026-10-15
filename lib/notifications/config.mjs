import { serverFirebaseEnvironment } from "../firebaseEnvironment.mjs";

const address = value => typeof value === "string" && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value) && value.length <= 254;
export { address };
export function notificationConfig(env = process.env) {
  const mode = env.NOTIFICATIONS_MODE || "off";
  if (!["off", "test", "resend"].includes(mode)) throw new Error("invalid_notification_mode");
  if (mode === "off") return { mode };
  const firebase = serverFirebaseEnvironment(env);
  if (mode === "test" && firebase.mode !== "emulator") throw new Error("test_requires_emulators");
  if (mode === "resend" && (firebase.mode !== "production" || env.FIREBASE_ADMIN_PROJECT_ID !== "fawcett-website-sandbox" || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "fawcett-website-sandbox" || env.NOTIFICATIONS_ENABLED !== "true")) throw new Error("delivery_not_authorized");
  if (mode === "resend" && (!env.NOTIFICATION_FROM || !env.NOTIFICATION_STUDIO_RECIPIENTS || !env.NOTIFICATION_PORTAL_ORIGIN)) throw new Error("explicit_delivery_configuration_required");
  const origin = new URL(env.NOTIFICATION_PORTAL_ORIGIN || "http://localhost:3000");
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || (mode === "resend" && origin.protocol !== "https:") || (mode === "test" && !["localhost", "127.0.0.1"].includes(origin.hostname))) throw new Error("invalid_portal_origin");
  const from = env.NOTIFICATION_FROM || "studio@example.test";
  const studio = [...new Set((env.NOTIFICATION_STUDIO_RECIPIENTS || "studio@example.test").split(",").map(s => s.trim()))];
  if (!address(from) || !studio.length || studio.length > 10 || !studio.every(address)) throw new Error("invalid_email_configuration");
  if (mode === "test" && ![from, ...studio].every(s => s.endsWith("@example.test"))) throw new Error("synthetic_addresses_required");
  const since = Date.parse(env.NOTIFICATION_ACTIVATED_AT || "");
  if (!Number.isFinite(since)) throw new Error("activation_watermark_required");
  const audience = env.NOTIFICATIONS_AUDIENCE || "staging";
  if (!["staging", "live"].includes(audience)) throw new Error("invalid_audience");
  if (mode === "resend" && !env.RESEND_API_KEY) throw new Error("provider_key_required");
  return { mode, from, studio, since, audience, origin: origin.origin, apiKey: env.RESEND_API_KEY };
}
