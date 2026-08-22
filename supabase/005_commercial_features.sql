-- TelaViva: agendamento, miniaturas e player comercial.
-- Execute este arquivo no SQL Editor depois de 004_player_and_image_fit.sql.

alter table public.workspaces add column if not exists timezone text not null default 'America/Sao_Paulo';
alter table public.media_items add column if not exists thumbnail_url text;
alter table public.media_items add column if not exists thumbnail_storage_path text;
alter table public.playlists add column if not exists start_at timestamptz;
alter table public.playlists add column if not exists end_at timestamptz;
alter table public.playlists add column if not exists active_days smallint[] not null default array[0,1,2,3,4,5,6]::smallint[];
alter table public.playlists add column if not exists daily_start time not null default '00:00';
alter table public.playlists add column if not exists daily_end time not null default '23:59';

create or replace function public.player_content(p_device_code text,p_device_secret text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  s public.screens;
  p public.playlists;
  payload jsonb;
  local_now timestamp;
  local_day smallint;
  local_time time;
  timezone_name text;
  time_allowed boolean;
begin
  if not public.rate_limit_ok('play:'||p_device_code,30,60) then raise exception 'rate_limited'; end if;
  select * into s from public.screens where device_code=upper(p_device_code);
  if s.id is null or s.device_secret_hash is null or encode(extensions.digest(p_device_secret,'sha256'),'hex')<>s.device_secret_hash then raise exception 'unauthorized_device'; end if;
  update public.screens set last_seen=now() where id=s.id;
  if s.status<>'connected' then return jsonb_build_object('paired',false,'items','[]'::jsonb); end if;
  if s.playlist_id is null then return jsonb_build_object('paired',true,'items','[]'::jsonb); end if;

  select * into p from public.playlists where id=s.playlist_id and workspace_id=s.workspace_id;
  if p.id is null then return jsonb_build_object('paired',true,'items','[]'::jsonb); end if;
  select coalesce(w.timezone,'America/Sao_Paulo') into timezone_name from public.workspaces w where w.id=s.workspace_id;
  local_now:=now() at time zone timezone_name;
  local_day:=extract(dow from local_now)::smallint;
  local_time:=local_now::time;
  time_allowed:=case when p.daily_start<=p.daily_end then local_time between p.daily_start and p.daily_end else local_time>=p.daily_start or local_time<=p.daily_end end;

  if (p.start_at is not null and now()<p.start_at)
    or (p.end_at is not null and now()>p.end_at)
    or not (local_day=any(p.active_days))
    or not time_allowed then
    return jsonb_build_object('paired',true,'scheduled',true,'items','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'type',m.type,'url',m.url,'duration',pi.duration_seconds,'fit',pi.fit_mode) order by pi.position),'[]'::jsonb) into payload
  from public.playlist_items pi join public.media_items m on m.id=pi.media_id
  where pi.playlist_id=s.playlist_id and m.workspace_id=s.workspace_id;
  return jsonb_build_object('paired',true,'scheduled',false,'playlist_id',s.playlist_id,'items',payload);
end $$;

revoke all on function public.player_content(text,text) from public;
grant execute on function public.player_content(text,text) to anon, authenticated;
