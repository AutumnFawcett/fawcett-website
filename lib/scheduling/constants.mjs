export const ARTISTS = ["ben", "autumn"];
export const TYPES = ["consultation", "tattoo_session", "touch_up", "tapout", "buyout", "studio_event", "availability_block"];
export const STATUSES = ["tentative", "booked", "confirmed", "cancelled", "completed", "no_show"];

export function confirmedStudioHours() {
  return Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, d === 6 ? [] : [{ start: "11:00", end: "20:00" }]]));
}
