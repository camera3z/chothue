-- Account-bound monthly keys sold by Filezuno. Keeps legacy keys and data.
begin;
create schema if not exists filezuno_private;
revoke all on schema filezuno_private from public,anon,authenticated;
create table if not exists filezuno_private.paid_keys(
 order_ref text primary key,
 license_key_id uuid unique not null references public.license_keys(id),
 key_hash text unique not null check(key_hash ~ '^[0-9a-f]{64}$'),
 customer_subject text not null,
 duration_months integer not null check(duration_months between 1 and 120),
 created_at timestamptz not null default now()
);
alter table filezuno_private.paid_keys enable row level security;
revoke all on filezuno_private.paid_keys from public,anon,authenticated;

create or replace function public.filezuno_license_ready() returns integer
language sql stable security invoker set search_path='' as $$ select 1 $$;
revoke all on function public.filezuno_license_ready() from public,anon,authenticated;
grant execute on function public.filezuno_license_ready() to service_role;

create or replace function public.issue_filezuno_license(p_order_ref text,p_key_hash text,p_subject text,p_months integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing filezuno_private.paid_keys%rowtype; key_id uuid;
begin
 if p_order_ref is null or p_order_ref !~ '^filezuno:[0-9]{14,16}$'
 or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
 or p_subject is null or p_subject !~ '^[A-Za-z0-9_-]{24,100}$'
 or p_months is null or p_months not between 1 and 120 then
   raise exception 'Invalid Filezuno license request';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_ref,0));
 select * into existing from filezuno_private.paid_keys where order_ref=p_order_ref;
 if found then
   if existing.key_hash is distinct from p_key_hash or existing.customer_subject is distinct from p_subject or existing.duration_months is distinct from p_months then
     raise exception 'Order license binding does not match';
   end if;
 else
   insert into public.license_keys(key_hash,duration_days) values(p_key_hash,30) returning id into key_id;
   insert into filezuno_private.paid_keys(order_ref,license_key_id,key_hash,customer_subject,duration_months)
     values(p_order_ref,key_id,p_key_hash,p_subject,p_months);
 end if;
 return jsonb_build_object('order_ref',p_order_ref,'key_hash',p_key_hash,'subject',p_subject,'months',p_months);
end $$;
revoke all on function public.issue_filezuno_license(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.issue_filezuno_license(text,text,text,integer) to service_role;

create or replace function public.redeem_license(p_organization uuid,p_key text)
returns void language plpgsql security definer set search_path='' as $$
declare k public.license_keys%rowtype; paid filezuno_private.paid_keys%rowtype; duration interval;
begin
 if auth.uid() is null or not exists(select 1 from public.members where organization_id=p_organization and user_id=auth.uid()) then
   raise exception 'Không có quyền truy cập';
 end if;
 if p_key is null or length(p_key) not between 24 and 256 then raise exception 'Key không hợp lệ'; end if;
 select * into k from public.license_keys where key_hash=encode(extensions.digest(p_key,'sha256'),'hex') for update;
 if not found or k.redeemed_at is not null then raise exception 'Key không hợp lệ hoặc đã được sử dụng'; end if;
 select * into paid from filezuno_private.paid_keys where license_key_id=k.id;
 if found then
   if not exists(select 1 from auth.identities where user_id=auth.uid() and provider='custom:filezuno' and provider_id=paid.customer_subject) then
     raise exception 'Hãy đăng nhập bằng đúng tài khoản Filezuno đã mua key';
   end if;
   duration=make_interval(months=>paid.duration_months);
 else
   duration=make_interval(days=>k.duration_days);
 end if;
 insert into public.licenses(organization_id,expires_at) values(p_organization,now()+duration)
 on conflict(organization_id) do update set expires_at=greatest(public.licenses.expires_at,now())+duration;
 update public.license_keys set redeemed_by=p_organization,redeemed_at=now() where id=k.id;
end $$;
revoke all on function public.redeem_license(uuid,text) from public,anon;
grant execute on function public.redeem_license(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
