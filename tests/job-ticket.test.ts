import test from "node:test";
import assert from "node:assert/strict";
import { formatJobTicketInput as f, displayJobTicket as d, isValidJobTicket as ok } from "../lib/job-ticket";

test("dashes appear while typing", () => {
  assert.equal(f("c"), "C");
  assert.equal(f("c2"), "C2-");
  assert.equal(f("C2-0"), "C2-0");
  assert.equal(f("C2-00607"), "C2-00607-");
  assert.equal(f("C2-00607-1"), "C2-00607-1-");
  assert.equal(f("C2-00607-1-b"), "C2-00607-1-B");
  assert.equal(f("C2-00607-1-bj"), "C2-00607-1-BJ-");
  assert.equal(f("C2-00607-1-BJ-2"), "C2-00607-1-BJ-2");
});
test("the first character and the AA part can be a letter or a digit", () => {
  assert.equal(f("76"), "76-");
  assert.equal(f("76876867bj1"), "76-87686-7-BJ-1");
  assert.equal(f("C2-00607-1-12-3"), "C2-00607-1-12-3");
  assert.equal(f("C2-00607-1-1b-3"), "C2-00607-1-1B-3");
});
test("pasted text without dashes, extra characters", () => {
  assert.equal(f("c2006071bj2"), "C2-00607-1-BJ-2");
  assert.equal(f("C2-00607-1-BJ-2999"), "C2-00607-1-BJ-2");
});
test("a letter where a digit is needed is ignored", () => {
  assert.equal(f("CC"), "C");
  assert.equal(f("C2-0a"), "C2-0");
  assert.equal(f("C2-00607-x"), "C2-00607-");
});
test("deleting removes the dash with the character", () => {
  assert.equal(f("C2-", { deleting: true }), "C2");
  assert.equal(f("C2-00607-", { deleting: true }), "C2-00607");
});
test("display: the optional parts may be missing", () => {
  assert.equal(d("c200607"), "C2-00607");
  assert.equal(d("C2-00607-1"), "C2-00607-1");
  assert.equal(d("C2-00607-1-bj"), "C2-00607-1-BJ");
  assert.equal(d("c2006071bj2"), "C2-00607-1-BJ-2");
  assert.equal(d("76876867BJ1"), "76-87686-7-BJ-1");
  assert.equal(d(""), "");
  assert.equal(d(null), "");
});
test("older tickets and short values are shown as stored", () => {
  assert.equal(d("C200607BJ2"), "C200607BJ2");
  assert.equal(d("11111"), "11111");
  assert.equal(d("C2-0060"), "C2-0060");
});
test("only A#-##### is required", () => {
  assert.equal(ok("C2-00607"), true);
  assert.equal(ok("C2-00607-1-BJ-2"), true);
  assert.equal(ok("76-87686"), true);
  assert.equal(ok("C2-0060"), false);
  assert.equal(ok("C2"), false);
  assert.equal(ok("C200607BJ2"), false);
  assert.equal(ok(""), false);
});
