import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const shop = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  user = "33333333-3333-4333-8333-333333333333";
try {
  // Minimal Supabase-compatible schemas; the migration below is the actual production SQL.
  await pg.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to anon,authenticated;
create table public.organizations(id uuid primary key);
create table public.members(organization_id uuid,user_id uuid);
create table public.licenses(organization_id uuid primary key,expires_at timestamptz);
create table public.records(organization_id uuid primary key,data jsonb);
create table storage.objects(id serial primary key,bucket_id text,name text);
alter table storage.objects enable row level security;
grant select on storage.objects to anon,authenticated;
grant select on public.members,public.licenses to authenticated;`);
  await pg.exec(
    fs.readFileSync(
      "supabase/migrations/20261112_public_storefront.sql",
      "utf8",
    ),
  );
  await pg.query("insert into organizations values ($1),($2)", [shop, other]);
  await pg.query("insert into members values ($1,$2)", [shop, user]);
  await pg.query(
    "insert into licenses values ($1,now()+interval '1 day'),($2,now()+interval '1 day')",
    [shop, other],
  );
  const assets = [
    {
      id: "partial",
      name: "Partly rented",
      category: "Vehicles",
      quantity: 3,
      maintenance: 1,
      price: 100,
      unit: "day",
      imagePath: shop + "/partial/a.png",
    },
    {
      id: "full",
      name: "Fully rented",
      quantity: 1,
      price: 50,
      imagePath: shop + "/full/a.png",
    },
    {
      id: "repair",
      name: "Maintenance only",
      quantity: 1,
      maintenance: 1,
      price: 50,
      imagePath: shop + "/repair/a.png",
    },
  ];
  const data = {
    assets,
    customers: [{ email: "PRIVATE@example.com" }],
    contracts: [
      {
        assetId: "partial",
        quantity: 1,
        status: "active",
        customerId: "PRIVATE",
      },
      { assetId: "full", quantity: 1, status: "active" },
      { assetId: "partial", quantity: 9, status: "returned" },
    ],
  };
  await pg.query("insert into records values ($1,$2),($3,$4)", [
    shop,
    JSON.stringify(data),
    other,
    JSON.stringify({ assets: [], contracts: [], customers: [] }),
  ]);
  await pg.query("insert into storefronts values ($1,$2,true),($3,$4,false)", [
    shop,
    "Public shop",
    other,
    "Hidden shop",
  ]);
  for (const a of assets)
    await pg.query(
      "insert into storage.objects(bucket_id,name) values('asset-images',$1)",
      [a.imagePath],
    );
  await pg.exec("set role anon");
  let result = (
    await pg.query("select public.get_public_storefront($1) as value", [shop])
  ).rows[0].value;
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].id, "partial");
  assert.equal(result.assets[0].available, 1);
  assert(!JSON.stringify(result).includes("PRIVATE"));
  assert(!("contracts" in result));
  assert.equal(
    (
      await pg.query("select public.get_public_storefront($1) as value", [
        other,
      ])
    ).rows[0].value,
    null,
  );
  assert.deepEqual(
    (await pg.query("select name from storage.objects")).rows.map(
      (x) => x.name,
    ),
    [shop + "/partial/a.png"],
  );
  await assert.rejects(
    pg.query("select data from records"),
    /permission denied/,
  );
  await assert.rejects(
    pg.query("select * from storefronts"),
    /permission denied/,
  );
  await pg.exec("reset role");
  await pg.query(
    "update storefronts set enabled=false where organization_id=$1",
    [shop],
  );
  await pg.exec("set role anon");
  assert.equal(
    (await pg.query("select public.get_public_storefront($1) as value", [shop]))
      .rows[0].value,
    null,
  );
  assert.equal(
    (await pg.query("select name from storage.objects")).rows.length,
    0,
  );
  await pg.exec("reset role");
  await pg.query(
    "update storefronts set enabled=true where organization_id=$1",
    [shop],
  );
  await pg.query(
    "update licenses set expires_at=now()-interval '1 day' where organization_id=$1",
    [shop],
  );
  await pg.exec("set role anon");
  assert.equal(
    (await pg.query("select public.get_public_storefront($1) as value", [shop]))
      .rows[0].value,
    null,
  );
  await pg.exec("reset role");
  await pg.query(
    "update licenses set expires_at=now()+interval '1 day' where organization_id=$1",
    [shop],
  );
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await pg.exec("set role authenticated");
  assert.equal((await pg.query("select * from storefronts")).rows.length, 1);
  await pg.query("update storefronts set name=$1 where organization_id=$2", [
    "Renamed shop",
    shop,
  ]);
  await assert.rejects(
    pg.query("insert into storefronts values ($1,$2,true)", [
      "44444444-4444-4444-8444-444444444444",
      "Foreign shop",
    ]),
    /row-level security/,
  );
  console.log(
    "PASS (local PostgreSQL engine): partial/full/maintenance availability, returned stock, safe public projection, hidden/expired shops, image RLS, private table denial, owner-only settings",
  );
} finally {
  await pg.close();
}
