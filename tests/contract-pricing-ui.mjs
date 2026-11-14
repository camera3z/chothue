import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5174");
  await page.locator(".page-title [data-add=contract]").click();
  assert.equal(await page.locator("[name=periods]").count(), 0);
  await page.locator("[name=start]").fill("2026-11-14");
  await page.locator("[name=end]").fill("2026-11-22");
  await page.locator("[name=unitPrice]").fill("100000");
  assert.equal(await page.locator("[name=unitPrice]").inputValue(), "100.000");
  await page.locator("[name=unitPrice]").fill("-100");
  assert.equal(
    await page.locator("[name=unitPrice]").evaluate((e) => e.checkValidity()),
    false,
  );
  await page.locator("[name=unitPrice]").fill("100.000 ₫");
  assert.equal(await page.locator("[name=unitPrice]").inputValue(), "100.000");

  await page.locator("[name=billingUnit]").selectOption("ngày");
  await page.locator('[name=end]').fill('2026-11-25');
  assert((await page.locator('#contract-price-summary').innerText()).includes('Số ngày đã thuê: 12'));
  assert((await page.locator('.contract-formula').innerText()).startsWith('Số ngày đã thuê: 12 × Đơn giá:'));
  await page.locator('[name=end]').fill('2026-11-22');
  await page.locator("[name=quantity]").fill("2");
  assert(
    (await page.locator("#contract-price-summary").innerText()).includes(
      "1.800.000",
    ),
  );
  await page.locator("[name=billingUnit]").selectOption("tháng");
  assert(
    (await page.locator("#contract-price-summary").innerText()).includes(
      "200.000",
    ),
  );
  await page.locator("[name=billingUnit]").selectOption("năm");
  await page.locator("[name=paid]").fill("0");
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("chothue-demo-v1")),
  );
  assert.equal(state.contracts[0].unitPrice, 100000);
  assert.equal(state.contracts[0].billingUnit, "năm");
  assert.equal(state.contracts[0].periods, 1);
  assert.equal(state.contracts[0].total, 200000);
  assert.equal(state.assets[0].price, 450000);
  await page.locator(".snav [data-view=assets]").click();
  await page.locator("[data-rentasset=a3]").click();
  assert.equal(await page.locator("[name=billingUnit]").inputValue(), "tháng");
  assert.equal(
    await page.locator("[name=unitPrice]").inputValue(),
    "5.500.000",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page
      .locator("#modal")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  console.log(
    "PASS UI: custom contract rate, day/month/year selection, automatic total, saved snapshot, unchanged asset price, quick-rent defaults, mobile form",
  );
} finally {
  await browser.close();
}
