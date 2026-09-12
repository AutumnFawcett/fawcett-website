export function squarePaymentLinkRequest({ order, offer, locationId, redirectUrl }) {
  return {
    idempotencyKey: order.idempotencyKey,
    checkoutOptions: { redirectUrl },
    order: {
      locationId,
      referenceId: order.orderId,
      lineItems: [{
        name: offer.itemName,
        quantity: "1",
        basePriceMoney: { amount: BigInt(order.amountCents), currency: "CAD" },
      }],
    },
  };
}
