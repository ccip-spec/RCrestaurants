-- 007: a photo per recipe (storage path in the "photos" bucket, or a picture link from a recipe site).
alter table public.recipes add column if not exists photo text;
