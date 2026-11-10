'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {MessageChannel}=require('node:worker_threads');
module.exports=async function verifyPwa(){
  const listeners={},stores=new Map(),requests=[],base='https://example.org/VoleyATA/';let skips=0,claims=0,busy=true;
  const oldCache='volley-scout:/VoleyATA/:2.0-test';stores.set(oldCache,new Map());stores.set('unrelated-app',new Map());
  function cache(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {async addAll(items){for(const request of items){requests.push(request.url);let file=new URL(request.url).pathname.slice('/VoleyATA/'.length)||'index.html';const bytes=fs.readFileSync(path.join(__dirname,file));data.set(request.url,new Response(bytes))}},async match(request){const response=data.get(typeof request==='string'?request:request.url);return response?.clone()},async keys(){return [...data.keys()].map(url=>new Request(url))}}}
  const messages=[],client={url:base,id:'test-client',postMessage(message,ports){messages.push(message);if(message.type==='PWA_CAN_UPDATE')ports[0].postMessage({canUpdate:!busy})}};
  const ctx=vm.createContext({URL,Request,Response,MessageChannel,setTimeout,clearTimeout,caches:{open:async name=>cache(name),keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},self:{registration:{scope:base},clients:{claim:async()=>{claims++},matchAll:async()=>[client]},skipWaiting:async()=>{skips++},addEventListener:(type,fn)=>listeners[type]=fn}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'service-worker.js'),'utf8'),ctx);
  async function event(type,values={}){let work;listeners[type]({...values,waitUntil:promise=>work=promise});await work;}
  const checks=[];
  await event('install');
  assert.equal(skips,0);assert.ok(stores.has(oldCache));assert.equal(requests.length,27);assert.ok(requests.every(url=>url.startsWith(base)));assert.ok(requests.some(url=>url.endsWith('scout-v21.js?v=2.2.0')));checks.push('instalación completa, versionada y sin activación forzada');
  let response;
  listeners.fetch({request:{method:'GET',url:base,mode:'navigate'},respondWith:p=>response=p});assert.equal((await response).status,200);checks.push('navegación bajo /VoleyATA/ usa HTML de la misma versión');
  response=null;listeners.fetch({request:{method:'GET',url:base+'scout-v21.js?v=2.2.0'},respondWith:p=>response=p});assert.match(await (await response).text(),/quickCausePoint/);checks.push('recurso JavaScript exacto disponible sin red');
  for(const request of [{method:'POST',url:base+'index.html'},{method:'GET',url:'https://script.google.com/macros/s/test/exec'},{method:'GET',url:'https://script.googleusercontent.com/test'},{method:'GET',url:'https://example.org/another-app/file.js'},{method:'GET',url:base+'scout-v21.js?v=old'}]){let intercepted=false;listeners.fetch({request,respondWith:()=>intercepted=true});assert.equal(intercepted,false)}checks.push('Apps Script, POST, otros scopes y versiones ajenas excluidos');
  await event('message',{data:{type:'ACTIVATE_UPDATE'},source:{postMessage:m=>messages.push(m)}});assert.equal(skips,0);assert.ok(messages.some(m=>m.type==='PWA_UPDATE_BLOCKED'));checks.push('otra pestaña ocupada impide activar');
  busy=false;await event('message',{data:{type:'ACTIVATE_UPDATE'},source:{postMessage:m=>messages.push(m)}});assert.equal(skips,1);assert.ok(messages.some(m=>m.type==='PWA_UPDATING'));checks.push('activación solo después de que todas las pestañas confirmen');
  await event('activate');assert.equal(claims,1);assert.equal(stores.has(oldCache),false);assert.equal(stores.has('unrelated-app'),true);checks.push('limpieza limitada a caché de la aplicación, sin datos de usuario');
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'service-worker.js'),'utf8'),/localStorage|indexedDB|sync\.register/);checks.push('worker independiente de estadísticas y sin promesa de background sync');
  return {passed:checks.length,checks};
};
if(require.main===module)module.exports().then(console.log);
