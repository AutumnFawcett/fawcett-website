// Server-side Sandbox transport only. Never import this into client components.
import { sandboxJournalEnabled } from "./tattooSandboxWebhook.mjs";

export async function getTattooSandboxPayment(paymentId, { env, fetcher = fetch }) {
  if (!sandboxJournalEnabled(env) || !/^[A-Za-z0-9_-]{1,160}$/.test(paymentId || "")) {
    throw Error("sandbox_payment_verification_disabled");
  }
  try {
    const response = await fetcher("https://connect.squareupsandbox.com/v2/payments/" + encodeURIComponent(paymentId), {
      method: "GET", headers: {
        Authorization: "Bearer " + env.SQUARE_TATTOO_SANDBOX_ACCESS_TOKEN,
        "Square-Version": "2026-09-16", Accept: "application/json",
      }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    // Includes 404/eventual visibility, 429, auth failures and provider outages.
    // Do not persist a terminal event; let Square redeliver after investigation.
    if (!response.ok) throw Error("unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw Error("empty");
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65536) { await reader.cancel(); throw Error("oversized"); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const raw = Buffer.concat(chunks).toString("utf8");
    const data = JSON.parse(raw);
    if (!data?.payment || typeof data.payment !== "object" || Array.isArray(data.payment)) throw Error("invalid");
    return data.payment;
  } catch {
    // No raw responses, headers, tokens, URLs or provider errors escape.
    throw Error("sandbox_payment_readback_unavailable");
  }
}

export function verifiedSandboxCard(payment, webhookPayment, order) {
  if (!payment || !webhookPayment || !order) return false;
  return payment.id === webhookPayment.id
    && payment.order_id === order.providerOrderId
    && payment.location_id === order.locationId
    && payment.amount_money?.amount === order.amountCents
    && Number.isSafeInteger(payment.amount_money?.amount)
    && payment.amount_money?.currency === "CAD"
    && payment.status === "COMPLETED" && payment.source_type === "CARD"
    && !Object.hasOwn(payment, "external_details")
    && [payment, webhookPayment].every(p => !Object.hasOwn(p, "card_details")
      || (!!p.card_details && p.card_details.status === "CAPTURED"))
    && (!payment.card_details?.card?.card_type
      || ["CREDIT", "DEBIT"].includes(payment.card_details.card.card_type))
    && (!webhookPayment.card_details?.card?.card_type
      || ["CREDIT", "DEBIT"].includes(webhookPayment.card_details.card.card_type));
}

// Only these versioned, readback-verified rows are eligible for future
// reconciliation. Historical providerConfirmed=true alone is never sufficient.
export function isVerifiedSandboxCharge(row) {
  return row?.kind === "confirmed_charge" && row.provider === "square"
    && row.environment === "sandbox" && row.status === "COMPLETED"
    && row.providerConfirmed === true && row.providerReadbackVerified === true
    && row.paymentVerificationVersion === 1 && row.sourceType === "CARD"
    && row.studioCreditIssued === false;
}
