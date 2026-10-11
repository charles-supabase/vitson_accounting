import test from "node:test";
import assert from "node:assert/strict";
import { aliasLinksCustomer, customerNoToNumber, formatCustomerNos, parseCustomerNos } from "../lib/alias-customers";

test("parses comma separated customer ids", () => {
  assert.deepEqual(parseCustomerNos("3,17,42"), [3, 17, 42]);
  assert.deepEqual(parseCustomerNos(" 3 , 17,,x,4a,42 ,3"), [3, 17, 42]);
  assert.deepEqual(parseCustomerNos(""), []);
  assert.deepEqual(parseCustomerNos(null), []);
});

test("writes unique ascending ids without spaces", () => {
  assert.equal(formatCustomerNos([42, 3, 17, 3]), "3,17,42");
  assert.equal(formatCustomerNos([5]), "5");
  assert.equal(formatCustomerNos([]), "");
});

test("a customer id is matched as a whole number, never as part of another", () => {
  assert.equal(aliasLinksCustomer("11,21,31", 1), false);
  assert.equal(aliasLinksCustomer("11,21,31", 21), true);
  assert.equal(aliasLinksCustomer("1", 1), true);
  assert.equal(aliasLinksCustomer("", 1), false);
});

test("customer_no becomes a number without leading zeros", () => {
  assert.equal(customerNoToNumber("008"), 8);
  assert.equal(customerNoToNumber(" 73 "), 73);
  assert.equal(customerNoToNumber("A-7"), null);
  assert.equal(customerNoToNumber(null), null);
});
