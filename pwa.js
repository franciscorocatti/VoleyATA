'use strict';
const PWA=(()=>{
  let registration=null,installPrompt=null,waiting=null,shouldReload=false,reloading=false,readyOffline=false,updateInFlight=false,needsReload=false;
  const canUpdate=()=> (typeof TrainingUI==='undefined'||TrainingUI.canUpdate())&&!(typeof pending!=='undefined'&&pending.length)&&!(typeof localWriteError!=='undefined'&&localWriteError)&&!((typeof TrainingUI==='undefined'||TrainingUI.mode!=='training')&&typeof view!=='undefined'&&view==='live'&&typeof activeSet==='function'&&activeSet()&&!activeSet().finished);
  function persist(){return typeof storageLoadResult!=='undefined'&&storageLoadResult?.readOnly?true:typeof save!=='function'||save();}
  function status(message){const el=document.getElementById('pwa-status');if(el)el.textContent=message;}
  function refresh(){
    const banner=document.getElementById('pwa-update');if(banner)banner.hidden=!waiting&&!needsReload;
    const button=document.getElementById('pwa-install');if(button)button.hidden=!installPrompt;
    status(navigator.onLine===false?(readyOffline?'Sin conexión · aplicación disponible en este dispositivo':'Sin conexión · falta completar la instalación offline'):readyOffline?'Aplicación preparada para abrir sin conexión':'Preparando apertura sin conexión…');
  }
  async function applyUpdate(){
    if((!waiting&&!needsReload)||updateInFlight)return;
    if(!canUpdate()){status('Para actualizar, cerrá el rally o pausá el entrenamiento y abrí el historial. No se recargó la página.');return;}
    if(!persist()){status('Primero descargá una copia: no se pudo guardar en este dispositivo.');return;}
    if(needsReload){reloading=true;location.reload();return;}
    updateInFlight=true;
    waiting.postMessage({type:'ACTIVATE_UPDATE'});
  }
  async function install(){if(!installPrompt)return;const prompt=installPrompt;await prompt.prompt();await prompt.userChoice;installPrompt=null;refresh();}
  function inspectWaiting(){waiting=registration?.waiting||null;refresh();}
  async function start(){
    if(!('serviceWorker' in navigator)||!location.protocol.startsWith('http')){status('Para instalar y abrir sin conexión, usá la página publicada con HTTPS.');return;}
    try{
      registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'});
      inspectWaiting();
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'){readyOffline=true;inspectWaiting()}})});
      navigator.serviceWorker.ready.then(()=>{readyOffline=true;inspectWaiting()});
      registration.update().catch(()=>{});
    }catch(error){status('No se completó la instalación offline. Conectate y volvé a abrir la página.');}
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refresh()});
  window.addEventListener('appinstalled',()=>{installPrompt=null;refresh()});
  window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',event=>{
      if(event.data?.type==='PWA_CAN_UPDATE'){
        const allowed=canUpdate()&&persist();
        // La intención de recargar queda establecida ANTES de confirmar al worker.
        shouldReload=allowed;
        event.ports?.[0]?.postMessage({canUpdate:allowed});
      }
      if(event.data?.type==='PWA_UPDATING')shouldReload=true;
      if(event.data?.type==='PWA_UPDATE_CANCELLED'){shouldReload=false;updateInFlight=false;}
      if(event.data?.type==='PWA_UPDATE_BLOCKED'){updateInFlight=false;status('Hay otra pestaña registrando o una versión antigua abierta. Cerrá el rally y las otras pestañas antes de actualizar.');}
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!shouldReload||reloading)return;
      if(!canUpdate()){needsReload=true;refresh();status('Versión nueva lista. Cerrá el rally y abrí Partidos para actualizar sin interrumpir la carga.');return;}
      reloading=true;location.reload();
    });
  }
  document.addEventListener('click',event=>{const action=event.target.closest?.('[data-pwa]')?.dataset.pwa;if(action==='install')install();if(action==='update')applyUpdate();});
  window.addEventListener('load',start);
  return {start,refresh,canUpdate,applyUpdate};
})();
