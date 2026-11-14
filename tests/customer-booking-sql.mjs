import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite(),
  shop = "11111111-1111-4111-8111-111111111111",
  owner = "22222222-2222-4222-8222-222222222222";
try {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create schema storage;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,storage to anon,authenticated;create table organizations(id uuid primary key);create table members(organization_id uuid,user_id uuid);create table licenses(organization_id uuid primary key,expires_at timestamptz);create table records(organization_id uuid primary key,data jsonb);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;grant select on members,licenses,records to authenticated;`,
  );
  for (const name of [
    "20261112_public_storefront.sql",
    "20261112_booking_requests.sql",
    "20261114_fixed_billing.sql",
    "20261114_customer_booking_form.sql",
  ])
    await db.exec(fs.readFileSync("supabase/migrations/" + name, "utf8"));
  await db.query("insert into organizations values ($1)", [shop]);
  await db.query("insert into members values ($1,$2)", [shop, owner]);
  await db.query("insert into licenses values ($1,now()+interval '1 year')", [
    shop,
  ]);
  await db.query("insert into storefronts values ($1,$2,true)", [shop, "Shop"]);
  const asset = {
    id: "a",
    name: "Xe",
    unit: "tháng",
    price: 300000,
    quantity: 3,
  };
  await db.query("insert into records(organization_id,data) values ($1,$2)", [
    shop,
    JSON.stringify({
      assets: [asset],
      customers: [
        {
          id: "existing",
          name: "Tên cũ",
          phone: "0901234567",
          address: "Địa chỉ cũ",
        },
      ],
      contracts: [],
    }),
  ]);
  const date = (
    await db.query(
      "select to_char((now() at time zone 'Asia/Bangkok')::date+2,'YYYY-MM-DD') d",
    )
  ).rows[0].d;
  const end = (
    await db.query("select to_char($1::date+8,'YYYY-MM-DD') d", [date])
  ).rows[0].d;
  let counter = 0;
  const send = async ({
    id = crypto.randomUUID(),
    phone = "09012345" + String(67 + counter++),
    address = "Địa chỉ khách mới",
    unit = "tháng",
    periods = 3,
    start = date,
    finish = date,
    honey = "",
  } = {}) =>
    (
      await db.query(
        "select submit_rental_request_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) r",
        [
          shop,
          id,
          "a",
          "Khách mới",
          phone,
          address,
          start,
          finish,
          1,
          unit,
          periods,
          "Ghi chú",
          honey,
        ],
      )
    ).rows[0].r;
  const rid = crypto.randomUUID();
  await db.exec("set role anon");
  const first = await send({ id: rid, phone: "0901234567" });
  assert.equal(Number(first.estimated_total), 900000);
  assert(first.cancel_token);
  const retry = await send({ id: rid, phone: "0901234567" });
  assert(!retry.cancel_token);
  await assert.rejects(
    send({ id: rid, phone: "0901234567", address: "Khác" }),
    /Ma yeu cau/,
  );
  assert.equal(
    Number(
      (await send({ unit: "ngày", periods: null, finish: end }))
        .estimated_total,
    ),
    90000,
  );
  assert.equal(
    Number((await send({ unit: "năm", periods: 2 })).estimated_total),
    7300000,
  );
  await assert.rejects(send({ unit: "tháng", periods: 0 }), /So ky/);
  await assert.rejects(send({ unit: "tháng", periods: 1.001 }), /So ky/);
  await assert.rejects(send({ unit: "bogus" }), /Don vi/);
  await assert.rejects(send({ honey: "spam" }), /khong hop le/);
  await assert.rejects(send({ address: "x".repeat(501) }), /500/);
  await assert.rejects(
    db.query("select customer_address from rental_requests"),
    /permission denied/,
  );
  const publicData = (
    await db.query("select get_public_storefront($1) r", [shop])
  ).rows[0].r;
  assert(!JSON.stringify(publicData).includes("Địa chỉ"));
  await db.exec("reset role");
  const req = (
    await db.query("select * from rental_requests where id=$1", [rid])
  ).rows[0];
  assert.equal(req.customer_address, "Địa chỉ khách mới");
  assert.equal(Number(req.quoted_unit_price), 300000);
  assert.equal(
    new Date(req.requested_start_date).toISOString().slice(0, 10),
    date,
  );
  assert.equal(
    new Date(req.requested_end_date).toISOString().slice(0, 10),
    date,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  await db.exec("set role authenticated");
  const cid = (
    await db.query(
      "select review_rental_request_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) r",
      [
        shop,
        rid,
        "approve",
        "Tên đã thỏa thuận",
        "0901234567",
        "Địa chỉ đã sửa",
        date,
        date,
        1,
        850000,
        100000,
        "Điều khoản",
      ],
    )
  ).rows[0].r;
  assert(cid);
  await db.exec("reset role");
  const doc = (
    await db.query("select data from records where organization_id=$1", [shop])
  ).rows[0].data;
  const contract = doc.contracts[0];
  assert.equal(contract.total, 850000);
  assert.equal(contract.paid, 0);
  assert.equal(contract.deposit, 0);
  assert.equal(contract.agreedAddress, "Địa chỉ đã sửa");
  assert.equal(contract.requestedUnit, "tháng");
  assert.equal(Number(contract.requestedPeriods), 3);
  assert.equal(Number(contract.quotedUnitPrice), 300000);
  assert.equal(contract.start, date);
  assert.equal(contract.end, date);
  assert.equal(
    new Date(contract.rentalEnd) - new Date(contract.rentalStart),
    86400000,
  );
  assert.equal(doc.customers[0].address, "Địa chỉ cũ");
  assert.equal(
    (
      await db.query(
        "select customer_address from rental_requests where id=$1",
        [rid],
      )
    ).rows[0].customer_address,
    "Địa chỉ đã sửa",
  );
  // Migration is repeatable and preserves all records.
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261114_customer_booking_form.sql",
      "utf8",
    ),
  );
  assert.equal(
    (await db.query("select count(*)::int n from rental_requests")).rows[0].n,
    3,
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261114_auto_booking_end.sql",
      "utf8",
    ),
  );
  const autoId = crypto.randomUUID();
  await db.exec("set role anon");
  const auto = await send({
    id: autoId,
    phone: "0999999901",
    periods: 3,
    finish: date,
  });
  assert.equal(Number(auto.estimated_total), 900000);
  const yearId = crypto.randomUUID();
  await send({
    id: yearId,
    phone: "0999999902",
    unit: "năm",
    periods: 2,
    finish: date,
  });
  await assert.rejects(
    send({ phone: "0999999903", unit: "năm", periods: 10.01 }),
    /3650/,
  );
  await db.exec("reset role");
  const expected = (
    await db.query("select to_char($1::date+89,'YYYY-MM-DD') d", [date])
  ).rows[0].d;
  assert.equal(auto.requested_end_date, expected);
  assert.equal(
    new Date(
      (
        await db.query(
          "select requested_end_date from rental_requests where id=$1",
          [autoId],
        )
      ).rows[0].requested_end_date,
    )
      .toISOString()
      .slice(0, 10),
    expected,
  );
  assert.equal(
    (
      await db.query(
        "select (requested_end_date-requested_start_date+1)::int days from rental_requests where id=$1",
        [yearId],
      )
    ).rows[0].days,
    730,
  );
  // An owner can approve the automatically derived schedule using the same locked path.
  await db.exec("set role authenticated");
  const automaticContract = (
    await db.query(
      "select review_rental_request_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) r",
      [
        shop,
        autoId,
        "approve",
        "Khách",
        "0999999901",
        "Địa chỉ",
        date,
        expected,
        1,
        900000,
        0,
        "",
      ],
    )
  ).rows[0].r;
  assert(automaticContract);
  // Migration is repeatable and updates both APIs without changing their grants.
  await db.exec("reset role");
  const limitsSql = fs.readFileSync("supabase/migrations/20261114_booking_request_limits.sql", "utf8");
  await db.exec(limitsSql);
  await db.exec(limitsSql);
  await db.exec("set role anon");
  const quotaPhone = "0988888888";
  for (let i = 1; i <= 10; i++)
    await send({ phone: quotaPhone, unit: "tháng", periods: i });
  await assert.rejects(send({ phone: quotaPhone, periods: 11 }), /Vui lòng thử lại sau 15 phút/);
  await db.exec("reset role");
  await db.query("update rental_requests set created_at=now()-interval '16 minutes' where phone=$1", [quotaPhone]);
  await db.exec("set role anon");
  await send({ phone: quotaPhone, periods: 11 });
  await db.exec("reset role");
  const legacyDefinition = (await db.query("select pg_get_functiondef(oid) d from pg_proc where proname='submit_rental_request'")).rows[0].d;
  assert(legacyDefinition.includes("interval '15 minutes')>=10"));
  console.log(
    "PASS SQL v2: date-inclusive/entered-period estimates, fixed unit conversion, server prices, validation/idempotency/privacy, reviewed address and quote snapshots, negotiated total, unchanged existing profile, repeatable migration",
  );
} finally {
  await db.close();
}
