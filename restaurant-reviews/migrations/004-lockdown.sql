-- Run after the invite-link version of the site is live.
-- Re-copy any C/R scores saved by the old site in the meantime, then close public access.
do $$
declare cid uuid; rid uuid;
begin
  select id into cid from public.members where legacy_key = 'c';
  select id into rid from public.members where legacy_key = 'r';
  update public.visits
     set scores = jsonb_strip_nulls(jsonb_build_object(cid::text, c_score, rid::text, r_score))
   where scores = '{}'::jsonb and (c_score is not null or r_score is not null);
end $$;

drop policy if exists "open access" on public.restaurants;
drop policy if exists "open access" on public.visits;
revoke all on public.restaurants, public.visits from anon;

drop policy if exists "photos upload" on storage.objects;
drop policy if exists "photos delete" on storage.objects;
create policy "photos upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_member());
create policy "photos delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_member());
