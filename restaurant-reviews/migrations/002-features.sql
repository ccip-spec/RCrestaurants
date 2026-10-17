-- Run once in Supabase SQL Editor (already applied to the RC Restaurants project).
alter table public.restaurants add column if not exists want_to_try boolean not null default false;
alter table public.restaurants add column if not exists recommended_by text;
alter table public.restaurants add column if not exists try_notes text;
alter table public.restaurants add column if not exists website text;
alter table public.restaurants add column if not exists photo text;
alter table public.visits alter column visit_date drop not null;
alter table public.visits add column if not exists meal text;
alter table public.visits add column if not exists items jsonb not null default '[]'::jsonb;
