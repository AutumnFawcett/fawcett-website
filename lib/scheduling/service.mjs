import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { fencedFirestore } from "../safety/serverFence.mjs";
import { ClientError, fail, recordId } from "../clients/clientModel.mjs";
import { requireClientAdmin } from "../clients/clientService.mjs";
import { reviewIdentity } from "../studioPayments/service.mjs";
import { fingerprint } from "../migration/model.mjs";
import { proposedPolicy, policyInput, appointmentInput, assertAvailability, blocking, overlaps, localStamp } from "./model.mjs";
const hash = value => createHash("sha256").update(value).digest("hex");
const stamp = () => FieldValue.serverTimestamp();
const string = value => typeof value === "string" ? value : "";
const ms = value => value?.toMillis?.() ?? null;
const selectedPolicy = value => Object.fromEntries(Object.keys(proposedPolicy()).map(k => [k, value[k]]));
async function admin(tx, db, uid) {
  const row = await tx.get(db.doc(`adminUsers/${recordId(uid)}`));
  if (row.data()?.active !== true) fail("access_denied", 403);
}
async function appointments(reader, db) {
  const rows = await reader(db.collection("appointments").limit(1001));
  if (rows.size > 1000) fail("appointment_inventory_limit_review_required", 409);
  return rows.docs;
}
function only(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) fail("unsupported_field");
}
async function evidence(tx, db, value) {
  if (!value.paymentEvidence) return null;
  only(value.paymentEvidence, ["kind", "id"]);
  const { kind, id } = value.paymentEvidence;
  if (!["manual", "square"].includes(kind)) fail("invalid_payment_evidence");
  const row = await tx.get(db.doc(`${kind === "manual" ? "studioPayments" : "paymentTransactions"}/${recordId(id)}`));
  const data = row.data();
  if (!row.exists || data.studioClientId !== value.studioClientId || (data.projectId && data.projectId !== value.projectId)
    || (kind === "manual" ? data.origin !== "manual" : data.provider !== "square" || data.purpose !== "tattoo_payment" || data.type !== "charge" || data.status !== "completed")) fail("payment_evidence_mismatch", 409);
  return { kind, id, sourceHash: fingerprint(data) };
}
export async function mutateSchedule({ firestore, auth, uid, input }) {
  const db = fencedFirestore(firestore);
  await requireClientAdmin(db, uid);
  only(input, ["action", "requestId", "id", "revision", "appointment", "policy", "reviewed", "legacyFingerprint", "policyRevision"]);
  if (!["save", "adopt", "policy"].includes(input.action) || input.reviewed !== true) fail("explicit_review_required");
  const requestId = recordId(input.requestId);
  if (requestId.length < 16) fail("invalid_request_id");
  const requestRef = db.doc(`schedulingRequests/${hash(requestId)}`), lock = db.doc("schedulingControls/lock");
  const inputHash = fingerprint(input);
  return db.runTransaction(async tx => {
    await admin(tx, db, uid);
    const receipt = await tx.get(requestRef);
    await tx.get(lock);
    if (receipt.exists) {
      if (receipt.data().inputHash !== inputHash || receipt.data().actorUid !== uid) fail("request_conflict", 409);
      return receipt.data().result;
    }
    const policyRef = db.doc("schedulingConfig/policy"), policySnap = await tx.get(policyRef);
    const policy = policySnap.exists ? policyInput(selectedPolicy(policySnap.data())) : proposedPolicy();
    const rows = await appointments(query => tx.get(query), db);
    const legacy = rows.filter(row => row.data().schedulingProtocol !== 1);
    let result;
    if (input.action === "policy") {
      const next = policyInput(input.policy);
      if (!Number.isInteger(input.revision) || input.revision !== policy.revision || next.revision !== policy.revision) fail("stale_policy", 409);
      if (next.timezone !== policy.timezone && rows.some(row => blocking(row.data().status) && row.data().schedulingProtocol === 1)) fail("timezone_change_requires_reservation_reconciliation", 409);
      if (next.transitionReviewed && legacy.length) fail("unreviewed_legacy_appointments", 409);
      tx.set(policyRef, { ...next, revision: policy.revision + 1, reviewedBy: uid, reviewedAt: stamp() });
      tx.create(db.collection("schedulingPolicyAudit").doc(), { actorUid: uid, action: "policy_reviewed", previous: policy, next, createdAt: stamp() });
      result = { revision: policy.revision + 1 };
    } else {
      if (!policySnap.exists || !policy.timezoneApproved) fail("reviewed_scheduling_policy_required", 409);
      if (input.policyRevision !== policy.revision) fail("stale_scheduling_policy", 409);
      const value = appointmentInput(input.appointment, policy);
      if (blocking(value.status) && !policy.enabled) fail("scheduling_disabled", 503);
      if (input.action === "save" && !input.id && (!policy.transitionReviewed && !value.transitionReviewed)) fail("business_calendar_transition_review_required", 409);
      if (input.action === "save" && blocking(value.status) && legacy.length) fail("unreviewed_legacy_appointments", 409);
      const id = input.id ? recordId(input.id) : `sch_${hash(requestId).slice(0, 32)}`;
      const ref = db.doc(`appointments/${id}`), before = await tx.get(ref), old = before.data();
      if (input.id && !before.exists) fail("appointment_not_found", 404);
      if (!input.id && before.exists) fail("appointment_destination_conflict", 409);
      if (input.action === "adopt") {
        if (!before.exists || old.schedulingProtocol === 1 || input.legacyFingerprint !== fingerprint(old)) fail("legacy_record_changed", 409);
        if ((old.clientUid && old.clientUid !== value.clientUid) || (old.projectId && old.projectId !== value.projectId)) fail("legacy_relationship_must_be_preserved", 409);
        const baseline = await tx.get(db.doc(`scheduleLegacySnapshots/${id}`));
        if (baseline.exists) fail("legacy_baseline_conflict", 409);
      } else if (before.exists && (old.schedulingProtocol !== 1 || old.revision !== input.revision)) fail("stale_appointment", 409);
      if (old?.schedulingProtocol === 1 && ["studioClientId", "clientUid", "projectId"].some(k => old[k] !== value[k])) fail("appointment_identity_change_requires_separate_review", 409);
      const samePayment = fingerprint(value.paymentEvidence) === fingerprint(old?.paymentEvidence ? { kind: old.paymentEvidence.kind, id: old.paymentEvidence.id } : null);
      const terminalOnly = old?.schedulingProtocol === 1 && !blocking(value.status)
        && value.start === ms(old.startAt) && value.end === ms(old.endAt)
        && value.artistId === old.artistId && value.appointmentType === old.appointmentType && samePayment
        && ["title", "internalNotes", "clientVisibleNotes"].every(key => value[key] === old[key]);
      // A safe cancellation must remain possible after a client is archived or a
      // project changes. Preserve prior evidence; never reinterpret it as new proof.
      const projectAssociationHash = terminalOnly ? old.projectAssociationHash : value.studioClientId ? await reviewIdentity(tx, db, auth, uid, value) : null;
      const paymentEvidence = terminalOnly ? old.paymentEvidence : await evidence(tx, db, value);
      assertAvailability(value, policy);
      const keys = [...new Set([...(old?.schedulingProtocol === 1 ? old.reservationKeys : []), ...(blocking(value.status) ? value.resources.map(r => `${r}_${value.day}`) : [])])].sort();
      const reservations = [];
      for (const key of keys) {
        const reservationRef = db.doc(`scheduleReservations/${recordId(key)}`), row = await tx.get(reservationRef);
        const entries = (row.data()?.entries || []).filter(entry => entry.id !== id);
        if (blocking(value.status) && value.resources.some(r => key === `${r}_${value.day}`)) {
          if (entries.some(entry => overlaps(entry, { start: value.occupiedStart, end: value.occupiedEnd }))) fail("resource_conflict", 409, { resource: key.split("_")[0] });
          if (entries.length >= 150) fail("resource_day_capacity_limit", 409);
          entries.push({ id, start: value.occupiedStart, end: value.occupiedEnd });
        }
        reservations.push({ ref: reservationRef, entries });
      }
      const viewRef = db.doc(`portalRecords/appointments/records/${id}`), publicationRef = db.doc(`publicationRecords/appointments/records/${id}`);
      await tx.get(viewRef); const publication = await tx.get(publicationRef);
      const revision = (old?.schedulingProtocol === 1 ? old.revision : 0) + 1;
      const data = { schedulingProtocol: 1, revision, studioClientId: value.studioClientId, clientUid: value.clientUid, projectId: value.projectId, projectAssociationHash,
        title: value.title, appointmentType: value.appointmentType, status: value.status, artistId: value.artistId,
        assignedInbox: value.artistId, assignedArtistId: `artist_${value.artistId}`, startAt: Timestamp.fromMillis(value.start), endAt: Timestamp.fromMillis(value.end),
        durationMinutes: (value.end - value.start) / 60000, timezone: policy.timezone, policyRevision: policy.revision,
        beforeMinutes: policy.beforeMinutes, afterMinutes: policy.afterMinutes,
        resources: value.resources, occupiedStart: value.occupiedStart, occupiedEnd: value.occupiedEnd, reservationDay: value.day,
        reservationKeys: blocking(value.status) ? value.resources.map(r => `${r}_${value.day}`).sort() : [],
        internalNotes: value.internalNotes, clientVisibleNotes: value.clientVisibleNotes, paymentEvidence,
        transitionReviewed: value.transitionReviewed, updatedAt: stamp(), ...(before.exists ? {} : { createdAt: stamp() }) };
      if (terminalOnly) Object.assign(data, { policyRevision: old.policyRevision, beforeMinutes: old.beforeMinutes, afterMinutes: old.afterMinutes,
        resources: old.resources, occupiedStart: old.occupiedStart, occupiedEnd: old.occupiedEnd, reservationDay: old.reservationDay });
      if (input.action === "adopt") tx.create(db.doc(`scheduleLegacySnapshots/${id}`), { original: old, sourceHash: input.legacyFingerprint, actorUid: uid, reviewedAt: stamp() });
      // Explicitly reviewed legacy adoption preserves unknown original fields and
      // createdAt. Exact prior timestamps/content remain in its immutable baseline.
      tx.set(ref, data, { merge: true });
      for (const row of reservations) tx.set(row.ref, { entries: row.entries, updatedAt: stamp() });
      // Every save withdraws stale appointment information. Publication is a
      // separate exact-source review, never a side effect of rescheduling.
      tx.delete(viewRef);
      tx.set(publicationRef, { schemaVersion: 1, state: "withheld", revision: (publication.data()?.revision || 0) + 1, actorUid: uid, sourceHash: null, withdrawnAt: stamp() });
      tx.create(publicationRef.collection("history").doc(), { action: "schedule_changed_projection_withdrawn", actorUid: uid, createdAt: stamp() });
      tx.create(ref.collection("scheduleAudit").doc(), { action: input.action === "adopt" ? "legacy_adopted" : before.exists ? "appointment_updated" : "appointment_created", actorUid: uid, revision, createdAt: stamp(),
        previous: old ? { startAt: old.startAt || null, endAt: old.endAt || null, status: old.status || null, revision: old.revision || null } : null,
        next: { startAt: data.startAt, endAt: data.endAt, status: data.status }, changedFields: Object.keys(data).filter(k => !["updatedAt", "createdAt"].includes(k)).filter(k => !old || !Object.hasOwn(old, k) || fingerprint(old[k]) !== fingerprint(data[k])) });
      result = { id, revision };
    }
    tx.set(lock, { revision: FieldValue.increment(1), updatedAt: stamp() }, { merge: true });
    tx.create(requestRef, { inputHash, actorUid: uid, result, createdAt: stamp() });
    return result;
  });
}
function display(row) {
  const data = row.data();
  return { id: row.id, legacy: data.schedulingProtocol !== 1, sourceHash: fingerprint(data), revision: data.revision || 0,
    studioClientId: data.studioClientId || null, clientUid: data.clientUid || null, projectId: data.projectId || null, title: string(data.title) || "Unreviewed appointment",
    appointmentType: string(data.appointmentType), artistId: string(data.artistId), status: string(data.status) || "unknown",
    startAt: ms(data.startAt), endAt: ms(data.endAt), timezone: data.timezone || null, policyRevision: data.policyRevision ?? null, resources: data.resources || [],
    internalNotes: string(data.internalNotes), clientVisibleNotes: string(data.clientVisibleNotes), paymentEvidence: data.paymentEvidence || null };
}
export async function scheduleReport(db, uid, params = new URLSearchParams()) {
  await requireClientAdmin(db, uid);
  const config = await db.doc("schedulingConfig/policy").get();
  const policy = config.exists ? policyInput(selectedPolicy(config.data())) : proposedPolicy();
  const from = params.get("from") || localStamp(Date.now(), policy.timezone).slice(0, 10), to = params.get("to") || from;
  if (![from, to].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || new Date(from).toISOString().slice(0, 10) !== from || new Date(to).toISOString().slice(0, 10) !== to || Date.parse(to) < Date.parse(from) || Date.parse(to) - Date.parse(from) >= 42 * 86400000) fail("invalid_calendar_range");
  const rows = (await appointments(query => query.get(), db)).map(display);
  const legacy = rows.filter(r => r.legacy);
  const entries = rows.filter(r => !r.legacy && localStamp(r.endAt, policy.timezone).slice(0, 10) >= from && localStamp(r.startAt, policy.timezone).slice(0, 10) <= to);
  const clientId = params.get("studioClientId");
  let financial = { manual: [], square: [], truncated: false };
  if (clientId) {
    recordId(clientId);
    const [manual, square] = await Promise.all([db.collection("studioPayments").where("studioClientId", "==", clientId).limit(101).get(), db.collection("paymentTransactions").where("studioClientId", "==", clientId).limit(101).get()]);
    const shape = row => { const p = row.data(); return { id: row.id, amountCents: p.amountCents, currency: p.currency, projectId: p.projectId || null, type: p.type || "manual_record", status: p.status, parentTransactionId: p.parentTransactionId || null }; };
    financial = { manual: manual.docs.slice(0, 100).map(shape), square: square.docs.filter(r => r.data().provider === "square" && r.data().purpose === "tattoo_payment").slice(0, 100).map(shape), truncated: manual.size > 100 || square.size > 100 };
  }
  const id = params.get("id");
  const audit = id ? (await db.collection(`appointments/${recordId(id)}/scheduleAudit`).orderBy("createdAt", "desc").limit(50).get()).docs.map(row => ({ id: row.id, action: row.data().action, actorUid: row.data().actorUid, revision: row.data().revision, createdAt: row.data().createdAt?.toDate?.().toISOString() || null })) : [];
  return { policy, entries, legacy, financial, audit };
}
export async function handleScheduleRequest(request, dependencies) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  try {
    let uid;
    try { uid = await dependencies.authenticate(request); } catch { fail("access_denied", 403); }
    await requireClientAdmin(dependencies.firestore, uid);
    if (request.method === "GET") return Response.json(await scheduleReport(dependencies.firestore, uid, new URL(request.url).searchParams), { headers });
    if (request.method !== "POST") fail("method_not_allowed", 405);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") fail("invalid_content_type", 415);
    const raw = await request.text(); if (Buffer.byteLength(raw) > 32000) fail("request_too_large", 413);
    let input; try { input = JSON.parse(raw); } catch { fail("invalid_json"); }
    return Response.json(await mutateSchedule({ ...dependencies, uid, input }), { headers });
  } catch (error) {
    return Response.json({ error: error.code === "maintenance" ? "maintenance" : error instanceof ClientError ? error.message : "schedule_operation_requires_review", ...(error instanceof ClientError ? error.details : {}) }, { status: error.code === "maintenance" ? 503 : error instanceof ClientError ? error.status : 503, headers });
  }
}
