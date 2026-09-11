import { handleFounderCheckoutRequest, createIdempotentFounderCheckout } from "@/lib/payments/founderCheckoutApi";
import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { createFounderCheckoutStorage } from "@/lib/server/founderCheckoutStorage";
import { createPaymentOrderStorage } from "@/lib/server/paymentOrderStorage";
import { createSquarePaymentLinkProvider } from "@/lib/server/squarePaymentLinkProvider";
import { getFounderLaunchConfig } from "@/lib/server/founderLaunchConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request) {
  return handleFounderCheckoutRequest(request, {
    authenticate: async (value) => { const { auth } = getFirebaseAdmin(); return verifyFirebaseBearer(value, auth.verifyIdToken.bind(auth)); },
    getConfig: () => getFounderLaunchConfig(),
    getCheckoutDependencies: async () => {
      const { firestore } = getFirebaseAdmin();
      const config = getFounderLaunchConfig();
      return { storage: createFounderCheckoutStorage(firestore, createPaymentOrderStorage(firestore)), provider: await createSquarePaymentLinkProvider(config), now: () => new Date() };
    },
    checkout: createIdempotentFounderCheckout,
  });
}
