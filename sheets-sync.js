'use strict';
const SHEETS_DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbxRAOMJWsZTT0r3vpHcQzUXpBgBJNHzImbtugmGBLlVRt2yZv6cuKLAyX1nGXTTiANZ/exec';
const sheetsConfig = {url:SHEETS_DEFAULT_URL};
// El enlace ya está configurado. Se retira la antigua clave guardada en el navegador.
try { localStorage.removeItem('volley_sheets_config_v1'); } catch (_) {}
let sheetsTimer, sheetsBusy = false, sheetsAgain = false;
let sheetsMessage = 'Guardado automático en Google Sheets';
function compactSheetsMessage() {
  if (sheetsMessage.startsWith('Guardado confirmado')) return sheetsMessage;
  if (sheetsMessage.startsWith('Enviando')) return 'Enviando a la hoja…';
  if (sheetsMessage.includes('Clave de conexión incorrecta')) return 'Falta actualizar el script de Google para conectar sin clave';
  if (sheetsMessage.startsWith('Envío pendiente') || sheetsMessage.startsWith('Sin conexión')) return 'Copia en la hoja pendiente · datos guardados en este dispositivo';
  if (sheetsMessage.startsWith('Creá')) return 'La hoja se actualizará al crear un partido';
  return 'Guardado automático en la hoja · cambios pendientes';
}
function sheetsPanel() {
  return `<div class="sheets-status-bar no-print"><span id="sheets-status" role="status" title="${esc(sheetsMessage)}">${esc(compactSheetsMessage())}</span><button class="btn btn-small" data-action="sheets-send">Reintentar envío</button><a href="https://docs.google.com/spreadsheets/d/1zzQpnoHHJNvNVTPdOyPkhcwftZUucV0tFPwxeYZdQpE/edit" target="_blank" rel="noopener">Abrir hoja</a></div>`;
}
function sheetsStatus(message) {
  sheetsMessage = message;
  const el = document.getElementById('sheets-status');
  if (el) { el.textContent = compactSheetsMessage(); el.title = message; }
}
function scheduleSheets() {
  sheetsStatus('Cambios pendientes de envío');
  clearTimeout(sheetsTimer);
  if (sheetsBusy) { sheetsAgain = true; return; }
  sheetsTimer = setTimeout(sendSheets,4000);
}
async function sendSheets() {
  clearTimeout(sheetsTimer);
  if (sheetsBusy) { sheetsAgain = true; return; }
  if (!state.matches.length) { sheetsStatus('Creá un partido para enviarlo'); return; }
  if (!navigator.onLine) { sheetsStatus('Sin conexión · envío pendiente'); return; }
  sheetsBusy = true;
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),45000);
  sheetsStatus('Enviando…');
  try {
    const response = await fetch(SHEETS_DEFAULT_URL,{
      method:'POST',redirect:'follow',credentials:'omit',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({matches:state.matches}),signal:controller.signal
    });
    if (!response.ok) throw new Error('HTTP '+response.status);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Google no confirmó el guardado');
    sheetsStatus('Guardado confirmado · '+new Date().toLocaleTimeString('es-AR'));
  } catch (error) {
    sheetsStatus('Envío pendiente · '+(error.name === 'AbortError' ? 'Google no respondió a tiempo' : error.message));
  } finally {
    clearTimeout(timeout);sheetsBusy=false;
    if (sheetsAgain) { sheetsAgain=false;scheduleSheets(); }
  }
}
 document.addEventListener('click',e=>{
  if (e.target.closest('[data-action]')?.dataset.action === 'sheets-send') sendSheets();
});
window.addEventListener('online',scheduleSheets);
scheduleSheets();