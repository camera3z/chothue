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
  await page.locator(".snav [data-view=customers]").click();
  await page.locator(".page-title [data-add=customer]").click();
  assert.equal(await page.locator("[name=email]").count(), 0);
  await page.locator("[name=name]").fill("Khách <kiểm tra>");
  await page.locator("[name=phone]").fill("0901234567");
  await page.locator("[name=address]").fill("12 Đường A, Phường B, Hà Nội");
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page
    .locator(".customer-row")
    .getByText("Khách <kiểm tra>", { exact: true })
    .waitFor();
  await page.locator(".snav [data-view=contracts]").click();
  await page.locator(".page-title [data-add=contract]").click();
  const customerId = await page
    .locator("[name=customerId] option")
    .filter({ hasText: "Khách <kiểm tra>" })
    .getAttribute("value");
  await page.locator("[name=customerId]").selectOption(customerId);
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page.locator("[data-detail]").click();
  const info = page.locator(".rental-customer-info");
  await info.getByText("Khách <kiểm tra>", { exact: true }).waitFor();
  await info.getByText("0901234567", { exact: true }).waitFor();
  await info
    .getByText("12 Đường A, Phường B, Hà Nội", { exact: true })
    .waitFor();
  assert.equal(await info.locator("dt").count(), 3);
  assert(!(await info.innerText()).includes("Email"));
  await page.locator("#close").click();
  await page.locator(".snav [data-view=customers]").click();
  await page.locator(`[data-edit-customer="${customerId}"]`).click();
  await page.locator("[name=address]").fill("Địa chỉ cập nhật");
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page.reload();
  await page.locator(".snav [data-view=contracts]").click();
  await page.locator("[data-detail]").click();
  await info.getByText("Địa chỉ cập nhật", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page
      .locator("#modal")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: customer name/phone/address create/edit, rental detail fields, escaped names, persistence, no email, mobile layout",
  );
} finally {
  await browser.close();
}
