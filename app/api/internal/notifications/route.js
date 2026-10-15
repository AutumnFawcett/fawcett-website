import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { authorizedWorker, runNotifications } from "@/lib/notifications/worker.mjs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorizedWorker(request, process.env.CRON_SECRET)) return Response.json({ error: "access_denied" }, { status: 403, headers });
  try {
    const { firestore, auth } = getFirebaseAdmin();
    return Response.json(await runNotifications(firestore, auth), { headers });
  } catch { return Response.json({ error: "notification_worker_unavailable" }, { status: 503, headers }); }
}
