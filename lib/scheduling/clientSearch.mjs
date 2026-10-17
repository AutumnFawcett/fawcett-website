// Display-only helpers for searching existing CRM client options.
// Selection always returns the original stable client key, never name/email.
export function filterScheduleClients(clients, term, limit = 12) {
  const list = Array.isArray(clients) ? clients : [];
  const query = typeof term === "string"
    ? term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    : "";
  if (!query) return [];
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 12;
  return list.filter(client => {
    const search = [client.clientName, client.clientEmail, client.phone]
      .filter(value => typeof value === "string")
      .join(" ")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return search.includes(query);
  }).slice(0, safeLimit);
}

export function formatBookingDuration(value) {
  if (value === "" || value === null || value === undefined) return "";
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 15) return "";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return minutes + " minutes";
  if (!remaining) return hours + (hours === 1 ? " hour" : " hours");
  return hours + (hours === 1 ? " hour " : " hours ") + remaining + " minutes";
}
