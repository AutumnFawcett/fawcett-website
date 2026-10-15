import { assertServerWritesOpen } from "@/lib/safety/serverFence.mjs";
import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { handleVerification } from "@/lib/verification/server.mjs";
export const runtime = "nodejs";
async function handle(request) {
  try {
    const { auth, firestore } = getFirebaseAdmin();
    if (request.method === "POST") await assertServerWritesOpen(firestore);
    return await handleVerification(request, { auth, firestore, authenticate: value => verifyFirebaseBearer(value, auth.verifyIdToken.bind(auth)) });
  } catch { return Response.json({ error: "verification_temporarily_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
export const GET = handle;
export const POST = handle;
