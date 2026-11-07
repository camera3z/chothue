import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
  headless: true,
});
const p = await b.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(process.env.TEST_URL || "http://127.0.0.1:5174");
await p.getByRole("heading", { name: "Hôm nay", exact: true }).waitFor();
await p.locator(".page-title [data-add=contract]").click();
await p.locator("[name=quantity]").fill("2");
await p.locator("[name=paid]").fill("100000");
await p.locator("[name=deposit]").fill("500000");
await p.locator("[name=handoverNote]").fill("Đủ phụ kiện <test>");
await p.getByRole("button", { name: "Lưu thông tin", exact: true }).click();
await p.getByText("HĐ-0001", { exact: true }).waitFor();
let state = await p.evaluate(() =>
  JSON.parse(localStorage.getItem("chothue-demo-v1")),
);
assert.equal(state.contracts[0].deposit, 500000);
assert.equal(state.contracts[0].total, 900000);
await p.locator(".snav [data-view=assets]").click();
await p.locator("[data-maintenance=a1]").click();
await p.locator("[name=maintenance]").fill("1");
await p.getByRole("button", { name: "Lưu thông tin", exact: true }).click();
await p.getByText("0 sẵn sàng", { exact: true }).waitFor();
await p.locator(".snav [data-view=contracts]").click();
await p.locator("#search").fill("HĐ-0001");
await p.locator("[data-detail]").click();
await p.getByText("Đủ phụ kiện <test>", { exact: true }).waitFor();
await p.locator("#close").click();
await p.locator("[data-return]").click();
await p.locator("[name=refund]").fill("200000");
await p.locator("[name=returnNote]").fill("Đã kiểm đủ");
await p.getByRole("button", { name: "Lưu thông tin", exact: true }).click();
await p.locator(".contract-row").getByText("Đã trả", { exact: true }).waitFor();
await p.locator(".snav [data-view=payments]").click();
await p.locator("[data-refund]").click();
await p.locator("[name=amount]").fill("300000");
await p.getByRole("button", { name: "Lưu thông tin", exact: true }).click();
await p.locator("[data-pay]").click();
await p.locator("[name=amount]").fill("800000");
await p.getByRole("button", { name: "Lưu thông tin", exact: true }).click();
await p.getByText("Đã thanh toán", { exact: true }).waitFor();
state = await p.evaluate(() =>
  JSON.parse(localStorage.getItem("chothue-demo-v1")),
);
assert.equal(state.contracts[0].paid, 900000);
assert.equal(state.contracts[0].depositRefunded, 500000);
assert.equal(state.contracts[0].transactions.length, 5);
assert.equal(state.contracts[0].status, "returned");
await p.locator(".snav [data-view=calendar]").click();
await p
  .getByText("Giao tài sản · Sony A7 IV + lens 24–70", { exact: true })
  .waitFor();
await p.getByRole("button", { name: "Tuần sau" }).click();
await p.getByRole("button", { name: "Hôm nay", exact: true }).click();
// Old records remain readable and overdue filter works.
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("chothue-demo-v1"));
  s.contracts.push({
    id: "old",
    code: "OLD-01",
    assetId: "a2",
    customerId: "c1",
    quantity: 1,
    total: 150000,
    paid: 0,
    status: "active",
    start: "2020-01-01",
    end: "2020-01-02",
  });
  localStorage.setItem("chothue-demo-v1", JSON.stringify(s));
});
await p.reload();
await p.getByText("Quá hạn từ 02/01/2020", { exact: true }).waitFor();
await p.locator(".snav [data-view=contracts]").click();
await p.locator("[data-filter=late]").click();
assert.equal(await p.locator(".contract-row").count(), 1);
await p.locator("[data-detail=old]").click();
await p
  .getByText("Hợp đồng cũ chưa có nhật ký giao dịch chi tiết.", { exact: true })
  .waitFor();
await p.locator("#close").click();
await p.locator(".snav [data-view=overview]").click();
await p.screenshot({ path: "test-results/rentos-desktop.png", fullPage: true });
await p.setViewportSize({ width: 390, height: 844 });
await p.screenshot({ path: "test-results/rentos-mobile.png", fullPage: true });
assert(
  await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
assert.deepEqual(errors, []);
console.log(
  "PASS: deposits, partial/full refunds, payments, maintenance stock, search actions, calendar, legacy data, overdue filter, mobile width, no runtime errors",
);
await p.locator(".tabs [data-view=calendar]").click();
await p.locator(".cal").waitFor();
assert((await p.locator(".cal .crow").count()) > 0);
assert(
  await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await p.locator(".top [data-theme-toggle]").click();
assert.equal(
  await p.evaluate(() => document.documentElement.dataset.theme),
  "dark",
);
await p.locator(".tabs [data-view=assets]").click();
await p.locator('[data-category="Phương tiện"]').click();
assert.equal(await p.locator(".acard").count(), 1);
await p.locator('[data-rentasset="a2"]').click();
assert.equal(await p.locator("#modal [name=assetId]").inputValue(), "a2");
await p.getByRole("button", { name: "Hủy", exact: true }).click();
await p.reload();
assert.equal(
  await p.evaluate(() => document.documentElement.dataset.theme),
  "dark",
);
console.log(
  "PASS: mobile bottom navigation, timeline, dark mode persistence, category filters, asset-specific rental",
);
await b.close();
