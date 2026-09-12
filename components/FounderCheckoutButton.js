"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebaseClient";
import { buildFounderCheckoutBody, validateFounderCheckoutResult } from "@/lib/payments/founderCheckoutClient";

function requestId() {
  return crypto.randomUUID().replaceAll("-", "");
}

export default function FounderCheckoutButton({ offerId, tierTitle, amountLabel, enabled, environment }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const retryId = useRef(null);
  const [accepted, setAccepted] = useState(false);

  if (!enabled) return <div className="founders-tier-status" aria-label="This reward tier is currently unavailable">Payments unavailable</div>;

  async function checkout() {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) {
        window.location.assign("/tattoo-portal?returnTo=%2Ffounders");
        return;
      }
      const token = await user.getIdToken();
      const response = await fetch("/api/payments/checkout/founder", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildFounderCheckoutBody(offerId, retryId.current ||= requestId(), accepted)),
      });
      const result = await response.json();
      const checkoutResult = validateFounderCheckoutResult(response, result, environment);
      window.location.assign(checkoutResult.checkoutUrl);
    } catch {
      setError("Checkout could not be started. Confirm your sign-in and connection, then safely try again.");
      setWorking(false);
    }
  }

  return <div className="founders-tier-checkout">
    <label className="founders-acknowledgement"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
      <span>I understand that {amountLabel} selects the {tierTitle} reward tier; this support is not a charitable donation or tax-receiptable, and is not an investment, loan, ownership interest, or promise of financial return. Fulfillment and refunds follow the <Link href="/policies">Founder terms and policies</Link>.</span>
    </label>
    <button type="button" className="founders-support-button" disabled={working || !accepted} onClick={checkout}>{working ? "Starting checkout…" : "Continue to secure Square checkout"}</button><p role="alert">{error}</p>
  </div>;
}
