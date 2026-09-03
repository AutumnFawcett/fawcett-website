import { randomUUID } from "node:crypto";
import { getFounderOffer } from "./founderOffers.js";
import { validatePaymentLinkResponse } from "./paymentLinkValidation.js";
import { assertSquareCheckoutConfig } from "./squareCheckoutConfig.js";

const ALLOWED_INPUTS = new Set(["offerId"]);

export async function createFounderCheckout({ input, clientUid = null, config, storage, provider, now = () => new Date(), createId = () => randomUUID().replaceAll("-", "") }) {
  if (!config?.paymentsEnabled) throw new Error("payments_disabled");
  assertSquareCheckoutConfig(config);
  if (!input || Object.keys(input).some((key) => !ALLOWED_INPUTS.has(key))) throw new Error("untrusted_checkout_field");
  const offer = getFounderOffer(input.offerId);
  const orderId = createId();
  if (typeof orderId !== "string" || !orderId || orderId.length > 40) throw new Error("invalid_order_id");
  const timestamp = now();
  const idempotencyKey = `fawcett-${orderId}`;
  const order = {
    orderId, provider: "square", environment: config.environment, purpose: offer.purpose,
    offerId: offer.offerId, amountCents: offer.amountCents, currency: offer.currency,
    status: "creating", clientUid: typeof clientUid === "string" && clientUid ? clientUid : null,
    providerOrderId: null, providerPaymentLinkId: null, checkoutUrl: null, idempotencyKey,
    createdAt: timestamp, updatedAt: timestamp, failureCode: null,
  };
  await storage.createOrder(order);
  let response;
  try {
    response = await provider.createPaymentLink({ order, offer, locationId: config.locationId });
  } catch {
    await storage.markCreationFailed(orderId, "provider_creation_failed", now());
    throw new Error("checkout_creation_failed");
  }
  let identity;
  try {
    identity = validatePaymentLinkResponse(response, order);
  } catch {
    await storage.markCreationFailed(orderId, "provider_response_invalid", now());
    throw new Error("checkout_response_invalid");
  }
  const updatedAt = now();
  try {
    await storage.attachProviderIdentity(orderId, identity, updatedAt);
  } catch {
    const error = new Error("checkout_persistence_pending");
    error.orderId = orderId;
    error.idempotencyKey = idempotencyKey;
    throw error;
  }
  return { ...order, ...identity, status: "pending", updatedAt };
}
