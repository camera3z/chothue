-- Run once in this app's Supabase SQL Editor. Private storage, scoped by shop.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('asset-images','asset-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id='asset-images' and public=true) then
  raise exception 'Bucket asset-images dang public. Chuyen bucket ve private truoc.';
 end if;
end $$;

create policy "asset_images_member_read" on storage.objects
for select to authenticated using (
 bucket_id='asset-images' and exists (
  select 1 from public.members m
  where m.user_id=auth.uid() and m.organization_id::text=(storage.foldername(name))[1]
 )
);
create policy "asset_images_licensed_upload" on storage.objects
for insert to authenticated with check (
 bucket_id='asset-images' and exists (
  select 1 from public.members m join public.licenses l using(organization_id)
  where m.user_id=auth.uid() and m.organization_id::text=(storage.foldername(name))[1]
  and l.expires_at>now()
 )
);
create policy "asset_images_licensed_delete" on storage.objects
for delete to authenticated using (
 bucket_id='asset-images' and exists (
  select 1 from public.members m join public.licenses l using(organization_id)
  where m.user_id=auth.uid() and m.organization_id::text=(storage.foldername(name))[1]
  and l.expires_at>now()
 )
);
commit;
