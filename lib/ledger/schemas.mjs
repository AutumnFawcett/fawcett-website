// Inert domain contracts. No SDK, credentials, storage or application imports.
export const SCHEMA_VERSION = 1;
export const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
export const cents = value => Number.isSafeInteger(value) && value >= 0;
export const positiveCents = value => cents(value) && value > 0;
const choice = (...values) => value => values.includes(value);
const text = value => typeof value === "string" && value.length > 0 && value.length <= 200;
const version = value => Number.isSafeInteger(value) && value > 0;
const base = { schemaVersion: value => value === 1, id, environment: choice("sandbox", "production"), currency: value => value === "CAD" };
const optionalId = value => value === null || id(value);
// Undefined optional fields are not allowed: use explicit null.
export const contracts = Object.freeze({
  paymentRequest: { ...base, clientId: id, projectId: optionalId, appointmentId: optionalId,
    projectApproved: value => typeof value === "boolean",
    purpose: choice("project_deposit", "session", "monthly", "supply_fee"), amountCents: positiveCents,
    policyId: id, policyVersion: version, status: choice("draft", "open", "closed", "canceled") },
  paymentAttempt: { ...base, requestId: id, channel: choice("hosted", "pos", "subscription"),
    idempotencyKey: id, status: choice("prepared", "pending", "verified", "failed", "review") },
  providerTransaction: { ...base, provider: value => value === "square", merchantId: id, paymentId: id,
    orderId: id, locationId: id, requestId: id, clientId: id, projectId: optionalId, amountCents: positiveCents,
    status: choice("COMPLETED", "FAILED", "PENDING"), sourceType: text,
    readbackVerified: value => typeof value === "boolean", verificationVersion: version,
    evidenceId: id },
  providerRefund: { ...base, provider: value => value === "square", merchantId: id, paymentId: id,
    amountCents: positiveCents, status: value => value === "COMPLETED", readbackVerified: value => value === true,
    verificationVersion: value => value === 1, evidenceId: id },
  creditAccount: { ...base, clientId: id, revision: cents, availableCents: cents, reservedCents: cents,
    purchasedCents: cents, promotionalCents: cents },
  allocation: { ...base, journalId: id, lotId: id, clientId: id, projectId: optionalId,
    appointmentId: optionalId, amountCents: positiveCents, purpose: choice("tattoo_service", "supply_fee", "refund") },
  policy: { schemaVersion: value => value === 1, id, version, status: choice("draft", "approved"),
    currency: value => value === "CAD", depositScope: value => value === "project",
    purchasedExpiry: value => value === "never", cancellationCredit: value => value === "retain",
    supplyFees: value => value === "separate", promotionUse: value => value === "explicit",
    disputeFreeze: value => value === "remaining_funding_lot" },
});
export function validateRecord(kind, value) {
  const fields = contracts[kind];
  if (!fields || !value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== Object.keys(fields).length
    || !Object.entries(fields).every(([key, check]) => Object.hasOwn(value, key) && check(value[key]))) {
    throw Error("invalid_" + kind);
  }
  if (kind === "paymentRequest" && value.purpose === "project_deposit" && (!value.projectId || !value.projectApproved)) throw Error("deposit_requires_project");
  return structuredClone(value);
}
export function add(a, b) {
  const result = a + b;
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(result)) throw Error("money_overflow");
  return result;
}
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  const result = JSON.stringify(value);
  if (result === undefined || (typeof value === "number" && !Number.isFinite(value))) throw Error("invalid_json");
  return result;
}
