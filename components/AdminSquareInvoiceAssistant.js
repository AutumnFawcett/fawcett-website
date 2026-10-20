"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cadToCents, invoicePurposes, prepareSquareInvoiceDraft } from "@/lib/payments/squareInvoiceDraft.mjs";
import { getFirebaseClient } from "@/lib/firebaseClient";

// Admin-only helper rendered inside AdminPayments after Firebase admin authorization.
// Clipboard copy is a draft, not a payment request sent, invoice created, or credit issued.
export default function AdminSquareInvoiceAssistant({
  clients, selectedClientKey, onChooseClient, amountDollars, onAmountChange,
}) {
  const [purpose, setPurpose] = useState("tattoo_deposit");
  const [description, setDescription] = useState("");
  const [copyState, setCopyState] = useState("");
  const [busy, setBusy] = useState(false);
  const [sandboxEnabled, setSandboxEnabled] = useState(false);
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalReady, setJournalReady] = useState(false);
  const [journalResult, setJournalResult] = useState("");
  const [sandboxError, setSandboxError] = useState("");
  const [sandboxResult, setSandboxResult] = useState(null);
  const sandboxRequestId = useRef(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/tattoo-checkout", { cache: "no-store" })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (active) setSandboxEnabled(data?.sandboxEnabled === true); })
      .catch(() => { if (active) setSandboxEnabled(false); });
    return () => { active = false; };
  }, []);

  // One authenticated, two-document Sandbox Firestore commit with no Square
  // API request, payment link or client data. Safe to retry with the same ID.
  async function checkSandboxJournal() {
    setJournalResult("");
    setJournalBusy(true);
    try {
      const { auth } = getFirebaseClient();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw Error("Sign in again.");
      const res = await fetch("/api/admin/tattoo-checkout", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ journalPreflight: true }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        const diagnostic = data?.diagnostic;
        const detail = diagnostic
          ? [diagnostic.stage, diagnostic.reason,
            diagnostic.httpStatus ? "HTTP " + diagnostic.httpStatus : "",
            diagnostic.missingPermission ? "missing " + diagnostic.missingPermission : "",
            diagnostic.googleReason || ""].filter(Boolean).join(" / ")
          : data?.error || "unknown_error";
        throw Error(detail);
      }
      if (data.sandboxJournalWritable !== true || data.squareCalled !== false) throw Error("unexpected_preflight_response");
      setJournalReady(true);
      setJournalResult("Sandbox journal write passed. No Square link or payment was created.");
    } catch (error) {
      setJournalReady(false);
      setJournalResult("Sandbox journal check failed: " + error.message);
    } finally {
      setJournalBusy(false);
    }
  }

  async function createSandboxLink() {
    setSandboxError("");
    if (!sandboxEnabled) return;
    const amountCents = cadToCents(amountDollars);
    if (!client || !client.clientEmail || !amountCents || !["tattoo_deposit", "tattoo_session", "consult"].includes(purpose)) {
      setSandboxError("Select a client, approved purpose and valid CAD amount first.");
      return;
    }
    setSandboxBusy(true);
    try {
      const { auth } = getFirebaseClient();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw Error("Sign in to the Tattoo Portal again.");
      sandboxRequestId.current ||= crypto.randomUUID();
      const res = await fetch("/api/admin/tattoo-checkout", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, purpose, idempotencyKey: sandboxRequestId.current, reviewed: true }),
        cache: "no-store",
      });
      const result = await res.json();
      if (!res.ok) {
        const diagnostic = result?.diagnostic;
        const safeDetail = diagnostic?.stage && diagnostic?.reason
          ? " · " + diagnostic.stage + " / " + diagnostic.reason
            + (diagnostic.httpStatus ? " / HTTP " + diagnostic.httpStatus : "")
            + (diagnostic.missingPermission ? " / missing " + diagnostic.missingPermission : "")
          : "";
        throw Error("Sandbox link unavailable (" + (result.error || res.status) + safeDetail + ").");
      }
      setSandboxResult(result);
    } catch (error) {
      setSandboxError(error.message + " If uncertain, retry with the same details; the request ID remains unchanged.");
    } finally {
      setSandboxBusy(false);
    }
  }

  const client = clients.find((item) => item.key === selectedClientKey) || null;

  async function copyDetails() {
    setCopyState("");
    const draft = prepareSquareInvoiceDraft({
      client, amountDollars, purpose, notes: description,
    });
    if (!draft.ok) {
      setCopyState(draft.error);
      return;
    }
    setBusy(true);
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopyState("Invoice details copied. Create and send the invoice in Square Dashboard.");
    } catch {
      setCopyState("Clipboard unavailable. Use your browser's copy controls or enter the details directly in Square.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto mb-6 w-full max-w-[1400px] rounded-3xl border border-[#5555ff]/50 bg-[#090923] p-4 sm:p-6" aria-label="Square invoice workflow">
      <p className="eyebrow">Collect a client payment</p>
      <h2 className="text-2xl font-black sm:text-3xl">Create a secure Square invoice</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
        Use your existing Square merchant account to send a one-time invoice to a client.
        Square handles card payment and confirmation. This form only prepares details to copy;
        it does not create an invoice, charge anyone or start monthly billing.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">
          Client
          <select value={selectedClientKey} onChange={(event) => { onChooseClient(event.target.value); setCopyState(""); }}
            className="min-w-0 rounded-xl border border-white/25 bg-black p-3 text-white">
            <option value="">Choose client</option>
            {clients.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.clientName} — {entry.clientEmail || "No email"}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Invoice amount (CAD)
          <input type="text" inputMode="decimal" placeholder="150.00" value={amountDollars}
            onChange={(event) => { onAmountChange(event.target.value); setCopyState(""); }}
            className="min-w-0 rounded-xl border border-white/25 bg-black p-3 text-white" />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          One-time payment purpose
          <select value={purpose} onChange={(event) => { setPurpose(event.target.value); setCopyState(""); }}
            className="min-w-0 rounded-xl border border-white/25 bg-black p-3 text-white">
            {invoicePurposes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Approved project / description (optional)
          <input value={description} onChange={(event) => { setDescription(event.target.value); setCopyState(""); }}
            maxLength={500} placeholder="e.g. Deposit for approved half sleeve"
            className="min-w-0 rounded-xl border border-white/25 bg-black p-3 text-white" />
        </label>
      </div>
      {copyState && <p className="mt-3 text-sm" role="status">{copyState}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="button button-primary" disabled={busy} onClick={copyDetails}>
          {busy ? "Copying…" : "Copy invoice details"}
        </button>
        <a className="button button-secondary" href="https://squareup.com/dashboard" target="_blank" rel="noopener noreferrer">
          Open Square Dashboard ↗
        </a>
        <Link className="button button-secondary" href="/admin/inbox">Open client inbox</Link>
      </div>
      {sandboxEnabled && (
        <div className="mt-5 rounded-2xl border border-dashed border-[#7676ff]/70 p-4">
          <h3 className="text-lg font-bold">Square Sandbox · one-time checkout test</h3>
          <p className="mt-2 text-sm text-white/70">
            Developer test only: no real charges, no client invitation, no Studio Credit and no recurring billing.
            After checking client, purpose, final amount and GST treatment, create a simulated Square checkout link.
            Test order records are written only to the separate Firebase Sandbox journal; no live payments or Studio Credit are posted.
          </p>
          <div className="mt-3">
            <button type="button" className="button button-secondary" onClick={checkSandboxJournal}
              disabled={journalBusy || sandboxBusy}>
              {journalBusy ? "Testing Firebase Sandbox journal…" : "Check Sandbox journal (no Square request)"}
            </button>
            {journalResult && <p className="mt-2 text-sm" role="status">{journalResult}</p>}
            {!journalReady && <p className="mt-2 text-xs text-white/70">
              Check the journal first; this prevents creating more Square test links while Firebase writes are failing.
            </p>}
          </div>
          {sandboxError && <p role="alert" className="mt-2 text-sm text-[#ffb5b5]">{sandboxError}</p>}
          {sandboxResult ? (
            <div className="mt-3 text-sm">
              <p>Sandbox link created. Not a paid receipt or enrollment.</p>
              <a className="underline" href={sandboxResult.checkoutUrl} target="_blank" rel="noopener noreferrer">
                Open Square Sandbox checkout ↗
              </a>
              <button type="button" className="button button-secondary ml-3" onClick={() => {
                sandboxRequestId.current = null; setSandboxResult(null); setSandboxError("");
              }}>Start another test</button>
            </div>
          ) : (
            <button className="button button-secondary mt-3" type="button" disabled={sandboxBusy || journalBusy || !journalReady}
              onClick={createSandboxLink}>{sandboxBusy ? "Creating test link…" : "Create Sandbox payment link"}</button>
          )}
        </div>
      )}
      <div className="mt-5 border-t border-white/15 pt-4 text-sm leading-6 text-white/75">
        <strong>To collect payment now:</strong> In Square Dashboard, go to Invoices, create a one-time invoice,
        review the client's email, price, approved terms and applicable tax, then send it through Square.
        Alternatively, create a Square Payment Link and share it privately with the client.
        After Square confirms payment, reconcile it in the manual payment records below using the receipt or transaction reference.
        <strong> Do not mark an unpaid invoice as paid or grant Studio Credit from the invoice request alone.</strong>
      </div>
    </section>
  );
}
