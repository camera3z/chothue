-- Apply after public_storefront migration. Do not rerun the original schema.
begin;
alter table public.records add column if not exists version bigint not null default 0;
create table if not exists public.rental_requests (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
 asset_id text not null, customer_name text not null, phone text not null,
 starts_at timestamptz not null, ends_at timestamptz not null, quantity integer not null check(quantity>0),
 note text not null default '', estimated_total numeric not null default 0,
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid,
 review_note text not null default '', contract_id text, final_total numeric, deposit_required numeric,
 check(ends_at>starts_at)
);
alter table public.rental_requests add column if not exists cancel_token uuid not null default gen_random_uuid();
create index if not exists rental_requests_shop_created on public.rental_requests(organization_id,created_at desc);
create index if not exists rental_requests_phone_created on public.rental_requests(organization_id,phone,created_at desc);
alter table public.rental_requests enable row level security;
drop policy if exists rental_requests_owner_read on public.rental_requests;
create policy rental_requests_owner_read on public.rental_requests for select to authenticated
using(exists(select 1 from public.members m where m.organization_id=rental_requests.organization_id and m.user_id=auth.uid()));
revoke all on public.rental_requests from anon,authenticated;
grant select on public.rental_requests to authenticated;

-- Canonical capacity calculation. New bookings use half-open [start,end) timestamps.
-- Legacy date-only contracts include their entire end day in Asia/Bangkok.
create or replace function public.rental_peak(p_data jsonb,p_asset text,p_start timestamptz,p_end timestamptz,p_exclude text default '')
returns numeric language sql stable set search_path=public as $$
 with spans as (
  select coalesce((c->>'quantity')::numeric,0) q,
   case when c->>'status'='active' then least(coalesce((c->>'rentalStart')::timestamptz,(c->>'start')::date::timestamp at time zone 'Asia/Bangkok','-infinity'::timestamptz),now())
    else coalesce((c->>'rentalStart')::timestamptz,(c->>'start')::date::timestamp at time zone 'Asia/Bangkok','-infinity'::timestamptz) end s,
   case when c->>'status'='active' and coalesce((c->>'rentalEnd')::timestamptz,((c->>'end')::date+1)::timestamp at time zone 'Asia/Bangkok','infinity'::timestamptz)<=now() then 'infinity'::timestamptz
    else coalesce((c->>'rentalEnd')::timestamptz,((c->>'end')::date+1)::timestamp at time zone 'Asia/Bangkok','infinity'::timestamptz) end e
  from jsonb_array_elements(coalesce(p_data->'contracts','[]'::jsonb)) c
  where c->>'assetId'=p_asset and c->>'status' in ('active','reserved') and coalesce(c->>'id','')<>p_exclude
 ), events as (
  select greatest(s,p_start) t,q delta from spans where s<p_end and e>p_start
  union all select least(e,p_end),-q from spans where s<p_end and e>p_start
 ), grouped as(select t,sum(delta) delta from events group by t), running as(select sum(delta) over(order by t) n from grouped)
 select coalesce(max(n),0) from running;
$$;
revoke all on function public.rental_peak(jsonb,text,timestamptz,timestamptz,text) from public;

create or replace function public.check_rental_capacity(p_data jsonb,p_asset text,p_start timestamptz,p_end timestamptz,p_qty integer,p_exclude text default '')
returns void language plpgsql stable set search_path=public as $$
declare a jsonb; capacity numeric;
begin
 if p_start is null or p_end is null or p_end<=p_start or p_end<=now() or p_end>p_start+interval '366 days' or p_qty is null or p_qty<1 or p_qty>10000 then raise exception 'Thoi gian hoac so luong khong hop le.'; end if;
 select item into a from jsonb_array_elements(coalesce(p_data->'assets','[]'::jsonb)) item where item->>'id'=p_asset;
 if a is null then raise exception 'Tai san khong con ton tai.'; end if;
 capacity:=coalesce((a->>'quantity')::numeric,0)-coalesce((a->>'maintenance')::numeric,0);
 if public.rental_peak(p_data,p_asset,p_start,p_end,p_exclude)+p_qty>capacity then raise exception 'Khong du tai san trong khoang thoi gian nay. Hay doi lich hoac so luong.'; end if;
end $$;
revoke all on function public.check_rental_capacity(jsonb,text,timestamptz,timestamptz,integer,text) from public;

