"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { completeVerification, inspectVerification, refreshVerification, requestVerification, verificationAction, verificationError } from "@/lib/verification/client.mjs";
const sendError = result => result.error === "verification_cooldown" ? "Please wait before requesting another link." : result.error === "verification_not_enabled" ? "Email verification delivery is awaiting studio activation. You can continue using your portal." : "We could not send a link just now. Your account is saved. Please try again later.";
export default function VerifyPortalEmail() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(null);
  const [linkEmail, setLinkEmail] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const parsed = useRef(false);
  const refreshedUid = useRef(null);
  useEffect(() => onIdTokenChanged(auth, user => {
    setAccount(user ? { uid: user.uid, email: user.email, verified: user.emailVerified } : null);
    setLoading(false);
    if (!user) { refreshedUid.current = null; return; }
    if (refreshedUid.current === user.uid) return;
    refreshedUid.current = user.uid;
    // Refresh persisted Auth state on arrival from Firebase's hosted handler too.
    // Mark the UID first: forced token refresh triggers this subscription again.
    refreshVerification(auth).catch(() => {});
  }), []);
  useEffect(() => {
    if (parsed.current) return;
    parsed.current = true;
    let action;
    try { action = verificationAction(window.location.search, auth.app.options.apiKey); }
    catch (failure) { Promise.resolve().then(() => setError(verificationError(failure))); }
    // Drop the action code before rendering links or making application requests.
    window.history.replaceState(null, "", "/portal/verify-email");
    if (action) inspectVerification(auth, action).then(email => { setCode(action); setLinkEmail(email); }).catch(failure => setError(verificationError(failure)));
  }, []);
  useEffect(() => {
    if (!account?.uid) return;
    let active = true;
    requestVerification(auth.currentUser, { method: "GET" }).then(result => { if (active) setRemaining(result.retryAfter || 0); });
    return () => { active = false; };
  }, [account?.uid]);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  async function refresh() {
    setBusy(true); setError("");
    try {
      const current = await refreshVerification(auth);
      setAccount(current);
      setMessage(current?.verified ? "Your email is verified. Future eligible email updates can reach this address when studio notifications are enabled." : "Your email is not verified yet. Open the latest link in your inbox, then check again.");
    } catch { setError("We could not refresh your account. Sign in again if your session has expired."); }
    finally { setBusy(false); }
  }
  async function send() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await requestVerification(auth.currentUser);
      setRemaining(result.retryAfter || 0);
      if (result.verified) await refresh();
      else if (result.sent) setMessage("Verification link requested. Check your inbox and spam folder. Use the latest link.");
      else setError(sendError(result));
    } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError("");
    try {
      const result = await completeVerification(auth, code);
      setCode(null); setLinkEmail(null); setAccount(result.account);
      setMessage(result.account?.verified ? "Email verified. Your portal history is unchanged." : "Email verified. Sign in to the matching account to continue.");
    } catch (failure) {
      if (["auth/invalid-action-code", "auth/expired-action-code"].includes(failure.code)) { setCode(null); setLinkEmail(null); }
      setError(verificationError(failure));
    }
    finally { setBusy(false); }
  }
  const wrongAccount = account && linkEmail && account.email?.toLowerCase() !== linkEmail.toLowerCase();
  return <main className="min-h-screen bg-black px-5 py-12 text-white md:py-20"><section className="mx-auto max-w-xl rounded-3xl border border-blue-500/40 bg-white/[0.04] p-6 md:p-10"><p className="text-xs uppercase tracking-widest text-blue-300">Fawcett Tattoos &amp; Art Studio</p><h1 className="mt-4 text-4xl font-black tracking-tight">{account?.verified && !code ? "Email verified" : "Verify your email"}</h1><p className="mt-5 leading-7 text-white/75">Confirm your email address so future consultation confirmations and message alerts can reach you. Your private conversations stay inside the Tattoo Portal.</p><p className="mt-3 text-sm leading-6 text-white/65">You can keep using your portal, submitting requests and viewing your history while verification is pending. Verification does not replay older email notices or activate notifications.</p>
    {loading ? <p className="mt-6" role="status">Checking your account…</p> : account ? <p className="mt-6 break-all text-sm">Signed in as {account.email || "an account without an email address"}.</p> : <p className="mt-6">Sign in to send a verification link or check your account.</p>}
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/40 p-4 text-sm text-red-200">{error}</p>}
    {message && <p role="status" className="mt-5 rounded-xl border border-blue-400/40 p-4 text-sm text-blue-100">{message}</p>}
    <div className="mt-7 grid gap-3">
      {code && !wrongAccount && <button type="button" onClick={confirm} disabled={busy || loading} className="button button-primary disabled:opacity-50">{busy ? "Checking…" : "Confirm email from this link"}</button>}
      {wrongAccount && <><p role="alert" className="text-sm text-blue-200">This link belongs to a different account. Sign out before using it.</p><button type="button" className="button button-secondary" disabled={busy} onClick={() => signOut(auth)}>Sign out of this account</button></>}
      {account && !account.verified && <button type="button" onClick={send} disabled={busy || remaining > 0 || !account.email} className="button button-primary disabled:opacity-50">{remaining > 0 ? `Send another link in ${remaining >= 3600 ? `${Math.ceil(remaining / 3600)}h` : remaining >= 60 ? `${Math.ceil(remaining / 60)} min` : `${remaining}s`}` : busy ? "Working…" : "Send verification link"}</button>}
      {account && <button type="button" onClick={refresh} disabled={busy} className="button button-secondary disabled:opacity-50">I’ve verified my email — check again</button>}
      <Link href={account ? "/portal/dashboard" : "/tattoo-portal"} className="button button-secondary">{account ? "Continue to my portal" : "Sign in to Tattoo Portal"}</Link>
    </div><p className="mt-6 text-sm leading-6 text-white/60">Need a different email address? Contact the studio for help. An old verified address does not verify a new one.</p>
  </section></main>;
}
