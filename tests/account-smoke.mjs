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
  // Recovered/refreshed sessions must not remount the app or reload records.
  await page.locator('.snav [data-view="assets"]').click();
  await page.locator('[data-add="asset"]').click();
  await page.locator('#modal [name="name"]').fill("Tài sản đang nhập");
  await page.locator('#modal [name="category"]').fill("Danh mục thử");
  await page.locator('#modal [name="photo"]').setInputFiles({
    name: "asset.png", mimeType: "image/png",
    buffer: await page.screenshot({ clip: { x: 0, y: 0, width: 40, height: 40 } }),
  });
  await page.locator('.photo-preview img').waitFor();
  let backgroundReads = 0;
  const countReads = (r) => { if (r.url().includes('/rest/v1/')) backgroundReads++; };
  page.on('request', countReads);
  for (const event of ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"]) {
    const label = "Shop cập nhật " + event;
    await page.evaluate(({ key, event, label }) => {
      const session = JSON.parse(localStorage.getItem(key));
      session.user.user_metadata.shop_name = label;
      const channel = new BroadcastChannel(key);
      channel.postMessage({event, session});
      channel.close();
    }, { key: projectHost, event, label });
    await page.locator('.account-header .shop-label').getByText(label, { exact: true }).waitFor();
    assert(await page.locator('#modal').evaluate(el => el.open));
    assert.equal(await page.locator('#modal [name="name"]').inputValue(), "Tài sản đang nhập");
    assert.equal(await page.locator('#modal [name="category"]').inputValue(), "Danh mục thử");
    assert.equal(await page.locator('#modal [name="photo"]').evaluate(el => el.files[0].name), "asset.png");
    assert.equal(await page.locator('.photo-preview img').count(), 1);
  }
  assert.equal(backgroundReads, 0, "Session events must not reload workspace data");
  page.off('request', countReads);
  await page.locator('#modal #cancel').click();
  await page.locator("[data-shop-name]").click();
  await page.locator("#modal [name=name]").fill("Shop mới <an toàn>");
  for (const theme of ['light','dark']) {
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    const styles=await page.locator('#modal .modal-actions').evaluate(el=>{
      const primary=getComputedStyle(el.querySelector('.primary'));
      const cancel=getComputedStyle(el.querySelector('#cancel'));
      return {background:primary.backgroundColor,color:primary.color,cancel:cancel.backgroundColor};
    });
    assert.notEqual(styles.background,styles.cancel,'Save button must use accent background in '+theme);
    assert.notEqual(styles.background,styles.color,'Save text must be visible in '+theme);
  }

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
  assert(await page.locator("[data-signout]:visible").isVisible());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("[data-signout]:visible").click();
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
