import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { formatPeriod, formatPeriodLabel, parsePeriodInput, parseSheetDate } from "../lib/receivables-import/dates";
import { describeKeyProblem, normalizePrivateKey } from "../lib/receivables-import/googleKey";
import {
  buildCustomerLookup,
  extractRecordsForMonth,
  locateColumns,
  normalizeCode,
  type CustomerLookup,
} from "../lib/receivables-import/validation";

// 46023 = 2026-01-01, 46054 = 2026-02-01 (Google Sheets serial numbers)
test("sheet serial dates convert without any timezone shift", () => {
  assert.deepEqual(parseSheetDate(46023), { year: 2026, month: 1, day: 1 });
  assert.deepEqual(parseSheetDate(46053), { year: 2026, month: 1, day: 31 });
  assert.deepEqual(parseSheetDate(46054), { year: 2026, month: 2, day: 1 });
  assert.deepEqual(parseSheetDate("2026-01-15"), { year: 2026, month: 1, day: 15 });
  assert.equal(parseSheetDate("2026-02-31"), null);
  assert.equal(parseSheetDate("abc"), null);
  assert.equal(parseSheetDate(null), null);
});

test("period is the TEXT month YYYY-MM (January 2026 -> 2026-01)", () => {
  assert.equal(formatPeriod(2026, 1), "2026-01");
  assert.equal(formatPeriodLabel(2026, 1), "January 2026");
  assert.deepEqual(parsePeriodInput(1, 2026), { month: 1, year: 2026 });
  assert.deepEqual(parsePeriodInput("12", "2026"), { month: 12, year: 2026 });
  assert.throws(() => parsePeriodInput(13, 2026), { code: "INVALID_PERIOD" });
  assert.throws(() => parsePeriodInput(1, "x"), { code: "INVALID_PERIOD" });
});

// customer_no -> tbl_Customer.id  (the sheet's customer_code is the customer_no)
const customers: CustomerLookup = buildCustomerLookup([
  { id: 1, customer_no: "38" },
  { id: 2, customer_no: "99" },
  { id: 3, customer_no: "A-7" },
  { id: 4, customer_no: null },
]);

const sheet: unknown[][] = [
  ["Sales Statement"],
  ["", "", "date", "customer_code", "amount", "type"],
  ["", "", 46023, 38, 100.5, " big "],
  ["", "", 46023, 38, 100.5, "BIG"], // exact duplicate must be kept
  ["", "", 46023, "99", "$1,200.00", "Small"],
  ["", "", 46054, "zzz", "x", "huge"], // February: ignored for a January import
  ["", "", 46023, " a-7 ", 5, "small"], // text customer_no, trimmed, case-insensitive
  [],
];

test("locates columns by header name", () => {
  const layout = locateColumns(sheet);
  assert.equal(layout.headerRowIndex, 1);
  assert.deepEqual(layout.columns, { date: 2, customerCode: 3, amount: 4, type: 5 });
});

test("extracts January rows, looks up customer ids, maps types, keeps duplicates", () => {
  const layout = locateColumns(sheet);
  const recs = extractRecordsForMonth(sheet, layout, { year: 2026, month: 1 }, customers);
  assert.equal(recs.length, 4);
  assert.deepEqual(recs.map((r) => r.receivable_id), [1, 1, 2, 2]);
  assert.deepEqual(recs.map((r) => r.customer_id), [1, 1, 2, 3]); // customer_no 38 -> id 1, 99 -> 2, A-7 -> 3
  assert.equal(recs[2].sales_amount, 1200);
  assert.deepEqual(recs.map((r) => r.sheetRow), [3, 4, 5, 7]);
});

