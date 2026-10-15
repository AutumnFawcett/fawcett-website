import test from "node:test";
import assert from "node:assert/strict";
import { clientInput, duplicateKeys, duplicateReview, recordId } from "../../lib/clients/clientModel.mjs";
const input = { name: " Synthetic Alice ", email: "Alice@Example.test", phone: "+1 (555) 123-4567", instagram: "@SyntheticAlice", preferredArtist: "ben", status: "lead", studioNotes: "Private synthetic note" };
test("studio duplicate matching normalizes name, email, phone and Instagram without treating matches as identity", () => {
  const first = duplicateKeys(clientInput(input));
  const second = duplicateKeys(clientInput({ ...input, name: "synthetic alice", email: "alice@example.test", phone: "5551234567", instagram: "syntheticalice" }));
  assert.deepEqual(first, second);
  assert.equal(clientInput(input).studioNotes, input.studioNotes);
  assert.equal(clientInput(input).name, "Synthetic Alice");
});
test("studio inputs reject ownership injection, invalid status, blank names, malformed contacts and oversized notes", () => {
  for (const patch of [{ clientUid: "victim" }, { linkedUid: "victim" }, { revision: 100 }, { status: "admin" }, { preferredArtist: "unknown" }, { name: " " }, { email: "invalid" }, { phone: "123" }, { studioNotes: "x".repeat(12001) }]) assert.throws(() => clientInput({ ...input, ...patch }));
  for (const id of ["../secret", "a/b", "", null, "x".repeat(129)]) assert.throws(() => recordId(id));
});
test("duplicate review requires explicit reason and a current token tied to candidates and draft", () => {
  const keys = duplicateKeys(input), candidates = [{ id: "one", revision: 1, name: "Synthetic", email: "test@example.test", phone: "5551234567", studioNotes: "Never disclosed in duplicates" }];
  let failure;
  try { duplicateReview(keys, candidates); } catch (e) { failure = e; }
  assert.equal(failure.status, 409);
  assert.equal(failure.details.candidates[0].studioNotes, undefined);
  const review = { token: failure.details.duplicateToken, reason: "Reviewed distinct synthetic clients" };
  assert.deepEqual(duplicateReview(keys, candidates, review).candidateIds, ["one"]);
  assert.throws(() => duplicateReview(keys, [{ ...candidates[0], revision: 2 }], review));
  assert.throws(() => duplicateReview([...keys, "email:different@example.test"], candidates, review));
  assert.throws(() => duplicateReview(keys, candidates, { ...review, reason: "short" }));
  assert.equal(duplicateReview(keys, [], review), null);
});


test("legacy client browsing groups only by explicit UID, never by shared email or source document ID", async () => {
  const { legacyClientKey } = await import("../../lib/clients/legacyClientIdentity.mjs");
  const consult = { sourceCollection: "consultRequests", id: "one", clientEmail: "shared@example.test" };
  const application = { sourceCollection: "membershipApplications", id: "one", clientEmail: "shared@example.test" };
  assert.notEqual(legacyClientKey(consult), legacyClientKey(application));
  assert.notEqual(legacyClientKey(consult), legacyClientKey({ ...consult, id: "two" }));
  assert.equal(legacyClientKey({ ...consult, clientUid: "verified" }), legacyClientKey({ ...application, clientUid: "verified" }));
  assert.notEqual(legacyClientKey({ ...consult, clientUid: "alice" }), legacyClientKey({ ...application, clientUid: "bob" }));
});
