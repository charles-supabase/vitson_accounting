import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatementReport } from "../lib/statement-report";

let n = 0;
const row = (o: Partial<any>) => {
  n++;
  const base = {
    id: n, jobOrderId: n, deliveryReceipt: 100 + n, dateDelivery: "2026-09-01", receivableTypeId: 1, invoiceId: 0, jobTicket: `T${n}`, cusJoNo: "", color: "",
    toneId: 1, toneName: "DK", fabricId: 1, fabricName: "TC", dyeId: 1, dyeName: "Bleach", unitPrice: 57.5,
    bodyWt: 0, bodyCount: 0, x1Wt: 0, x1Count: 0, ccWt: 0, ccCount: 0, totalWt: 0, totalRolls: 0,
  };
  const r = { ...base, ...o };
  r.totalWt = Math.round((r.bodyWt + r.x1Wt + r.ccWt) * 100) / 100;
  r.totalRolls = r.bodyCount + r.x1Count + r.ccCount;
  return r as any;
};

test("group totals, amount = weight x unit price, grand totals", () => {
  const rep = buildStatementReport([
    row({ bodyWt: 389.85, bodyCount: 15, x1Wt: 20.35, x1Count: 1 }),
    row({ bodyWt: 275.75, bodyCount: 11, x1Wt: 11.6, x1Count: 1 }),
    row({ toneId: 2, toneName: "LT", unitPrice: 69.5, bodyWt: 381.55, bodyCount: 15, x1Wt: 20.85, x1Count: 1 }),
  ]);
  assert.equal(rep.groups.length, 2);
  const dk = rep.groups.find((g) => g.toneName === "DK")!;
  assert.equal(dk.totals.bodyWt, 665.6);
  assert.equal(dk.totals.x1Wt, 31.95);
  assert.equal(dk.totals.wt, 697.55);
  assert.equal(dk.totals.bodyCount, 26);
  assert.equal(dk.totals.rolls, 28);
  assert.equal(dk.amount, Math.round(697.55 * 57.5 * 100) / 100);
  const lt = rep.groups.find((g) => g.toneName === "LT")!;
  assert.equal(lt.amount, Math.round(402.4 * 69.5 * 100) / 100);
  assert.equal(rep.grand.wt, Math.round((697.55 + 402.4) * 100) / 100);
  assert.equal(rep.grand.amount, Math.round((dk.amount + lt.amount) * 100) / 100);
  assert.equal(rep.grand.rolls, 28 + 16);
});

test("rows are ordered by date then delivery receipt; groups by fabric, dye, tone", () => {
  const rep = buildStatementReport([
    row({ dateDelivery: "2026-09-05", deliveryReceipt: 5, bodyWt: 1, bodyCount: 1 }),
    row({ dateDelivery: "2026-09-01", deliveryReceipt: 9, bodyWt: 1, bodyCount: 1 }),
    row({ dateDelivery: "2026-09-01", deliveryReceipt: 3, bodyWt: 1, bodyCount: 1 }),
    row({ fabricId: 2, fabricName: "CVC", bodyWt: 1, bodyCount: 1 }),
  ]);
  assert.deepEqual(rep.groups.map((g) => g.fabricName), ["CVC", "TC"]);
  assert.deepEqual(rep.groups[1].rows.map((r) => r.deliveryReceipt), [3, 9, 5]);
});

test("a different price makes a separate group, and an empty list gives zero totals", () => {
  const rep = buildStatementReport([row({ unitPrice: 57.5, bodyWt: 10, bodyCount: 1 }), row({ unitPrice: 60, bodyWt: 10, bodyCount: 1 })]);
  assert.equal(rep.groups.length, 2);
  assert.equal(rep.grand.amount, 1175);
  const empty = buildStatementReport([]);
  assert.equal(empty.groups.length, 0);
  assert.equal(empty.grand.amount, 0);
});
