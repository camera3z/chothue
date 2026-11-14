-- Apply after booking_requests.sql. Existing requests remain readable and use the old API.
begin;
alter table public.rental_requests add column if not exists customer_address text not null default '';
alter table public.rental_requests add column if not exists requested_start_date date;
alter table public.rental_requests add column if not exists requested_end_date date;
alter table public.rental_requests add column if not exists billing_unit text;
alter table public.rental_requests add column if not exists billing_periods numeric;
alter table public.rental_requests add column if not exists quoted_unit_price numeric;
create or replace function public.listing_unit_price(p_price numeric,p_source text,p_target text)
returns numeric language plpgsql immutable set search_path=public as $$
declare source_days numeric;target_days numeric;
begin
 if p_price is null or p_price<0 then raise exception 'Don gia tai san khong hop le.';end if;
 if p_source='lượt' and p_target='lượt' then return round(p_price);end if;
 source_days:=case p_source when 'giờ' then 1::numeric/24 when 'ngày' then 1 when 'tuần' then 7 when 'tháng' then 30 when 'năm' then 365 else null end;
 target_days:=case p_target when 'ngày' then 1 when 'tháng' then 30 when 'năm' then 365 else null end;
 if source_days is null or target_days is null then raise exception 'Khong the quy doi don vi nay. Vui long lien he shop.';end if;
 return round(p_price*target_days/source_days);
