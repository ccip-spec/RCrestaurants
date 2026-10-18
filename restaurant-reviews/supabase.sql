-- Run this once in Supabase: SQL Editor > New query > paste > Run.

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  neighborhood text,
  lat double precision,
  lng double precision,
  osm_ref text unique,            -- OpenStreetMap id, prevents duplicate restaurants
  cuisine text,
  price smallint check (price between 1 and 4),
  created_by text,
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  visit_date date not null default current_date,
  c_score numeric(3,1) check (c_score between 0 and 10),
  r_score numeric(3,1) check (r_score between 0 and 10),
  dishes text,
  cost numeric(8,2),
  would_return boolean,
  notes text,
  photos text[] not null default '{}',   -- storage paths in the "photos" bucket
  created_by text,
  created_at timestamptz not null default now()
);

create index visits_restaurant_id_idx on public.visits (restaurant_id);

-- No passwords: anyone with the site link can read and write.
alter table public.restaurants enable row level security;
alter table public.visits enable row level security;

create policy "open access" on public.restaurants
  for all to anon, authenticated using (true) with check (true);
create policy "open access" on public.visits
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.restaurants, public.visits to anon, authenticated;

-- Photo storage (public bucket)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'photos');
create policy "photos upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'photos');
create policy "photos delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'photos');

-- Added later (also in migrations/002-features.sql)
alter table public.restaurants add column if not exists want_to_try boolean not null default false;
alter table public.restaurants add column if not exists recommended_by text;
alter table public.restaurants add column if not exists try_notes text;
alter table public.restaurants add column if not exists website text;
alter table public.restaurants add column if not exists photo text;
alter table public.visits alter column visit_date drop not null;
alter table public.visits add column if not exists meal text;
alter table public.visits add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.restaurants add column if not exists meal_tags text[] not null default '{}';
