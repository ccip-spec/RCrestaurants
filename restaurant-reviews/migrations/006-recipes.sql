-- ReCIPes: home recipes, visible only to the two original people (C and R).
-- Run once in Supabase: SQL Editor > New query > paste > Run.

-- True only when this phone is signed in as C or R (the members with legacy_key 'c' / 'r').
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from member_devices d join members m on m.id = d.member_id
     where d.user_id = auth.uid() and m.legacy_key in ('c', 'r')
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

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
  created_by text,                                 -- member id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes enable row level security;
drop policy if exists "admins only" on public.recipes;
create policy "admins only" on public.recipes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.recipes from anon;
grant select, insert, update, delete on public.recipes to authenticated;
