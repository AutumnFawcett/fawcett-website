import { verifySquareSignature } from "./squareWebhook.js";
import { processSquareWebhook } from "./webhookProcessor.js";

function json(outcome, status, reason) {
  return { status, body: { outcome, ...(reason && { reason }) } };
}

export async function handleSquareWebhook({ request, config, firestore, now, process = processSquareWebhook }) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");
  if (!verifySquareSignature({ rawBody, signature, signatureKey: config.webhookSignatureKey, notificationUrl: config.notificationUrl })) return json("invalid", 401, "invalid_signature");
  let event;
  try { event = JSON.parse(rawBody); } catch { return json("invalid", 400, "malformed_json"); }
  if (!event || typeof event.event_id !== "string" || !event.event_id || typeof event.type !== "string" || !event.type) return json("invalid", 400, "missing_event_identity");
  if (event.environment && event.environment.toLowerCase() !== config.environment) return json("invalid", 400, "environment_mismatch");
  try {
    const result = await process({ firestore, environment: config.environment, event, rawBody, now });
    return json(result.outcome, result.outcome === "invalid" ? 409 : 200, result.reason);
  } catch { return json("retryable", 503, "processing_unavailable"); }
}
