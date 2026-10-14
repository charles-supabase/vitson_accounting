import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTin, tinDigits } from "../lib/tin-format";

test("TIN is shown with a dash every 3 digits", () => {
  assert.equal(formatTin("123456789000"), "123-456-789-000");
  assert.equal(formatTin(123456789), "123-456-789");
  assert.equal(formatTin("1234"), "123-4");
  assert.equal(formatTin("12"), "12");
  assert.equal(formatTin(""), "");
  assert.equal(formatTin(null), "");
  assert.equal(formatTin(undefined), "");
});

test("typing a formatted value gives back digits only, max 15", () => {
  assert.equal(tinDigits("123-456-789-0"), "1234567890");
  assert.equal(tinDigits("12 34abc5"), "12345");
  assert.equal(tinDigits("1234567890123456789"), "123456789012345");
  assert.equal(formatTin("123-456-789-0"), "123-456-789-0");
});
