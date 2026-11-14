import assert from "node:assert/strict";
import { rentalQuote as q } from "../src/rental-pricing.js";
assert.deepEqual(q("2026-11-14", "2026-11-22", "ngày", 250000, 1), {
  periods: 9,
  total: 2250000,
});
assert.equal(q("2026-11-14", "2026-11-14", "ngày", 250000, 2).total, 500000);
assert.equal(
  q("2026-01-01", "2026-01-31", "tháng", 1000000, 1).periods,
  31 / 30,
);
assert.equal(
  q("2026-01-01", "2026-02-01", "tháng", 1000000, 1).periods,
  32 / 30,
);
assert.equal(
  q("2026-01-31", "2026-02-27", "tháng", 1000000, 1).periods,
  28 / 30,
);
assert.equal(q("2024-02-29", "2025-02-27", "năm", 1000000, 1).periods, 1);
assert.equal(
  q("2024-02-29", "2025-02-28", "năm", 1000000, 1).periods,
  366 / 365,
);
assert.throws(() => q("2026-11-22", "2026-11-14", "ngày", 1, 1));
assert.throws(() => q("2026-02-30", "2026-03-01", "ngày", 1, 1));
assert.throws(() => q("2026-11-14", "2026-11-22", "ngày", -1, 1));
assert.throws(() => q("2026-11-14", "2026-11-22", "ngày", 1, 1.5));
console.log(
  "PASS: day/month/year quotes, inclusive dates, month-end/leap-year boundaries, invalid input",
);

assert.equal(q("2026-11-14", "2026-12-13", "tháng", 300000, 1).total, 300000);
assert.equal(q("2026-11-14", "2026-12-14", "tháng", 300000, 1).total, 310000);
assert.equal(q("2026-01-01", "2026-12-31", "năm", 365000, 1).total, 365000);
assert.equal(q("2024-01-01", "2024-12-31", "năm", 365000, 1).total, 366000);
