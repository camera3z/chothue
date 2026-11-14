-- Derive hidden end dates on the server; do not rewrite existing requests.
begin;
create or replace function public.check_rental_capacity(p_data jsonb,p_asset text,p_start timestamptz,p_end timestamptz,p_qty integer,p_exclude text default '')
returns void language plpgsql stable set search_path=public as $$
declare a jsonb; capacity numeric;
begin
 if p_start is null or p_end is null or p_end<=p_start or p_end<=now() or p_end>p_start+interval '10 years' or p_qty is null or p_qty<1 or p_qty>10000 then raise exception 'Thoi gian hoac so luong khong hop le.'; end if;
 select item into a from jsonb_array_elements(coalesce(p_data->'assets','[]'::jsonb)) item where item->>'id'=p_asset;
 if a is null then raise exception 'Tai san khong con ton tai.'; end if;
 capacity:=coalesce((a->>'quantity')::numeric,0)-coalesce((a->>'maintenance')::numeric,0);
 if public.rental_peak(p_data,p_asset,p_start,p_end,p_exclude)+p_qty>capacity then raise exception 'Khong du tai san trong khoang thoi gian nay. Hay doi lich hoac so luong.'; end if;
end $$;
revoke all on function public.check_rental_capacity(jsonb,text,timestamptz,timestamptz,integer,text) from public;

create or replace function public.submit_rental_request_v2(p_shop uuid,p_request uuid,p_asset text,p_name text,p_phone text,p_address text,p_start_date date,p_end_date date,p_quantity integer,p_billing_unit text,p_periods numeric default null,p_note text default '',p_website text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare doc jsonb; a jsonb; phone_clean text; estimate numeric; seconds numeric; existing public.rental_requests%rowtype; p_start timestamptz; p_end timestamptz; count_periods numeric; quoted_price numeric;
begin
 if p_billing_unit in ('tháng','năm') then
  if p_periods is null or p_periods<=0 or p_periods>10000 or p_periods*100<>trunc(p_periods*100) then raise exception 'So thang/nam khong hop le.';end if;
  seconds:=ceil(p_periods*(case p_billing_unit when 'tháng' then 30 else 365 end));
  if seconds>3650 then raise exception 'Thoi gian thue toi da 3650 ngay.';end if;
  p_end_date:=p_start_date+seconds::integer-1;
 elsif p_start_date is not null and p_end_date is not null and p_end_date-p_start_date+1>366 then
  raise exception 'Dat thue theo ngay toi da 366 ngay.';
 end if;
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
 return jsonb_build_object('id',p_request,'status','received','estimated_total',estimate,'cancel_token',existing.cancel_token,'requested_end_date',p_end_date);
end $$;
revoke all on function public.submit_rental_request_v2(uuid,uuid,text,text,text,text,date,date,integer,text,numeric,text,text) from public;
grant execute on function public.submit_rental_request_v2(uuid,uuid,text,text,text,text,date,date,integer,text,numeric,text,text) to anon,authenticated;

commit;
notify pgrst, 'reload schema';
