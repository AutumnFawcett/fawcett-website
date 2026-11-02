// Isolated domain contracts. No UI, payment transport, SDK or persistence.
import { createHash } from "node:crypto";
import { id, cents, positiveCents, add, canonical } from "../ledger/schemas.mjs";
export { id, cents, positiveCents, add, canonical };
export const check = (ok, reason) => { if (!ok) throw Error(reason); };
export const oneOf = (...values) => value => values.includes(value);
export const nullableId = value => value === null || id(value);
export const integer = value => Number.isSafeInteger(value) && value > 0;
export const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
export const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const timestamp = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const ms = Date.parse(value); return Number.isFinite(ms) && new Date(ms).toISOString() === value;
};
const text = value => typeof value === "string" && value.length > 0 && value.length <= 20000;
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const base = { schemaVersion: value => value === 1, id };
const referenceFields = { id, version: integer, contentHash: digest };
export function record(fields, value) {
  check(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === Object.keys(fields).length
    && Object.entries(fields).every(([key, fn]) => Object.hasOwn(value, key) && fn(value[key])), "invalid_contract");
  return structuredClone(value);
}
export const reference = value => { try { record(referenceFields, value); return true; } catch { return false; } };
export const policyRef = policy => ({ id: policy.id, version: policy.version, contentHash: policy.contentHash });
export const allocation = value => {
  try { record({ id, kind: oneOf("appointment_booking_fee", "tattoo_advance"), amountCents: positiveCents }, value); return true; } catch { return false; }
};
export function policyVersion(value) {
  const p = record({ ...base, version: integer, content: text, contentHash: digest,
    status: oneOf("draft", "published"), legalReview: oneOf("pending", "approved"), accountingReview: oneOf("pending", "approved"),
    complimentaryNoticeHours: v => v === 168, complimentaryReschedules: v => v === 1,
    automaticForfeiture: v => v === false, advanceToStudio: v => typeof v === "boolean" }, value);
  check(p.contentHash === hash(p.content), "policy_hash_mismatch"); return p;
}
export function agreement(value) {
  const a = record({ ...base, clientId: id, environment: oneOf("sandbox", "production"), currency: v => v === "CAD",
    revision: integer, appointmentId: id, appointmentRevision: integer, policy: reference,
    allocations: v => Array.isArray(v) && v.length > 0 && v.length <= 2 && v.every(allocation),
    requiredOfferTerms: v => Array.isArray(v) && v.every(reference), totalCents: positiveCents }, value);
  check(new Set(a.allocations.map(x => x.id)).size === a.allocations.length
    && new Set(a.allocations.map(x => x.kind)).size === a.allocations.length, "duplicate_allocation");
  check(a.allocations.reduce((sum, x) => add(sum, x.amountCents), 0) === a.totalCents, "allocation_total_mismatch");
  check(new Set(a.requiredOfferTerms.map(x => x.id)).size === a.requiredOfferTerms.length, "duplicate_offer_terms");
  return a;
}
export function offerVersion(value) {
  const o = record({ ...base, version: integer, type: oneOf("conditional_discount", "loyalty_benefit", "service_entitlement"),
    terms: text, termsHash: digest, startsAt: timestamp, expiresAt: timestamp, serviceIds: ids, artistIds: ids,
    qualifyingCents: cents, maxRedemptions: integer, stackGroup: nullableId, allowStackWith: ids,
    discountCents: cents, entitlementCode: nullableId }, value);
  check(hash(o.terms) === o.termsHash && Date.parse(o.expiresAt) > Date.parse(o.startsAt), "invalid_offer_terms");
  check(o.type === "conditional_discount" ? o.discountCents > 0 && o.entitlementCode === null
    : o.discountCents === 0 && id(o.entitlementCode), "invalid_benefit");
  check(!o.allowStackWith.includes(o.id), "self_stacking"); return o;
}
export function purchasedCredit(value) {
  const c = record({ ...base, clientId: id, environment: oneOf("sandbox", "production"), currency: v => v === "CAD",
    revision: cents, acceptanceEvidenceId: id,
    category: oneOf("studio_credit", "tattoo_credit", "appointment_advance", "appointment_booking_fee"),
    remainingCents: cents, reservedCents: cents, artistId: nullableId, projectId: nullableId, appointmentId: nullableId,
    fundingEvidenceId: id, policy: reference }, value);
  check(c.reservedCents <= c.remainingCents, "invalid_reservation");
  check(c.category !== "studio_credit" || (!c.artistId && !c.projectId && !c.appointmentId), "restricted_studio_credit");
  check(!["appointment_advance", "appointment_booking_fee"].includes(c.category) || c.appointmentId !== null, "appointment_required");
  return c;
}
// Context must be constructed by a future authenticated SERVER adapter. Passing
// these fields from a browser is not authentication and must never be accepted.
export function serverContext(value) {
  return record({ actorId: id, clientId: id, environment: oneOf("sandbox", "production"),
    role: oneOf("client", "owner", "admin"), now: timestamp, authorizationEvidenceId: id }, value);
}
