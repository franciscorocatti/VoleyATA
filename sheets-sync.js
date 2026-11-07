'use strict';
// Configuración privada de este navegador; nunca se incluye en las copias JSON.
const SHEETS_CONFIG = 'volley_sheets_config_v1';
const SHEETS_DEFAULT_URL = 'https://script.google.com/macros/s/AKfycby694u9MysauPjttNvkBBUPeTPky9BSIOXgOyLZts-63IktIBkXekZaBk5bBNI6YO6o/exec';
let sheetsConfig = {};
try { sheetsConfig = JSON.parse(localStorage.getItem(SHEETS_CONFIG)) || {}; } catch (_) {}
let sheetsTimer, sheetsBusy = false, sheetsAgain = false;
let sheetsMessage = 'Ingresá la clave para activar el guardado automático';

function sheetsPanel() {
  return `<details class="card no-print" style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:750">Google Sheets · <span id="sheets-status" role="status">${esc(sheetsMessage)}</span></summary>
  <p style="margin-top:12px">Los cambios guardados se envían automáticamente a tu hoja. Las acciones del punto se envían al cerrar el rally. Conservamos también la copia local.</p>
  <div class="grid-2"><div class="field"><label for="sheets-url">URL de la aplicación web de Apps Script (termina en /exec)</label><input id="sheets-url" type="url" value="${esc(sheetsConfig.url || SHEETS_DEFAULT_URL)}" placeholder="https://script.google.com/macros/s/…/exec"></div>
  <div class="field"><label for="sheets-token">Clave de conexión configurada en Apps Script</label><input id="sheets-token" type="password" autocomplete="off" value="${esc(sheetsConfig.token || '')}"></div></div>
  <div class="row" style="margin-top:12px"><button class="btn btn-primary" data-action="sheets-connect">Guardar conexión y enviar</button><button class="btn" data-action="sheets-send">Enviar todos los partidos</button><button class="btn" data-action="sheets-disconnect">Desconectar</button><a class="btn" href="https://docs.google.com/spreadsheets/d/1zzQpnoHHJNvNVTPdOyPkhcwftZUucV0tFPwxeYZdQpE/edit" target="_blank" rel="noopener">Abrir hoja</a><a href="CONECTAR_GOOGLE_SHEETS.md" target="_blank" rel="noopener">Instrucciones de conexión</a></div>
  <p class="hinttext">Requiere Internet. Si falla el envío, los datos locales se conservan y se reintenta al recuperar conexión o volver a abrir la página. Eliminar un partido aquí no elimina su copia en la hoja. Cada partido debe cargarse desde un solo dispositivo.</p></details>`;
}
function sheetsStatus(message) {
  sheetsMessage = message;
  const el = document.getElementById('sheets-status');
  if (el) el.textContent = message;
}
function scheduleSheets() {
  if (!sheetsConfig.url) return;
  sheetsStatus('Cambios pendientes de envío');
  clearTimeout(sheetsTimer);
  if (sheetsBusy) { sheetsAgain = true; return; }
  sheetsTimer = setTimeout(sendSheets, 4000);
}
async function sendSheets() {
  clearTimeout(sheetsTimer);
  if (!sheetsConfig.url) { sheetsStatus('Configurá la conexión primero'); return; }
  if (sheetsBusy) { sheetsAgain = true; return; }
  if (!state.matches.length) { sheetsStatus('Creá un partido para enviarlo'); return; }
  if (!navigator.onLine) { sheetsStatus('Sin conexión · envío pendiente'); return; }
  sheetsBusy = true;
  const config = {...sheetsConfig};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  sheetsStatus('Enviando…');
  try {
    const response = await fetch(config.url, {
      method: 'POST', redirect: 'follow', credentials: 'omit',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify({token: config.token, matches: state.matches}),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Google no confirmó el guardado');
    if (sheetsConfig.url === config.url) sheetsStatus('Guardado confirmado · ' + new Date().toLocaleTimeString('es-AR'));
  } catch (error) {
    if (sheetsConfig.url === config.url) sheetsStatus('Envío pendiente · ' + (error.name === 'AbortError' ? 'Google no respondió a tiempo' : error.message) + '. Revisá la URL, la clave y los permisos; luego reintentá.');
  } finally {
    clearTimeout(timeout);
    sheetsBusy = false;
    if (sheetsAgain) { sheetsAgain = false; scheduleSheets(); }
  }
}
document.addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'sheets-connect') {
    const url = document.getElementById('sheets-url').value.trim();
    const token = document.getElementById('sheets-token').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) || token.length < 24) {
      toast('Pegá la URL /exec y una clave de al menos 24 caracteres.'); return;
    }
    try { localStorage.setItem(SHEETS_CONFIG, JSON.stringify({url, token})); }
    catch (_) { toast('No se pudo guardar la configuración en este navegador.'); return; }
    sheetsConfig = {url, token}; sendSheets();
  }
  if (action === 'sheets-send') sendSheets();
  if (action === 'sheets-disconnect') {
    try { localStorage.removeItem(SHEETS_CONFIG); } catch (_) {}
    sheetsConfig = {}; clearTimeout(sheetsTimer); sheetsAgain = false;
    sheetsStatus('Conexión desactivada'); render();
  }
});
window.addEventListener('online', scheduleSheets);
scheduleSheets();
