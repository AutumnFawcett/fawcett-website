export function squarePaymentLinkRequest({ order, offer, locationId }) {
  return {
    idempotencyKey: order.idempotencyKey,
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
