const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
module.exports=async function verifyAutoSync(){
  let sent, removed=false, calls=0;
  const status={textContent:'',title:''}, listeners={}, timers=new Map();
  let timerId=0;
  const stored=new Map([['volley_sheets_config_v1','{"url":"previous","unknownPreference":true}']]);
  const ctx=vm.createContext({
    localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:()=>{removed=true}},
    document:{addEventListener(){},getElementById:()=>status},
    window:{addEventListener:(event,fn)=>listeners[event]=fn},
    navigator:{onLine:true},state:{matches:[{id:'test'}]},
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},
    clearTimeout:id=>timers.delete(id),AbortController,
    fetch:async(url,options)=>{calls++;sent={url,...options};return {ok:true,json:async()=>({ok:true,contractVersion:2})}}
  });
  const run=source=>vm.runInContext(source,ctx);
  run(fs.readFileSync(path.join(__dirname,'sheets-sync.js'),'utf8'));
  assert.equal(removed,false,'Las preferencias existentes no se borran');
  assert.match(stored.get('volley_sheets_config_v1'),/unknownPreference/);
  assert.equal(run('sheetsPhase'),'pending');
  ctx.state.openRallies={'set-open':{id:'pending-rally',actions:[{id:'pending-action'}]}};
  await run('sendSheets()');
  assert.equal(sent.url.includes('/exec'),true);
  assert.equal(Object.hasOwn(JSON.parse(sent.body),'token'),false);
  assert.equal(JSON.parse(sent.body).schemaVersion,2);
  assert.equal(Object.hasOwn(JSON.parse(sent.body),'openRallies'),false,'El rally abierto es copia local, no se inventa un punto remoto');
  assert.match(status.textContent,/Guardado confirmado en la hoja/);
  assert.match(status.textContent,/rally abierto guardado solo en este dispositivo/);
  assert.equal(run('sheetsPhase'),'confirmed');
  ctx.fetch=async()=>({ok:true,json:async()=>({ok:true})});
  await run('sendSheets()');
  assert.match(status.textContent,/columnas anteriores/);
  assert.equal(run('sheetsPhase'),'confirmed-legacy');
  ctx.fetch=async()=>({ok:true,json:async()=>({ok:false,error:'Encabezados incompatibles'})});
  await run('sendSheets()');
  assert.match(status.textContent,/Guardado local.*error de sincronización.*Encabezados/);
  assert.equal(run('sheetsPhase'),'error');
  assert.ok([...timers.values()].some(t=>t.delay===30000),'Primer reintento a los 30s');
  ctx.fetch=async()=>{throw Error('Failed to fetch')};
  await run('sendSheets()');
  assert.equal(run('sheetsPhase'),'error');
  assert.match(status.title,/Failed to fetch/);
  assert.ok([...timers.values()].some(t=>t.delay===60000),'Reintento limitado progresivamente');
  ctx.fetch=async()=>({ok:true,json:async()=>({ok:'true'})});
  await run('sendSheets()');
  assert.equal(run('sheetsPhase'),'error','No se acepta una confirmación no booleana');
  ctx.fetch=async()=>({ok:false,status:503});
  await run('sendSheets()');
  assert.match(status.title,/HTTP 503/);
  const beforeOffline=calls;
  ctx.navigator.onLine=false;
  await run('sendSheets()');
  assert.equal(calls,beforeOffline);
  assert.match(status.textContent,/Guardado local.*sin conexión.*pendiente/);
  assert.equal(run('sheetsPhase'),'offline');
  ctx.navigator.onLine=true;
  listeners.online();
  assert.equal(run('sheetsPhase'),'pending');
  assert.ok([...timers.values()].some(t=>t.delay===4000),'Volver online se agrupa, no inunda requests');
  // Una respuesta de un snapshot anterior no confirma cambios que ocurrieron durante su envío.
  let release;
  ctx.fetch=async()=>{calls++;await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({ok:true,contractVersion:2})}};
  const inFlight=run('sendSheets()');
  run('state.matches.push({id:"newer"});scheduleSheets()');
  release();await inFlight;
  assert.equal(run('sheetsPhase'),'pending');
  ctx.state.matches=Array.from({length:201},(_,i)=>({id:'m'+i}));
  const beforeLimit=calls;
  await run('sendSheets()');
  assert.equal(calls,beforeLimit);
  assert.match(status.textContent,/máximo 200/);
  assert.equal(run('sheetsPhase'),'error');
  ctx.state.matches=[{id:'test'}];ctx.storageLoadResult={readOnly:true};
  const beforeReadOnly=calls;
  await run('sendSheets()');
  assert.equal(calls,beforeReadOnly,'Una recuperación en modo solo lectura no sobrescribe la hoja');
  assert.match(status.textContent,/Sincronización pausada/);
  return {automaticEndpoint:'OK',noTokenSent:'OK',existingConfigPreserved:'OK',v2ContractAndLegacyWarning:'OK',strictRemoteConfirmation:'OK',openRallyRemainsLocal:'OK',failureAndBackoff:'OK',offlineRetry:'OK',inFlightChanges:'OK',batchLimit:'OK',readOnlyRecovery:'OK'};
};
if(require.main===module) module.exports().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1});

