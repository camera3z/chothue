import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const shop = "11111111-1111-4111-8111-111111111111",
  owner = "22222222-2222-4222-8222-222222222222",
  foreign = "33333333-3333-4333-8333-333333333333";
const t = (n) => new Date(Date.now() + n * 3600000).toISOString();
const start = t(24),
  end = t(48);
const request = () => crypto.randomUUID();
try {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create schema storage;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,storage to anon,authenticated;create table organizations(id uuid primary key);create table members(organization_id uuid,user_id uuid);create table licenses(organization_id uuid primary key,expires_at timestamptz);create table records(organization_id uuid primary key,data jsonb);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;grant select on members,licenses,records to authenticated;grant insert,update on records to authenticated;`,
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261112_public_storefront.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261112_booking_requests.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync("supabase/migrations/20261114_fixed_billing.sql", "utf8"),
  );
  await db.query("insert into organizations values ($1)", [shop]);
  await db.query("insert into members values ($1,$2)", [shop, owner]);
  await db.query("insert into licenses values ($1,now()+interval '1 year')", [
    shop,
  ]);
  await db.query("insert into storefronts values ($1,$2,true)", [shop, "Shop"]);
  await db.query("insert into records(organization_id,data) values ($1,$2)", [
    shop,
    JSON.stringify({
      assets: [
        {
          id: "a1",
          quantity: 1,
          price: 100000,
          unit: "ngày",
          name: "Camera",
          maintenance: 0,
        },
      ],
      customers: [],
      contracts: [],
    }),
  ]);
  const submit = async (
    id,
    phone = "0901234567",
    s = start,
    e = end,
    honey = "",
    assetId = "a1",
  ) =>
    (
      await db.query(
        "select submit_rental_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result",
        [shop, id, assetId, "Khách thử", phone, s, e, 1, "Ghi chú", honey],
      )
    ).rows[0].result;
  const review = async (id, decision = "approve", s = start, e = end) =>
    (
      await db.query(
        "select review_rental_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result",
        [
          shop,
          id,
          decision,
          "Khách thỏa thuận",
          "0901234567",
          s,
          e,
          1,
          200000,
          500000,
          "Đủ phụ kiện",
        ],
      )
    ).rows[0].result;
  const save = async (version, data) =>
    (
      await db.query("select save_rental_records($1,$2,$3) v", [
        shop,
        version,
        JSON.stringify(data),
      ])
    ).rows[0].v;
  const records = async () => {
    await db.exec("reset role");
    const r = (
      await db.query(
        "select data,version from records where organization_id=$1",
        [shop],
      )
    ).rows[0];
    await db.exec("set role authenticated");
    return r;
  };
  await db.exec("set role anon");
  const r1 = request(),
    r2 = request();
  assert.equal((await submit(r1)).id, r1);
  assert(
    !("cancel_token" in (await submit(r1))),
    "Idempotent retry must not reveal cancellation token",
  );
  assert.equal((await submit(r1)).id, r1);
  await submit(r2, "0901234568");
  await assert.rejects(
    submit(request(), "0901234569", end, start),
    /Thoi gian/,
  );
  await assert.rejects(
    submit(request(), "0901234569", start, end, "bot"),
    /khong hop le/,
  );
  await assert.rejects(
    db.query("select * from rental_requests"),
    /permission denied/,
  );
  await db.exec("reset role");
  assert.equal(
    (await db.query("select count(*)::int n from rental_requests")).rows[0].n,
    2,
  );
  let original = (await db.query("select data from records")).rows[0].data;
  assert.equal(original.contracts.length, 0);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  await db.exec("set role authenticated");
  const cid = await review(r1);
  assert(cid);
  await assert.rejects(review(r1), /da xu ly/);
  await assert.rejects(review(r2), /Khong du tai san/);
  let current = await records();
  assert.equal(current.data.contracts.length, 1);
  assert.equal(current.data.contracts[0].status, "reserved");
  assert.equal(current.data.contracts[0].paid, 0);
  assert.equal(current.data.contracts[0].deposit, 0);
  assert.equal(current.data.contracts[0].depositRequired, 500000);
  await assert.rejects(save(0, original), /Du lieu da thay doi/);
  await assert.rejects(
    db.query("update records set data='{}'"),
    /permission denied/,
  );
  // An adjacent, non-overlapping reservation can be approved.
  await db.exec("set role anon");
  const r3 = request();
  await submit(r3, "0901234570", end, t(72));
  await db.exec("set role authenticated");
  await review(r3, "approve", end, t(72));
  current = await records();
  const manual = structuredClone(current.data);
  manual.contracts.push({
    id: "manual",
    assetId: "a1",
    customerId: "x",
    quantity: 1,
    status: "active",
    start: new Date().toISOString().slice(0, 10),
    end: new Date(Date.now() + 48 * 3600000).toISOString().slice(0, 10),
  });
  await assert.rejects(save(current.version, manual), /Khong du tai san/);
  const maintenance = structuredClone(current.data);
  maintenance.assets[0].maintenance = 1;
  await assert.rejects(save(current.version, maintenance), /bao tri/);
  // Start handover, then mark returned. Approval only releases after an actual return.
  let next = structuredClone(current.data);
  next.contracts.find((c) => c.id === cid).status = "active";
  const v = await save(current.version, next);
  next = structuredClone(next);
  next.contracts.find((c) => c.id === cid).status = "returned";
  await save(v, next);
  await review(r2);
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    foreign,
  ]);
  await db.exec("set role authenticated");
  await assert.rejects(review(r2), /Khong co quyen/);
  assert.equal(
    (await db.query("select * from rental_requests")).rows.length,
    0,
  );
  // Rejection creates no contract or financial entries.
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  await db.exec("set role anon");
  const rejected = request();
  await submit(rejected, "0901234599", t(80), t(81));
  await db.exec("set role authenticated");
  const beforeReject = await records();
  await review(rejected, "reject", t(80), t(81));
  const afterReject = await records();
  assert.equal(afterReject.version, beforeReject.version);
  assert.deepEqual(afterReject.data, beforeReject.data);
  assert.equal(
    (
      await db.query("select status from rental_requests where id=$1", [
        rejected,
      ])
    ).rows[0].status,
    "rejected",
  );
  // A secret link can look up status and cancel only its own pending request.
  await db.exec("set role anon");
  const cancelId = request();
  const cancelResult = await submit(cancelId, "0901234598", t(85), t(86));
  assert(cancelResult.cancel_token);
  assert.equal(
    (
      await db.query("select public_rental_request_status($1,$2,$3) s", [
        shop,
        cancelId,
        request(),
      ])
    ).rows[0].s,
    null,
  );
  assert.equal(
    (
      await db.query("select public_rental_request_status($1,$2,$3) s", [
        shop,
        cancelId,
        cancelResult.cancel_token,
      ])
    ).rows[0].s,
    "pending",
  );
  await assert.rejects(
    db.query("select cancel_public_rental_request($1,$2,$3)", [
      shop,
      cancelId,
      request(),
    ]),
    /khong hop le/,
  );
  assert.equal(
    (
      await db.query("select cancel_public_rental_request($1,$2,$3) s", [
        shop,
        cancelId,
        cancelResult.cancel_token,
      ])
    ).rows[0].s,
    "cancelled",
  );
  await db.exec("set role authenticated");
  await assert.rejects(review(cancelId), /da xu ly/);
  await db.exec("reset role");
  const approvedToken = (
    await db.query("select cancel_token from rental_requests where id=$1", [r1])
  ).rows[0].cancel_token;
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select cancel_public_rental_request($1,$2,$3)", [
      shop,
      r1,
      approvedToken,
    ]),
    /da duoc xu ly/,
  );
  // Per-phone quota is server-side and cannot be bypassed by changing request IDs.
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  await db.exec("set role anon");
  for (let i = 0; i < 3; i++)
    await submit(request(), "0999999999", t(100 + i * 30), t(101 + i * 30));
  await assert.rejects(
    submit(request(), "0999999999", t(210), t(211)),
    /gioi han/,
  );
  await db.exec("reset role");
  await db.query("update licenses set expires_at=now()-interval '1 day'");
  await db.exec("set role anon");
  await assert.rejects(
    submit(request(), "0901234580", t(300), t(301)),
    /chua mo/,
  );
  // A long interval sees peak usage, not the sum of disjoint reservations.
  await db.exec("reset role");
  const peaks = {
    assets: [],
    contracts: [
      {
        id: "one",
        assetId: "p",
        status: "reserved",
        quantity: 1,
        rentalStart: t(1),
        rentalEnd: t(2),
      },
      {
        id: "two",
        assetId: "p",
        status: "reserved",
        quantity: 1,
        rentalStart: t(3),
        rentalEnd: t(4),
      },
    ],
  };
  assert.equal(
    Number(
      (
        await db.query("select rental_peak($1,$2,$3,$4) n", [
          JSON.stringify(peaks),
          "p",
          t(0),
          t(5),
        ])
      ).rows[0].n,
    ),
    1,
  );
  await db.exec("reset role");
  await db.query("update licenses set expires_at=now()+interval '1 year'");
  await db.query(
    "update records set data=jsonb_set(data,'{assets}',(data->'assets')||$1::jsonb) where organization_id=$2",
    [
      JSON.stringify([
        {
          id: "monthly",
          name: "Monthly",
          quantity: 1,
          price: 300000,
          unit: "tháng",
        },
        {
          id: "yearly",
          name: "Yearly",
          quantity: 1,
          price: 365000,
          unit: "năm",
        },
      ]),
      shop,
    ],
  );
  const from = Date.now() + 2 * 86400000,
    until = (days) => new Date(from + days * 86400000).toISOString();
  await db.exec("set role anon");
  assert.equal(
    Number(
      (
        await submit(
          request(),
          "0909999901",
          until(0),
          until(31),
          "",
          "monthly",
        )
      ).estimated_total,
    ),
    310000,
  );
  assert.equal(
    Number(
      (
        await submit(
          request(),
          "0909999902",
          until(0),
          until(365),
          "",
          "yearly",
        )
      ).estimated_total,
    ),
    365000,
  );
  assert.equal(
    Number(
      (
        await submit(
          request(),
          "0909999903",
          until(0),
          until(366),
          "",
          "yearly",
        )
      ).estimated_total,
    ),
    366000,
  );
  console.log(
    "PASS SQL: request validation/idempotency/quotas/privacy, atomic approval conflict, adjacent bookings, duplicate approval rejection, stale-save protection, manual allocation/maintenance validation, handover/return, tenant isolation, expired license, peak overlap",
  );
} finally {
  await db.close();
}