create or replace function public.submit_rental_request(p_shop uuid,p_request uuid,p_asset text,p_name text,p_phone text,p_start timestamptz,p_end timestamptz,p_quantity integer,p_note text default '',p_website text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare doc jsonb; a jsonb; phone_clean text; estimate numeric; seconds numeric; existing public.rental_requests%rowtype;
begin
 if length(coalesce(p_website,''))>0 then raise exception 'Yeu cau khong hop le.'; end if;
 if p_request is null or length(trim(coalesce(p_name,''))) not between 2 and 120 or length(coalesce(p_note,''))>1500 then raise exception 'Ten hoac ghi chu khong hop le.'; end if;
 phone_clean:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(phone_clean) not between 9 and 15 then raise exception 'So dien thoai can tu 9 den 15 chu so.'; end if;
 if p_start is null or p_start<now()-interval '15 minutes' or p_start>now()+interval '730 days' then raise exception 'Ngay bat dau phai tu hien tai, trong vong hai nam.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text,17));
 if not exists(select 1 from public.storefronts s join public.licenses l using(organization_id) where s.organization_id=p_shop and s.enabled and l.expires_at>now()) then raise exception 'Shop chua mo nhan yeu cau.'; end if;
 select * into existing from public.rental_requests where id=p_request;
 if found then
  if existing.organization_id=p_shop and existing.phone=phone_clean and existing.asset_id=p_asset and existing.starts_at=p_start and existing.ends_at=p_end and existing.quantity=p_quantity and existing.customer_name=trim(p_name) then
   return jsonb_build_object('id',existing.id,'status','received');
  end if;
  raise exception 'Ma yeu cau khong hop le.';
 end if;
 if (select count(*) from public.rental_requests where organization_id=p_shop and created_at>now()-interval '1 hour')>=100
 or (select count(*) from public.rental_requests where organization_id=p_shop and phone=phone_clean and created_at>now()-interval '1 hour')>=3 then raise exception 'Da dat gioi han gui yeu cau. Vui long lien he shop hoac thu lai sau.'; end if;
 if exists(select 1 from public.rental_requests where organization_id=p_shop and phone=phone_clean and asset_id=p_asset and starts_at=p_start and ends_at=p_end and status='pending') then raise exception 'Ban da gui yeu cau nay. Vui long cho shop lien he.'; end if;
 select data into doc from public.records where organization_id=p_shop;
 perform public.check_rental_capacity(doc,p_asset,p_start,p_end,p_quantity);
 select item into a from jsonb_array_elements(doc->'assets') item where item->>'id'=p_asset;
 seconds:=case a->>'unit' when 'giờ' then 3600 when 'tuần' then 604800 when 'tháng' then 2592000 when 'lượt' then extract(epoch from p_end-p_start) else 86400 end;
 estimate:=coalesce((a->>'price')::numeric,0)*greatest(1,ceil(extract(epoch from p_end-p_start)/seconds))*p_quantity;
 insert into public.rental_requests(id,organization_id,asset_id,customer_name,phone,starts_at,ends_at,quantity,note,estimated_total)
 values(p_request,p_shop,p_asset,trim(p_name),phone_clean,p_start,p_end,p_quantity,trim(coalesce(p_note,'')),estimate) returning * into existing;
 return jsonb_build_object('id',p_request,'status','received','estimated_total',estimate,'cancel_token',existing.cancel_token);
end $$;
revoke all on function public.submit_rental_request(uuid,uuid,text,text,text,timestamptz,timestamptz,integer,text,text) from public;
grant execute on function public.submit_rental_request(uuid,uuid,text,text,text,timestamptz,timestamptz,integer,text,text) to anon,authenticated;

create or replace function public.review_rental_request(p_shop uuid,p_request uuid,p_decision text,p_name text,p_phone text,p_start timestamptz,p_end timestamptz,p_quantity integer,p_total numeric,p_deposit numeric,p_terms text default '')
returns text language plpgsql security definer set search_path=public as $$
declare doc jsonb; req public.rental_requests%rowtype; cid text; contract text; phone_clean text; c jsonb;
begin
 if not exists(select 1 from public.members m join public.licenses l using(organization_id) where m.organization_id=p_shop and m.user_id=auth.uid() and l.expires_at>now()) then raise exception 'Khong co quyen hoac key da het han.'; end if;
 select data into doc from public.records where organization_id=p_shop for update;
 if not found then raise exception 'Khong tim thay du lieu shop.'; end if;
 select * into req from public.rental_requests where id=p_request and organization_id=p_shop for update;
 if not found or req.status<>'pending' then raise exception 'Yeu cau da xu ly hoac khong ton tai.'; end if;
 if p_decision not in ('approve','reject') or p_decision is null or length(coalesce(p_terms,''))>4000 then raise exception 'Quyet dinh hoac dieu khoan khong hop le.'; end if;
 if p_decision='reject' then update public.rental_requests set status='rejected',review_note=coalesce(p_terms,''),reviewed_at=now(),reviewed_by=auth.uid() where id=p_request;return '';end if;
 phone_clean:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(trim(coalesce(p_name,''))) not between 2 and 120 or length(phone_clean) not between 9 and 15 or p_total is null or p_deposit is null or p_total<0 or p_deposit<0 or p_total>100000000000 or p_deposit>100000000000 then raise exception 'Thong tin khach, tien thue hoac tien coc khong hop le.'; end if;
 if p_end<=now() then raise exception 'Thoi gian thue da qua. Hay thoa thuan lai voi khach.'; end if;
 perform public.check_rental_capacity(doc,req.asset_id,p_start,p_end,p_quantity);
 select item->>'id' into cid from jsonb_array_elements(coalesce(doc->'customers','[]'::jsonb)) item where regexp_replace(coalesce(item->>'phone',''),'[^0-9]','','g')=phone_clean limit 1;
 if cid is null then cid:=gen_random_uuid()::text;doc:=jsonb_set(doc,'{customers}',coalesce(doc->'customers','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',cid,'name',trim(p_name),'phone',phone_clean,'email','')));end if;
 contract:=gen_random_uuid()::text;
 c:=jsonb_build_object('id',contract,'code','WEB-'||upper(left(p_request::text,8)),'assetId',req.asset_id,'customerId',cid,'quantity',p_quantity,'start',to_char(p_start at time zone 'Asia/Bangkok','YYYY-MM-DD'),'end',to_char(p_end at time zone 'Asia/Bangkok','YYYY-MM-DD'),'rentalStart',p_start,'rentalEnd',p_end,'status','reserved','total',p_total,'paid',0,'deposit',0,'depositRequired',p_deposit,'depositRefunded',0,'transactions','[]'::jsonb,'handoverNote',coalesce(p_terms,''),'requestId',p_request,'agreedCustomerName',trim(p_name),'agreedPhone',phone_clean);
 doc:=jsonb_set(doc,'{contracts}',coalesce(doc->'contracts','[]'::jsonb)||jsonb_build_array(c));
 update public.records set data=doc,version=version+1 where organization_id=p_shop;
 update public.rental_requests set status='approved',customer_name=trim(p_name),phone=phone_clean,starts_at=p_start,ends_at=p_end,quantity=p_quantity,final_total=p_total,deposit_required=p_deposit,review_note=coalesce(p_terms,''),reviewed_at=now(),reviewed_by=auth.uid(),contract_id=contract where id=p_request;
 return contract;
