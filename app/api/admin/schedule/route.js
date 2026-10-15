import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { assertServerWritesOpen } from "@/lib/safety/serverFence.mjs";
import { handleScheduleRequest } from "@/lib/scheduling/service.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request) {
  try {
    const { auth, firestore } = getFirebaseAdmin();
    if (request.method === "POST") await assertServerWritesOpen(firestore);
    return await handleScheduleRequest(request, { auth, firestore, authenticate: value => verifyFirebaseBearer(value, auth.verifyIdToken.bind(auth)) });
  } catch { return Response.json({ error: "schedule_service_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
export const GET = handle;
export const POST = handle;
