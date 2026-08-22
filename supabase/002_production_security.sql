-- TelaViva - migração de segurança e multiempresa
-- Execute após schema.sql. Esta migração REMOVE as políticas públicas do MVP.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  plan text not null default 'starter' check (plan in ('starter','pro','business')),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.media_items add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.media_items add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.playlists add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.playlists add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.screens add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.screens add column if not exists device_secret_hash text;
alter table public.screens add column if not exists paired_at timestamptz;

create index if not exists media_workspace_idx on public.media_items(workspace_id);
create index if not exists playlists_workspace_idx on public.playlists(workspace_id);
create index if not exists screens_workspace_idx on public.screens(workspace_id);
create index if not exists members_user_idx on public.workspace_members(user_id);

create or replace function public.is_workspace_member(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=target and m.user_id=auth.uid()) $$;

create or replace function public.can_edit_workspace(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=target and m.user_id=auth.uid() and m.role in ('owner','admin','editor')) $$;

create or replace function public.can_admin_workspace(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=target and m.user_id=auth.uid() and m.role in ('owner','admin')) $$;

create or replace function public.is_workspace_owner(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=target and m.user_id=auth.uid() and m.role='owner') $$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_edit_workspace(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
revoke all on function public.can_admin_workspace(uuid) from public;
grant execute on function public.can_admin_workspace(uuid) to authenticated;
revoke all on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare new_workspace uuid; safe_name text; safe_slug text;
begin
  safe_name := coalesce(nullif(trim(new.raw_user_meta_data->>'company_name'),''), split_part(new.email,'@',1));
  if char_length(safe_name)<2 then safe_name:=safe_name||' workspace'; end if;
  safe_slug := trim(both '-' from lower(regexp_replace(safe_name,'[^a-zA-Z0-9]+','-','g')));
  if safe_slug='' then safe_slug:='workspace'; end if;
  safe_slug := safe_slug || '-' || substr(new.id::text,1,6);
  insert into public.workspaces(name,slug,owner_id) values(left(safe_name,80),left(safe_slug,63),new.id) returning id into new_workspace;
  insert into public.workspace_members(workspace_id,user_id,role) values(new_workspace,new.id,'owner');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Cria workspace para usuários cadastrados antes desta migração.
do $$ declare u record; w uuid; n text; s text; begin
  for u in select id,email from auth.users where not exists(select 1 from public.workspace_members m where m.user_id=auth.users.id) loop
    n:=split_part(u.email,'@',1); if char_length(n)<2 then n:=n||' workspace'; end if;
    s:=trim(both '-' from lower(regexp_replace(n,'[^a-zA-Z0-9]+','-','g'))); if s='' then s:='workspace'; end if;
    insert into public.workspaces(name,slug,owner_id) values(n,s||'-'||substr(u.id::text,1,6),u.id) returning id into w;
    insert into public.workspace_members values(w,u.id,'owner',now());
  end loop;
end $$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists "workspace_read" on public.workspaces;
create policy "workspace_read" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
drop policy if exists "workspace_update" on public.workspaces;
create policy "workspace_update" on public.workspaces for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
revoke update on public.workspaces from authenticated;
grant update(name,slug) on public.workspaces to authenticated;
drop policy if exists "members_read" on public.workspace_members;
create policy "members_read" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "members_manage" on public.workspace_members;
create policy "members_manage" on public.workspace_members for all to authenticated using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

-- Remove toda permissão pública do MVP.
drop policy if exists "mvp_media_all" on public.media_items;
drop policy if exists "mvp_playlists_all" on public.playlists;
drop policy if exists "mvp_playlist_items_all" on public.playlist_items;
drop policy if exists "mvp_screens_all" on public.screens;

create policy "media_read" on public.media_items for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "media_insert" on public.media_items for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by=auth.uid());
create policy "media_update" on public.media_items for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "media_delete" on public.media_items for delete to authenticated using (public.can_edit_workspace(workspace_id));
create policy "playlists_read" on public.playlists for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "playlists_insert" on public.playlists for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by=auth.uid());
create policy "playlists_update" on public.playlists for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "playlists_delete" on public.playlists for delete to authenticated using (public.can_edit_workspace(workspace_id));
create policy "playlist_items_read" on public.playlist_items for select to authenticated using (exists(select 1 from public.playlists p where p.id=playlist_id and public.is_workspace_member(p.workspace_id)));
create policy "playlist_items_insert" on public.playlist_items for insert to authenticated with check (exists(select 1 from public.playlists p where p.id=playlist_id and public.can_edit_workspace(p.workspace_id)));
create policy "playlist_items_update" on public.playlist_items for update to authenticated using (exists(select 1 from public.playlists p where p.id=playlist_id and public.can_edit_workspace(p.workspace_id)));
create policy "playlist_items_delete" on public.playlist_items for delete to authenticated using (exists(select 1 from public.playlists p where p.id=playlist_id and public.can_edit_workspace(p.workspace_id)));
create policy "screens_read" on public.screens for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "screens_update" on public.screens for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "screens_delete" on public.screens for delete to authenticated using (public.can_edit_workspace(workspace_id));

