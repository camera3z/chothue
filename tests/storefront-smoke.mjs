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
  const calls = [];
  const id = "22222222-2222-4222-8222-222222222222";
  let published = true;
  let rented = false;
  await page.clock.install();
  await page.route("https://*.supabase.co/**", async (r) => {
    const u = new URL(r.request().url());
    calls.push(u.pathname);
    assert(
      u.pathname.endsWith("/rpc/get_public_storefront"),
      "Public page must use only safe public RPC",
    );
    assert.equal(r.request().postDataJSON().p_shop, id);
    await r.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        published
          ? {
              name: "Shop <test>",
              assets: [
                {
                  id: "one",
                  name: "Xe máy còn một chiếc",
                  category: "Xe máy",
                  price: 150000,
                  unit: "ngày",
                  available: rented ? 0 : 1,
                },
                {
                  id: "two",
                  name: "Máy ảnh Sony",
                  category: "Thiết bị",
                  price: 250000,
                  unit: "ngày",
                  available: 2,
                },
              ],
            }
          : null,
      ),
    });
  });
  await page.goto(
    (process.env.AUTH_TEST_URL || "http://127.0.0.1:5173") + "/?shop=" + id,
  );
  await page
    .getByRole("heading", { name: "Tìm tài sản phù hợp cho bạn" })
    .waitFor();
  assert.equal(await page.locator(".acard").count(), 2);
  assert.equal(await page.locator(".snav").count(), 0);
  await page.locator("#public-search").fill("Sony");
  assert.equal(await page.locator(".acard").count(), 1);
  await page.locator("#public-search").fill("");
  await page.locator("#public-category").selectOption("Xe máy");
  assert.equal(await page.locator(".acard").count(), 1);
  assert.equal(
    await page.getByRole("button", { name: "Cho thuê", exact: true }).count(),
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(
    await page.getByRole("link", { name: "Quản trị / Đăng nhập" }).count(),
    0,
  );
  await page.locator("#public-category").selectOption("all");
  rented = true;
  const rentedResponse = page.waitForResponse((r) =>
    r.url().includes("get_public_storefront"),
  );
  await page.clock.fastForward(30000);
  await rentedResponse;
  await page
    .getByRole("heading", { name: "Xe máy còn một chiếc", exact: true })
    .waitFor({ state: "hidden" });
  rented = false;
  const returnedResponse = page.waitForResponse((r) =>
    r.url().includes("get_public_storefront"),
  );
  await page.clock.fastForward(30000);
  await returnedResponse;
  await page
    .getByRole("heading", { name: "Xe máy còn một chiếc", exact: true })
    .waitFor();
  published = false;
  await page.reload();
  await page
    .getByRole("heading", { name: "Trang trưng bày chưa mở" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS (mocked public RPC): anonymous storefront, filters, read-only UI, no private table requests, unpublished state, mobile layout",
  );
} finally {
  await browser.close();
}
