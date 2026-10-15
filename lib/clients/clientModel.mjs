import { createHash } from "node:crypto";

export const STATUSES = ["lead", "consulting", "quoted", "booked", "active_project", "membership_candidate", "completed", "inactive", "archived"];
export const ARTISTS = ["not_sure", "ben", "autumn", "no_preference"];
export class ClientError extends Error {
  constructor(code, status = 400, details = {}) { super(code); this.status = status; this.details = details; }
}
export function fail(code, status, details) { throw new ClientError(code, status, details); }
export function text(value, max, required = false) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) fail("invalid_input");
  return value.trim();
}
export function recordId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail("invalid_record_id");
  return value;
}
export function clientInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid_input");
  const allowed = ["name", "email", "phone", "instagram", "preferredArtist", "status", "studioNotes"];
  if (Object.keys(input).some(key => !allowed.includes(key))) fail("unsupported_field");
  const data = {
    name: text(input.name, 160, true), email: text(input.email, 254), phone: text(input.phone, 50),
    instagram: text(input.instagram, 80), preferredArtist: input.preferredArtist,
    status: input.status, studioNotes: text(input.studioNotes, 12000),
  };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fail("invalid_email");
  if (data.phone && data.phone.replace(/\D/g, "").length < 7) fail("invalid_phone");
  if (!STATUSES.includes(data.status) || !ARTISTS.includes(data.preferredArtist)) fail("invalid_selection");
  return data;
}
const normalize = value => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function duplicateKeys(data) {
  return [
    `name:${normalize(data.name)}`,
    data.email && `email:${normalize(data.email)}`,
    data.phone && `phone:${data.phone.replace(/\D/g, "").slice(-10)}`,
    data.instagram && `instagram:${normalize(data.instagram).replace(/^@/, "")}`,
  ].filter(Boolean);
}
export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function duplicateReview(keys, candidates, input) {
  if (!candidates.length) return null;
  const token = digest({ keys: [...keys].sort(), candidates: candidates.map(c => [c.id, c.revision]).sort() });
  if (input?.token !== token || typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 1000) {
    fail("duplicate_review_required", 409, { candidates: candidates.map(({ id, name, email, phone, revision }) => ({ id, name, email, phone, revision })), duplicateToken: token });
  }
  return { candidateIds: candidates.map(c => c.id).sort(), reason: input.reason.trim() };
}
