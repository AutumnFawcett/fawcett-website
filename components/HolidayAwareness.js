"use client";
import { useState } from "react";
import { HOLIDAY_CATEGORIES, HOLIDAY_STATES } from "@/lib/holidays/constants.mjs";
import { wall } from "@/lib/scheduling/calendar.mjs";
const timezone = "America/Edmonton";
const dates = item => `${wall(item.start, timezone).replace("T", " ")} to ${wall(item.end, timezone).replace("T", " ")}`;
export function HolidayMarkers({ holidays, day }) {
  return <div className="holiday-markers">{holidays.filter(h => (h.startDate <= day && h.endDate >= day) || (h.state !== "reminder" && h.closureStartDate <= day && h.closureEndDate >= day)).map(h => {
    const controlApplies = h.state !== "reminder" && h.closureStartDate <= day && h.closureEndDate >= day;
    return <p className={`holiday-marker holiday-${h.category}`} key={h.id}><strong>{HOLIDAY_CATEGORIES[h.category]}: {h.name}</strong><span>{controlApplies ? HOLIDAY_STATES[h.state] : "Holiday reference / reminder"}{controlApplies && ` (${h.resource})`}</span>{h.category === "jewish" && day === h.startDate && <span>Begins near sunset {wall(h.start, timezone).slice(11)} Edmonton</span>}{controlApplies && <span>{wall(h.controlStart, timezone).replace("T", " ")}–{wall(h.controlEnd, timezone).replace("T", " ")}</span>}</p>;
  })}</div>;
}
export default function HolidayAwareness({ report, busy, onSave }) {
  const [category, setCategory] = useState("all"), [draft, setDraft] = useState(null), [approved, setApproved] = useState(false);
  const rows = [...new Map([...report.upcoming, ...report.calendar].map(h => [h.id, h])).values()].filter(h => category === "all" || h.category === category).sort((a, b) => a.start - b.start);
  function select(item) {
    setDraft({ id: item.id, name: item.name, revision: item.revision, sourceHash: item.sourceHash, state: item.state, resource: item.resource,
      startLocal: wall(item.controlStart ?? item.start, timezone), endLocal: wall(item.controlEnd ?? (Math.ceil(item.end / 60000) * 60000), timezone) }); setApproved(false);
  }
  function update(patch) { setDraft(d => ({ ...d, ...patch })); setApproved(false); }
  return <><section className="admin-card"><h2>Upcoming holidays</h2><ul>{report.upcoming.slice(0, 3).map(h => <li key={h.id}>{HOLIDAY_CATEGORIES[h.category]}: {h.name} · {wall(h.start, timezone).replace("T", " ")} Edmonton · {HOLIDAY_STATES[h.state]}</li>)}</ul></section><details className="admin-card"><summary>Upcoming holidays and observance controls</summary>
    <p>Reference calendar: {report.firstYear}–{report.lastYear}, Edmonton. All holidays default to reminder-only. Nothing closes or sends an email automatically. Jewish dates use Diaspora conventions and approximate city-centre sunset/nightfall; confirm your observance and any preparation time.</p>
    {!report.coverageAvailable && <p role="alert">Holiday data is unavailable for part of this calendar range. Do not treat an empty list as confirmation that no holidays occur.</p>}
    <label>Holiday category<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{Object.entries(HOLIDAY_CATEGORIES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    <ul>{rows.map(h => <li key={h.id}><strong>{HOLIDAY_CATEGORIES[h.category]}: {h.name}</strong><p>{dates(h)} Edmonton · {HOLIDAY_STATES[h.state]} {h.policyStale && "— reference changed; review required"}</p>{h.classification && <p>{h.classification}</p>}<a href={report.sources[h.source].url} target="_blank" rel="noopener noreferrer">Date source</a> <button type="button" onClick={() => select(h)}>Review this occurrence</button></li>)}</ul>
    {draft && <fieldset disabled={busy}><legend>{draft.name} — this occurrence only</legend><p>Saving a new interval never cancels or moves an appointment. Resolve conflicting bookings before approving a closure.</p><label>State<select value={draft.state} onChange={e => update({ state: e.target.value })}>{Object.entries(HOLIDAY_STATES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      {draft.state !== "reminder" && <><label>Resource<select value={draft.resource} onChange={e => update({ resource: e.target.value })}>{["studio", "chair", "ben", "autumn"].map(r => <option key={r}>{r}</option>)}</select></label><label>Start (Edmonton)<input type="datetime-local" value={draft.startLocal} onChange={e => update({ startLocal: e.target.value })} /></label><label>End (Edmonton)<input type="datetime-local" value={draft.endLocal} onChange={e => update({ endLocal: e.target.value })} /></label><p>You may select a partial-day interval or preparation time within one day of the reference period. The exact approved interval is enforced, not the whole holiday automatically.</p></>}
      <label><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I reviewed this source, occurrence, resource and interval.{draft.state === "closed" && " I explicitly approve this closure/blockout."}</label><button type="button" disabled={!approved} onClick={async () => { const { name: _name, ...holiday } = draft; const result = await onSave({ action: "holiday", holiday: { ...holiday, closureApproved: draft.state === "closed" } }); if (result) setDraft(null); setApproved(false); }}>Save reviewed holiday setting</button>
    </fieldset>}
  </details></>;
}
