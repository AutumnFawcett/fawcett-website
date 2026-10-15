export function wall(ms, timezone) {
  if (!Number.isFinite(ms)) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function shift(date, count) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }
export function range(date, view) {
  let start = date, count = view === "day" ? 1 : view === "month" ? 42 : 7;
  if (view === "month") start = `${date.slice(0, 7)}-01`;
  if (["week", "month"].includes(view)) start = shift(start, -((new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: count }, (_, i) => shift(start, i));
}
export function navigateDate(date, view, direction) {
  if (view === "month") { const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + direction); return d.toISOString().slice(0, 10); }
  return shift(date, direction * (view === "day" ? 1 : 7));
}
