// UI guardrails for manually entered payment records.
// Manual acknowledgement is not automatic verification with Square.
export function isReceivedStatus(status) {
  return status === "paid" || status === "partial";
}
export function validateManualRecord({ status, creditHandling, reference, acknowledged }) {
  if (!isReceivedStatus(status)) {
    if (creditHandling !== "none") {
      return "Pending or unconfirmed payments cannot add, use or remove Studio Credit.";
    }
    return null;
  }
  if (!acknowledged) return "Confirm you personally verified the received payment before recording it as paid.";
  if (typeof reference !== "string" || !reference.trim()) {
    return "Enter a receipt or Square transaction reference for the verified payment.";
  }
  return null;
}
