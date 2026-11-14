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
  const page = await browser.newPage();
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5174");
  const data = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("chothue-demo-v1")));
  async function create() {
    await page.locator(".page-title [data-add=contract]").click();
    assert.equal(await page.locator("[name=deposit]").count(), 0);
    await page.locator("[name=unitPrice]").fill("300000");
    await page.locator("[name=paid]").fill("400000");
    await page
      .getByRole("button", { name: "Lưu thông tin", exact: true })
      .click();
    await page
      .getByText("Tiền đã thu không được vượt tổng hợp đồng.", { exact: true })
      .waitFor();
    await page.locator("[name=paid]").fill("100000");
    await page
      .getByRole("button", { name: "Lưu thông tin", exact: true })
      .click();
    await page.locator("#modal").waitFor({ state: "hidden" });
    await page.locator(".snav [data-view=contracts]").click();
  }
  await create();
  let state = await data();
  assert.equal(state.contracts[0].paid, 100000);
  assert.equal(state.contracts[0].deposit, 0);
  assert.equal(state.contracts[0].transactions.length, 1);
  assert.equal(state.contracts[0].transactions[0].type, "rent");
  await page.locator("[data-return]").click();
  assert.equal(await page.locator("[name=refund]").count(), 0);
  await page.locator("[name=returnPayment]").fill("300000");
  assert.equal(
    await page
      .locator("[name=returnPayment]")
      .evaluate((e) => e.checkValidity()),
    false,
  );
  await page.locator("[data-fill-return-payment]").click();
  assert.equal(
    await page.locator("[name=returnPayment]").inputValue(),
    "200.000",
  );
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page
    .locator(".contract-row")
    .getByText("Đã trả", { exact: true })
    .waitFor();
  state = await data();
  assert.equal(state.contracts[0].paid, 300000);
  assert.equal(state.contracts[0].deposit, 0);
  assert.equal(
    state.contracts[0].transactions
      .filter((t) => t.type === "rent")
      .reduce((n, t) => n + t.amount, 0),
    300000,
  );
  await create();
  await page.locator("[data-return]").click();
  await page.locator("[name=returnPayment]").fill("50000");
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  state = await data();
  assert.equal(state.contracts[1].paid, 150000);
  assert.equal(state.contracts[1].status, "returned");
  await page.locator(".snav [data-view=payments]").click();
  await page.locator("[data-pay]").click();
  await page.locator("[name=amount]").fill("150000");
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page.locator("#modal").waitFor({ state: "hidden" });
  state = await data();
  assert.equal(state.contracts[1].paid, 300000);
  assert.equal(state.contracts[1].depositRefunded, 0);
  console.log(
    "PASS: advance deducted from rent, no separate new deposit, overpayment rejected, full settlement on return, partial return payment and later debt collection, no double counting",
  );
} finally {
  await browser.close();
}
