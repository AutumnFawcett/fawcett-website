"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onIdTokenChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { refreshVerification } from "@/lib/verification/client.mjs";
export default function EmailVerificationBanner() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let lastRefresh = 0;
    const unsubscribe = onIdTokenChanged(auth, user => setPending(Boolean(user?.email && !user.emailVerified)));
    const refresh = () => {
      if (document.visibilityState === "hidden" || !auth.currentUser || Date.now() - lastRefresh < 5000) return;
      lastRefresh = Date.now();
      refreshVerification(auth).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { unsubscribe(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  if (!pending || pathname === "/portal/verify-email") return null;
  return <aside aria-label="Email verification reminder" className="border-b border-blue-500/40 bg-black px-5 py-4 text-sm text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3"><p>Verify your email for future email updates. Your Tattoo Portal and history remain available.</p><Link href="/portal/verify-email" className="font-bold text-blue-300 underline underline-offset-4">Verify your email</Link></div></aside>;
}
