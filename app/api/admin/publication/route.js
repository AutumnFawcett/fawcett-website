import { assertServerWritesOpen } from "@/lib/safety/serverFence.mjs";
import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { reviewPublication, withdrawPublication } from "@/lib/safety/publication.mjs";
export const runtime = "nodejs";
async function handle(request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  try {
    const { firestore, auth } = getFirebaseAdmin();
    const uid = await verifyFirebaseBearer(request, auth.verifyIdToken.bind(auth));
    let input = { path: new URL(request.url).searchParams.get("path") };
    if (request.method === "POST") {
      await assertServerWritesOpen(firestore);
      const raw = await request.text();
      if (raw.length > 12000) throw new Error();
      input = JSON.parse(raw);
      if (Object.keys(input).some(key => !["path", "sourceHash", "fields", "reviewed", "action"].includes(key))) throw new Error();
    }
    if (request.method === "POST" && input.action === "withdraw") return Response.json(await withdrawPublication(firestore, uid, input), { headers });
    if (input.action != null) throw new Error();
    return Response.json(await reviewPublication(firestore, auth, uid, input, request.method === "POST"), { headers });
  } catch (error) {
    return Response.json({ error: error.code === "maintenance" ? "maintenance" : "publication_not_authorized_or_record_changed" }, { status: error.code === "maintenance" ? 503 : 403, headers });
  }
}
export const GET = handle;
export const POST = handle;
