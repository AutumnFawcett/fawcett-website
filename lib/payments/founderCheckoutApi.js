import { createIdempotentFounderCheckout } from "./checkoutService.js";
import { FOUNDER_REQUEST_ID_PATTERN, isSafeSquareCheckoutUrl } from "./founderCheckoutValidation.js";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body, status) => Response.json(body, { status, headers: NO_STORE });

function safeResult(checkout) {
  if (typeof checkout?.orderId !== "string" || !checkout.orderId || checkout.orderId.length > 40 || typeof checkout.checkoutUrl !== "string") return false;
  return isSafeSquareCheckoutUrl(checkout.checkoutUrl);
}

export async function handleFounderCheckoutRequest(request, dependencies) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ error: "invalid_request" }, 415);
  let clientUid;
  try { clientUid = await dependencies.authenticate(request); } catch { return json({ error: "authentication_required" }, 401); }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 1024) return json({ error: "invalid_request" }, 413);
  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1024) return json({ error: "invalid_request" }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: "invalid_request" }, 400); }
  if (!body || Object.getPrototypeOf(body) !== Object.prototype || Object.keys(body).length !== 2 || Object.keys(body).some((key) => !["offerId", "requestId"].includes(key)) || typeof body.requestId !== "string" || !FOUNDER_REQUEST_ID_PATTERN.test(body.requestId) || typeof body.offerId !== "string") return json({ error: "invalid_request" }, 400);
  let config;
  try { config = dependencies.getConfig(); } catch { return json({ error: "service_unavailable" }, 503); }
  if (!config.paymentsEnabled) return json({ error: "payments_disabled" }, 503);
  try {
    const checkout = await dependencies.checkout({ input: { offerId: body.offerId }, requestId: body.requestId, clientUid, config, ...(await dependencies.getCheckoutDependencies()) });
    if (!safeResult(checkout)) throw new Error("unsafe_checkout_result");
    return json({ orderId: checkout.orderId, checkoutUrl: checkout.checkoutUrl }, 200);
  } catch (error) {
    const codes = {
      unknown_offer: ["invalid_request", 400], checkout_request_conflict: ["request_conflict", 409], checkout_rate_limited: ["rate_limited", 429],
      checkout_outcome_unknown: ["provider_outcome_unknown", 503], checkout_persistence_pending: ["reconciliation_pending", 503],
      checkout_request_inconsistent: ["internal_inconsistency", 500],
    };
    const [code, status] = codes[error?.message] || ["service_unavailable", 503];
    return json({ error: code }, status);
  }
}

export { createIdempotentFounderCheckout };
