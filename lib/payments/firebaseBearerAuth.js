export async function verifyFirebaseBearerToken(request, verifyIdToken) {
  const header = request.headers.get("authorization");
  if (!header || !/^Bearer [^\s]+$/.test(header)) throw new Error("authentication_required");
  const token = header.slice(7);
  try {
    const decoded = await verifyIdToken(token, true);
    if (!decoded || typeof decoded.uid !== "string" || !decoded.uid) throw new Error("invalid_uid");
    return decoded.uid;
  } catch {
    throw new Error("authentication_required");
  }
}