end $$;
revoke all on function public.listing_unit_price(numeric,text,text) from public,anon,authenticated;
create or replace function public.submit_rental_request_v2(p_shop uuid,p_request uuid,p_asset text,p_name text,p_phone text,p_address text,p_start_date date,p_end_date date,p_quantity integer,p_billing_unit text,p_periods numeric default null,p_note text default '',p_website text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare doc jsonb; a jsonb; phone_clean text; estimate numeric; seconds numeric; existing public.rental_requests%rowtype; p_start timestamptz; p_end timestamptz; count_periods numeric; quoted_price numeric;
begin
 p_start:=p_start_date::timestamp at time zone 'Asia/Bangkok';
 p_end:=(p_end_date+1)::timestamp at time zone 'Asia/Bangkok';
 if length(coalesce(p_address,''))>500 then raise exception 'Dia chi toi da 500 ky tu.';end if;
 if length(coalesce(p_website,''))>0 then raise exception 'Yeu cau khong hop le.'; end if;
 if p_request is null or length(trim(coalesce(p_name,''))) not between 2 and 120 or length(coalesce(p_note,''))>1500 then raise exception 'Ten hoac ghi chu khong hop le.'; end if;
 phone_clean:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(phone_clean) not between 9 and 15 then raise exception 'So dien thoai can tu 9 den 15 chu so.'; end if;
 if p_start_date is null or p_end_date is null or p_start_date<(now() at time zone 'Asia/Bangkok')::date or p_start_date>(now() at time zone 'Asia/Bangkok')::date+730 or p_end_date<p_start_date then raise exception 'Ngay bat dau phai tu hien tai, trong vong hai nam.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text,17));
 if not exists(select 1 from public.storefronts s join public.licenses l using(organization_id) where s.organization_id=p_shop and s.enabled and l.expires_at>now()) then raise exception 'Shop chua mo nhan yeu cau.'; end if;
 select * into existing from public.rental_requests where id=p_request;
 if found then
  if existing.organization_id=p_shop and existing.phone=phone_clean and existing.asset_id=p_asset and existing.starts_at=p_start and existing.ends_at=p_end and existing.quantity=p_quantity and existing.customer_name=trim(p_name) and existing.customer_address=trim(coalesce(p_address,'')) and existing.billing_unit=p_billing_unit and existing.billing_periods=(case when p_billing_unit='ngày' then p_end_date-p_start_date+1 else p_periods end) then
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
 if p_billing_unit not in ('ngày','tháng','năm','lượt') or p_billing_unit is null then raise exception 'Don vi tinh khong hop le.';end if;
 quoted_price:=public.listing_unit_price((a->>'price')::numeric,a->>'unit',p_billing_unit);
 count_periods:=case when p_billing_unit='ngày' then p_end_date-p_start_date+1 else p_periods end;
 if count_periods is null or count_periods<=0 or count_periods>10000 or count_periods*100<>trunc(count_periods*100) then raise exception 'So ky phai lon hon 0, toi da 10000, toi da hai chu so thap phan.';end if;
 estimate:=round(quoted_price*count_periods*p_quantity);
 if estimate>100000000000 then raise exception 'Tong du kien vuot gioi han. Vui long lien he shop.';end if;
 insert into public.rental_requests(id,organization_id,asset_id,customer_name,phone,starts_at,ends_at,quantity,note,estimated_total,customer_address,requested_start_date,requested_end_date,billing_unit,billing_periods,quoted_unit_price)
 values(p_request,p_shop,p_asset,trim(p_name),phone_clean,p_start,p_end,p_quantity,trim(coalesce(p_note,'')),estimate,trim(coalesce(p_address,'')),p_start_date,p_end_date,p_billing_unit,count_periods,quoted_price) returning * into existing;
 return jsonb_build_object('id',p_request,'status','received','estimated_total',estimate,'cancel_token',existing.cancel_token);
end $$;
revoke all on function public.submit_rental_request_v2(uuid,uuid,text,text,text,text,date,date,integer,text,numeric,text,text) from public;
grant execute on function public.submit_rental_request_v2(uuid,uuid,text,text,text,text,date,date,integer,text,numeric,text,text) to anon,authenticated;

create or replace function public.review_rental_request_v2(p_shop uuid,p_request uuid,p_decision text,p_name text,p_phone text,p_address text,p_start_date date,p_end_date date,p_quantity integer,p_total numeric,p_advance numeric,p_terms text default '')
returns text language plpgsql security definer set search_path=public as $$
declare req public.rental_requests%rowtype;contract text;doc jsonb;
begin
 if not exists(select 1 from public.members m where m.organization_id=p_shop and m.user_id=auth.uid()) then raise exception 'Khong co quyen.';end if;
 if length(coalesce(p_address,''))>500 then raise exception 'Dia chi toi da 500 ky tu.';end if;
 select * into req from public.rental_requests where id=p_request and organization_id=p_shop;
 if not found or req.requested_start_date is null then raise exception 'Yeu cau khong hop le.';end if;
 if p_decision='approve' and (p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_advance>p_total) then raise exception 'Lich hoac tien tra truoc khong hop le.';end if;
 contract:=public.review_rental_request(p_shop,p_request,p_decision,p_name,p_phone,p_start_date::timestamp at time zone 'Asia/Bangkok',(p_end_date+1)::timestamp at time zone 'Asia/Bangkok',p_quantity,p_total,p_advance,p_terms);
 update public.rental_requests set customer_address=trim(coalesce(p_address,'')),requested_start_date=p_start_date,requested_end_date=p_end_date where id=p_request;
 if p_decision='approve' then
  select data into doc from public.records where organization_id=p_shop for update;
  doc:=jsonb_set(doc,'{contracts}',(select jsonb_agg(case when c->>'id'=contract then c||jsonb_build_object('start',p_start_date::text,'end',p_end_date::text,'agreedAddress',trim(coalesce(p_address,'')),'requestedUnit',req.billing_unit,'requestedPeriods',req.billing_periods,'quotedUnitPrice',req.quoted_unit_price) else c end) from jsonb_array_elements(doc->'contracts') c));
  doc:=jsonb_set(doc,'{customers}',(select jsonb_agg(case when c->>'id'=(select b->>'customerId' from jsonb_array_elements(doc->'contracts') b where b->>'id'=contract) and coalesce(c->>'address','')='' then c||jsonb_build_object('address',trim(coalesce(p_address,''))) else c end) from jsonb_array_elements(doc->'customers') c));
  update public.records set data=doc,version=version+1 where organization_id=p_shop;
 end if;
 return contract;
end $$;
revoke all on function public.review_rental_request_v2(uuid,uuid,text,text,text,text,date,date,integer,numeric,numeric,text) from public;
grant execute on function public.review_rental_request_v2(uuid,uuid,text,text,text,text,date,date,integer,numeric,numeric,text) to authenticated;
commit;

notify pgrst, 'reload schema';
