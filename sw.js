'use strict';
const CACHE='volley-scout-v2-20261107-endpoint-3';
const SHELL=['./','./index.html','./responsive.css','./scout-v2.css','./data-compat.js','./volley-engine.js','./stats-v2.js','./scout-v2.js','./sheets-sync.js','./team-management.js','./saved-teams.js','./blocker-tracking.js','./formation-stats.js','./sequence-stats.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('volley-scout-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{try{const response=await fetch(event.request);if(response.ok){try{const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}catch(_){}}return response;}catch(_){return await caches.match(event.request)||(event.request.mode==='navigate'?await caches.match('./index.html'):Response.error());}})());
});