-- Rate limiter transacional para endpoints públicos do player.
create table if not exists public.api_rate_limits (
  key_hash text not null,
  bucket timestamptz not null,
  hits integer not null default 1,
  primary key(key_hash,bucket)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create or replace function public.rate_limit_ok(raw_key text, max_hits int, window_seconds int)
returns boolean language plpgsql security definer set search_path=public
as $$ declare b timestamptz; current_hits int; begin
  b := to_timestamp(floor(extract(epoch from now())/window_seconds)*window_seconds);
  insert into public.api_rate_limits(key_hash,bucket,hits) values(encode(extensions.digest(raw_key,'sha256'),'hex'),b,1)
  on conflict(key_hash,bucket) do update set hits=api_rate_limits.hits+1 returning hits into current_hits;
  delete from public.api_rate_limits where bucket < now()-interval '24 hours';
  return coalesce(current_hits,1)<=max_hits;
end $$;
revoke all on function public.rate_limit_ok(text,int,int) from public;

-- Player registra um segredo aleatório que nunca aparece no QR Code.
create or replace function public.register_screen(p_device_code text,p_device_secret text)
returns jsonb language plpgsql security definer set search_path=public
as $$ declare row_id uuid; begin
  if char_length(p_device_code)<>6 or p_device_code !~ '^[A-Z0-9]{6}$' or char_length(p_device_secret)<32 then raise exception 'invalid_device'; end if;
  if not public.rate_limit_ok('register:'||p_device_code,12,60) then raise exception 'rate_limited'; end if;
  insert into public.screens(device_code,device_secret_hash,status,last_seen)
  values(p_device_code,encode(extensions.digest(p_device_secret,'sha256'),'hex'),'pending',now())
  on conflict(device_code) do update set device_secret_hash=case when screens.device_secret_hash is null then excluded.device_secret_hash else screens.device_secret_hash end,last_seen=now()
  returning id into row_id;
  return jsonb_build_object('ok',true,'screen_id',row_id);
end $$;

create or replace function public.pair_screen(p_device_code text,p_name text,p_location text,p_playlist_id uuid default null)
returns uuid language plpgsql security definer set search_path=public
as $$ declare ws uuid; result uuid; begin
  select workspace_id into ws from public.workspace_members where user_id=auth.uid() order by created_at limit 1;
  if ws is null or not public.can_edit_workspace(ws) then raise exception 'forbidden'; end if;
  if char_length(trim(p_name))<2 then raise exception 'invalid_name'; end if;
  if p_playlist_id is not null and not exists(select 1 from public.playlists where id=p_playlist_id and workspace_id=ws) then raise exception 'invalid_playlist'; end if;
  update public.screens set workspace_id=ws,name=left(trim(p_name),80),location=left(coalesce(nullif(trim(p_location),''),'Novo local'),120),playlist_id=p_playlist_id,status='connected',paired_at=now(),updated_at=now()
  where device_code=upper(p_device_code) and workspace_id is null returning id into result;
  if result is null then raise exception 'screen_not_pending'; end if;
  return result;
end $$;

create or replace function public.player_content(p_device_code text,p_device_secret text)
returns jsonb language plpgsql security definer set search_path=public
as $$ declare s public.screens; payload jsonb; begin
  if not public.rate_limit_ok('play:'||p_device_code,30,60) then raise exception 'rate_limited'; end if;
  select * into s from public.screens where device_code=upper(p_device_code);
  if s.id is null or s.device_secret_hash is null or encode(extensions.digest(p_device_secret,'sha256'),'hex')<>s.device_secret_hash then raise exception 'unauthorized_device'; end if;
  update public.screens set last_seen=now() where id=s.id;
  if s.status<>'connected' or s.playlist_id is null then return jsonb_build_object('paired',false,'items','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'type',m.type,'url',m.url,'duration',pi.duration_seconds) order by pi.position),'[]'::jsonb) into payload
  from public.playlist_items pi join public.media_items m on m.id=pi.media_id where pi.playlist_id=s.playlist_id and m.workspace_id=s.workspace_id;
  return jsonb_build_object('paired',true,'playlist_id',s.playlist_id,'items',payload);
end $$;

revoke all on function public.register_screen(text,text) from public;
revoke all on function public.pair_screen(text,text,text,uuid) from public;
revoke all on function public.player_content(text,text) from public;
grant execute on function public.register_screen(text,text) to anon, authenticated;
grant execute on function public.player_content(text,text) to anon, authenticated;
grant execute on function public.pair_screen(text,text,text,uuid) to authenticated;

-- Storage: publicidade é legível por URL, mas somente membros podem escrever em sua pasta.
create or replace function public.storage_workspace_allowed(object_name text,require_edit boolean default false)
returns boolean language sql stable security definer set search_path=public,storage
as $$ select exists(select 1 from public.workspace_members m where m.user_id=auth.uid() and m.workspace_id::text=(storage.foldername(object_name))[1] and (not require_edit or m.role in ('owner','admin','editor'))) $$;
revoke all on function public.storage_workspace_allowed(text,boolean) from public;
grant execute on function public.storage_workspace_allowed(text,boolean) to authenticated;
drop policy if exists "mvp_storage_insert" on storage.objects;
drop policy if exists "mvp_storage_select" on storage.objects;
drop policy if exists "mvp_storage_update" on storage.objects;
drop policy if exists "mvp_storage_delete" on storage.objects;
create policy "workspace_storage_insert" on storage.objects for insert to authenticated with check(bucket_id='media' and public.storage_workspace_allowed(name,true));
create policy "workspace_storage_select" on storage.objects for select to authenticated using(bucket_id='media' and public.storage_workspace_allowed(name,false));
create policy "workspace_storage_update" on storage.objects for update to authenticated using(bucket_id='media' and public.storage_workspace_allowed(name,true));
create policy "workspace_storage_delete" on storage.objects for delete to authenticated using(bucket_id='media' and public.storage_workspace_allowed(name,true));

-- Impede que novas linhas comerciais sejam criadas sem empresa.
-- Execute depois de adotar/remover dados antigos, se existirem:
-- alter table public.media_items alter column workspace_id set not null;
-- alter table public.playlists alter column workspace_id set not null;
