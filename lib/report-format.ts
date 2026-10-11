// Small helpers shared by the printed reports (Bank summary, Voucher reports, Accounts Receivable).

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-10" -> { year: 2026, month: 10, start: "2026-10-01", end: "2026-11-01" } (end is exclusive). */
export function parseYm(ym: string | undefined | null) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    year,
    month,
    ym: `${year}-${pad(month)}`,
    start: `${year}-${pad(month)}-01`,
    end: `${nextYear}-${pad(nextMonth)}-01`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    lastDay: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

/** 1,234.50. Always two decimals. */
export function money(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Like money() but blank for an empty cell. */
export function moneyOrBlank(n: number | null | undefined): string {
  return n == null ? "" : money(n);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Voucher numbers look like "104-A": sort by the number first, then by the suffix. */
export function compareVoucherNo(a: string, b: string): number {
  const pa = /^(\d+)-?(.*)$/.exec(a);
  const pb = /^(\d+)-?(.*)$/.exec(b);
  if (pa && pb) {
    const d = Number(pa[1]) - Number(pb[1]);
    if (d !== 0) return d;
    return pa[2].localeCompare(pb[2]);
  }
  return a.localeCompare(b);
}

/** "2026-10" is one month, "2026" is the whole year. Balances run up to the end of the period. */
export function parsePeriod(period: string | undefined | null) {
  const month = parseYm(period);
  if (month) return { ...month, whole: false as const, asOf: `${month.ym}-${String(month.lastDay).padStart(2, "0")}` };
  const m = /^(\d{4})$/.exec(period ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 2000 || year > 2100) return null;
  return {
    year,
    month: null as number | null,
    ym: String(year),
    start: `${year}-01-01`,
    end: `${year + 1}-01-01`,
    label: `Year ${year}`,
    lastDay: 31,
    whole: true as const,
    asOf: `${year}-12-31`,
  };
}
