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
  await page.locator(".snav [data-view=assets]").click();
  const image = await page.screenshot({
    clip: { x: 0, y: 0, width: 40, height: 40 },
  });
  await page.locator("[data-photo=a1]").click();
  await page
    .locator("[name=photo]")
    .setInputFiles({ name: "asset.png", mimeType: "image/png", buffer: image });
  await page.locator(".photo-preview img").waitFor();
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page
    .locator(".acard")
    .filter({ has: page.locator("[data-photo=a1]") })
    .locator(".asset-photo img")
    .waitFor();
  await page.reload();
  await page.locator(".snav [data-view=assets]").click();
  assert.equal(await page.locator(".asset-photo img").count(), 1);
  await page.locator("[data-photo=a1]").click();
  await page
    .locator("[name=photo]")
    .setInputFiles({
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await page
    .getByText("Chọn ảnh JPG, PNG hoặc WebP.", { exact: true })
    .waitFor();
  await page
    .locator("[name=photo]")
    .setInputFiles({
      name: "large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
  await page
    .getByText("Ảnh phải nhỏ hơn hoặc bằng 5 MB.", { exact: true })
    .waitFor();
  await page.locator("[name=removePhoto]").check();
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  assert.equal(await page.locator(".asset-photo img").count(), 0);
  await page.locator(".page-title [data-add=asset]").click();
  await page.locator("[name=name]").fill("Ảnh thiết bị thử");
  await page.locator("[name=category]").fill("Thiết bị");
  await page.locator("[name=quantity]").fill("1");
  await page.locator("[name=price]").fill("100000");
  await page
    .locator("[name=photo]")
    .setInputFiles({ name: "new.png", mimeType: "image/png", buffer: image });
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page
    .locator(".acard")
    .filter({ hasText: "Ảnh thiết bị thử" })
    .locator(".asset-photo img")
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS (demo): existing asset photo add/remove/persistence, preview, file type/size validation, new asset upload, mobile layout",
  );
} finally {
  await browser.close();
}