end $$;
revoke all on function public.review_rental_request(uuid,uuid,text,text,text,timestamptz,timestamptz,integer,numeric,numeric,text) from public;
grant execute on function public.review_rental_request(uuid,uuid,text,text,text,timestamptz,timestamptz,integer,numeric,numeric,text) to authenticated;

-- Secret per-request links allow only status lookup and pending cancellation.
create or replace function public.public_rental_request_status(p_shop uuid,p_request uuid,p_token uuid)
returns text language sql stable security definer set search_path=public as $$
 select status from public.rental_requests where organization_id=p_shop and id=p_request and cancel_token=p_token;
$$;
create or replace function public.cancel_public_rental_request(p_shop uuid,p_request uuid,p_token uuid)
returns text language plpgsql security definer set search_path=public as $$
declare r public.rental_requests%rowtype;
begin
 select * into r from public.rental_requests where organization_id=p_shop and id=p_request and cancel_token=p_token for update;
 if not found then raise exception 'Lien ket khong hop le.';end if;
 if r.status='cancelled' then return 'cancelled';end if;
 if r.status<>'pending' then raise exception 'Yeu cau da duoc xu ly. Vui long lien he shop.';end if;
 update public.rental_requests set status='cancelled',review_note='Khach huy qua lien ket rieng',reviewed_at=now() where id=p_request;
 return 'cancelled';
end $$;
revoke all on function public.public_rental_request_status(uuid,uuid,uuid) from public;
revoke all on function public.cancel_public_rental_request(uuid,uuid,uuid) from public;
grant execute on function public.public_rental_request_status(uuid,uuid,uuid) to anon,authenticated;
grant execute on function public.cancel_public_rental_request(uuid,uuid,uuid) to anon,authenticated;

