-- Profile pictures, log out, and a to-try list that tracks who added each place.

alter table public.members add column if not exists avatar text;   -- path in the photos bucket

-- Member ids of everyone who put this place on the try list.
alter table public.restaurants add column if not exists try_by text[] not null default '{}';
update public.restaurants r
   set try_by = array[r.created_by]
 where r.try_by = '{}' and r.created_by is not null
   and (r.want_to_try or not exists (select 1 from public.visits v where v.restaurant_id = r.id));

create or replace function public.update_me(new_name text default null, new_avatar text default null, clear_avatar boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare clean text := btrim(coalesce(new_name, '')); mid uuid;
begin
  select member_id into mid from member_devices where user_id = auth.uid();
  if mid is null then
    raise exception 'Members only.' using errcode = 'P0001';
  end if;
  if new_name is not null then
    if char_length(clean) < 1 or char_length(clean) > 30 then
      raise exception 'Enter a name up to 30 characters.' using errcode = 'P0001';
    end if;
    if exists (select 1 from members where lower(btrim(name)) = lower(clean) and id <> mid) then
      raise exception 'Someone is already called %.', clean using errcode = 'P0001';
    end if;
    update members set name = clean where id = mid;
  end if;
  if clear_avatar then
    update members set avatar = null where id = mid;
  elsif new_avatar is not null then
    update members set avatar = new_avatar where id = mid;
  end if;
end $$;

-- Log this phone out (the person stays on the list).
create or replace function public.leave_device() returns void
language sql security definer set search_path = public as $$
  delete from member_devices where user_id = auth.uid();
$$;

revoke all on function public.update_me(text, text, boolean) from public, anon;
revoke all on function public.leave_device() from public, anon;
grant execute on function public.update_me(text, text, boolean) to authenticated;
grant execute on function public.leave_device() to authenticated;
