import { FOUNDER_OFFERS } from "./founderOffers.js";
import { assertFounderRequestId, isSafeSquareCheckoutUrl } from "./founderCheckoutValidation.js";

export function buildFounderCheckoutBody(offerId, requestId) {
  if (typeof offerId !== "string" || !Object.hasOwn(FOUNDER_OFFERS, offerId)) throw new Error("invalid_offer");
  assertFounderRequestId(requestId);
  return { offerId, requestId };
}

export function validateFounderCheckoutResult(response, result) {
  if (!response?.ok || !result || Object.getPrototypeOf(result) !== Object.prototype
    || Object.keys(result).length !== 2 || !Object.hasOwn(result, "orderId")
    || !Object.hasOwn(result, "checkoutUrl") || typeof result.orderId !== "string"
    || !result.orderId || result.orderId.length > 40 || !isSafeSquareCheckoutUrl(result.checkoutUrl)) {
    throw new Error("checkout_failed");
  }
  return result;
}
