"use client";

import { useRef, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { buildFounderCheckoutBody, validateFounderCheckoutResult } from "@/lib/payments/founderCheckoutClient";

function requestId() {
  return crypto.randomUUID().replaceAll("-", "");
}

export default function FounderCheckoutButton({ offerId, enabled }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const retryId = useRef(null);

  if (!enabled) return <div className="founders-tier-status" aria-label="This reward tier is not available yet">Available at launch</div>;

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
        body: JSON.stringify(buildFounderCheckoutBody(offerId, retryId.current ||= requestId())),
      });
      const result = await response.json();
      const checkoutResult = validateFounderCheckoutResult(response, result);
      window.location.assign(checkoutResult.checkoutUrl);
    } catch {
      setError("Checkout could not be started. Please try again.");
      setWorking(false);
    }
  }

  return <div className="founders-tier-checkout"><button type="button" className="founders-support-button" disabled={working} onClick={checkout}>{working ? "Starting checkout…" : "Support this tier"}</button><p role="alert">{error}</p></div>;
}
