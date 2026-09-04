import { handleFounderCheckoutRequest, createIdempotentFounderCheckout } from "@/lib/payments/founderCheckoutApi";
import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { createFounderCheckoutStorage } from "@/lib/server/founderCheckoutStorage";
import { createPaymentOrderStorage } from "@/lib/server/paymentOrderStorage";
import { getSquareConfig } from "@/lib/server/squareConfig";
import { createSquarePaymentLinkProvider } from "@/lib/server/squarePaymentLinkProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request) {
  return handleFounderCheckoutRequest(request, {
    authenticate: async (value) => { const { auth } = getFirebaseAdmin(); return verifyFirebaseBearer(value, auth.verifyIdToken.bind(auth)); },
    getConfig: () => process.env.SQUARE_PAYMENTS_ENABLED === "true" ? getSquareConfig() : { paymentsEnabled: false },
    getCheckoutDependencies: async () => {
      const { firestore } = getFirebaseAdmin();
      const config = getSquareConfig();
      return { storage: createFounderCheckoutStorage(firestore, createPaymentOrderStorage(firestore)), provider: await createSquarePaymentLinkProvider(config), now: () => new Date() };
    },
    checkout: createIdempotentFounderCheckout,
  });
}
