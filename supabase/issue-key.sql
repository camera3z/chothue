-- ADMIN ONLY: run in Supabase SQL editor. Never expose a service-role key in the web app.
-- Generates a cryptographically random key; stores only its SHA-256 hash.
-- Copy the returned key securely for the buyer; do not paste it into source control.
with new_key as (select 'THUE-' || encode(extensions.gen_random_bytes(24),'hex') as key),
issued as (insert into public.license_keys(key_hash,duration_days)
select encode(extensions.digest(key,'sha256'),'hex'),365 from new_key returning id)
select new_key.key, issued.id from new_key cross join issued;
