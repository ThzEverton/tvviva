import './config.js';
import { getStoredSession } from './auth.js';

const config = window.TELAVIVA_CONFIG || {};
export const supabaseUrl = (localStorage.getItem('telaviva-supabase-url') || config.supabaseUrl || '').replace(/\/$/, '');
export const supabaseKey = localStorage.getItem('telaviva-supabase-key') || config.supabasePublishableKey || '';
export const cloudEnabled = Boolean(supabaseUrl && supabaseKey);

function headers(extra = {}) {
  const token=getStoredSession()?.access_token||supabaseKey;
  return { apikey: supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: headers(options.headers) });
  if (!response.ok) throw new Error((await response.text()) || `Supabase: ${response.status}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  select(table, query = '') { return request(`${table}?${query}`, { headers: { Prefer: 'count=exact' } }); },
  insert(table, body) { return request(table, { method: 'POST', body: JSON.stringify(body), headers: { Prefer: 'return=representation' } }); },
  update(table, query, body) { return request(`${table}?${query}`, { method: 'PATCH', body: JSON.stringify(body), headers: { Prefer: 'return=representation' } }); },
  upsert(table, body, conflict = 'id') { return request(`${table}?on_conflict=${conflict}`, { method: 'POST', body: JSON.stringify(body), headers: { Prefer: 'resolution=merge-duplicates,return=representation' } }); },
  remove(table, query) { return request(`${table}?${query}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
  rpc(name, body) { return request(`rpc/${name}`, { method:'POST', body:JSON.stringify(body), headers:{Prefer:'return=representation'} }); },
  async upload(file,onProgress) {
    if(!_workspaceId)throw new Error('Workspace não carregado');
    const safe = `${_workspaceId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('POST',`${supabaseUrl}/storage/v1/object/media/${safe}`);
      xhr.setRequestHeader('apikey',supabaseKey);xhr.setRequestHeader('Authorization',`Bearer ${getStoredSession()?.access_token||supabaseKey}`);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.setRequestHeader('x-upsert','false');
      xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100))};
      xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(xhr.responseText||`Upload: ${xhr.status}`));xhr.onerror=()=>reject(new Error('Falha de rede durante o upload'));xhr.send(file);
    });
    onProgress?.(100);
    return { path: safe, url: `${supabaseUrl}/storage/v1/object/public/media/${safe}` };
  },
  async removeFile(path){if(!path)return;const response=await fetch(`${supabaseUrl}/storage/v1/object/media/${path}`,{method:'DELETE',headers:{apikey:supabaseKey,Authorization:`Bearer ${getStoredSession()?.access_token||supabaseKey}`}});if(!response.ok)throw new Error(await response.text())}
};

let _workspaceId=null;
export const getWorkspaceId=()=>_workspaceId;

export async function loadCloudState() {
  const workspaces=await api.select('workspaces','select=*&limit=1');
  if(!workspaces.length)throw new Error('Sua conta ainda não possui um workspace');
  _workspaceId=workspaces[0].id;
  const [screens, media, playlists, items] = await Promise.all([
    api.select('screens', 'select=*&order=created_at.desc'),
    api.select('media_items', 'select=*&order=created_at.desc'),
    api.select('playlists', 'select=*&order=created_at.desc'),
    api.select('playlist_items', 'select=*&order=position.asc')
  ]);
  return {
    workspace:workspaces[0],
    screens: screens.map(s => ({ id:s.id, code:s.device_code, name:s.name || `Tela ${s.device_code}`, location:s.location, online:Date.now()-new Date(s.last_seen).getTime()<60000, playlistId:s.playlist_id, playlist:playlists.find(p=>p.id===s.playlist_id)?.name || 'Sem playlist', seen:'Sincronizada' })),
    media: media.map(m => ({ id:m.id, name:m.name, type:m.type, url:m.url, storagePath:m.storage_path, thumbnail:m.thumbnail_url||'', thumbnailPath:m.thumbnail_storage_path||'', size:m.size_bytes || 0 })),
    playlists: playlists.map(p => {
      const playlistItems=items.filter(i=>i.playlist_id===p.id);
      return {id:p.id,name:p.name,items:playlistItems.map(i=>i.media_id),durations:Object.fromEntries(playlistItems.map(i=>[i.media_id,i.duration_seconds||10])),fits:Object.fromEntries(playlistItems.map(i=>[i.media_id,i.fit_mode||'cover'])),schedule:{startAt:p.start_at||'',endAt:p.end_at||'',days:Array.isArray(p.active_days)?p.active_days:[0,1,2,3,4,5,6],dailyStart:(p.daily_start||'00:00').slice(0,5),dailyEnd:(p.daily_end||'23:59').slice(0,5)},screens:screens.filter(s=>s.playlist_id===p.id).length};
    })
  };
}

export async function savePlaylist(playlist) {
  const userId=getStoredSession()?.user?.id;
  const isNew=playlist.id?.startsWith('p');
  const schedule={start_at:playlist.schedule?.startAt||null,end_at:playlist.schedule?.endAt||null,active_days:playlist.schedule?.days?.length?playlist.schedule.days:[0,1,2,3,4,5,6],daily_start:playlist.schedule?.dailyStart||'00:00',daily_end:playlist.schedule?.dailyEnd||'23:59'};
  let id;
  if(isNew){
    let saved;try{saved=await api.insert('playlists',{name:playlist.name,workspace_id:_workspaceId,created_by:userId,...schedule})}catch(error){if(!/start_at|active_days|daily_start/.test(String(error.message)))throw error;saved=await api.insert('playlists',{name:playlist.name,workspace_id:_workspaceId,created_by:userId})}
    id=saved[0].id;
  }else{
    let updated;try{updated=await api.update('playlists',`id=eq.${playlist.id}`,{name:playlist.name,...schedule,updated_at:new Date().toISOString()})}catch(error){if(!/start_at|active_days|daily_start/.test(String(error.message)))throw error;updated=await api.update('playlists',`id=eq.${playlist.id}`,{name:playlist.name,updated_at:new Date().toISOString()})}
    if(!updated?.length)throw new Error('Playlist não encontrada ou sem permissão para editar');
    id=playlist.id;
  }
  await api.remove('playlist_items', `playlist_id=eq.${id}`);
  if (playlist.items.length) {
    const rows=playlist.items.map((media_id, position)=>({playlist_id:id,media_id,position,duration_seconds:Math.min(3600,Math.max(1,Number(playlist.durations?.[media_id])||10)),fit_mode:['cover','contain','fill'].includes(playlist.fits?.[media_id])?playlist.fits[media_id]:'cover'}));
    try{await api.insert('playlist_items',rows)}catch(error){
      if(!String(error.message).includes('fit_mode'))throw error;
      await api.insert('playlist_items',rows.map(({fit_mode,...row})=>row));
    }
  }
  return id;
}
