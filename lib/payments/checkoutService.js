import { randomUUID } from "node:crypto";
import { getFounderOffer } from "./founderOffers.js";
import { validatePaymentLinkResponse } from "./paymentLinkValidation.js";
import { assertSquareCheckoutConfig } from "./squareCheckoutConfig.js";
import { assertFounderRequestId, isSafeSquareCheckoutUrl } from "./founderCheckoutValidation.js";

const ALLOWED_INPUTS = new Set(["offerId"]);

const SQUARE_ENVIRONMENTS = new Set(["sandbox", "production"]);

function reconciliationRequired(order) {
  const error = new Error("checkout_outcome_unknown");
  error.orderId = order.orderId;
  error.idempotencyKey = order.idempotencyKey;
  return error;
}

function timestampMs(value) {
  const milliseconds = value instanceof Date ? value.getTime() : value?.toMillis?.();
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

function assertReservedOrder(reservation, offer, requestId, clientUid, environment) {
  const { order, mapping } = reservation || {};
  const fail = () => { throw new Error("checkout_request_inconsistent"); };
  if (!mapping || mapping.requestId !== requestId || typeof order?.orderId !== "string" || !order.orderId
    || order.orderId.length > 40 || mapping.orderId !== order.orderId
    || mapping.clientUid !== clientUid || mapping.offerId !== offer.offerId
    || mapping.provider !== "square" || mapping.environment !== environment
    || order.clientUid !== clientUid || order.purpose !== "founder" || order.provider !== "square"
    || order.environment !== environment || order.offerId !== mapping.offerId || order.offerId !== offer.offerId
    || order.amountCents !== offer.amountCents || order.currency !== offer.currency
    || order.itemName !== offer.itemName || order.offerVersion !== offer.offerVersion
    || order.idempotencyKey !== `fawcett-${order.orderId}` || timestampMs(mapping.createdAt) === null
    || timestampMs(mapping.createdAt) !== timestampMs(order.createdAt) || timestampMs(order.createdAt) === null
    || timestampMs(order.updatedAt) === null || timestampMs(order.updatedAt) < timestampMs(order.createdAt)) fail();
  const blankProvider = order.providerOrderId === null && order.providerPaymentLinkId === null && order.checkoutUrl === null;
  if (order.status === "creating") {
    if (!blankProvider || order.failureCode !== null) fail();
  } else if (order.status === "pending") {
    if (typeof order.providerOrderId !== "string" || !order.providerOrderId.trim()
      || typeof order.providerPaymentLinkId !== "string" || !order.providerPaymentLinkId.trim()
      || !isSafeSquareCheckoutUrl(order.checkoutUrl) || order.failureCode !== null) fail();
  } else if (order.status === "creation_failed") {
    if (!blankProvider || order.failureCode !== "provider_response_invalid") fail();
  } else fail();
  return order;
}

function assertRecoverableOrder(order, offer, requestedOrderId, environment) {
  if (!order || typeof order.orderId !== "string" || !order.orderId
    || order.orderId !== requestedOrderId || order.orderId.length > 40
    || order.status !== "creating" || order.provider !== "square"
    || !SQUARE_ENVIRONMENTS.has(order.environment) || order.environment !== environment
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
    throw reconciliationRequired(order);
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

export async function createIdempotentFounderCheckout({ input, requestId, clientUid, config, storage, provider, now = () => new Date(), createId = () => randomUUID().replaceAll("-", "") }) {
  if (!config?.paymentsEnabled) throw new Error("payments_disabled");
  assertSquareCheckoutConfig(config);
  if (!input || Object.keys(input).some((key) => !ALLOWED_INPUTS.has(key))) throw new Error("untrusted_checkout_field");
  const offer = getFounderOffer(input.offerId);
  assertFounderRequestId(requestId);
  if (typeof clientUid !== "string" || !clientUid) throw new Error("invalid_client_uid");
  const orderId = createId();
  if (typeof orderId !== "string" || !orderId || orderId.length > 40) throw new Error("invalid_order_id");
  const timestamp = now();
  const order = {
    orderId, provider: "square", environment: config.environment, purpose: offer.purpose,
    offerId: offer.offerId, offerVersion: offer.offerVersion, itemName: offer.itemName, amountCents: offer.amountCents, currency: offer.currency,
    status: "creating", clientUid, providerOrderId: null, providerPaymentLinkId: null,
    checkoutUrl: null, idempotencyKey: `fawcett-${orderId}`, createdAt: timestamp,
    updatedAt: timestamp, failureCode: null,
  };
  const reservation = await storage.reserveCheckoutRequest({ requestId, order, timestamp });
  if (reservation.outcome === "conflict") throw new Error("checkout_request_conflict");
  if (reservation.outcome === "rate_limited") throw new Error("checkout_rate_limited");
  const reservedOrder = assertReservedOrder(reservation, offer, requestId, clientUid, config.environment);
  if (reservedOrder.status === "pending") return reservedOrder;
  assertRecoverableOrder(reservedOrder, offer, reservedOrder.orderId, config.environment);
  return createAndAttach({ order: reservedOrder, offer, config, storage, provider, now });
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
    offerId: offer.offerId, offerVersion: offer.offerVersion, itemName: offer.itemName, amountCents: offer.amountCents, currency: offer.currency,
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
  assertRecoverableOrder(order, offer, orderId, config.environment);
  return createAndAttach({ order, offer, config, storage, provider, now });
}
