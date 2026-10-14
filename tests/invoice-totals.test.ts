import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceTotals, lineAmount } from "../lib/invoice-totals";

test("gross, VAT and service income", () => {
  const t = invoiceTotals([{ weight: 323.3, unitPrice: 138 }]);
  assert.equal(t.gross, 44615.4);
  assert.equal(t.vat, 4780.22);
  assert.equal(t.serviceIncome, 39835.18);
  assert.equal(Math.round((t.vat + t.serviceIncome) * 100) / 100, t.gross);
});

test("several receipts with different prices", () => {
  const t = invoiceTotals([
    { weight: 187.8, unitPrice: 93 },
    { weight: 184.05, unitPrice: 58 },
    { weight: 284.55, unitPrice: 58 },
  ]);
  assert.equal(t.gross, Math.round((187.8 * 93 + 184.05 * 58 + 284.55 * 58) * 100) / 100);
  assert.equal(Math.round((t.vat + t.serviceIncome) * 100) / 100, t.gross);
});

test("empty list and line amount", () => {
  assert.deepEqual(invoiceTotals([]), { gross: 0, vat: 0, serviceIncome: 0 });
  assert.equal(lineAmount(323.3, 138), 44615.4);
});
