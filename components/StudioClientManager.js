"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebaseClient";
const blank = () => ({ name: "", email: "", phone: "", instagram: "", preferredArtist: "not_sure", status: "lead", studioNotes: "" });
const statuses = ["lead", "consulting", "quoted", "booked", "active_project", "membership_candidate", "completed", "inactive", "archived"];
const artists = ["not_sure", "ben", "autumn", "no_preference"];
const label = value => value.replaceAll("_", " ");

export default function StudioClientManager({ user }) {
  const [clients, setClients] = useState([]), [cursor, setCursor] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null), [draft, setDraft] = useState(blank);
  const [audit, setAudit] = useState([]), [associations, setAssociations] = useState([]);
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [busy, setBusy] = useState(false);
  const [duplicates, setDuplicates] = useState(null), [duplicateReason, setDuplicateReason] = useState("");
  const [consultId, setConsultId] = useState(""), [consultReview, setConsultReview] = useState(null);
  const [reason, setReason] = useState(""), [reviewed, setReviewed] = useState(false);
  const generation = useRef(0);
  const api = useCallback(async (params = "", body) => {
    const token = await user.getIdToken();
    const response = await fetch(`/api/admin/clients${params}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, cache: "no-store", ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (auth.currentUser?.uid !== user.uid) throw new Error("Session changed. Please sign in again.");
    if (!response.ok) { const failure = new Error(data.error || "Request failed"); failure.details = data; throw failure; }
    return data;
  }, [user]);
  const load = useCallback(async (after = "") => {
    const data = await api(after ? `?after=${encodeURIComponent(after)}` : "");
    setClients(previous => after ? [...previous, ...data.clients] : data.clients);
    setCursor(data.nextCursor);
  }, [api]);
  useEffect(() => {
    let active = true;
    api().then(data => { if (active) { setClients(data.clients); setCursor(data.nextCursor); } }).catch(() => { if (active) setError("Could not load studio files. Please retry."); });
    return () => { active = false; generation.current += 1; };
  }, [api]);
  async function select(id) {
    if (busy) return;
    const sequence = ++generation.current;
    setBusy(true);
    setError(""); setSuccess(""); setDuplicates(null); setDuplicateReason("");
    setConsultReview(null); setConsultId(""); setReason(""); setReviewed(false);
    try {
      const data = await api(`?id=${encodeURIComponent(id)}`);
      if (sequence !== generation.current) return;
      setSelected(data.client); setDraft(Object.fromEntries(Object.keys(blank()).map(key => [key, data.client[key] || blank()[key]])));
      setAudit(data.audit); setAssociations(data.associations);
    } catch { if (sequence === generation.current) setError("Could not load this file."); }
    finally { if (sequence === generation.current) setBusy(false); }
  }
  function create() {
    generation.current += 1; setSelected(null); setDraft(blank()); setAudit([]); setAssociations([]);
    setDuplicates(null); setDuplicateReason(""); setError(""); setSuccess(""); setConsultReview(null); setConsultId(""); setReason(""); setReviewed(false);
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const result = await api("", { action: "save", ...(selected ? { id: selected.id, revision: selected.revision } : {}), client: draft, ...(duplicates ? { duplicateReview: { token: duplicates.duplicateToken, reason: duplicateReason } } : {}) });
      await load();
      // select is called while this request owns the busy lock.
      const detail = await api(`?id=${encodeURIComponent(result.id)}`);
      setSelected(detail.client); setDraft(Object.fromEntries(Object.keys(blank()).map(key => [key, detail.client[key] || blank()[key]]))); setAudit(detail.audit); setAssociations(detail.associations); setDuplicates(null); setDuplicateReason("");
      setSuccess("Studio file saved. No portal account was created.");
    } catch (failure) {
      if (failure.details?.error === "duplicate_review_required") { setDuplicates(failure.details); setDuplicateReason(""); setError("Review the possible duplicates before saving."); }
      else setError(failure.message === "record_changed_reload" ? "This file changed. Reopen it before saving." : "Could not save. Check your entries and admin access, then retry.");
    } finally { setBusy(false); }
  }
  async function inspectConsult() {
    setBusy(true); setError(""); setConsultReview(null); setReviewed(false);
    try { setConsultReview(await api(`?consultId=${encodeURIComponent(consultId.trim())}`)); }
    catch { setError("Could not find that consultation or verify access."); }
    finally { setBusy(false); }
  }
  async function associate() {
    setBusy(true); setError(""); setSuccess("");
    try {
      await api("", { action: "associate", id: selected.id, revision: selected.revision, consultId: consultReview.consult.id, consultReviewToken: consultReview.consultReviewToken, reviewed, reason });
      const detail = await api(`?id=${encodeURIComponent(selected.id)}`);
      setAudit(detail.audit); setAssociations(detail.associations); setConsultReview(null); setReviewed(false); setReason("");
      setSuccess("Consultation associated. Original records and portal access are unchanged.");
    } catch (failure) { setError(failure.message === "consult_already_associated" ? "That consultation is already associated with another studio file." : "Association could not be saved. Reload the file and review the consultation again."); }
    finally { setBusy(false); }
  }
  const visible = clients.filter(client => [client.name, client.email, client.phone, client.instagram, client.id].some(value => value.toLowerCase().includes(search.toLowerCase())));
  return <section className="studio-client-manager" aria-labelledby="studio-client-heading">
    <div className="panel-heading"><h2 id="studio-client-heading">Studio client files</h2><p>Create a studio file without portal signup. Private studio notes are visible to authorized admins only.</p></div>
    <div className="admin-applications-layout">
      <aside className="applications-list-panel">
        <button className="button button-primary" type="button" onClick={create} disabled={busy}>New studio client</button>
        <div className="admin-filters"><label>Search loaded files<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, contact or studio ID" /></label></div>
        {cursor && <p>More files are available. Load more to include them in search.</p>}
        <div className="application-list">{visible.map(client => <button key={client.id} type="button" className={`application-card ${selected?.id === client.id ? "application-card-active" : ""}`} aria-pressed={selected?.id === client.id} disabled={busy} onClick={() => select(client.id)}><strong>{client.name}</strong><span>{client.email || client.phone || "No contact details"}</span><span>{label(client.status)}</span></button>)}</div>
        {!visible.length && <p>No matching loaded files.</p>}
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => { setBusy(true); load(cursor || "").catch(() => setError("Could not load files.")).finally(() => setBusy(false)); }}>{cursor ? "Load more files" : "Refresh files"}</button>
      </aside>
      <div className="application-detail-panel">
        <h3>{selected ? "Edit studio client" : "New studio client"}</h3>
        {selected && <p className="studio-record-id">Studio ID: {selected.id} · Revision {selected.revision}</p>}
        {error && <p role="alert" className="error-message">{error}</p>}{success && <p role="status" className="success-message">{success}</p>}
        <form onSubmit={save}>
          <fieldset disabled={busy} className="studio-fields detail-card">
            <div className="review-controls">{[["name", "Name", "text", 160], ["email", "Email", "email", 254], ["phone", "Telephone", "tel", 50], ["instagram", "Instagram", "text", 80]].map(([key, title, type, maxLength]) => <label key={key}>{title}<input type={type} maxLength={maxLength} required={key === "name"} value={draft[key]} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setDuplicates(null); setDuplicateReason(""); }} /></label>)}
              <label>Preferred artist<select value={draft.preferredArtist} onChange={e => setDraft({ ...draft, preferredArtist: e.target.value })}>{artists.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
              <label>Client status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
            </div>
            <label>Private studio notes<textarea rows={6} maxLength={12000} value={draft.studioNotes} onChange={e => setDraft({ ...draft, studioNotes: e.target.value })} /></label>
            {duplicates && <div className="studio-duplicate-review"><h4>Possible duplicate files</h4><p>Compare these files. Saving separately requires a reason; no records will be merged.</p>{duplicates.candidates.map(c => <p key={c.id}>{c.name} · {c.email || c.phone} · {c.id}</p>)}<label>Reason for keeping separate files<textarea required minLength={10} maxLength={1000} value={duplicateReason} onChange={e => setDuplicateReason(e.target.value)} /></label></div>}
            <button className="button button-primary" type="submit">{busy ? "Saving…" : duplicates ? "Save separate file after review" : "Save studio file"}</button>
          </fieldset>
        </form>
        {selected && <>
          <section className="detail-card"><h3>Reviewed consultation association</h3><p>This adds an administrative association. It does not grant portal access or move any history.</p><label>Consultation document ID<input value={consultId} disabled={busy} onChange={e => { setConsultId(e.target.value); setConsultReview(null); setReviewed(false); }} /></label><button className="button button-secondary" type="button" disabled={busy || !consultId.trim()} onClick={inspectConsult}>Review consultation</button>
            {consultReview && <div><p>{consultReview.consult.clientName} · {consultReview.consult.clientEmail} · {consultReview.consult.phone}</p><p>Submitted: {consultReview.consult.createdAt || "Unknown"} · Status: {consultReview.consult.status || "Unknown"}</p><p className="studio-record-id">Original account: {consultReview.consult.clientUid || "No verified account recorded"}</p><label>Reason for association<textarea disabled={busy} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label><label className="studio-check"><input type="checkbox" disabled={busy} checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the consultation and verified it belongs in this studio file.</label><button type="button" className="button button-primary" disabled={busy || !reviewed || reason.trim().length < 10} onClick={associate}>Associate reviewed consultation</button></div>}
            <h4>Associated consultations</h4>{associations.length ? associations.map(item => <p key={item.id} className="studio-record-id">{item.consultId} · {item.reason}</p>) : <p>None yet.</p>}
          </section>
          <section className="detail-card"><h3>Portal account linking</h3><p>No portal account is linked by this workflow. Linking requires a separate verified ownership review. Matching email addresses and consultation associations do not grant access.</p></section>
          <section className="detail-card"><h3>Audit history</h3><p>Latest 100 events. Events record the acting admin and changed fields without duplicating private note text.</p>{audit.map(item => <div key={item.id} className="mini-record-card"><strong>{label(item.action)}</strong><span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Pending timestamp"}</span><span className="studio-record-id">Admin: {item.actorUid}</span><span>{item.changedFields?.map(label).join(", ") || item.consultId}</span>{item.reason && <span>{item.reason}</span>}{item.duplicateReview && <span>Duplicate review: {item.duplicateReview.reason}</span>}</div>)}</section>
        </>}
      </div>
    </div>
  </section>;
}
