// Sandbox-only, admin-authenticated, one-time Square checkout links.
// This creates NO Firebase payment/credit record, subscription or confirmed revenue.
// Production remains disabled until a separate, reviewed webhook reconciliation release.
import { sandboxJournalEnabled, journalId } from "./tattooSandboxWebhook.mjs";
import { makeTattooSandboxStore, recordSandboxCheckout } from "./tattooSandboxStore.mjs";

const PURPOSES = Object.freeze({
  tattoo_deposit: "Tattoo project deposit (Sandbox test)",
  tattoo_session: "Tattoo session (Sandbox test)",
  consult: "In-person consultation (Sandbox test)",
});

const result = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export function tattooSquareSandboxEnabled(env = {}) {
  return env.VERCEL_ENV === "preview"
    && env.SQUARE_TATTOO_SANDBOX_ENABLED === "true"
    && env.SQUARE_TATTOO_ENVIRONMENT === "sandbox"
    && env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "fawcett-website"
    && !!env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()
    && !!env.SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN?.trim()
    && !!env.SQUARE_TATTOO_SANDBOX_LOCATION_ID?.trim()
    && sandboxJournalEnabled(env);
}

export function validateTattooCheckoutInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.some(key => !["amountCents", "purpose", "idempotencyKey", "reviewed"].includes(key))) return null;
  const { amountCents, purpose, idempotencyKey, reviewed } = body;
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 1_000_000
    || !Object.hasOwn(PURPOSES, purpose)
    || typeof idempotencyKey !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(idempotencyKey)
    || reviewed !== true) return null;
  return { amountCents, purpose, idempotencyKey, name: PURPOSES[purpose] };
}

export function createTattooSquareRequest(input, locationId) {
  return {
    idempotency_key: "fawcett-tattoo-sandbox-" + input.idempotencyKey,
    quick_pay: {
      name: input.name,
      location_id: locationId,
      price_money: { amount: input.amountCents, currency: "CAD" },
    },
    description: "Sandbox-only Fawcett Tattoos checkout test. Not a membership or Studio Credit.",
  };
}

function validSquareLink(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  try {
    const url = new URL(raw);
    // Square controls the payment page: disallow arbitrary redirects and credentials.
    return url.protocol === "https:" && !url.username && !url.password
      && ["square.link", "sandbox.square.link", "checkout.square.site", "sandbox.checkout.square.site"].includes(url.hostname)
      && url.pathname !== "/";
  } catch { return false; }
}

async function requireStudioAdmin(token, env, fetcher) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_.-]{20,5000}$/.test(token)) return false;
  const authResponse = await fetcher("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(env.NEXT_PUBLIC_FIREBASE_API_KEY), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }),
    cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!authResponse.ok) return false;
  const account = (await authResponse.json()).users?.[0];
  if (!account || account.disabled === true || typeof account.localId !== "string"
    || !/^[A-Za-z0-9_-]{1,128}$/.test(account.localId)) return false;
  const adminUrl = "https://firestore.googleapis.com/v1/projects/fawcett-website/databases/(default)/documents/adminUsers/" + encodeURIComponent(account.localId);
  const adminResponse = await fetcher(adminUrl, {
    headers: { Authorization: "Bearer " + token }, cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!adminResponse.ok) return false;
  const record = await adminResponse.json();
  return record?.fields?.active?.booleanValue === true;
}

export async function handleTattooSquareSandbox(request, {
  env = process.env, fetcher = fetch, getStore = makeTattooSandboxStore,
} = {}) {
  if (request.method === "GET") {
    return result(200, { sandboxEnabled: tattooSquareSandboxEnabled(env), productionCheckoutEnabled: false });
  }
  if (request.method !== "POST") return result(405, { error: "method_not_allowed" });
  if (!tattooSquareSandboxEnabled(env)) return result(503, { error: "sandbox_checkout_disabled" });
  const header = request.headers.get("authorization");
  const token = /^Bearer (\S+)$/.exec(header || "")?.[1];
  if (!token) return result(401, { error: "admin_sign_in_required" });
  if (Number(request.headers.get("content-length")) > 2048) return result(413, { error: "request_too_large" });
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return result(413, { error: "request_too_large" });
    body = JSON.parse(raw);
  } catch { return result(400, { error: "invalid_request" }); }
  const input = validateTattooCheckoutInput(body);
  if (!input) return result(400, { error: "invalid_tattoo_checkout_input" });
  let diagnosticStage = "admin_verification";
  try {
    if (!await requireStudioAdmin(token, env, fetcher)) return result(403, { error: "admin_access_required" });
    diagnosticStage = "sandbox_journal_read";
    const store = getStore({ env, fetcher });
    // Verify sandbox journal write credentials BEFORE asking Square to create a link.
    const existing = await store.read("tattooSandboxOrders", journalId("checkout", input.idempotencyKey));
    if (existing) {
      if (existing.amountCents !== input.amountCents || existing.purpose !== input.purpose ||
        existing.locationId !== env.SQUARE_TATTOO_SANDBOX_LOCATION_ID ||
        !existing.providerLinkId || !existing.providerOrderId || !validSquareLink(existing.checkoutUrl)) {
        return result(409, { error: "sandbox_checkout_idempotency_collision" });
      }
      return result(200, { paymentLinkId: existing.providerLinkId, checkoutUrl: existing.checkoutUrl,
        orderId: existing.providerOrderId, environment: "sandbox", providerConfirmed: false,
        studioCreditIssued: false, duplicate: true });
    }
    diagnosticStage = "square_link_request";
    const square = await fetcher("https://connect.squareupsandbox.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN,
        "Square-Version": "2026-09-16",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createTattooSquareRequest(input, env.SQUARE_TATTOO_SANDBOX_LOCATION_ID)),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!square.ok) return result(502, { error: "square_sandbox_checkout_failed" });
    const data = await square.json();
    const link = data?.payment_link;
    if (!link?.id || !link.order_id || !validSquareLink(link.url)) {
      return result(502, { error: "unexpected_square_checkout_response" });
    }
    diagnosticStage = "sandbox_journal_write";
    await recordSandboxCheckout({
      store, input, link, locationId: env.SQUARE_TATTOO_SANDBOX_LOCATION_ID,
    });
    return result(200, {
      paymentLinkId: link.id,
      checkoutUrl: link.url,
      orderId: typeof link.order_id === "string" ? link.order_id : null,
      environment: "sandbox",
      providerConfirmed: false,
      studioCreditIssued: false,
    });
  } catch (error) {
    // Preview-only admin checkout. Return static diagnostics, never raw exceptions,
    // provider responses, tokens, keys or account identifiers.
    const safeReasons = new Set([
      "invalid_sandbox_journal_private_key",
      "sandbox_google_token_unavailable",
      "invalid_sandbox_google_token",
      "sandbox_firestore_read_failed",
      "sandbox_firestore_commit_failed",
    ]);
    const safeStatus = diagnosticStage === "sandbox_journal_write" &&
      error?.message === "sandbox_firestore_commit_failed" &&
      Number.isInteger(error?.httpStatus) && error.httpStatus >= 400 && error.httpStatus <= 599
        ? error.httpStatus : null;
    return result(503, {
      error: "sandbox_payment_service_unavailable",
      diagnostic: {
        stage: diagnosticStage,
        reason: safeReasons.has(error?.message) ? error.message : "unexpected_failure",
        ...(safeStatus ? { httpStatus: safeStatus } : {}),
        ...(safeStatus === 403 && typeof error?.missingPermission === "string"
          ? { missingPermission: error.missingPermission } : {}),
      },
    });
  }
}
