"use client";
import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebaseClient";

async function api(path, input) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again.");
  const response = await fetch(path, { method: input ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(input && { "Content-Type": "application/json" }) }, ...(input && { body: JSON.stringify(input) }), cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Payment operation failed.");
  return result;
}
async function pages(path, key) {
  const rows = []; let after = "";
  do {
    const result = await api(`${path}${after ? `?after=${encodeURIComponent(after)}` : ""}`);
    rows.push(...result[key]); after = result.nextCursor;
    if (rows.length >= 5000 && after) throw new Error("Too many records. Ask the studio operator for a scoped report.");
  } while (after);
  return rows;
}
export default function StudioPayments({ user }) {
  const [hosted, setHosted] = useState([]), [transactions, setTransactions] = useState([]);
  const [clients, setClients] = useState([]), [payments, setPayments] = useState([]);
  const [clientId, setClientId] = useState(""), [mode, setMode] = useState("manual"), [amount, setAmount] = useState("");
  const [kind, setKind] = useState("deposit"), [method, setMethod] = useState("etransfer");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)), [reference, setReference] = useState(""), [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState(""), [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState(""), [result, setResult] = useState(null), [busy, setBusy] = useState(false);
  const pending = useRef(null);
  useEffect(() => {
    let live = true;
    api("/api/admin/studio-payments").then(r => { if (live) { setHosted(r.hosted); setTransactions(r.transactions); } }).catch(e => { if (live) setError(e.message); });
    Promise.all([pages("/api/admin/clients", "clients"), pages("/api/admin/studio-payments", "payments")]).then(([c, p]) => { if (live) { setClients(c); setPayments(p); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [user.uid]);
  async function submit(event) {
    event.preventDefault(); setError(""); setResult(null);
    // Parse decimal text without floating point money conversion.
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) { setError("Enter a positive CAD amount with at most two decimal places."); return; }
    const [whole, fraction = ""] = amount.split(".");
    const amountCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    const input = { action: mode, studioClientId: clientId, projectId: projectId || null, amountCents, currency: "CAD", kind, reviewed,
      ...(mode === "manual" && { paymentMethod: method, receivedDate: date, reference, notes }) };
    pending.current ||= { requestId: sessionStorage.getItem("fawcett-studio-payment-pending") || crypto.randomUUID() };
    // Only the request ID is persisted, never client/contact/payment form data.
    sessionStorage.setItem("fawcett-studio-payment-pending", pending.current.requestId);
    setBusy(true);
    try {
      const response = await api("/api/admin/studio-payments", { ...input, requestId: pending.current.requestId });
      setResult(response);
      try {
        const report = await api("/api/admin/studio-payments"); setHosted(report.hosted); setTransactions(report.transactions);
        if (mode === "manual") setPayments(await pages("/api/admin/studio-payments", "payments"));
      } catch { setError("Payment request saved. History could not refresh; reload to review it. Do not create a replacement payment."); }
    } catch (e) { setError(`${e.message}. Retry with unchanged details. If the result is uncertain, ask the operator to reconcile before starting another request.`); }
    finally { setBusy(false); }
  }
  return <section className="admin-card studio-payments"><p className="eyebrow">Private studio payments</p><h2>Record a payment or prepare a Square checkout</h2>
    <p>Clients do not need a portal account. Manual records are studio bookkeeping, not Square confirmation, tattoo credit or Founder benefits.</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    <form className="admin-form payment-form" onSubmit={submit}>
      <fieldset disabled={busy || !!result}><legend>Payment details</legend>
        <label>Studio client<select required value={clientId} onChange={e => setClientId(e.target.value)}><option value="">Choose a studio client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.id}</option>)}</select></label>
        <label>Workflow<select value={mode} onChange={e => setMode(e.target.value)}><option value="manual">Record received payment privately</option><option value="checkout">Create Square hosted checkout (requires activation)</option></select></label>
        <label>Type<select value={kind} onChange={e => setKind(e.target.value)}><option value="deposit">Tattoo deposit</option><option value="tattoo_payment">Tattoo payment</option></select></label>
        <label>Amount (CAD)<input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100.00" /></label>
        <label>Reviewed project ID (optional)<input value={projectId} onChange={e => setProjectId(e.target.value)} aria-describedby="studio-project-help" /></label><p id="studio-project-help">Only a previously reviewed project association is accepted. Leave blank when none exists.</p>
        {mode === "manual" && <><label>Method<select value={method} onChange={e => setMethod(e.target.value)}>{["cash", "etransfer", "debit", "credit_card", "square_dashboard", "other"].map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label><label>Date received<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>Reference / receipt<input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label><label>Private notes<textarea maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} /></label></>}
        <label><input type="checkbox" required checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the client, amount and any project association.</label>
        <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : mode === "manual" ? "Record privately" : "Prepare hosted checkout"}</button>
      </fieldset>
    </form>
    {result && <div role="status"><p>Record {result.id}: {result.status}. {result.status === "recorded" && "Not provider-confirmed."}</p>{result.checkoutUrl && <p><a href={result.checkoutUrl} target="_blank" rel="noopener noreferrer">Open Square checkout</a> — share this payment link privately. Opening it does not confirm payment.</p>}</div>}
    {result && <button className="button button-secondary" onClick={() => { pending.current = null; sessionStorage.removeItem("fawcett-studio-payment-pending"); setResult(null); setAmount(""); setReference(""); setNotes(""); setReviewed(false); }}>Start another payment</button>}
    <h3>Hosted checkout records</h3><p>Up to 100 records. A pending link may still be payable; ask the operator to reconcile uncertain outcomes before issuing another.</p><ul>{hosted.map(p => <li key={p.id}>{p.id} · {p.studioClientId} · {(p.amountCents / 100).toFixed(2)} {p.currency} · {p.status} ({p.environment}) {p.checkoutUrl && <a href={p.checkoutUrl} target="_blank" rel="noopener noreferrer">Square checkout</a>}</li>)}</ul>
    <h3>Square-confirmed financial effects</h3><p>Up to 100 immutable charge, refund and dispute effects. No tattoo credit is generated.</p><ul>{transactions.map(t => <li key={t.id}>{t.type} · {(t.amountCents / 100).toFixed(2)} {t.currency} · {t.studioClientId} · {t.status}<p>Order: {t.orderId} · Provider reference: {t.providerTransactionId} {t.parentTransactionId && `· Original charge: ${t.parentTransactionId}`}</p></li>)}</ul>
    <h3>Private manual payment history</h3>{payments.length === 0 ? <p>No studio payments recorded.</p> : <ul>{payments.map(p => <li key={p.id}><strong>{(p.amountCents / 100).toFixed(2)} {p.currency}</strong> · {p.studioClientId} · {p.receivedDate} · {p.paymentMethod} · manually recorded, not provider-confirmed<p>{p.reference}</p><p>{p.notes}</p><small>{p.audit.map(a => `${a.action} by ${a.actorUid} at ${a.createdAt}`).join("; ")}</small></li>)}</ul>}
  </section>;
}
