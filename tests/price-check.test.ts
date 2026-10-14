import { test } from "node:test";
import assert from "node:assert/strict";
import { groupKeyOf, priceMismatches, pricesAllConsistent } from "../lib/price-check";

const k1 = groupKeyOf(1, 2, 3);
const k2 = groupKeyOf(1, 2, 4);

test("the first price of a group is the reference; later different prices are flagged", () => {
  const rows = [
    { id: 1, groupKey: k1, price: 138 },
    { id: 2, groupKey: k1, price: 138 },
    { id: 3, groupKey: k1, price: 140 },
    { id: 4, groupKey: k1, price: 138 },
  ];
  assert.deepEqual([...priceMismatches(rows)], [3]);
  assert.equal(pricesAllConsistent(rows), false);
});

test("groups are independent and a lone row is fine", () => {
  const rows = [
    { id: 1, groupKey: k1, price: 138 },
    { id: 2, groupKey: k2, price: 93 },
    { id: 3, groupKey: k2, price: 93 },
  ];
  assert.equal(priceMismatches(rows).size, 0);
  assert.equal(pricesAllConsistent(rows), true);
});

test("the order decides which price is the reference", () => {
  const rows = [
    { id: 1, groupKey: k1, price: 140 },
    { id: 2, groupKey: k1, price: 138 },
  ];
  assert.deepEqual([...priceMismatches(rows)], [2]);
});

test("cent rounding, empty list and invalid prices", () => {
  assert.equal(priceMismatches([{ id: 1, groupKey: k1, price: 57.5 }, { id: 2, groupKey: k1, price: 57.5000001 }]).size, 0);
  assert.equal(priceMismatches([{ id: 1, groupKey: k1, price: 57.5 }, { id: 2, groupKey: k1, price: 57.51 }]).size, 1);
  assert.equal(pricesAllConsistent([]), false);
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.deepEqual([...priceMismatches([{ id: 9, groupKey: k1, price: bad }])], [9], String(bad));
  }
});

test("missing ids in a group key become 0 and group together", () => {
  assert.equal(groupKeyOf(null, null, null), "0|0|0");
  assert.equal(groupKeyOf(1, 2, 3), "1|2|3");
});
