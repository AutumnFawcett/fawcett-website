import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { handleResendWebhook } from "@/lib/notifications/webhook.mjs";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    // The send kill switch must not discard delivery/bounce reports for emails
    // already accepted. Authentication still requires the endpoint signing key.
    if (!process.env.RESEND_WEBHOOK_SECRET) throw new Error();
    const { firestore } = getFirebaseAdmin();
    return await handleResendWebhook(request, firestore, { secret: process.env.RESEND_WEBHOOK_SECRET });
  } catch { return Response.json({ error: "webhook_disabled" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
