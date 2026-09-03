export function canAttachProviderIdentity(order) {
  return order?.status === "creating"
    && order.providerOrderId === null
    && order.providerPaymentLinkId === null
    && order.checkoutUrl === null;
}
