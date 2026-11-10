'use strict';
const APP_BUILD='2.2.1';
const BASE=self.registration.scope;
const CACHE_PREFIX='volley-scout:'+new URL(BASE).pathname+':';
const CACHE=CACHE_PREFIX+APP_BUILD;
const VERSIONED=['training.css','training-model.js','training-store.js','training-ui.js','responsive.css','scout-v2.css','v21.css','data-compat.js','attack-position.js','volley-engine.js','stats-v2.js','coach-report.js','scout-v21.js','scout-v2.js','pwa.js','sheets-sync.js','team-management.js','saved-teams.js','blocker-tracking.js','formation-stats.js','sequence-stats.js'];
const STATIC=['manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
const url=file=>new URL(file,BASE).href;
const SHELL=[url('./'),url('index.html'),...VERSIONED.map(file=>url(file+'?v='+APP_BUILD)),...STATIC.map(url)];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})));
  const html=await cache.match(url('index.html'));
  if(!html||(await html.text()).indexOf('name="app-build" content="'+APP_BUILD+'"')<0)throw Error('La página no coincide con la versión de la aplicación.');
  // Una actualización espera. No se usa skipWaiting durante install.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()){
    if(key===CACHE)continue;
    if(key.startsWith(CACHE_PREFIX)){await caches.delete(key);continue;}
    if(key.startsWith('volley-scout-v2-')){
      const requests=await (await caches.open(key)).keys();
      if(requests.length&&requests.every(request=>request.url.startsWith(BASE)))await caches.delete(key);
    }
  }
  await self.clients.claim();
})()));
let updateInFlight=false;
function askClient(client){return new Promise(resolve=>{
  const channel=new MessageChannel();
  const timeout=setTimeout(()=>{channel.port1.close();resolve(false)},1800);
  channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();resolve(event.data?.canUpdate===true)};
  try{client.postMessage({type:'PWA_CAN_UPDATE'},[channel.port2]);}
  catch(error){clearTimeout(timeout);channel.port1.close();resolve(false);}
});}
self.addEventListener('message',event=>{
  if(event.data?.type!=='ACTIVATE_UPDATE')return;
  if(updateInFlight)return;
  updateInFlight=true;
  event.waitUntil((async()=>{
    const clients=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>client.url.startsWith(BASE));
    const allowed=await Promise.all(clients.map(askClient));
    if(allowed.some(value=>!value)){
      clients.forEach(client=>client.postMessage({type:'PWA_UPDATE_CANCELLED'}));
      updateInFlight=false;event.source?.postMessage({type:'PWA_UPDATE_BLOCKED'});return;
    }
    clients.forEach(client=>client.postMessage({type:'PWA_UPDATING'}));
    await self.skipWaiting();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,requested=new URL(request.url),base=new URL(BASE);
  if(request.method!=='GET'||requested.origin!==base.origin||!requested.pathname.startsWith(base.pathname))return;
  const relative=requested.pathname.slice(base.pathname.length);
  const navigation=request.mode==='navigate'&&(relative===''||relative==='index.html');
  const versioned=VERSIONED.includes(relative)&&requested.searchParams.get('v')===APP_BUILD;
  const plain=STATIC.includes(relative)&&!requested.search;
  if(!navigation&&!versioned&&!plain)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const response=await cache.match(navigation?url('index.html'):request);
    if(response)return response;
    // No actualizar recursos individualmente en una versión activa.
    return new Response('La instalación offline está incompleta. Abrí la página con conexión.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
  })());
});
