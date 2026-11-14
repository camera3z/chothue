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

assert.equal(
  q("2026-11-14", "2026-11-14", "tháng", 300000, 1, 3).total,
  900000,
);
assert.equal(
  q("2026-11-14", "2026-12-14", "tháng", 300000, 1, 3).total,
  900000,
);
assert.equal(q("2026-11-14", "2026-11-14", "năm", 300000, 1, 2).total, 600000);
assert.equal(
  q("2026-11-14", "2026-11-14", "tháng", 300000, 1, 1.5).total,
  450000,
);
for (const count of [0, -1, NaN, 10001, 1.001])
  assert.throws(() => q("2026-11-14", "2026-11-14", "tháng", 300000, 1, count));

const { listingUnitPrice } = await import("../src/rental-pricing.js");
assert.equal(
  listingUnitPrice({ unit: "ngày", price: 100000 }, "tháng"),
  3000000,
);
assert.equal(listingUnitPrice({ unit: "tháng", price: 300000 }, "ngày"), 10000);
assert.equal(
  listingUnitPrice({ unit: "tháng", price: 300000 }, "năm"),
  3650000,
);
assert.equal(listingUnitPrice({ unit: "năm", price: 365000 }, "ngày"), 1000);
assert.throws(() => listingUnitPrice({ unit: "lượt", price: 100000 }, "tháng"));
