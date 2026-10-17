import test from "node:test";
import assert from "node:assert/strict";
import { isReceivedStatus, validateManualRecord } from "../../lib/payments/manualReconciliation.mjs";

test("unpaid requests cannot change Studio Credit", () => {
  assert.equal(validateManualRecord({ status: "pending", creditHandling: "adds_in_studio_credit", reference: "", acknowledged: false }).includes("cannot add"), true);
  assert.equal(validateManualRecord({ status: "pending", creditHandling: "none", reference: "", acknowledged: false }), null);
  assert.equal(isReceivedStatus("pending"), false);
  assert.equal(isReceivedStatus("partial"), true);
});
test("recording a received manual payment requires acknowledgement and reference", () => {
  assert.match(validateManualRecord({ status: "paid", creditHandling: "none", reference: "INV-11", acknowledged: false }), /Confirm/);
  assert.match(validateManualRecord({ status: "paid", creditHandling: "adds_in_studio_credit", reference: "", acknowledged: true }), /reference/);
  assert.equal(validateManualRecord({ status: "paid", creditHandling: "adds_in_studio_credit", reference: "Square receipt ABC", acknowledged: true }), null);
});
