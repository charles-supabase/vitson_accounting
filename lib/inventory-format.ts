export function fmtQty(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return (Math.round(n * 10000) / 10000).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Subtract with float noise removed (e.g. 0.3 - 0.1 shows 0.2, not 0.19999999999999998). */
export function diff(a: number, b: number): number {
  return Math.round((a - b) * 1e6) / 1e6;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Reads a "YYYY-MM" search param, falling back to the current month. */
export function parseYm(raw: string | string[] | undefined): { ym: string; year: number; month: number } {
  const v = typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : currentYm();
  return { ym: v, year: Number(v.slice(0, 4)), month: Number(v.slice(5, 7)) };
}

/** Groups rows into an ordered Map, preserving the order rows arrive in. */
export function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}
