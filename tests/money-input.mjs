import assert from "node:assert/strict";
import {
  parseMoneyInput as p,
  formatMoneyInput as f,
} from "../src/money-input.js";
assert.equal(f("300000"), "300.000");
assert.equal(p("1.234.567 ₫"), "1234567");
assert.equal(p("300,000"), "300000");
assert.equal(p("300 000"), "300000");
assert.equal(f("0"), "0");
assert.equal(p(""), "");
for (const bad of [
  "-100",
  "1e6",
  "100.50",
  "300,000.00",
  "hello",
  "999999999999999999",
])
  assert.throws(() => p(bad));
console.log(
  "PASS: VND grouping/parsing, zero/empty, rejected negative/scientific/decimal/mixed/unsafe amounts",
);
