/** Price check for the Customer Statements screen (pure functions, unit tested). */

export type PriceRow = { id: number; groupKey: string; price: number };

/** Deliveries share a price when they have the same tone, fabric and dye process (the customer is already chosen). */
export function groupKeyOf(toneId: number | null, fabricId: number | null, dyeId: number | null): string {
  return `${toneId ?? 0}|${fabricId ?? 0}|${dyeId ?? 0}`;
}

const cents = (n: number) => Math.round(n * 100);

export function isValidPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0;
}

/**
 * ids of the rows to show in red bold: in each group the first row (in the order given) is the reference
 * and every later row whose price differs from it is flagged. A missing or zero price is always flagged.
 */
export function priceMismatches(rows: PriceRow[]): Set<number> {
  const reference = new Map<string, number>();
  const flagged = new Set<number>();
  for (const r of rows) {
    if (!isValidPrice(r.price)) {
      flagged.add(r.id);
      continue;
    }
    const ref = reference.get(r.groupKey);
    if (ref === undefined) reference.set(r.groupKey, cents(r.price));
    else if (cents(r.price) !== ref) flagged.add(r.id);
  }
  return flagged;
}

/** Printing is allowed only when there is something to print and every price in every group is the same. */
export function pricesAllConsistent(rows: PriceRow[]): boolean {
  return rows.length > 0 && priceMismatches(rows).size === 0;
}
