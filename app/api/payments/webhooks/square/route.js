import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { getSquareConfig } from "@/lib/server/squareConfig";
import { handleSquareWebhook } from "@/lib/payments/squareWebhookHandler";
import { handleSquareWebhookRequest } from "@/lib/payments/squareWebhookRoute";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request) {
  return handleSquareWebhookRequest(request, {
    getConfig: getSquareConfig,
    getFirebaseAdmin,
    handleWebhook: handleSquareWebhook,
    now: () => FieldValue.serverTimestamp(),
    logger: console,
  });
}
