import { assertMoney } from "./founderOffers.js";
import { isSafeSquareCheckoutUrl } from "./founderCheckoutValidation.js";

function requiredString(value, code) {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value;
}

export function validatePaymentLinkResponse(response, order) {
  const paymentLink = response?.paymentLink ?? response?.payment_link;
  const squareOrder = response?.order ?? response?.relatedResources?.orders?.[0] ?? response?.related_resources?.orders?.[0];
  const providerPaymentLinkId = requiredString(paymentLink?.id, "invalid_payment_link_id");
  const providerOrderId = requiredString(squareOrder?.id ?? paymentLink?.orderId ?? paymentLink?.order_id, "missing_provider_order_id");
  const checkoutUrl = requiredString(paymentLink?.url, "invalid_checkout_url");
  let parsed;
  try { parsed = new URL(checkoutUrl); } catch { throw new Error("invalid_checkout_url"); }
  if (parsed.hostname !== "square.link" && parsed.hostname !== "checkout.square.site") throw new Error("invalid_checkout_host");
  if (!isSafeSquareCheckoutUrl(checkoutUrl)) throw new Error("invalid_checkout_url");

  const total = squareOrder?.totalMoney ?? squareOrder?.total_money;
  if (total !== undefined) {
    const amount = typeof total.amount === "bigint" && total.amount <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(total.amount) : total.amount;
    assertMoney(amount, total.currency);
    if (amount !== order.amountCents) throw new Error("provider_amount_mismatch");
  }
  return { providerPaymentLinkId, providerOrderId, checkoutUrl };
}
