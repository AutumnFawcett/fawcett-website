// Private, copy-only preparation for an owner-created Square invoice.
// This function never contacts Square or posts payment/credit records.
export const invoicePurposes = Object.freeze([
  { id: "tattoo_deposit", label: "Tattoo project deposit" },
  { id: "tattoo_session", label: "Tattoo session" },
  { id: "consult", label: "In-person consultation" },
  { id: "design", label: "Tattoo design fee" },
  { id: "supplies", label: "Tattoo supplies / touch-up" },
]);

export function cadToCents(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [dollars, fractional = ""] = value.trim().split(".");
  const cents = Number(dollars) * 100 + Number(fractional.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function prepareSquareInvoiceDraft({ client, amountDollars, purpose, notes = "" }) {
  if (!client || typeof client.clientName !== "string" || !client.clientName.trim()) {
    return { ok: false, error: "Select a client with a name first." };
  }
  if (typeof client.clientEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.clientEmail.trim())) {
    return { ok: false, error: "The client needs a valid email for a Square invoice." };
  }
  const cents = cadToCents(amountDollars);
  if (cents === null) return { ok: false, error: "Enter a CAD amount greater than $0, with up to two decimals." };
  const kind = invoicePurposes.find((item) => item.id === purpose);
  if (!kind) return { ok: false, error: "Choose a supported one-time payment purpose." };
  if (typeof notes !== "string" || notes.length > 500) return { ok: false, error: "Keep invoice notes within 500 characters." };
  const formatted = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
  return {
    ok: true, cents,
    text: [
      "FAWCETT TATTOOS & ART STUDIO — SQUARE INVOICE DRAFT",
      "Client: " + client.clientName.trim(),
      "Client email: " + client.clientEmail.trim(),
      "Item: " + kind.label,
      "Amount: " + formatted + " CAD",
      notes.trim() ? "Invoice description: " + notes.trim() : "",
      "Create and review a one-time invoice in Square Dashboard. Confirm any applicable GST, fees and approved terms before sending.",
      "This draft is NOT an invoice, payment confirmation, subscription or Studio Credit.",
    ].filter(Boolean).join("\n"),
  };
}
