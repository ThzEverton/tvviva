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
  async upload(file) {
    if(!_workspaceId)throw new Error('Workspace não carregado');
    const safe = `${_workspaceId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const response = await fetch(`${supabaseUrl}/storage/v1/object/media/${safe}`, {
      method: 'POST', body: file,
      headers: { apikey: supabaseKey, Authorization: `Bearer ${getStoredSession()?.access_token||supabaseKey}`, 'Content-Type': file.type, 'x-upsert': 'false' }
    });
    if (!response.ok) throw new Error(await response.text());
    return { path: safe, url: `${supabaseUrl}/storage/v1/object/public/media/${safe}` };
  },
  async removeFile(path){if(!path)return;const response=await fetch(`${supabaseUrl}/storage/v1/object/media/${path}`,{method:'DELETE',headers:{apikey:supabaseKey,Authorization:`Bearer ${getStoredSession()?.access_token||supabaseKey}`}});if(!response.ok)throw new Error(await response.text())}
};

let _workspaceId=null;
export const getWorkspaceId=()=>_workspaceId;

export async function loadCloudState() {
  const workspaces=await api.select('workspaces','select=id,name,plan&limit=1');
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
    media: media.map(m => ({ id:m.id, name:m.name, type:m.type, url:m.url, storagePath:m.storage_path, size:m.size_bytes || 0 })),
    playlists: playlists.map(p => ({ id:p.id, name:p.name, items:items.filter(i=>i.playlist_id===p.id).map(i=>i.media_id), screens:screens.filter(s=>s.playlist_id===p.id).length }))
  };
}

export async function savePlaylist(playlist) {
  const userId=getStoredSession()?.user?.id;
  const row = playlist.id?.startsWith('p') ? { name:playlist.name,workspace_id:_workspaceId,created_by:userId } : { id:playlist.id, name:playlist.name,workspace_id:_workspaceId,updated_at:new Date().toISOString() };
  const saved = playlist.id?.startsWith('p') ? await api.insert('playlists', row) : await api.upsert('playlists', row);
  const id = saved[0].id;
  await api.remove('playlist_items', `playlist_id=eq.${id}`);
  if (playlist.items.length) await api.insert('playlist_items', playlist.items.map((media_id, position)=>({playlist_id:id,media_id,position,duration_seconds:10})));
  return id;
}
