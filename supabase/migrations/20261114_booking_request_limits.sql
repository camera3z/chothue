-- Update both public booking APIs without changing their pricing or dates.
-- Existing requests and permissions are preserved. Safe to run again.
begin;
do $migration$
declare
 api regprocedure;
 definition text;
 previous_guard text := $old$if (select count(*) from public.rental_requests where organization_id=p_shop and created_at>now()-interval '1 hour')>=100
 or (select count(*) from public.rental_requests where organization_id=p_shop and phone=phone_clean and created_at>now()-interval '1 hour')>=3 then raise exception 'Da dat gioi han gui yeu cau. Vui long lien he shop hoac thu lai sau.'; end if;$old$;
 updated_guard text := $new$if (select count(*) from public.rental_requests where organization_id=p_shop and created_at>now()-interval '1 hour')>=100 then
  raise exception 'Shop đã đạt giới hạn nhận yêu cầu. Vui lòng liên hệ shop hoặc thử lại sau 1 giờ.';
 end if;
 if (select count(*) from public.rental_requests where organization_id=p_shop and phone=phone_clean and created_at>now()-interval '15 minutes')>=10 then
  raise exception 'Đã đạt giới hạn gửi yêu cầu. Vui lòng thử lại sau 15 phút.';
 end if;$new$;
begin
 for api in
  select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('submit_rental_request','submit_rental_request_v2')
 loop
  definition:=pg_get_functiondef(api);
  if strpos(definition,previous_guard)>0 then
   execute replace(definition,previous_guard,updated_guard);
  elsif strpos(definition,updated_guard)=0 then
   raise exception 'Unsupported booking API definition: %. No changes applied.',api;
  end if;
 end loop;
 if to_regprocedure('public.submit_rental_request_v2(uuid,uuid,text,text,text,text,date,date,integer,text,numeric,text,text)') is null then
  raise exception 'Install 20261114_customer_booking_form.sql and 20261114_auto_booking_end.sql first.';
 end if;
end $migration$;
commit;
notify pgrst, 'reload schema';