-- Every edit uses optimistic versioning under the SAME row lock as approval.
-- Old tabs cannot overwrite a newly approved contract.
create or replace function public.save_rental_records(p_shop uuid,p_expected bigint,p_data jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare old_data jsonb; v bigint; c jsonb; old_contract jsonb; qty numeric;
begin
 if not exists(select 1 from public.members m join public.licenses l using(organization_id) where m.organization_id=p_shop and m.user_id=auth.uid() and l.expires_at>now()) then raise exception 'Khong co quyen hoac key da het han.'; end if;
 select data,version into old_data,v from public.records where organization_id=p_shop for update;
 if not found or p_expected is distinct from v then raise exception 'Du lieu da thay doi. Tai lai trang truoc khi luu de tranh ghi de.';end if;
 if jsonb_typeof(p_data->'assets') is distinct from 'array' or jsonb_typeof(p_data->'customers') is distinct from 'array' or jsonb_typeof(p_data->'contracts') is distinct from 'array' then raise exception 'Du lieu khong hop le.';end if;
 -- Validate NEW allocations and maintenance against reservations in the same transaction.
 for c in select * from jsonb_array_elements(p_data->'contracts') loop
  select item into old_contract from jsonb_array_elements(old_data->'contracts') item where item->>'id'=c->>'id';
  if c->>'status' in ('active','reserved') and (old_contract is null or (c->'quantity',c->'assetId',c->'rentalStart',c->'rentalEnd',c->'start',c->'end',c->'status') is distinct from (old_contract->'quantity',old_contract->'assetId',old_contract->'rentalStart',old_contract->'rentalEnd',old_contract->'start',old_contract->'end',old_contract->'status')) then
   perform public.check_rental_capacity(p_data,c->>'assetId',case when c->>'status'='active' then least(coalesce((c->>'rentalStart')::timestamptz,(c->>'start')::date::timestamp at time zone 'Asia/Bangkok'),now()) else (c->>'rentalStart')::timestamptz end,coalesce((c->>'rentalEnd')::timestamptz,((c->>'end')::date+1)::timestamp at time zone 'Asia/Bangkok'),(c->>'quantity')::integer,c->>'id');
  end if;
 end loop;
 for c in select * from jsonb_array_elements(p_data->'assets') loop
  select item into old_contract from jsonb_array_elements(old_data->'assets') item where item->>'id'=c->>'id';
  if old_contract is not null and (c->'maintenance',c->'quantity') is distinct from (old_contract->'maintenance',old_contract->'quantity') then
   qty:=public.rental_peak(p_data,c->>'id',now(),'infinity'::timestamptz);
   if coalesce((c->>'quantity')::numeric,0)-coalesce((c->>'maintenance')::numeric,0)<qty then raise exception 'Ton sau bao tri khong du cho lich thue da duyet.';end if;
  end if;
 end loop;
 update public.records set data=p_data,version=v+1 where organization_id=p_shop;
 return v+1;
end $$;
revoke all on function public.save_rental_records(uuid,bigint,jsonb) from public;
grant execute on function public.save_rental_records(uuid,bigint,jsonb) to authenticated;
revoke insert,update,delete on public.records from anon,authenticated;

create or replace function public.get_public_storefront(p_shop uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('name',s.name,'assets',coalesce((
  select jsonb_agg(jsonb_build_object('id',a->>'id','name',a->>'name','category',a->>'category','price',coalesce((a->>'price')::numeric,0),'unit',a->>'unit','available',stock.available,'imagePath',case when a->>'imagePath' like p_shop::text||'/%' then a->>'imagePath' else null end))
  from jsonb_array_elements(coalesce(r.data->'assets','[]'::jsonb)) a
  cross join lateral(select coalesce((a->>'quantity')::numeric,0)-coalesce((a->>'maintenance')::numeric,0)-coalesce((select sum((c->>'quantity')::numeric) from jsonb_array_elements(coalesce(r.data->'contracts','[]'::jsonb)) c where c->>'assetId'=a->>'id' and (c->>'status'='active' or (c->>'status'='reserved' and (c->>'rentalStart')::timestamptz<=now() and (c->>'rentalEnd')::timestamptz>now()))),0) available) stock
  where stock.available>0
 ),'[]'::jsonb)) from public.storefronts s join public.licenses l on l.organization_id=s.organization_id and l.expires_at>now() join public.records r on r.organization_id=s.organization_id where s.organization_id=p_shop and s.enabled;
$$;
commit;
