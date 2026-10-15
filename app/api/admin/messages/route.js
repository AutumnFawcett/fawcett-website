import { assertServerWritesOpen } from "@/lib/safety/serverFence.mjs";
import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { handleAdminMessage } from "@/lib/notifications/adminMessages.mjs";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    const { firestore, auth } = getFirebaseAdmin();
    await assertServerWritesOpen(firestore);
    return await handleAdminMessage(request, { firestore, authenticate: value => verifyFirebaseBearer(value, auth.verifyIdToken.bind(auth)) });
  } catch { return Response.json({ error: "message_service_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
