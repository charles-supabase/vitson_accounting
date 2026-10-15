import { test } from "node:test";
import assert from "node:assert/strict";
import { discountFromRate, invoiceTotals, lineAmount, rateFromDiscount } from "../lib/invoice-totals";

test("gross, VAT and service income without a discount (matches the printed invoice)", () => {
  const t = invoiceTotals([
    { weight: 507.1, unitPrice: 175 },
    { weight: 182.4, unitPrice: 90 },
    { weight: 157.9, unitPrice: 90 },
  ]);
  assert.equal(t.gross, 119369.5);
  assert.equal(t.discount, 0);
  assert.equal(t.deduction, 0);
  assert.equal(t.vat, 12789.59);
  assert.equal(t.serviceIncome, 106579.91);
  assert.equal(t.netSales, 119369.5);
});

test("VAT is worked out on gross minus discount; service income is gross minus VAT; net sales also takes the deduction", () => {
  const t = invoiceTotals([{ weight: 323.3, unitPrice: 138 }], 1000, 500);
  assert.equal(t.gross, 44615.4);
  assert.equal(t.discount, 1000);
  assert.equal(t.deduction, 500);
  assert.equal(t.vat, Math.round(((44615.4 - 1000) * 0.12 / 1.12) * 100) / 100);
  assert.equal(t.serviceIncome, Math.round((44615.4 - t.vat) * 100) / 100);
  assert.equal(t.netSales, 43115.4);
});

test("discount rate is a percentage: divide by 100", () => {
  assert.equal(discountFromRate(10000, 5), 500);
  assert.equal(discountFromRate(44615.4, 2), 892.31);
  assert.equal(discountFromRate(10000, 0), 0);
  assert.equal(rateFromDiscount(10000, 500), 5);
  assert.equal(rateFromDiscount(0, 500), 0);
  assert.equal(discountFromRate(NaN, 5), 0);
});

test("empty list, bad numbers, line amount", () => {
  assert.deepEqual(invoiceTotals([]), { gross: 0, discount: 0, deduction: 0, vat: 0, serviceIncome: 0, netSales: 0 });
  assert.equal(invoiceTotals([{ weight: 1, unitPrice: 100 }], NaN, NaN).netSales, 100);
  assert.equal(lineAmount(323.3, 138), 44615.4);
});
