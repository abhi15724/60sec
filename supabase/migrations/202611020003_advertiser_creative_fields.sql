-- Persist advertiser creative metadata required by the production marketplace UI.
alter table public.advertisements
  add column if not exists brand_name text not null default '',
  add column if not exists title text not null default '',
  add column if not exists media_url text not null default '',
  add column if not exists media_type text not null default 'image/jpeg',
  add column if not exists website_url text not null default '';

alter table public.advertisements
  add constraint advertisements_media_type_check
  check (media_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm'));

create index if not exists advertisements_owner_created_idx
  on public.advertisements(owner_id, created_at desc);
