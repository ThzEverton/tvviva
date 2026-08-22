-- Corrige as funcoes do player em projetos Supabase onde pgcrypto vive no schema extensions.
-- Execute este arquivo no SQL Editor do Supabase depois de 002_production_security.sql.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.rate_limit_ok(raw_key text,max_hits int,window_seconds int)
returns boolean language plpgsql security definer set search_path=public
as $$ declare b timestamptz; current_hits int; begin
  b := to_timestamp(floor(extract(epoch from now())/window_seconds)*window_seconds);
  insert into public.api_rate_limits(key_hash,bucket,hits)
  values(encode(extensions.digest(raw_key,'sha256'),'hex'),b,1)
  on conflict(key_hash,bucket) do update set hits=api_rate_limits.hits+1 returning hits into current_hits;
  delete from public.api_rate_limits where bucket < now()-interval '24 hours';
  return coalesce(current_hits,1)<=max_hits;
end $$;

create or replace function public.register_screen(p_device_code text,p_device_secret text)
returns jsonb language plpgsql security definer set search_path=public
as $$ declare row_id uuid; begin
  if char_length(p_device_code)<>6 or p_device_code !~ '^[A-Z0-9]{6}$' or char_length(p_device_secret)<32 then raise exception 'invalid_device'; end if;
  if not public.rate_limit_ok('register:'||p_device_code,12,60) then raise exception 'rate_limited'; end if;
  insert into public.screens(device_code,device_secret_hash,status,last_seen)
  values(p_device_code,encode(extensions.digest(p_device_secret,'sha256'),'hex'),'pending',now())
  on conflict(device_code) do update set
    device_secret_hash=case when screens.device_secret_hash is null then excluded.device_secret_hash else screens.device_secret_hash end,
    last_seen=now()
  returning id into row_id;
  return jsonb_build_object('ok',true,'screen_id',row_id);
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
  from public.playlist_items pi join public.media_items m on m.id=pi.media_id
  where pi.playlist_id=s.playlist_id and m.workspace_id=s.workspace_id;
  return jsonb_build_object('paired',true,'playlist_id',s.playlist_id,'items',payload);
end $$;

revoke all on function public.rate_limit_ok(text,int,int) from public;
revoke all on function public.register_screen(text,text) from public;
revoke all on function public.player_content(text,text) from public;
grant execute on function public.register_screen(text,text) to anon, authenticated;
grant execute on function public.player_content(text,text) to anon, authenticated;
