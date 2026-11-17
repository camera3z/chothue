import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite();
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const shop='33333333-3333-4333-8333-333333333333',shop2='44444444-4444-4444-8444-444444444444';
const sub='FilezunoSubject_'+ 'x'.repeat(24), key='FZ-'+ 'k'.repeat(64), second='FZ-'+ 'z'.repeat(64),legacy='legacy-test-key-'+'l'.repeat(32);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const order='filezuno:123456789012345';
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;
 create table auth.identities(user_id uuid,provider text,provider_id text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create table public.members(organization_id uuid,user_id uuid);
 create table public.licenses(organization_id uuid primary key,expires_at timestamptz not null);
 create table public.license_keys(id uuid primary key default gen_random_uuid(),key_hash text unique not null,duration_days integer not null,redeemed_by uuid,redeemed_at timestamptz,created_at timestamptz default now());
 create table extensions.test_hashes(raw text primary key,value bytea);
 -- PGlite does not ship pgcrypto. Only digest transport is stubbed with known SHA256 vectors;
 -- the real migration, role grants, identity binding, locks and expiry math run in PostgreSQL.
 create function extensions.digest(input text,algorithm text) returns bytea language sql stable as $$select value from extensions.test_hashes where raw=input and algorithm='sha256'$$;`);
 for(const k of [key,second,legacy])await db.query('insert into extensions.test_hashes values($1,decode($2,\'hex\'))',[k,hash(k)]);
 const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_filezuno_paid_keys.sql'));assert(file);
 await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const issue=async (ref,k,subject=sub,months=1)=>(await db.query('select public.issue_filezuno_license($1,$2,$3,$4) r',[ref,hash(k),subject,months])).rows[0].r;
 await db.exec('set role service_role');
 const first=await issue(order,key);assert.deepEqual(first,{order_ref:order,key_hash:hash(key),subject:sub,months:1});
 assert.deepEqual(await issue(order,key),first);
 await assert.rejects(()=>issue(order,second));
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from license_keys')).rows[0].n,1);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(()=>issue('filezuno:123456789012346',second));
  await assert.rejects(()=>db.exec('select * from filezuno_private.paid_keys'));
  await db.exec('reset role');
 }
 await db.query('insert into members values($1,$2),($3,$4)',[shop,user,shop2,other]);
 await db.query('insert into auth.identities values($1,$2,$3)',[user,'custom:filezuno',sub]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
 await assert.rejects(()=>db.query('select redeem_license($1,$2)',[shop2,key]));
 await assert.rejects(()=>db.query('select redeem_license($1,$2)',[shop,key]));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 await db.query('select redeem_license($1,$2)',[shop,key]);
 await assert.rejects(()=>db.query('select redeem_license($1,$2)',[shop,key]));
 await db.exec('reset role');
 assert((await db.query("select expires_at between now()+interval '1 month'-interval '5 seconds' and now()+interval '1 month'+interval '5 seconds' ok from licenses where organization_id=$1",[shop])).rows[0].ok);
 await db.exec('set role service_role');await issue('filezuno:123456789012346',second);await db.exec('reset role');
 const before=(await db.query('select expires_at from licenses where organization_id=$1',[shop])).rows[0].expires_at;
 await db.exec('set role authenticated');await db.query('select redeem_license($1,$2)',[shop,second]);await db.exec('reset role');
 assert((await db.query("select expires_at=$1::timestamptz+interval '1 month' ok from licenses where organization_id=$2",[before,shop])).rows[0].ok);
 await db.query('insert into license_keys(key_hash,duration_days) values($1,7)',[hash(legacy)]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
 await db.query('select redeem_license($1,$2)',[shop2,legacy]);await db.exec('reset role');
 assert((await db.query("select expires_at between now()+interval '7 days'-interval '5 seconds' and now()+interval '7 days'+interval '5 seconds' ok from licenses where organization_id=$1",[shop2])).rows[0].ok);
 let leapYear=new Date().getUTCFullYear()+4;
 while(leapYear%4!==0 || (leapYear%100===0 && leapYear%400!==0))leapYear++;
 const durations=[
  [3,`${leapYear}-01-31T12:00:00Z`,`${leapYear}-04-30T12:00:00Z`],
  [6,`${leapYear}-08-31T12:00:00Z`,`${leapYear+1}-02-28T12:00:00Z`],
  [12,`${leapYear}-02-29T12:00:00Z`,`${leapYear+1}-02-28T12:00:00Z`],
 ];
 for(const [months,start,expected] of durations){
  const raw='FZ-duration-'+months+'-'+'q'.repeat(64),ref='filezuno:'+String(123456789012350+months);
  await db.query('insert into extensions.test_hashes values($1,decode($2,\'hex\'))',[raw,hash(raw)]);
  await db.exec('set role service_role');assert.equal((await issue(ref,raw,sub,months)).months,months);await db.exec('reset role');
  await db.query('update licenses set expires_at=$1::timestamptz where organization_id=$2',[start,shop]);
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.query('select redeem_license($1,$2)',[shop,raw]);
  await assert.rejects(()=>db.query('select redeem_license($1,$2)',[shop,raw]));
  await db.exec('reset role');
  assert((await db.query('select expires_at=$1::timestamptz ok from licenses where organization_id=$2',[expected,shop])).rows[0].ok,months+' calendar months incl month-end/leap-day');
 }
 console.log('PASS actual PostgreSQL migration: service-only issuance, idempotence, immutable binding, private RLS/grants, buyer/shop isolation, single-use, 1/3/6/12-calendar-month renewal with month-end/leap-day clamping, legacy keys');
}finally{await db.close();}
