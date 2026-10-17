import { consultationBudget } from "./paymentPlans.mjs";

function formatValue(value) {
  if (!value) return "Not provided";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildConsultSummary(form, planId = "") {
  return `
New tattoo consult request

Client:
Name: ${form.fullName}
Email: ${form.email}
Phone: ${form.phone}
Instagram: ${form.instagram || "Not provided"}
Preferred contact: ${formatValue(form.preferredContactMethod)}

Artist:
Preferred artist: ${formatValue(form.preferredArtist)}

Tattoo Request:
Project type: ${formatValue(form.projectType)}
Placement: ${form.placement}
Body side: ${formatValue(form.bodySide)}
Approximate size: ${form.approximateSize}
Colour preference: ${formatValue(form.colourPreference)}
Style direction: ${form.styleDirection || "Not provided"}
Budget range: ${consultationBudget(form.budgetRange || "", planId) || "Not provided"}

Idea:
${form.tattooIdea}

Cover-up:
Is cover-up: ${formatValue(form.isCoverUp)}
Cover-up details: ${form.coverUpDescription || "Not provided"}

Timeline:
Timeline: ${formatValue(form.timeline)}
Urgent: ${formatValue(form.isUrgent)}
Availability: ${form.availability || "Not provided"}

Health / Notes:
${form.healthNotes || "Not provided"}

Reference links:
${form.referenceLinks || "Not provided"}
`.trim();
}