test("reports every bad row with its real sheet row number", () => {
  const bad: unknown[][] = [
    ["date", "customer_code", "amount", "type"],
    [46023, 38, 5, "BIG"], // row 2 ok
    [46023, "12.5", 5, "BIG"], // row 3 unknown customer
    [46023, 99, "zz", "MEDIUM"], // row 4 bad amount + bad type
    [null, 38, 5, "BIG"], // row 5 blank date
    [46023, "", 5, "SMALL"], // row 6 blank customer
  ];
  const layout = locateColumns(bad);
  try {
    extractRecordsForMonth(bad, layout, { year: 2026, month: 1 }, customers);
    assert.fail("should throw");
  } catch (e: any) {
    assert.equal(e.code, "VALIDATION_FAILED");
    assert.deepEqual(e.details.rowErrors.map((r: any) => r.row), [3, 4, 5, 6]);
    assert.equal(e.details.rowErrors[1].problems.length, 2);
    assert.match(e.details.rowErrors[0].problems[0], /does not match any customer_no/);
  }
});

test("leading zeros are dropped before comparing customer codes (both sides)", () => {
  const lookup = buildCustomerLookup([
    { id: 1, customer_no: "38" },
    { id: 2, customer_no: "0099" }, // stored with zeros: still matches 99
    { id: 3, customer_no: "0" },
  ]);
  const rows: unknown[][] = [
    ["date", "customer_code", "amount", "type"],
    [46023, "038", 1, "BIG"],
    [46023, "0038", 2, "BIG"],
    [46023, 38, 3, "SMALL"],
    [46023, "99", 4, "BIG"],
    [46023, "000", 5, "BIG"], // all zeros -> "0"
  ];
  const recs = extractRecordsForMonth(rows, locateColumns(rows), { year: 2026, month: 1 }, lookup);
  assert.deepEqual(recs.map((r) => r.customer_id), [1, 1, 1, 2, 3]);
  assert.equal(normalizeCode("A-07"), "a-07");
  assert.equal(normalizeCode(" 007 "), "7");
});

test("a customer_no that belongs to two customers is rejected as ambiguous", () => {
  const dup = buildCustomerLookup([
    { id: 1, customer_no: "38" },
    { id: 2, customer_no: "38" },
  ]);
  const rows: unknown[][] = [["date", "customer_code", "amount", "type"], [46023, 38, 5, "BIG"]];
  assert.throws(() => extractRecordsForMonth(rows, locateColumns(rows), { year: 2026, month: 1 }, dup), {
    code: "VALIDATION_FAILED",
  });
});

test("an invalid type value fails the whole import (no records returned)", () => {
  const rows: unknown[][] = [
    ["date", "customer_code", "amount", "type"],
    [46023, 38, 5, "BIG"],
    [46023, 99, 5, "BIGG"],
  ];
  assert.throws(() => extractRecordsForMonth(rows, locateColumns(rows), { year: 2026, month: 1 }, customers), {
    code: "VALIDATION_FAILED",
  });
});

test("missing or duplicate headers are rejected", () => {
  assert.throws(() => locateColumns([["date", "amount"]]), { code: "COLUMNS_NOT_FOUND" });
  assert.throws(() => locateColumns([["date", "customer_code", "amount", "type", "Type"]]), { code: "AMBIGUOUS_COLUMNS" });
});

test("empty month returns zero records", () => {
  const layout = locateColumns(sheet);
  assert.equal(extractRecordsForMonth(sheet, layout, { year: 2030, month: 5 }, customers).length, 0);
});

test("private key normalisation handles quotes, \\n sequences and CRLF", () => {
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const escaped = `"${pem.trim().replace(/\n/g, "\\n")}"`;
  assert.equal(describeKeyProblem(normalizePrivateKey(escaped)), null);
  assert.equal(describeKeyProblem(normalizePrivateKey(pem.replace(/\n/g, "\r\n"))), null);
  assert.match(describeKeyProblem(normalizePrivateKey("")) ?? "", /empty/);
  assert.match(describeKeyProblem(normalizePrivateKey("abc")) ?? "", /BEGIN PRIVATE KEY/);
  const broken = pem.replace(/\n.*\n/, "\nAAAA\n");
  assert.ok(describeKeyProblem(normalizePrivateKey(broken)));
});
