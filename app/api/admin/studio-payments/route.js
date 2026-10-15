import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { assertServerWritesOpen } from "@/lib/safety/serverFence.mjs";
import { handleStudioPaymentRequest } from "@/lib/studioPayments/service.mjs";
import { getStudioCheckoutConfig } from "@/lib/server/studioCheckoutConfig";
import { createSquarePaymentLinkProvider } from "@/lib/server/squarePaymentLinkProvider";
import { createPaymentOrderStorage } from "@/lib/server/paymentOrderStorage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request) {
  try {
    const { firestore, auth } = getFirebaseAdmin();
    if (request.method === "POST") await assertServerWritesOpen(firestore);
    return await handleStudioPaymentRequest(request, { firestore, auth,
      authenticate: value => verifyFirebaseBearer(value, auth.verifyIdToken.bind(auth)),
      checkoutDependencies: async () => {
        const config = getStudioCheckoutConfig();
        if (!config.paymentsEnabled) return { config };
        const transport = await createSquarePaymentLinkProvider(config);
        return { config, orderStorage: createPaymentOrderStorage(firestore), provider: { createPaymentLink: async values => { await assertServerWritesOpen(firestore); return transport.createPaymentLink(values); } } };
      },
    });
  } catch { return Response.json({ error: "payment_service_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
export const GET = handle;
export const POST = handle;
