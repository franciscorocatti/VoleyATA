'use strict';
// La URL pública es parte del sitio. No se envían contraseñas ni se borra la configuración anterior.
const SHEETS_DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbz_tWTAsGJ7QzPZyJyM0KspQouL1cQNIn7se-2ucrSCiM2TNsTggxrkyka_0qLTaqA/exec';
const sheetsConfig = {url:SHEETS_DEFAULT_URL};
let sheetsTimer, sheetsBusy = false, sheetsAgain = false, sheetsFailures = 0;
let sheetsPhase = 'local';
let sheetsMessage = 'Guardado local · copia en la hoja pendiente';
function compactSheetsMessage() { return sheetsMessage; }
function sheetsPanel() {
  return `<div class="sheets-status-bar no-print" data-sync-phase="${sheetsPhase}"><span id="sheets-status" role="status" title="${esc(sheetsMessage)}">${esc(compactSheetsMessage())}</span><button class="btn btn-small" data-action="sheets-send">Reintentar envío</button><a href="https://docs.google.com/spreadsheets/d/1zzQpnoHHJNvNVTPdOyPkhcwftZUucV0tFPwxeYZdQpE/edit" target="_blank" rel="noopener">Abrir hoja</a></div>`;
}
function sheetsStatus(message, phase) {
  sheetsMessage = message;
  if (phase) sheetsPhase = phase;
  const el = document.getElementById('sheets-status');
  if (el) {
    el.textContent = compactSheetsMessage(); el.title = message;
    const panel = el.closest?.('.sheets-status-bar');
    if (panel) panel.dataset.syncPhase = sheetsPhase;
  }
}
function scheduleSheets() {
  clearTimeout(sheetsTimer);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    sheetsStatus('Guardado local · sin conexión · envío pendiente', 'offline');
    return;
  }
  sheetsStatus('Guardado local · envío pendiente', 'pending');
  if (sheetsBusy) { sheetsAgain = true; return; }
  // Agrupa las acciones de un rally y evita una petición por cada toque.
  sheetsTimer = setTimeout(sendSheets,4000);
}
async function sendSheets() {
  if(typeof localWriteError!=='undefined'&&localWriteError){sheetsStatus('No se guardó en este dispositivo · descargá una copia antes de continuar','error-local');return;}
  clearTimeout(sheetsTimer);
  if (sheetsBusy) { sheetsAgain = true; return; }
  if (typeof storageLoadResult !== 'undefined' && storageLoadResult?.readOnly) {
    sheetsStatus('Sincronización pausada · recuperá los datos locales antes de enviarlos', 'error'); return;
  }
  if (typeof state === 'undefined' || !Array.isArray(state.matches)) {
    sheetsStatus('Guardado local · no se pudo preparar el envío', 'error'); return;
  }
  if (!state.matches.length) { sheetsStatus('Creá un partido para enviarlo a la hoja', 'local'); return; }
  if (state.matches.length > 200) {
    sheetsStatus('Guardado local · error de sincronización: máximo 200 partidos por envío. Exportá una copia antes de organizar el archivo.', 'error'); return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    sheetsStatus('Guardado local · sin conexión · envío pendiente', 'offline'); return;
  }
  sheetsBusy = true;
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),45000);
  let failed = false;
  sheetsStatus('Guardado local · enviando a la hoja…', 'sending');
  try {
    // El consumidor antiguo sigue recibiendo matches; las columnas V2 van en pestañas auxiliares.
    const body = JSON.stringify({schemaVersion:2,matches:state.matches});
    const response = await fetch(sheetsConfig.url,{
      method:'POST',redirect:'follow',credentials:'omit',
      headers:{'Content-Type':'text/plain;charset=utf-8'},body,signal:controller.signal
    });
    if (!response.ok) throw new Error('HTTP '+response.status);
    const result = await response.json();
    if (!result || result.ok !== true) throw new Error(result?.error || 'Google no confirmó el guardado');
    sheetsFailures = 0;
    const openDraft = state.openRallies && Object.values(state.openRallies).some(rally=>Array.isArray(rally?.actions) && rally.actions.length);
    const draftNotice = openDraft ? ' · rally abierto guardado solo en este dispositivo' : '';
    if (result.contractVersion === 2) {
      sheetsStatus('Guardado confirmado en la hoja · '+new Date().toLocaleTimeString('es-AR')+draftNotice, 'confirmed');
    } else {
      sheetsStatus('Guardado confirmado (columnas anteriores) · actualizá Apps Script para conservar el detalle V2'+draftNotice, 'confirmed-legacy');
    }
  } catch (error) {
    failed = true; sheetsFailures++;
    const detail = error.name === 'AbortError' ? 'Google no respondió a tiempo' : error.message;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      sheetsStatus('Guardado local · sin conexión · envío pendiente', 'offline');
    } else {
      sheetsStatus('Guardado local · error de sincronización · '+detail+' · se reintentará', 'error');
    }
  } finally {
    clearTimeout(timeout); sheetsBusy = false;
    if (sheetsAgain) { sheetsAgain = false; scheduleSheets(); }
    else if (failed && navigator.onLine !== false) {
      sheetsTimer = setTimeout(sendSheets,Math.min(300000,30000*Math.pow(2,Math.min(sheetsFailures-1,4))));
    }
  }
}
document.addEventListener('click',e=>{
  if (e.target.closest('[data-action]')?.dataset.action === 'sheets-send') sendSheets();
});
window.addEventListener('online',scheduleSheets);
window.addEventListener('offline',()=>{
  clearTimeout(sheetsTimer);
  sheetsStatus('Guardado local · sin conexión · envío pendiente', 'offline');
});
scheduleSheets();

