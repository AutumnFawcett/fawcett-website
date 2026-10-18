import {
  WEBHOOK_MAX_BYTES, parseTattooSquareEvent, sandboxJournalEnabled,
  verifyTattooSquareSignature,
} from "./tattooSandboxWebhook.mjs";
import { journalVerifiedTattooEvent, makeTattooSandboxStore } from "./tattooSandboxStore.mjs";

const response = (status, outcome) => new Response(JSON.stringify({ outcome }), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export async function handleTattooSandboxWebhook(request, {
  env = process.env, fetcher = fetch, getStore = makeTattooSandboxStore,
} = {}) {
  if (request.method !== "POST") return response(405, "method_not_allowed");
  if (!sandboxJournalEnabled(env)) return response(503, "sandbox_webhook_disabled");
  // Square signs the exact subscribed notification URL plus raw request bytes.
  // Never trust request-supplied host or forwarded headers as that signing URL.
  if (request.url !== env.SQUARE_TATTOO_SANDBOX_NOTIFICATION_URL) return response(403, "webhook_url_mismatch");
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > WEBHOOK_MAX_BYTES) return response(413, "payload_too_large");
  let raw;
  try {
    raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > WEBHOOK_MAX_BYTES) return response(413, "payload_too_large");
  } catch { return response(400, "unreadable_payload"); }
  if (!verifyTattooSquareSignature(raw, request.headers.get("x-square-hmacsha256-signature"), env)) {
    return response(401, "invalid_square_signature");
  }
  const event = parseTattooSquareEvent(raw);
  if (!event) return response(400, "invalid_square_event");
  try {
    const store = getStore({ env, fetcher });
    const result = await journalVerifiedTattooEvent({ store, event, raw });
    // Unlinked but legitimately signed events are recorded as needing manual
    // review, not counted as received money or as Studio Credit.
    return response(200, result.outcome);
  } catch {
    // Retry on temporary storage failure, never acknowledge as confirmed.
    return response(503, "sandbox_journal_unavailable");
  }
}
