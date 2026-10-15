import { assertServerWritesOpen, fencedFirestore } from "../safety/serverFence.mjs";
import { createHash } from "node:crypto";
import { serverFirebaseEnvironment } from "../firebaseEnvironment.mjs";
export const COOLDOWN_MS = 60000;
const WINDOW_MS = 86400000;
export function verificationConfig(env = process.env) {
  const firebase = serverFirebaseEnvironment(env);
  if (firebase.mode === "production" && env.EMAIL_VERIFICATION_ENABLED !== "true") return { enabled: false };
  if (firebase.mode === "production" && (env.FIREBASE_ADMIN_PROJECT_ID !== "fawcett-website-sandbox" || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "fawcett-website-sandbox")) throw new Error("verification_project_mismatch");
  const origin = new URL(env.EMAIL_VERIFICATION_ORIGIN || (firebase.mode === "emulator" ? "http://localhost:3000" : ""));
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || (firebase.mode === "production" ? origin.protocol !== "https:" : !["localhost", "127.0.0.1"].includes(origin.hostname) || !["http:", "https:"].includes(origin.protocol))) throw new Error("invalid_verification_origin");
  return { enabled: true, emulator: firebase.mode === "emulator", continueUrl: `${origin.origin}/portal/verify-email`, endpoint: firebase.mode === "emulator" ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-fawcett-api-key" : `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.NEXT_PUBLIC_FIREBASE_API_KEY)}` };
}
const keyFor = uid => createHash("sha256").update(uid).digest("hex");
export async function verificationLimit(firestore, uid, { reserve = false, email, now = Date.now() } = {}) {
  firestore = fencedFirestore(firestore);
  const identities = [`uid:${uid}`, ...(email ? [`email:${email.trim().toLowerCase()}`] : [])];
  const refs = identities.map(identity => firestore.doc(`authVerificationRateLimits/${keyFor(identity)}`));
  return firestore.runTransaction(async tx => {
    const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
    const histories = snapshots.map(snapshot => {
      const previous = snapshot.data();
      if (previous && (!Array.isArray(previous.attempts) || previous.attempts.some(at => !Number.isFinite(at)))) throw new Error("invalid_limiter_state");
      return (previous?.attempts || []).filter(at => now - at < WINDOW_MS).sort((a, b) => a - b);
    });
    const next = Math.max(0, ...histories.map(history => Math.max(history.length ? history.at(-1) + COOLDOWN_MS : 0, history.length >= 5 ? history[0] + WINDOW_MS : 0)));
    const retryAfter = Math.max(0, Math.ceil((next - now) / 1000));
    if (reserve && !retryAfter) histories.forEach((history, index) => tx.set(refs[index], { attempts: [...history, now] }));
    return { allowed: reserve && !retryAfter, retryAfter: reserve && !retryAfter ? COOLDOWN_MS / 1000 : retryAfter };
  });
}
export async function handleVerification(request, { firestore, auth, authenticate, env = process.env, fetcher = fetch, now = Date.now() }) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  try {
    let uid;
    try { uid = await authenticate(request); } catch { return Response.json({ error: "sign_in_required" }, { status: 401, headers }); }
    if (typeof uid !== "string" || !uid || uid.includes("/")) throw new Error();
    if (!["GET", "POST"].includes(request.method)) return Response.json({ error: "method_not_allowed" }, { status: 405, headers });
    if (request.method === "POST" && (await request.text()).trim()) return Response.json({ error: "unsupported_input" }, { status: 400, headers });
    const user = await auth.getUser(uid);
    if (user.disabled || !user.email) return Response.json({ error: "account_unavailable" }, { status: 403, headers });
    if (user.emailVerified) return Response.json({ verified: true, retryAfter: 0 }, { headers });
    if (request.method === "GET") return Response.json({ verified: false, retryAfter: (await verificationLimit(firestore, uid, { email: user.email, now })).retryAfter }, { headers });
    const config = verificationConfig(env);
    if (!config.enabled) return Response.json({ error: "verification_not_enabled" }, { status: 503, headers });
    if (config.emulator && !user.email.endsWith("@example.test")) return Response.json({ error: "synthetic_account_required" }, { status: 403, headers });
    // Reserve before external side effects. Failed/uncertain attempts consume the
    // budget too; browser reloads, concurrency and address changes cannot reset it.
    const permit = await assertServerWritesOpen(firestore);
    const limit = await verificationLimit(firestore, uid, { reserve: true, email: user.email, now });
    if (!limit.allowed) return Response.json({ error: "verification_cooldown", retryAfter: limit.retryAfter }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfter) } });
    await assertServerWritesOpen(firestore, permit.epoch);
    const response = await fetcher(config.endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: request.headers.get("authorization").slice(7), continueUrl: config.continueUrl, canHandleCodeInApp: false }) });
    // Never parse/log provider response bodies: some can contain account details.
    if (!response.ok) return Response.json({ error: "verification_temporarily_unavailable", retryAfter: 60 }, { status: 503, headers });
    return Response.json({ sent: true, verified: false, retryAfter: 60 }, { status: 202, headers });
  } catch { return Response.json({ error: "verification_temporarily_unavailable" }, { status: 503, headers }); }
}
