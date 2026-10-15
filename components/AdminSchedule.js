"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SchedulingPolicy from "./SchedulingPolicy";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { ARTISTS, TYPES, STATUSES } from "@/lib/scheduling/constants.mjs";
import { wall, range, navigateDate } from "@/lib/scheduling/calendar.mjs";
const label = value => value.replaceAll("_", " ");
async function api(path, body) {
  const token = await auth.currentUser?.getIdToken(); if (!token) throw new Error("Sign in to continue.");
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body && { "Content-Type": "application/json" }) }, ...(body && { body: JSON.stringify(body) }), cache: "no-store" });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "Schedule request failed."); return result;
}
const emptyForm = { studioClientId: "", clientUid: "", projectId: "", artistId: "", appointmentType: "tattoo_session", title: "", startLocal: "", endLocal: "", status: "booked", internalNotes: "", clientVisibleNotes: "", paymentEvidence: null, transitionReviewed: false };
export default function AdminSchedule() {
  const [user, setUser] = useState(null), [authReady, setAuthReady] = useState(false), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [date, setDate] = useState(() => wall(Date.now(), "America/Edmonton").slice(0, 10)), [view, setView] = useState("week"), [artist, setArtist] = useState("");
  const [report, setReport] = useState(null), [clients, setClients] = useState([]), [form, setForm] = useState(emptyForm), [selected, setSelected] = useState(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [reviewed, setReviewed] = useState(false);
  const [policyDraft, setPolicyDraft] = useState(""), [policyReviewed, setPolicyReviewed] = useState(false), [reload, setReload] = useState(0);
  const request = useRef(null), days = range(date, view), from = days[0], to = days.at(-1);
  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); setReport(null); setClients([]); setForm(emptyForm); setSelected(null); setPolicyDraft(""); }), []);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const params = new URLSearchParams({ from, to, ...(form.studioClientId && { studioClientId: form.studioClientId }), ...(selected?.id && { id: selected.id }) });
    api(`/api/admin/schedule?${params}`).then(r => { if (live) { setReport(r); setPolicyDraft(old => old || JSON.stringify(r.policy, null, 2)); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [user, from, to, form.studioClientId, selected?.id, reload]);
  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      const rows = []; let cursor = "";
      do { const r = await api(`/api/admin/clients${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`); rows.push(...r.clients); cursor = r.nextCursor; if (rows.length >= 5000 && cursor) throw new Error("Client inventory needs a scoped report."); } while (cursor);
      if (live) setClients(rows);
    })().catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [user]);
  function change(key, value) { setForm(old => ({ ...old, [key]: value, ...(key === "studioClientId" && { clientUid: "", projectId: "", paymentEvidence: null }) })); setReviewed(false); }
  function select(row) {
    setSelected(row); setReviewed(false); setNotice("");
    setForm({ ...emptyForm, ...Object.fromEntries(Object.keys(emptyForm).filter(k => k in row).map(k => [k, row[k] ?? ""])), paymentEvidence: row.paymentEvidence ? { kind: row.paymentEvidence.kind, id: row.paymentEvidence.id } : null,
      startLocal: wall(row.startAt, report.policy.timezone), endLocal: wall(row.endAt, report.policy.timezone) });
  }
  async function send(body) {
    setBusy(true); setError(""); setNotice("");
    try {
      request.current ||= sessionStorage.getItem("fawcett-schedule-request") || crypto.randomUUID();
      sessionStorage.setItem("fawcett-schedule-request", request.current);
      const result = await api("/api/admin/schedule", { ...body, requestId: request.current, reviewed: true });
      request.current = null; sessionStorage.removeItem("fawcett-schedule-request");
      if (body.action === "policy") { setPolicyDraft(""); setPolicyReviewed(false); }
      else { setSelected({ id: result.id, revision: result.revision, legacy: false }); setReviewed(false); }
      setNotice("Saved privately. Appointment portal details require separate publication review."); setReload(r => r + 1);
    } catch (e) { setReviewed(false); setError(`${e.message}. Reload and re-review stale policy or appointment details. For uncertain outcomes, retain the request ID and reconcile before starting a replacement.`); }
    finally { setBusy(false); }
  }
  async function login(event) { event.preventDefault(); setError(""); try { await signInWithEmailAndPassword(auth, email, password); } catch { setError("Sign-in failed."); } }
  if (!authReady) return <main className="admin-page"><p>Checking access…</p></main>;
  if (!user) return <main className="admin-page"><h1>Studio schedule</h1>{error && <p role="alert">{error}</p>}<form className="admin-form" onSubmit={login}><label>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label><label>Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label><button className="button button-primary">Sign in</button></form></main>;
  function navigate(direction) { setDate(navigateDate(date, view, direction)); }
  const entries = (report?.entries || []).filter(r => !artist || r.resources.includes(artist));
  const financial = report?.financial || { manual: [], square: [] };
  const cards = day => entries.filter(r => wall(r.startAt, report.policy.timezone).slice(0, 10) === day).sort((a, b) => a.startAt - b.startAt).map(row => <button key={row.id} className={`schedule-card schedule-${row.artistId}`} onClick={() => select(row)}><strong>{row.title}</strong><span>{wall(row.startAt, report.policy.timezone).slice(11)}–{wall(row.endAt, report.policy.timezone).slice(11)} · {row.artistId}</span><span>{label(row.appointmentType)} · {row.status}</span>{row.policyRevision !== report.policy.revision && <small>Policy changed: review availability</small>}</button>);
  return <main className="admin-page scheduling"><header className="admin-header"><div><p className="eyebrow">Private studio calendar</p><h1>Fawcett schedule</h1><p>Ben and Autumn · one chair · {report?.policy.timezone || "America/Edmonton (proposed)"}</p></div><Link href="/admin">Admin home</Link><button onClick={() => signOut(auth)}>Sign out</button></header>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {report && <><p>{report.policy.enabled ? "Scheduling policy enabled." : "Scheduling is closed pending reviewed configuration."} {report.policy.transitionReviewed ? "Business-calendar transition acknowledged." : "Apple Calendar transition remains under manual review; this is not yet the master calendar."}</p>
      <nav className="schedule-toolbar" aria-label="Calendar controls"><label>Date<input type="date" required value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></label><button onClick={() => navigate(-1)}>Previous</button><button onClick={() => navigate(1)}>Next</button><label>View<select value={view} onChange={e => setView(e.target.value)}>{["day", "week", "month", "agenda"].map(v => <option key={v}>{v}</option>)}</select></label><button onClick={() => { setReviewed(false); setReload(r => r + 1); }}>Refresh calendar</button><label>Artist<select value={artist} onChange={e => setArtist(e.target.value)}><option value="">Both artists</option>{ARTISTS.map(a => <option key={a}>{a}</option>)}</select></label></nav>
      <section className={`schedule-calendar schedule-view-${view}`} aria-label={`${view} calendar`}>{days.map(day => <article key={day} className="schedule-day"><h2>{day}</h2>{cards(day)}</article>)}</section>
      <section className="admin-card"><h2>Unreviewed legacy appointments ({report.legacy.length})</h2><p>Unknown availability blocks new active bookings. Review each original individually; never guess duration, ownership or artist.</p>{report.legacy.map(row => <button className="schedule-card" key={row.id} onClick={() => select(row)}>{row.title} · {row.id} · review required</button>)}</section>
      <section className="admin-card"><h2>{selected?.legacy ? "Review legacy appointment" : selected ? "Edit / reschedule appointment" : "Create appointment"}</h2><button disabled={busy} onClick={() => { setForm(emptyForm); setSelected(null); setReviewed(false); }}>New appointment</button>
        <form className="admin-form" onSubmit={e => { e.preventDefault(); if (reviewed) send({ action: selected?.legacy ? "adopt" : "save", ...(selected && { id: selected.id, revision: selected.revision }), ...(selected?.legacy && { legacyFingerprint: selected.sourceHash }), policyRevision: report.policy.revision, appointment: form }); }}><fieldset disabled={busy}>
          <label>Studio client<select value={form.studioClientId} onChange={e => change("studioClientId", e.target.value)}><option value="">No client (event/block only)</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.id}</option>)}</select></label>
          <label>Verified existing Auth UID (optional)<input value={form.clientUid} onChange={e => change("clientUid", e.target.value)} /></label><label>Reviewed project ID (optional)<input value={form.projectId} onChange={e => change("projectId", e.target.value)} /></label><p>IDs require pre-existing reviewed evidence. No account or link is created here.</p>
          <label>Artist<select required value={form.artistId} onChange={e => change("artistId", e.target.value)}><option value="">Choose artist</option>{ARTISTS.map(a => <option key={a}>{a}</option>)}</select></label><label>Type<select required value={form.appointmentType} onChange={e => change("appointmentType", e.target.value)}><option value="">Choose type</option>{TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></label>
          <label>Title<input required maxLength={160} value={form.title} onChange={e => change("title", e.target.value)} /></label><label>Start ({report.policy.timezone})<input required type="datetime-local" value={form.startLocal} onChange={e => change("startLocal", e.target.value)} /></label><label>End<input required type="datetime-local" value={form.endLocal} onChange={e => change("endLocal", e.target.value)} /></label><label>Status<select value={form.status} onChange={e => change("status", e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Private studio notes<textarea maxLength={4000} value={form.internalNotes} onChange={e => change("internalNotes", e.target.value)} /></label><label>Proposed client-visible notes<textarea maxLength={1000} value={form.clientVisibleNotes} onChange={e => change("clientVisibleNotes", e.target.value)} /></label><p>Saving withdraws the old portal appointment. <Link href="/admin/publication">Review and publish</Link> separately after checking the exact new record.</p>
          <label>Payment/deposit evidence (read-only source)<select value={form.paymentEvidence ? `${form.paymentEvidence.kind}:${form.paymentEvidence.id}` : ""} onChange={e => { const [kind, id] = e.target.value.split(":"); change("paymentEvidence", id ? { kind, id } : null); }}><option value="">No evidence selected</option>{financial.manual.map(p => <option key={p.id} value={`manual:${p.id}`}>Manual bookkeeping — NOT Square-confirmed · {p.amountCents / 100} {p.currency} · {p.id}</option>)}{financial.square.filter(p => p.type === "charge" && p.status === "completed").map(p => <option key={p.id} value={`square:${p.id}`}>Square-confirmed charge · {p.amountCents / 100} {p.currency} · {p.id}</option>)}</select></label>
          <p>Charges do not establish an available deposit balance. Review refunds/disputes below; no automatic financial action occurs.</p><ul>{financial.square.map(p => <li key={p.id}>{p.type} · {p.status} · {p.amountCents / 100} {p.currency} · {p.id}</li>)}</ul>{financial.truncated && <p role="alert">Payment report is incomplete. Operator reconciliation required.</p>}
          {!report.policy.transitionReviewed && <label><input type="checkbox" checked={form.transitionReviewed} onChange={e => change("transitionReviewed", e.target.checked)} />Manually reviewed business-only entry from the transition checklist; no family calendar content copied.</label>}
          <label><input type="checkbox" required checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed client identity, times, resources, notes and any legacy changes.</label><button className="button button-primary" disabled={!reviewed || busy}>{selected?.legacy ? "Adopt reviewed legacy record" : "Save / reschedule privately"}</button>
        </fieldset></form>
        {report.audit?.length > 0 && <><h3>Appointment audit</h3><ul>{report.audit.map(a => <li key={a.id}>{a.action} · revision {a.revision} · {a.actorUid} · {a.createdAt}</li>)}</ul></>}
      </section>
      <details className="admin-card"><summary>Reviewed booking policy</summary><SchedulingPolicy policy={policyDraft ? JSON.parse(policyDraft) : report.policy} disabled={busy} onChange={policy => { setPolicyDraft(JSON.stringify(policy)); setPolicyReviewed(false); }} /><label><input type="checkbox" checked={policyReviewed} onChange={e => setPolicyReviewed(e.target.checked)} />I reviewed the hours, resources, buffers, timezone and business-calendar transition acknowledgement.</label><button disabled={!policyReviewed || busy} onClick={() => { const policy = policyDraft ? JSON.parse(policyDraft) : report.policy; send({ action: "policy", revision: policy.revision, policy }); }}>Save reviewed policy</button></details>
    </>}
  </main>;
}
