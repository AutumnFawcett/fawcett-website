import "server-only";
import { squarePaymentLinkRequest } from "../payments/squarePaymentLinkRequest.js";
import { assertSquareCheckoutConfig } from "../payments/squareCheckoutConfig.js";

export async function createSquarePaymentLinkProvider(config) {
  assertSquareCheckoutConfig(config);
  const { SquareClient, SquareEnvironment } = await import("square");
  const client = new SquareClient({
    token: config.accessToken,
    environment: config.environment === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  });
  return {
    createPaymentLink(values) {
      return client.checkout.paymentLinks.create(squarePaymentLinkRequest(values));
    },
  };
}
