/** Invoice amounts (pure functions, unit tested). */

const r2 = (n: number) => Math.round(n * 100) / 100;

export type InvoiceLine = { weight: number; unitPrice: number };

/** One delivery receipt: total weight x unit price, to 2 decimals (display only; the invoice sums the unrounded products). */
export function lineAmount(weight: number, unitPrice: number): number {
  return r2(weight * unitPrice);
}

/** The discount for a customer's discount rate, which is stored as a percentage (5 = 5%): gross x rate / 100. */
export function discountFromRate(gross: number, ratePercent: number): number {
  if (!Number.isFinite(gross) || !Number.isFinite(ratePercent)) return 0;
  return r2((gross * ratePercent) / 100);
}

/** The percentage that a discount amount is of the gross amount (2 decimals). */
export function rateFromDiscount(gross: number, discount: number): number {
  if (!(gross > 0) || !Number.isFinite(discount)) return 0;
  return r2((discount / gross) * 100);
}

/**
 * From the gross amount (invoice_amount), the discount and the deduction:
 * VAT (uncollected) = ((Gross - (Discount + Deduction)) x 0.12) / 1.12;
 * Service Income = Gross - (Discount + Deduction + VAT);
 * Net sales (what the customer pays) = Gross - (Discount + Deduction).
 */
export function adjustTotals(
  grossAmount: number,
  discount = 0,
  deduction = 0,
): { gross: number; discount: number; deduction: number; vat: number; serviceIncome: number; netSales: number } {
  const gross = r2(Number.isFinite(grossAmount) ? grossAmount : 0);
  const d = r2(Number.isFinite(discount) ? discount : 0);
  const e = r2(Number.isFinite(deduction) ? deduction : 0);
  const vat = r2(((gross - (d + e)) * 0.12) / 1.12);
  return { gross, discount: d, deduction: e, vat, serviceIncome: r2(gross - (d + e + vat)), netSales: r2(gross - (d + e)) };
}

/** Gross Amount = sum(total weight x unit price), then the amounts of adjustTotals. */
export function invoiceTotals(
  lines: InvoiceLine[],
  discount = 0,
  deduction = 0,
): { gross: number; discount: number; deduction: number; vat: number; serviceIncome: number; netSales: number } {
  return adjustTotals(
    lines.reduce((s, l) => s + l.weight * l.unitPrice, 0),
    discount,
    deduction,
  );
}
