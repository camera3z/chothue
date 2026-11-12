begin;
create table if not exists public.storefronts (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 enabled boolean not null default false
);
alter table public.storefronts enable row level security;
drop policy if exists storefront_owner_read on public.storefronts;
create policy storefront_owner_read on public.storefronts for select to authenticated
using(exists(select 1 from public.members m where m.organization_id=storefronts.organization_id and m.user_id=auth.uid()));
drop policy if exists storefront_owner_write on public.storefronts;
create policy storefront_owner_write on public.storefronts for all to authenticated
using(exists(select 1 from public.members m join public.licenses l using(organization_id) where m.organization_id=storefronts.organization_id and m.user_id=auth.uid() and l.expires_at>now()))
with check(exists(select 1 from public.members m join public.licenses l using(organization_id) where m.organization_id=storefronts.organization_id and m.user_id=auth.uid() and l.expires_at>now()));
revoke all on public.storefronts from anon;
grant select,insert,update on public.storefronts to authenticated;

-- Anonymous visitors receive only an explicit safe projection, never records itself.
create or replace function public.get_public_storefront(p_shop uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('name',s.name,'assets',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',a->>'id','name',a->>'name','category',a->>'category',
   'price',coalesce((a->>'price')::numeric,0),'unit',a->>'unit',
   'available',stock.available,
   'imagePath',case when a->>'imagePath' like p_shop::text||'/%' then a->>'imagePath' else null end
  ))
  from jsonb_array_elements(coalesce(r.data->'assets','[]'::jsonb)) a
  cross join lateral (select coalesce((a->>'quantity')::numeric,0)
   - coalesce((a->>'maintenance')::numeric,0)
   - coalesce((select sum((c->>'quantity')::numeric)
      from jsonb_array_elements(coalesce(r.data->'contracts','[]'::jsonb)) c
      where c->>'assetId'=a->>'id' and c->>'status'='active'),0) as available) stock
  where stock.available>0
 ),'[]'::jsonb))
 from public.storefronts s
 join public.licenses l on l.organization_id=s.organization_id and l.expires_at>now()
 join public.records r on r.organization_id=s.organization_id
 where s.organization_id=p_shop and s.enabled=true;
$$;
revoke all on function public.get_public_storefront(uuid) from public;
grant execute on function public.get_public_storefront(uuid) to anon,authenticated;

-- Allow viewing only images referenced by currently available, published assets.
create or replace function public.is_public_asset_image(p_path text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare oid uuid;
begin
 begin oid:=split_part(p_path,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 return exists(select 1 from jsonb_array_elements(coalesce(public.get_public_storefront(oid)->'assets','[]'::jsonb)) a where a->>'imagePath'=p_path);
end $$;
revoke all on function public.is_public_asset_image(text) from public;
grant execute on function public.is_public_asset_image(text) to anon,authenticated;
drop policy if exists asset_images_public_storefront_read on storage.objects;
create policy asset_images_public_storefront_read on storage.objects for select to anon,authenticated
using(bucket_id='asset-images' and public.is_public_asset_image(name));
commit;
