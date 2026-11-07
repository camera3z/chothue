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
    viewport: { width: 1400, height: 950 },
  });
  const url = process.env.AUTH_TEST_URL || "http://127.0.0.1:5173";
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator(".auth-page-header [data-login]").waitFor();
  assert.equal(await page.locator("[data-signout]").count(), 0);
  await page.locator("[data-login]").click();
  assert(
    await page
      .locator("[name=email]")
      .evaluate((e) => document.activeElement === e),
  );
  const uid = "11111111-1111-4111-8111-111111111111",
    oid = "22222222-2222-4222-8222-222222222222";
  let user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    user_metadata: { shop_name: "Shop thử nghiệm" },
  };
  let logout = false;
  const projectHost =
    (await page.evaluate(() =>
      Object.keys(localStorage).find((k) => k.includes("auth-token")),
    )) || "sb-lkwnbvervvgbbvfosohi-auth-token";
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request(),
      u = new URL(request.url());
    let data = {};
    if (u.pathname.endsWith("/logout")) {
      logout = true;
      await route.fulfill({ status: 204 });
      return;
    }
    if (u.pathname.endsWith("/user")) {
      if (request.method() === "PUT") {
        user = {
          ...user,
          user_metadata: {
            ...user.user_metadata,
            ...request.postDataJSON().data,
          },
        };
      }
      data = user;
    } else if (u.pathname.endsWith("/members"))
      data = [{ organization_id: oid }];
    else if (u.pathname.endsWith("/organizations"))
      data = { id: oid, name: "Đơn vị mặc định" };
    else if (u.pathname.endsWith("/records"))
      data = {
        organization_id: oid,
        data: { assets: [], customers: [], contracts: [] },
      };
    else if (u.pathname.endsWith("/licenses"))
      data = { organization_id: oid, expires_at: "2099-01-01T00:00:00Z" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  const encode = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      sub: uid,
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: "authenticated",
      role: "authenticated",
    }) +
    ".test";
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: projectHost,
      value: {
        access_token: token,
        refresh_token: "test-refresh",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user,
      },
    },
  );
  await page.reload();
  await page
    .locator(".account-header .shop-label")
    .getByText("Shop thử nghiệm", { exact: true })
    .waitFor();
  await page.locator("[data-shop-name]").click();
  await page.locator("#modal [name=name]").fill("Shop mới <an toàn>");
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page
    .locator(".account-header .shop-label")
    .getByText("Shop mới <an toàn>", { exact: true })
    .waitFor();
  await page.reload();
  await page
    .locator(".account-header .shop-label")
    .getByText("Shop mới <an toàn>", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.locator("[data-signout]").isVisible());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("[data-signout]").click();
  await page.locator(".auth-page-header [data-login]").waitFor();
  assert(logout);
  assert.equal(await page.locator(".shop-label").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS (mocked Supabase): guest login action, shop label/edit/persistence, mobile account header, logout and cleared identity",
  );
} finally {
  await browser.close();
}
