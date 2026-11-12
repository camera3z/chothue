import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const shop = "11111111-1111-4111-8111-111111111111",
  uid = "22222222-2222-4222-8222-222222222222",
  rid = "33333333-3333-4333-8333-333333333333";
const start = new Date(Date.now() + 86400000).toISOString(),
  end = new Date(Date.now() + 172800000).toISOString();
const base = process.env.AUTH_TEST_URL || "http://127.0.0.1:5173";
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let submitted;
  let publicStatus = "pending";
  const cancellationKey = "44444444-4444-4444-8444-444444444444";
  await page.route("https://*.supabase.co/**", async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith("get_public_storefront"))
      return r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          name: "Shop mẫu",
          assets: [
            {
              id: "a1",
              name: "Camera",
              category: "Máy ảnh",
              price: 100000,
              unit: "ngày",
              available: 1,
            },
          ],
        }),
      });
    if (u.pathname.endsWith("submit_rental_request")) {
      submitted = r.request().postDataJSON();
      return r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: rid,
          status: "received",
          estimated_total: 100000,
          cancel_token: cancellationKey,
        }),
      });
    }
    if (u.pathname.endsWith("public_rental_request_status"))
      return r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(publicStatus),
      });
    if (u.pathname.endsWith("cancel_public_rental_request")) {
      publicStatus = "cancelled";
      return r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(publicStatus),
      });
    }
    throw Error("Unexpected public request " + u.pathname);
  });
  await page.goto(base + "/?shop=" + shop);
  await page.getByRole("button", { name: "Đặt thuê", exact: true }).click();
  await page.locator("[name=name]").fill("Khách thử nghiệm");
  await page.locator("[name=phone]").fill("0901234567");
  await page.locator("[name=consent]").check();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page
      .locator(".booking-request-dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  await page.screenshot({
    path: "/tmp/rentbook-booking-mobile.png",
    fullPage: true,
  });

  await page
    .getByRole("button", { name: "Gửi yêu cầu thuê", exact: true })
    .click();
  await page.getByRole("heading", { name: "Đã gửi yêu cầu" }).waitFor();
  assert.equal(submitted.p_shop, shop);
  assert.equal(submitted.p_quantity, 1);
  assert.equal(submitted.p_name, "Khách thử nghiệm");
  assert(new Date(submitted.p_end) > new Date(submitted.p_start));
  assert(!("p_total" in submitted));
  const follow = await page
    .getByRole("link", { name: "Theo dõi yêu cầu" })
    .getAttribute("href");
  await page.goto(follow);
  await page.getByText("Chờ shop duyệt", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Hủy yêu cầu thuê", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bấm lần nữa để xác nhận hủy", exact: true })
    .click();
  await page.getByText("Yêu cầu đã hủy", { exact: true }).waitFor();
  await page.close();
  const admin = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  admin.on("pageerror", (e) => errors.push(e.message));
  const user = {
    id: uid,
    aud: "authenticated",
    email: "owner@example.com",
    user_metadata: {},
  };
  let doc = {
      assets: [
        {
          id: "a1",
          name: "Camera",
          category: "Máy ảnh",
          price: 100000,
          quantity: 1,
          unit: "ngày",
        },
      ],
      customers: [],
      contracts: [],
    },
    version = 0;
  let req = {
    id: rid,
    asset_id: "a1",
    customer_name: "Khách thử nghiệm",
    phone: "0901234567",
    starts_at: start,
    ends_at: end,
    quantity: 1,
    note: "Giao đủ phụ kiện",
    status: "pending",
    estimated_total: 100000,
  };
  let reviewed;
  await admin.route("https://*.supabase.co/**", async (r) => {
    const u = new URL(r.request().url());
    let data = {};
    if (u.pathname.endsWith("/members")) data = [{ organization_id: shop }];
    else if (u.pathname.endsWith("/organizations"))
      data = { id: shop, name: "Shop" };
    else if (u.pathname.endsWith("/records"))
      data = { organization_id: shop, data: doc, version };
    else if (u.pathname.endsWith("/licenses"))
      data = { expires_at: "2099-01-01" };
    else if (u.pathname.endsWith("/storefronts"))
      data = { name: "Shop", enabled: true };
    else if (u.pathname.endsWith("/rental_requests")) data = [req];
    else if (u.pathname.endsWith("/user")) data = user;
    else if (u.pathname.endsWith("/review_rental_request")) {
      reviewed = r.request().postDataJSON();
      req = { ...req, status: "approved", contract_id: "contract1" };
      doc = {
        ...doc,
        customers: [
          { id: "c1", name: reviewed.p_name, phone: reviewed.p_phone },
        ],
        contracts: [
          {
            id: "contract1",
            code: "WEB-TEST",
            assetId: "a1",
            customerId: "c1",
            quantity: 1,
            total: reviewed.p_total,
            paid: 0,
            deposit: 0,
            depositRequired: reviewed.p_deposit,
            depositRefunded: 0,
            status: "reserved",
            start: start.slice(0, 10),
            end: end.slice(0, 10),
            rentalStart: start,
            rentalEnd: end,
            transactions: [],
          },
        ],
      };
      version++;
      data = "contract1";
    } else if (u.pathname.endsWith("/save_rental_records")) {
      const d = r.request().postDataJSON();
      assert.equal(d.p_expected, version);
      doc = d.p_data;
      version++;
      data = version;
    } else throw Error("Unexpected admin request " + u.pathname);
    await r.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url"),
    jwt =
      enc({ alg: "HS256" }) +
      "." +
      enc({
        sub: uid,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: "authenticated",
      }) +
      ".test";
  await admin.addInitScript(
    ({ user, jwt }) => {
      localStorage.setItem(
        "sb-lkwnbvervvgbbvfosohi-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "test",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user,
        }),
      );
    },
    { user, jwt },
  );
  await admin.goto(base);
  await admin
    .locator("#overview-requests")
    .getByRole("button", { name: "Xem xét", exact: true })
    .click();
  await admin.locator("#modal [name=total]").fill("350000");
  await admin.locator("#modal [name=deposit]").fill("500000");
  await admin
    .getByRole("button", { name: "Lưu quyết định", exact: true })
    .click();
  await admin
    .locator("#overview-requests")
    .getByText("Chưa có yêu cầu chờ duyệt", { exact: true })
    .waitFor();
  assert.equal(reviewed.p_total, 350000);
  assert.equal(reviewed.p_deposit, 500000);
  await admin.locator(".snav [data-view=contracts]").click();
  await admin
    .getByRole("button", { name: "Giao tài sản", exact: true })
    .click();
  await admin
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await admin
    .locator(".contract-row .pill")
    .getByText("Đang thuê", { exact: true })
    .waitFor();
  assert.equal(doc.contracts[0].status, "active");
  await admin.locator(".snav [data-view=payments]").click();
  await admin.getByRole("button", { name: "Nhận cọc", exact: true }).click();
  await admin.locator("#modal [name=amount]").fill("100000");
  await admin
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await admin.locator(".snav [data-view=contracts]").click();
  await admin.getByRole("button", { name: "Nhận trả", exact: true }).click();
  await admin
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await admin
    .locator(".contract-row")
    .getByText("Đã trả", { exact: true })
    .waitFor();
  assert.equal(doc.contracts[0].depositRefunded, 100000);
  await admin.setViewportSize({ width: 390, height: 844 });
  assert(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS UI (mock APIs): customer request and estimate, admin review/edit/approval, reservation handover, deposit receipt, return/refund, optimistic revision saves, mobile layout",
  );
} finally {
  await browser.close();
}
