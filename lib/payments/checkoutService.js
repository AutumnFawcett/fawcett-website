import { randomUUID } from "node:crypto";
import { getFounderOffer } from "./founderOffers.js";
import { validatePaymentLinkResponse } from "./paymentLinkValidation.js";
import { assertSquareCheckoutConfig } from "./squareCheckoutConfig.js";

const ALLOWED_INPUTS = new Set(["offerId"]);

function assertRecoverableOrder(order, offer) {
  if (!order || order.status !== "creating" || order.provider !== "square"
    || order.environment === undefined || order.orderId?.length > 40
    || order.offerId !== offer.offerId || order.amountCents !== offer.amountCents
    || order.currency !== offer.currency || order.purpose !== offer.purpose
    || order.idempotencyKey !== `fawcett-${order.orderId}`
    || order.providerOrderId !== null || order.providerPaymentLinkId !== null
    || order.checkoutUrl !== null) {
    throw new Error("order_not_recoverable");
  }
}

async function createAndAttach({ order, offer, config, storage, provider, now }) {
  let response;
  try {
    response = await provider.createPaymentLink({ order, offer, locationId: config.locationId });
  } catch {
    await storage.markCreationFailed(order.orderId, "provider_creation_failed", now());
    throw new Error("checkout_creation_failed");
  }
  let identity;
  try {
    identity = validatePaymentLinkResponse(response, order);
  } catch {
    await storage.markCreationFailed(order.orderId, "provider_response_invalid", now());
    throw new Error("checkout_response_invalid");
  }
  const updatedAt = now();
  try {
    await storage.attachProviderIdentity(order.orderId, identity, updatedAt);
  } catch {
    const error = new Error("checkout_persistence_pending");
    error.orderId = order.orderId;
    error.idempotencyKey = order.idempotencyKey;
    throw error;
  }
  return { ...order, ...identity, status: "pending", updatedAt };
}

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
  return createAndAttach({ order, offer, config, storage, provider, now });
}

export async function reconcileFounderCheckout({ orderId, config, storage, provider, now = () => new Date() }) {
  if (!config?.paymentsEnabled) throw new Error("payments_disabled");
  assertSquareCheckoutConfig(config);
  if (typeof orderId !== "string" || !orderId || orderId.length > 40) throw new Error("invalid_order_id");
  const order = await storage.getOrder(orderId);
  const offer = getFounderOffer(order?.offerId);
  assertRecoverableOrder(order, offer);
  if (order.environment !== config.environment) throw new Error("order_environment_mismatch");
  return createAndAttach({ order, offer, config, storage, provider, now });
}
