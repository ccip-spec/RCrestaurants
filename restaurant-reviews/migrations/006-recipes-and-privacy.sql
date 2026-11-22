-- 006: ReCIPes, per-person try lists, and public/private for both.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.

-- This phone's person.
create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select member_id from member_devices where user_id = auth.uid();
$$;
revoke all on function public.my_member_id() from public, anon;
grant execute on function public.my_member_id() to authenticated;

-- ---------- recipes ----------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  meal_type text,                                  -- Breakfast, Lunch, Dinner, Side, Dessert, Snack, Drink
  cuisine text,
  servings smallint check (servings between 1 and 100),
  prep_min smallint check (prep_min between 0 and 1440),
  cook_min smallint check (cook_min between 0 and 1440),
  ingredients jsonb not null default '[]'::jsonb,  -- ["2 cups flour", ...]
  steps jsonb not null default '[]'::jsonb,        -- ["Preheat oven to 400", ...]
  notes text,
  source_url text,
  is_public boolean not null default true,         -- false = only the person who added it sees it
  created_by text,                                 -- member id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipes add column if not exists is_public boolean not null default true;

alter table public.recipes enable row level security;
drop policy if exists "admins only" on public.recipes;
drop policy if exists "recipes read" on public.recipes;
drop policy if exists "recipes add" on public.recipes;
drop policy if exists "recipes edit" on public.recipes;
drop policy if exists "recipes delete" on public.recipes;
create policy "recipes read" on public.recipes for select to authenticated
  using (public.is_member() and (is_public or created_by = public.my_member_id()::text));
create policy "recipes add" on public.recipes for insert to authenticated
  with check (created_by = public.my_member_id()::text);
create policy "recipes edit" on public.recipes for update to authenticated
  using (created_by = public.my_member_id()::text) with check (created_by = public.my_member_id()::text);
create policy "recipes delete" on public.recipes for delete to authenticated
  using (created_by = public.my_member_id()::text);
revoke all on public.recipes from anon;
grant select, insert, update, delete on public.recipes to authenticated;

-- ---------- try lists: one row per person per place ----------
create table if not exists public.tries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  is_public boolean not null default true,         -- false = only this person sees it
  recommended_by text,
  notes text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, member_id)
);
create index if not exists tries_restaurant_idx on public.tries (restaurant_id);

alter table public.tries enable row level security;
drop policy if exists "tries read" on public.tries;
drop policy if exists "tries own" on public.tries;
create policy "tries read" on public.tries for select to authenticated
  using (public.is_member() and (is_public or member_id = public.my_member_id()));
create policy "tries own" on public.tries for all to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
revoke all on public.tries from anon;
grant select, insert, update, delete on public.tries to authenticated;

-- Copy the old shared try list over once. Everything already saved starts public.
do $$
begin
  if not exists (select 1 from public.tries) then
    insert into public.tries (restaurant_id, member_id, recommended_by, notes, created_at)
    select r.id, m.id, r.recommended_by, r.try_notes, r.created_at
      from public.restaurants r
      cross join lateral unnest(r.try_by) as t(mid)
      join public.members m on m.id::text = t.mid
    on conflict do nothing;
    -- Older saved places with nobody recorded and no visits were on both lists: give them to C and R.
    insert into public.tries (restaurant_id, member_id, recommended_by, notes, created_at)
    select r.id, m.id, r.recommended_by, r.try_notes, r.created_at
      from public.restaurants r
      join public.members m on m.legacy_key in ('c', 'r')
     where coalesce(array_length(r.try_by, 1), 0) = 0
       and not exists (select 1 from public.visits v where v.restaurant_id = r.id)
    on conflict do nothing;
  end if;
end $$;

-- ---------- restaurants: hide places that are only on someone else's private try list ----------
create or replace function public.can_see_restaurant(rid uuid, creator text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and (
    creator = public.my_member_id()::text
    or exists (select 1 from visits v where v.restaurant_id = rid)
    or exists (select 1 from tries t where t.restaurant_id = rid and (t.is_public or t.member_id = public.my_member_id()))
    or not exists (select 1 from tries t where t.restaurant_id = rid)
  );
$$;
revoke all on function public.can_see_restaurant(uuid, text) from public, anon;
grant execute on function public.can_see_restaurant(uuid, text) to authenticated;

drop policy if exists "members only" on public.restaurants;
drop policy if exists "restaurants read" on public.restaurants;
drop policy if exists "restaurants add" on public.restaurants;
drop policy if exists "restaurants edit" on public.restaurants;
drop policy if exists "restaurants delete" on public.restaurants;
create policy "restaurants read" on public.restaurants for select to authenticated
  using (public.can_see_restaurant(id, created_by));
create policy "restaurants add" on public.restaurants for insert to authenticated with check (public.is_member());
create policy "restaurants edit" on public.restaurants for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy "restaurants delete" on public.restaurants for delete to authenticated using (public.is_member());

-- Adding a place someone else saved privately: find it without showing it.
create or replace function public.restaurant_id_for(ref text) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then
    raise exception 'Members only.' using errcode = 'P0001';
  end if;
  return (select id from restaurants where osm_ref = ref);
end $$;
revoke all on function public.restaurant_id_for(text) from public, anon;
grant execute on function public.restaurant_id_for(text) to authenticated;
