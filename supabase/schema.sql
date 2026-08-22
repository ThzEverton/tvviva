-- TelaViva - esquema inicial para Supabase
-- Execute este arquivo inteiro no SQL Editor do seu projeto.

create extension if not exists pgcrypto;

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('image', 'video')),
  url text not null,
  storage_path text,
  size_bytes bigint default 0,
  duration_seconds integer default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  position integer not null default 0,
  duration_seconds integer not null default 10,
  fit_mode text not null default 'cover' check (fit_mode in ('cover','contain','fill')),
  unique (playlist_id, position)
);

create table if not exists public.screens (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  name text,
  location text default 'Novo local',
  playlist_id uuid references public.playlists(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'connected')),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists screens_device_code_idx on public.screens(device_code);
create index if not exists playlist_items_playlist_idx on public.playlist_items(playlist_id, position);

-- Bucket público: o player da TV precisa ler os arquivos sem autenticação.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 524288000, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update set public = true;

alter table public.media_items enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.screens enable row level security;

-- Políticas do MVP. Permitem que painel e TV funcionem usando a publishable key.
-- Antes de uso comercial, substitua por políticas vinculadas a auth.uid() e workspace_id.
drop policy if exists "mvp_media_all" on public.media_items;
create policy "mvp_media_all" on public.media_items for all to anon, authenticated using (true) with check (true);
drop policy if exists "mvp_playlists_all" on public.playlists;
create policy "mvp_playlists_all" on public.playlists for all to anon, authenticated using (true) with check (true);
drop policy if exists "mvp_playlist_items_all" on public.playlist_items;
create policy "mvp_playlist_items_all" on public.playlist_items for all to anon, authenticated using (true) with check (true);
drop policy if exists "mvp_screens_all" on public.screens;
create policy "mvp_screens_all" on public.screens for all to anon, authenticated using (true) with check (true);

drop policy if exists "mvp_storage_insert" on storage.objects;
create policy "mvp_storage_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'media');
drop policy if exists "mvp_storage_select" on storage.objects;
create policy "mvp_storage_select" on storage.objects for select to anon, authenticated using (bucket_id = 'media');
drop policy if exists "mvp_storage_update" on storage.objects;
create policy "mvp_storage_update" on storage.objects for update to anon, authenticated using (bucket_id = 'media');
drop policy if exists "mvp_storage_delete" on storage.objects;
create policy "mvp_storage_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'media');

-- Ativa atualizações em tempo real (seguro repetir; ignora se já estiver incluído).
do $$ begin
  alter publication supabase_realtime add table public.screens;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.playlists;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.playlist_items;
exception when duplicate_object then null;
end $$;
