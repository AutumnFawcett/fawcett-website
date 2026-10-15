import { ClientError, fail } from "./clientModel.mjs";
import { associateConsult, listStudioClients, readStudioClient, requireClientAdmin, reviewConsult, saveStudioClient } from "./clientService.mjs";
export async function handleClientRequest(request, { firestore, authenticate }) {
  const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization" };
  try {
    let uid;
    try { uid = await authenticate(request); } catch { fail("access_denied", 403); }
    if (typeof uid !== "string" || !uid) fail("access_denied", 403);
    await requireClientAdmin(firestore, uid);
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const result = params.has("consultId") ? await reviewConsult(firestore, uid, params.get("consultId"))
        : params.has("id") ? await readStudioClient(firestore, uid, params.get("id"))
          : await listStudioClients(firestore, uid, { after: params.get("after") || "" });
      return Response.json(result, { headers });
    }
    if (request.method !== "POST") fail("method_not_allowed", 405);
    if (!(request.headers.get("content-type") || "").startsWith("application/json")) fail("invalid_content_type", 415);
    const raw = await request.text();
    if (raw.length > 24000) fail("request_too_large", 413);
    let input;
    try { input = JSON.parse(raw); } catch { fail("invalid_json"); }
    if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid_input");
    const allowed = input.action === "save" ? ["action", "id", "revision", "client", "duplicateReview"] : ["action", "id", "revision", "consultId", "reason", "reviewed", "consultReviewToken"];
    if (Object.keys(input).some(k => !allowed.includes(k))) fail("unsupported_field");
    const result = input.action === "save" ? await saveStudioClient(firestore, uid, input)
      : input.action === "associate" ? await associateConsult(firestore, uid, input) : fail("unsupported_action");
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json({ error: error.code === "maintenance" ? "maintenance" : error instanceof ClientError ? error.message : "client_operation_failed", ...(error instanceof ClientError ? error.details : {}) }, { status: error.code === "maintenance" ? 503 : error instanceof ClientError ? error.status : 500, headers });
  }
}
