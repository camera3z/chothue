-- Run once in the SQL editor of a NEW, dedicated Supabase project.
create extension if not exists pgcrypto with schema extensions;
create table public.organizations(id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table public.members(organization_id uuid references public.organizations on delete cascade, user_id uuid references auth.users on delete cascade, primary key(organization_id,user_id), unique(user_id));
create table public.records(organization_id uuid primary key references public.organizations on delete cascade, data jsonb not null default '{"assets":[],"customers":[],"contracts":[]}'::jsonb, check(jsonb_typeof(data->'assets')='array' and jsonb_typeof(data->'customers')='array' and jsonb_typeof(data->'contracts')='array'));
create table public.licenses(organization_id uuid primary key references public.organizations on delete cascade, expires_at timestamptz not null);
create table public.license_keys(id uuid primary key default gen_random_uuid(), key_hash text unique not null, duration_days integer not null check(duration_days between 1 and 3660), redeemed_by uuid references public.organizations, redeemed_at timestamptz, created_at timestamptz not null default now());
alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.records enable row level security;
alter table public.licenses enable row level security;
alter table public.license_keys enable row level security;
create policy member_self on public.members for select to authenticated using(user_id=auth.uid());
create policy organization_read on public.organizations for select to authenticated using(exists(select 1 from public.members m where m.organization_id=id and m.user_id=auth.uid()));
create policy license_read on public.licenses for select to authenticated using(exists(select 1 from public.members m where m.organization_id=licenses.organization_id and m.user_id=auth.uid()));
create policy records_read on public.records for select to authenticated using(exists(select 1 from public.members m where m.organization_id=records.organization_id and m.user_id=auth.uid()));
create policy records_insert on public.records for insert to authenticated with check(exists(select 1 from public.members m join public.licenses l using(organization_id) where m.organization_id=records.organization_id and m.user_id=auth.uid() and l.expires_at>now()));
create policy records_update on public.records for update to authenticated using(exists(select 1 from public.members m join public.licenses l using(organization_id) where m.organization_id=records.organization_id and m.user_id=auth.uid() and l.expires_at>now())) with check(exists(select 1 from public.members m join public.licenses l using(organization_id) where m.organization_id=records.organization_id and m.user_id=auth.uid() and l.expires_at>now()));
create function public.create_workspace(p_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid;
begin
 if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select organization_id into oid from members where user_id=auth.uid();
 if found then return oid; end if;
 if length(trim(p_name)) not between 1 and 120 then raise exception 'Tên không hợp lệ'; end if;
 insert into organizations(name) values(trim(p_name)) returning id into oid;
 insert into members values(oid,auth.uid());
 insert into records(organization_id) values(oid);
 return oid;
end $$;
create function public.redeem_license(p_organization uuid,p_key text) returns void language plpgsql security definer set search_path=public,extensions as $$
declare k public.license_keys%rowtype;
begin
 if not exists(select 1 from members where organization_id=p_organization and user_id=auth.uid()) then raise exception 'Không có quyền truy cập'; end if;
 if length(p_key) not between 24 and 256 then raise exception 'Key không hợp lệ'; end if;
 select * into k from license_keys where key_hash=encode(digest(p_key,'sha256'),'hex') for update;
 if not found or k.redeemed_at is not null then raise exception 'Key không hợp lệ hoặc đã được sử dụng'; end if;
 insert into licenses(organization_id,expires_at) values(p_organization,now()+make_interval(days=>k.duration_days)) on conflict(organization_id) do update set expires_at=greatest(licenses.expires_at,now())+make_interval(days=>k.duration_days);
 update license_keys set redeemed_by=p_organization,redeemed_at=now() where id=k.id;
end $$;
revoke all on function public.create_workspace(text) from public,anon;
revoke all on function public.redeem_license(uuid,text) from public,anon;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.redeem_license(uuid,text) to authenticated;
revoke all on public.license_keys from anon,authenticated;
grant select on public.organizations,public.members,public.licenses to authenticated;
grant select,insert,update on public.records to authenticated;
