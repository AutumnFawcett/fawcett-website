"use client";

import { useState } from "react";
import Link from "next/link";
import { invoicePurposes, prepareSquareInvoiceDraft } from "@/lib/payments/squareInvoiceDraft.mjs";

// Admin-only helper rendered inside AdminPayments after Firebase admin authorization.
// Clipboard copy is a draft, not a payment request sent, invoice created, or credit issued.
export default function AdminSquareInvoiceAssistant({
  clients, selectedClientKey, onChooseClient, amountDollars, onAmountChange,
}) {
  const [purpose, setPurpose] = useState("tattoo_deposit");
  const [description, setDescription] = useState("");
  const [copyState, setCopyState] = useState("");
  const [busy, setBusy] = useState(false);
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
