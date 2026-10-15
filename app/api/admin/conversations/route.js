import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { assertServerWritesOpen } from "@/lib/safety/serverFence.mjs";
import { createAdminConversation } from "@/lib/notifications/adminConversations.mjs";
export const runtime = "nodejs";
export async function POST(request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  try {
    const { firestore, auth } = getFirebaseAdmin();
    const uid = await verifyFirebaseBearer(request, auth.verifyIdToken.bind(auth));
    await assertServerWritesOpen(firestore);
    if (!(request.headers.get("content-type") || "").startsWith("application/json")) throw new Error();
    const raw = await request.text(); if (raw.length > 10000) throw new Error();
    return Response.json(await createAdminConversation(firestore, auth, uid, JSON.parse(raw)), { headers });
  } catch (error) { return Response.json({ error: error.code === "maintenance" ? "maintenance" : "conversation_not_authorized" }, { status: error.code === "maintenance" ? 503 : 403, headers }); }
}
