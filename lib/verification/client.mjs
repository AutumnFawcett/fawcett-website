import { applyActionCode, checkActionCode, getIdToken, reload, ActionCodeOperation } from "firebase/auth";
export async function requestVerification(user, { fetcher = fetch, method = "POST" } = {}) {
  if (!user) return { error: "sign_in_required" };
  try {
    const response = await fetcher("/api/auth/verification", { method, signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${await getIdToken(user)}` } });
    const result = await response.json();
    return result;
  } catch { return { error: "verification_temporarily_unavailable" }; }
}
// A verification outage must never turn a successful signup/intake into failure.
export async function verifyAfterRegistration(user) { return requestVerification(user); }
export async function refreshVerification(auth) {
  const user = auth.currentUser;
  if (!user) return null;
  await reload(user);
  if (auth.currentUser?.uid !== user.uid) return null;
  await getIdToken(user, true);
  return { uid: user.uid, email: user.email, verified: user.emailVerified };
}
export function verificationAction(search, apiKey) {
  const params = new URLSearchParams(search);
  if (!params.has("oobCode") && !params.has("mode")) return null;
  if (params.get("mode") !== "verifyEmail" || params.getAll("mode").length !== 1 || params.getAll("oobCode").length !== 1 || params.getAll("apiKey").length > 1 || (params.has("apiKey") && params.get("apiKey") !== apiKey) || params.has("tenantId") || !/^[A-Za-z0-9_-]{1,4096}$/.test(params.get("oobCode") || "")) throw new Error("invalid_verification_link");
  // continueUrl/returnTo are deliberately ignored; never follow a link's redirect.
  return params.get("oobCode");
}
export async function inspectVerification(auth, code) {
  const info = await checkActionCode(auth, code);
  if (info.operation !== ActionCodeOperation.VERIFY_EMAIL || !info.data.email) throw new Error("invalid_verification_link");
  return info.data.email;
}
export async function completeVerification(auth, code) {
  const email = await inspectVerification(auth, code);
  if (auth.currentUser) await refreshVerification(auth);
  if (auth.currentUser && auth.currentUser.email?.toLowerCase() !== email.toLowerCase()) throw new Error("wrong_verification_account");
  await applyActionCode(auth, code);
  return { email, account: await refreshVerification(auth) };
}
export function verificationError(error) {
  if (error?.message === "wrong_verification_account") return "This link belongs to a different account. Sign out, then open the link again or sign in to the matching account.";
  if (error?.code === "auth/expired-action-code") return "This verification link has expired. Sign in and request a fresh link.";
  if (error?.code === "auth/network-request-failed") return "We could not check the link. Check your connection and try again.";
  return "This link is invalid, expired, or already used. Sign in and check your email status, or request a fresh link.";
}
