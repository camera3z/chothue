-- Fixed conversion for NEW public estimates only. Existing requests/contracts are unchanged.
begin;
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
 seconds:=case a->>'unit' when 'giờ' then 3600 when 'tuần' then 604800 when 'tháng' then 2592000 when 'năm' then 31536000 when 'lượt' then extract(epoch from p_end-p_start) else 86400 end;
 estimate:=round(coalesce((a->>'price')::numeric,0)*p_quantity*(case a->>'unit' when 'tháng' then greatest(1,ceil(extract(epoch from p_end-p_start)/86400))/30 when 'năm' then greatest(1,ceil(extract(epoch from p_end-p_start)/86400))/365 else greatest(1,ceil(extract(epoch from p_end-p_start)/seconds)) end));
 insert into public.rental_requests(id,organization_id,asset_id,customer_name,phone,starts_at,ends_at,quantity,note,estimated_total)
 values(p_request,p_shop,p_asset,trim(p_name),phone_clean,p_start,p_end,p_quantity,trim(coalesce(p_note,'')),estimate) returning * into existing;
 return jsonb_build_object('id',p_request,'status','received','estimated_total',estimate,'cancel_token',existing.cancel_token);
end $$;
revoke all on function public.submit_rental_request(uuid,uuid,text,text,text,timestamptz,timestamptz,integer,text,text) from public;
grant execute on function public.submit_rental_request(uuid,uuid,text,text,text,timestamptz,timestamptz,integer,text,text) to anon,authenticated;

commit;
