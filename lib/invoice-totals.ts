/** Invoice amounts (pure functions, unit tested). */

const r2 = (n: number) => Math.round(n * 100) / 100;

export type InvoiceLine = { weight: number; unitPrice: number };

/** One delivery receipt: total weight x unit price, to 2 decimals (display only; the invoice sums the unrounded products). */
export function lineAmount(weight: number, unitPrice: number): number {
  return r2(weight * unitPrice);
}

/**
 * Gross Amount = sum(total weight x unit price);
 * VAT (uncollected) = Gross x 0.12 / 1.12;
 * Service Income = Gross - VAT.
 */
export function invoiceTotals(lines: InvoiceLine[]): { gross: number; vat: number; serviceIncome: number } {
  const gross = r2(lines.reduce((s, l) => s + l.weight * l.unitPrice, 0));
  const vat = r2((gross * 0.12) / 1.12);
  return { gross, vat, serviceIncome: r2(gross - vat) };
}
