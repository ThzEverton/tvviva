const SHELL_CACHE='telaviva-shell-v1';
const MEDIA_CACHE='telaviva-media-v1';
const SHELL=['/player','/player.js','/player.css','/player-v2.css','/config.js','/supabase.js','/auth.js','/favicon.svg'];

self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>!([SHELL_CACHE,MEDIA_CACHE].includes(key))).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

self.addEventListener('message',event=>{
  if(event.data?.type==='CLEAR_MEDIA'){event.waitUntil(caches.delete(MEDIA_CACHE));return}
  if(event.data?.type!=='CACHE_MEDIA'||!Array.isArray(event.data.urls))return;
  event.waitUntil(caches.open(MEDIA_CACHE).then(async cache=>{for(const url of [...new Set(event.data.urls)].slice(0,100)){try{if(await cache.match(url))continue;const response=await fetch(url,{mode:'cors'});if(response.ok&&response.status===200)await cache.put(url,response.clone())}catch{}}}));
});

self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);
  if(request.mode==='navigate'&&url.origin===location.origin){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(SHELL_CACHE).then(cache=>cache.put(request,copy));return response}).catch(()=>caches.match(request).then(hit=>hit||caches.match('/player'))));return}
  if(request.destination==='image'||request.destination==='video'){event.respondWith((async()=>{const hit=await caches.match(request,{ignoreVary:true});if(hit){const range=request.headers.get('range');if(range&&request.destination==='video'){const bytes=await hit.arrayBuffer(),match=/bytes=(\d+)-(\d*)/.exec(range),start=Number(match?.[1]||0),end=Math.min(Number(match?.[2]||bytes.byteLength-1),bytes.byteLength-1),headers=new Headers(hit.headers);headers.set('Content-Range',`bytes ${start}-${end}/${bytes.byteLength}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');return new Response(bytes.slice(start,end+1),{status:206,headers})}return hit}const response=await fetch(request);if(response.ok&&response.status===200)caches.open(MEDIA_CACHE).then(cache=>cache.put(request,response.clone()));return response})());return}
  if(url.origin===location.origin){event.respondWith((async()=>{const hit=await caches.match(request),network=fetch(request).then(response=>{if(response.ok)caches.open(SHELL_CACHE).then(cache=>cache.put(request,response.clone()));return response});if(hit){event.waitUntil(network.catch(()=>{}));return hit}return network})());}
});
