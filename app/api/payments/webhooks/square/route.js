import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { getSquareConfig } from "@/lib/server/squareConfig";
import { handleSquareWebhook } from "@/lib/payments/squareWebhookHandler";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(outcome, status, reason) {
  return Response.json({ outcome, ...(reason && { reason }) }, { status });
}

export async function POST(request) {
  let config;
  try { config = getSquareConfig(); } catch { return response("retryable", 503, "server_configuration_unavailable"); }
  try {
    const { firestore } = getFirebaseAdmin();
    const result = await handleSquareWebhook({ request, config, firestore, now: () => FieldValue.serverTimestamp() });
    return Response.json(result.body, { status: result.status });
  } catch { return response("retryable", 503, "processing_unavailable"); }
}
