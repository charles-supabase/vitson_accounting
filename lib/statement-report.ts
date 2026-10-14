import type { StatementDelivery } from "../actions/customer-statements";

/** Groups and totals of the two printed customer statements (pure functions, unit tested). */

export type ReportTotals = {
  wt: number;
  rolls: number;
  bodyWt: number;
  bodyCount: number;
  x1Wt: number;
  x1Count: number;
  ccWt: number;
  ccCount: number;
};

export type ReportGroup = {
  key: string;
  fabricName: string;
  dyeName: string;
  toneName: string;
  unitPrice: number;
  rows: StatementDelivery[];
  totals: ReportTotals;
  /** sum of the delivered weight x unit price */
  amount: number;
};

export type StatementReportData = { groups: ReportGroup[]; grand: ReportTotals & { amount: number } };

const r2 = (n: number) => Math.round(n * 100) / 100;
const emptyTotals = (): ReportTotals => ({ wt: 0, rolls: 0, bodyWt: 0, bodyCount: 0, x1Wt: 0, x1Count: 0, ccWt: 0, ccCount: 0 });

function add(t: ReportTotals, d: StatementDelivery) {
  t.wt += d.totalWt;
  t.rolls += d.totalRolls;
  t.bodyWt += d.bodyWt;
  t.bodyCount += d.bodyCount;
  t.x1Wt += d.x1Wt;
  t.x1Count += d.x1Count;
  t.ccWt += d.ccWt;
  t.ccCount += d.ccCount;
}

function rounded(t: ReportTotals): ReportTotals {
  return { ...t, wt: r2(t.wt), bodyWt: r2(t.bodyWt), x1Wt: r2(t.x1Wt), ccWt: r2(t.ccWt) };
}

/** Groups by fabric, dye process, tone and unit price; rows by date then delivery receipt; the amount of a group is its weight x unit price. */
export function buildStatementReport(deliveries: StatementDelivery[]): StatementReportData {
  const map = new Map<string, ReportGroup>();
  for (const d of deliveries) {
    const key = `${d.fabricId ?? 0}|${d.dyeId ?? 0}|${d.toneId ?? 0}|${Math.round(d.unitPrice * 100)}`;
    let g = map.get(key);
    if (!g) {
      g = { key, fabricName: d.fabricName, dyeName: d.dyeName, toneName: d.toneName, unitPrice: d.unitPrice, rows: [], totals: emptyTotals(), amount: 0 };
      map.set(key, g);
    }
    g.rows.push(d);
    add(g.totals, d);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.rows.sort((a, b) => a.dateDelivery.localeCompare(b.dateDelivery) || a.deliveryReceipt - b.deliveryReceipt || a.id - b.id);
    g.totals = rounded(g.totals);
    g.amount = r2(g.totals.wt * g.unitPrice);
  }
  groups.sort(
    (a, b) =>
      a.fabricName.localeCompare(b.fabricName) || a.dyeName.localeCompare(b.dyeName) || a.toneName.localeCompare(b.toneName) || a.unitPrice - b.unitPrice,
  );

  const grand = emptyTotals();
  let amount = 0;
  for (const g of groups) {
    grand.wt += g.totals.wt;
    grand.rolls += g.totals.rolls;
    grand.bodyWt += g.totals.bodyWt;
    grand.bodyCount += g.totals.bodyCount;
    grand.x1Wt += g.totals.x1Wt;
    grand.x1Count += g.totals.x1Count;
    grand.ccWt += g.totals.ccWt;
    grand.ccCount += g.totals.ccCount;
    amount += g.amount;
  }
  return { groups, grand: { ...rounded(grand), amount: r2(amount) } };
}
