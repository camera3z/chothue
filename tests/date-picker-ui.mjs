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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5174");
  await page.locator(".page-title [data-add=contract]").click();
  await page.locator("[name=start]").fill("2026-11-14");
  await page.locator("[name=end]").fill("2026-11-14");
  const open = () =>
    page
      .getByRole("button", { name: "Mở lịch ngày kết thúc", exact: true })
      .click();
  await open();
  let calendar = page.locator(".calendar-picker");
  await calendar.locator('[data-day="2026-11-25"]').click();
  assert.equal(await page.locator("[name=end]").inputValue(), "2026-11-14");
  await calendar.getByRole("button", { name: "Chọn", exact: true }).click();
  assert.equal(await page.locator("[name=end]").inputValue(), "2026-11-25");
  assert(
    (await page.locator(".contract-formula").innerText()).startsWith(
      "12 ngày ×",
    ),
  );
  await open();
  await calendar.locator('[data-day="2026-11-26"]').click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[name=end]").inputValue(), "2026-11-25");
  await open();
  await calendar.getByLabel("Chọn năm", { exact: true }).selectOption("2024");
  await calendar.getByLabel("Chọn tháng", { exact: true }).selectOption("1");
  await calendar.locator('[data-day="2024-02-29"]').click();
  await calendar.getByRole("button", { name: "Chọn", exact: true }).click();
  assert.equal(await page.locator("[name=end]").inputValue(), "2024-02-29");
  await page.locator("[name=end]").fill("2026-11-25");
  await open();
  await calendar.getByRole("button", { name: "Xóa", exact: true }).click();
  await calendar.getByRole("button", { name: "Chọn", exact: true }).click();
  assert.equal(await page.locator("[name=end]").inputValue(), "");
  assert.equal(
    await page.locator("[name=end]").evaluate((e) => e.checkValidity()),
    false,
  );
  await page.locator("[name=end]").fill("2026-11-25");
  await open();
  await calendar.getByRole("button", { name: "Hôm nay", exact: true }).click();
  await calendar.getByRole("button", { name: "Chọn", exact: true }).click();
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  assert.equal(await page.locator("[name=end]").inputValue(), today);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await open();
  const bounds = await calendar.boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  assert(bounds.y >= 0 && bounds.y + bounds.height <= 844);
  await page.screenshot({
    path: "/tmp/rentbook-date-picker.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: explicit date confirmation, cancel unchanged, month/year/leap day, clear/required, today, pricing refresh, dark/mobile positioning",
  );
} finally {
  await browser.close();
}
