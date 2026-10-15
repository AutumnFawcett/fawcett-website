"use client";
import { useState } from "react";
import { auth } from "@/lib/firebaseClient";
export default function PublicationReview() {
  const [path, setPath] = useState(""), [review, setReview] = useState(null), [fields, setFields] = useState([]);
  const [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function run(publish, withdraw = false) {
    setBusy(true); setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in with your studio admin account first.");
      const response = await fetch(`/api/admin/publication${publish ? "" : `?path=${encodeURIComponent(path)}`}`, {
        method: publish ? "POST" : "GET", cache: "no-store",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        ...(publish ? { body: JSON.stringify({ path: review.path, sourceHash: review.sourceHash, fields, reviewed: confirmed, ...(withdraw ? { action: "withdraw" } : {}) }) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review unavailable.");
      if (auth.currentUser?.uid !== user.uid) throw new Error("Session changed. Reload before reviewing.");
      if (publish) { setReview(null); setMessage(withdraw ? "Portal record withdrawn. The private original is unchanged." : "Reviewed portal record published. The private original is unchanged."); }
      else { setReview(data); setFields(Object.keys(data.candidate)); setConfirmed(false); }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-black text-white px-4 py-12"><section className="mx-auto max-w-3xl space-y-6">
    <h1 className="text-3xl font-bold">Review portal publication</h1>
    <p>Studio saves stay private. Review every selected field below before sharing it with the named client. Remove health information, internal notes, private references and unapproved summaries or previews.</p>
    <label className="block">Original record path<input className="block w-full border border-white/40 bg-black p-3" placeholder="projects/record-id" value={path} onChange={event => { setPath(event.target.value); setReview(null); }} /></label>
    <button className="button button-secondary" disabled={busy || !path} onClick={() => run(false)}>Load for review</button>
    {review && <div className="space-y-4"><p>Publication state: {review.state}. Original: {review.path}</p>{Object.entries(review.candidate).map(([key, value]) => <label key={key} className="block border border-white/30 p-3"><input type="checkbox" checked={fields.includes(key)} onChange={event => { setConfirmed(false); setFields(previous => event.target.checked ? [...previous, key] : previous.filter(field => field !== key)); }} /> Share {key}<pre className="mt-2 whitespace-pre-wrap break-words text-sm">{JSON.stringify(value, null, 2)}</pre></label>)}
    <label className="block"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I confirmed ownership and reviewed every selected value for client visibility.</label>
    <button className="button button-primary" disabled={busy || !confirmed || review.requiresCuration} onClick={() => run(true)}>Publish reviewed record</button>
    <button className="button button-secondary" disabled={busy || !confirmed} onClick={() => run(true, true)}>Withdraw portal record</button></div>}
    <p role="status">{message}</p>
  </section></main>;
}
