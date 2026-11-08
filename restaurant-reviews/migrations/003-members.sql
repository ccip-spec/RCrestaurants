-- People who can use the list, joined by invite link (no email).
-- Each phone signs in anonymously; member_devices links that phone to a person.

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  legacy_key text unique,              -- 'c' / 'r' for the two original people
  created_at timestamptz not null default now()
);
create unique index if not exists members_name_lower on public.members (lower(btrim(name)));

create table if not exists public.member_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  invite_code text not null
);

insert into public.members (name, legacy_key) values ('C', 'c'), ('R', 'r') on conflict do nothing;

insert into public.app_settings (id, invite_code)
select 1, (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random() * 31))::int + 1, 1), '')
           from generate_series(1, 6))
on conflict (id) do nothing;

alter table public.members enable row level security;
alter table public.member_devices enable row level security;
alter table public.app_settings enable row level security;   -- no policies: only reachable through the functions below

-- Scores keyed by member id: {"<member id>": 8.5, ...}
alter table public.visits add column if not exists scores jsonb not null default '{}'::jsonb;

-- Copy C/R scores into the new shape (visits and dish items).
do $$
declare cid uuid; rid uuid;
begin
  select id into cid from public.members where legacy_key = 'c';
  select id into rid from public.members where legacy_key = 'r';
  update public.visits
     set scores = jsonb_strip_nulls(jsonb_build_object(cid::text, c_score, rid::text, r_score))
   where scores = '{}'::jsonb and (c_score is not null or r_score is not null);
  update public.visits v
     set items = (
       select coalesce(jsonb_agg(
                jsonb_build_object(
                  'name', it->'name',
                  'scores', jsonb_strip_nulls(jsonb_build_object(cid::text, it->'c', rid::text, it->'r'))
                ) order by ord), '[]'::jsonb)
         from jsonb_array_elements(v.items) with ordinality as t(it, ord))
   where jsonb_array_length(v.items) > 0
     and exists (select 1 from jsonb_array_elements(v.items) e where not (e ? 'scores'));
  update public.visits set created_by = cid::text where created_by = 'c';
  update public.visits set created_by = rid::text where created_by = 'r';
  update public.restaurants set created_by = cid::text where created_by = 'c';
  update public.restaurants set created_by = rid::text where created_by = 'r';
end $$;

-- ---------- functions ----------
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from member_devices where user_id = auth.uid());
$$;

create or replace function public.whoami() returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.name from member_devices d join members m on m.id = d.member_id where d.user_id = auth.uid();
$$;

-- Names already on the list, shown on the join screen (only with the right code).
create or replace function public.invite_members(code text) returns table (id uuid, name text, legacy_key text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from app_settings where upper(btrim(invite_code)) = upper(btrim(code))) then
    raise exception 'That invite code is not right.' using errcode = 'P0001';
  end if;
  return query select m.id, m.name, m.legacy_key from members m order by m.created_at, m.name;
end $$;

-- Join as a new person (new_name) or as someone already on the list (existing_id).
create or replace function public.join_with_code(code text, new_name text default null, existing_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid; clean text := btrim(coalesce(new_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from app_settings where upper(btrim(invite_code)) = upper(btrim(code))) then
    raise exception 'That invite code is not right.' using errcode = 'P0001';
  end if;
  if existing_id is not null then
    select id into mid from members where id = existing_id;
    if mid is null then
      raise exception 'That person is no longer on the list.' using errcode = 'P0001';
    end if;
  else
    if char_length(clean) < 1 or char_length(clean) > 30 then
      raise exception 'Enter a name up to 30 characters.' using errcode = 'P0001';
    end if;
    if exists (select 1 from members where lower(btrim(name)) = lower(clean)) then
      raise exception 'Someone is already called %. If that''s you, tap your name instead.', clean using errcode = 'P0001';
    end if;
    insert into members (name) values (clean) returning id into mid;
  end if;
  insert into member_devices (user_id, member_id) values (auth.uid(), mid)
  on conflict (user_id) do update set member_id = excluded.member_id;
  return mid;
end $$;

create or replace function public.get_invite_code() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then
    raise exception 'Members only.' using errcode = 'P0001';
  end if;
  return (select invite_code from app_settings where id = 1);
end $$;

create or replace function public.rename_me(new_name text) returns void
language plpgsql security definer set search_path = public as $$
declare clean text := btrim(coalesce(new_name, '')); mid uuid;
begin
  select member_id into mid from member_devices where user_id = auth.uid();
  if mid is null then
    raise exception 'Members only.' using errcode = 'P0001';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 30 then
    raise exception 'Enter a name up to 30 characters.' using errcode = 'P0001';
  end if;
  if exists (select 1 from members where lower(btrim(name)) = lower(clean) and id <> mid) then
    raise exception 'Someone is already called %.', clean using errcode = 'P0001';
  end if;
  update members set name = clean where id = mid;
end $$;

revoke all on function public.join_with_code(text, text, uuid) from public, anon;
revoke all on function public.invite_members(text) from public, anon;
revoke all on function public.get_invite_code() from public, anon;
revoke all on function public.rename_me(text) from public, anon;
revoke all on function public.whoami() from public, anon;
grant execute on function public.join_with_code(text, text, uuid) to authenticated;
grant execute on function public.invite_members(text) to authenticated;
grant execute on function public.get_invite_code() to authenticated;
grant execute on function public.rename_me(text) to authenticated;
grant execute on function public.whoami() to authenticated;
grant execute on function public.is_member() to authenticated;

drop policy if exists "members read" on public.members;
create policy "members read" on public.members for select to authenticated using (public.is_member());
grant select on public.members to authenticated;

-- Members-only access (added now; the old open policies are removed in 004).
drop policy if exists "members only" on public.restaurants;
drop policy if exists "members only" on public.visits;
create policy "members only" on public.restaurants
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members only" on public.visits
  for all to authenticated using (public.is_member()) with check (public.is_member());
