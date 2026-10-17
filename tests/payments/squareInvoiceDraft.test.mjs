import test from "node:test";
import assert from "node:assert/strict";
import { cadToCents, prepareSquareInvoiceDraft } from "../../lib/payments/squareInvoiceDraft.mjs";

test("parses Canadian amounts exactly and rejects ambiguous money", () => {
  assert.equal(cadToCents("150.50"), 15050);
  assert.equal(cadToCents("500"), 50000);
  for (const bad of ["0", "", "1.999", "1,000.00", "-5", "NaN", "1e5", "9999999"]) {
    assert.equal(cadToCents(bad), null);
  }
});
test("prepares an invoice without falsely claiming payment or credit", () => {
  const client = { clientName: "Sample Client", clientEmail: "sample@example.invalid" };
  const result = prepareSquareInvoiceDraft({ client, amountDollars: "150.50", purpose: "tattoo_deposit", notes: "Approved project deposit" });
  assert.equal(result.ok, true);
  assert.equal(result.cents, 15050);
  assert.match(result.text, /Sample Client/);
  assert.match(result.text, /\$150\.50/);
  assert.match(result.text, /NOT an invoice, payment confirmation, subscription or Studio Credit/);
});
test("refuses unidentified clients and unsupported payment purposes", () => {
  const valid = { clientName: "Someone", clientEmail: "person@example.invalid" };
  assert.equal(prepareSquareInvoiceDraft({ client: valid, amountDollars: "10", purpose: "membership_subscription" }).ok, false);
  assert.equal(prepareSquareInvoiceDraft({ client: { ...valid, clientEmail: "" }, amountDollars: "10", purpose: "consult" }).ok, false);
  assert.equal(prepareSquareInvoiceDraft({ client: null, amountDollars: "10", purpose: "consult" }).ok, false);
});
