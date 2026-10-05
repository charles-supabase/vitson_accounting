/** Format an ISO date string (YYYY-MM-DD) as MM-DD-YYYY for display. Passes through anything unparseable. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "\u2014";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const [, y, mo, d] = m;
  return `${mo}-${d}-${y}`;
}

/** Add N days to an ISO date string (YYYY-MM-DD), returning an ISO date string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
