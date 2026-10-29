import test from "node:test";
import assert from "node:assert/strict";
import { formatJobTicketInput as f, displayJobTicket as d, isCompleteJobTicket as ok } from "../lib/job-ticket";

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
test("pasted text without dashes, extra characters", () => {
  assert.equal(f("c2006071bj2"), "C2-00607-1-BJ-2");
  assert.equal(f("C2-00607-1-BJ-2999"), "C2-00607-1-BJ-2");
});
test("a wrong kind of character is ignored", () => {
  assert.equal(f("2"), ""); // the first character is a letter
  assert.equal(f("CC"), "C");
  assert.equal(f("C2-00607-1-1"), "C2-00607-1-");
});
test("deleting removes the dash with the character", () => {
  assert.equal(f("C2-", { deleting: true }), "C2");
  assert.equal(f("C2-00607-", { deleting: true }), "C2-00607");
});
test("display", () => {
  assert.equal(d("c2006071bj2"), "C2-00607-1-BJ-2");
  assert.equal(d("C2-00607-1-bj-2"), "C2-00607-1-BJ-2");
  assert.equal(d("C200607BJ2"), "C200607BJ2"); // older layout: shown as stored
  assert.equal(d("76876867BJ1"), "76876867BJ1");
  assert.equal(d(""), "");
  assert.equal(d(null), "");
  assert.equal(ok("C2-00607-1-BJ-2"), true);
  assert.equal(ok("C2-00607-1-BJ"), false);
});
