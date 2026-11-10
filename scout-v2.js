'use strict';
let scoutMode='quick',autoClosePoints=true,originZone=null,destinationZone=null,settingTarget='',receiverId='',ownBlockers=[],
  editingActionIndex=null,awaitingBlockerIndex=null,pointCause=null,sequenceComplete=false,openRallyId=null,lastPointCommit=0,lastActionTap=0,localWriteError='',useBlockerDraft={skill:'attack',outcomeId:'use_block_out'};
const SCOUT_CAUSES={opponent_attack:'Ataque rival',opponent_serve:'Saque rival',opponent_block:'Bloqueo rival',opponent_error:'Error rival',own_error:'Error propio',unknown:'Otro / desconocido'};
function localSaveBanner(){return localWriteError?'<div class="errorbox no-print" role="alert" style="margin-bottom:12px"><strong>No se guardaron los últimos cambios en este dispositivo.</strong><p>Siguen en la memoria de esta página. Descargá una copia antes de recargar o cerrar.</p><button class="btn" data-action="backup">Descargar copia actual</button><button class="btn" data-action="v2-retry-local">Reintentar guardado</button></div>':'';}
function renderCriteriaCard(m){const c=StatsV2.getMatchData(m).config;return `<details class="card"><summary style="cursor:pointer;font-weight:750">Criterios estadísticos del partido</summary><p class="hinttext">Los resultados originales se conservan. Sheets mantiene su convención de bloqueo punto como error; estos selectores afectan el informe y CSV de la página.</p>${[['blockedPointIsError','Contar bloqueo punto como error de ataque'],['assistsEnabled','Contar asistencias del último armado antes de un kill'],['assistRequiresReceiver','Exigir atacante identificado en el armado para contar asistencia']].map(([key,label])=>`<label class="row" style="margin-top:10px"><input type="checkbox" style="width:18px;min-height:18px" data-v2-stat="${key}" ${c[key]?'checked':''}>${label}</label>`).join('')}</details>`;}
function initializeScout() {
  state.preferences ||= {};
  if(state.activeId&&!state.matches.some(m=>m.id===state.activeId))state.activeId=state.matches[0]?.id||null;
  scoutMode=state.preferences.mode==='advanced'?'advanced':'quick';autoClosePoints=state.preferences.autoClose!==false;
  restoreScoutDraft();
}
function importScoutBackup(raw) {
  try{const incoming=JSON.parse(raw);if(incoming.training||incoming.trainingSession){TrainingUI.importBackup(raw);return true;}}catch(_){}

  let object;try{object=JSON.parse(raw)}catch(_){toast('El archivo no contiene JSON válido.');return false;}
  const prepared=VolleyData.prepareImport(object,state);
  if(!prepared.ok){toast('La copia no tiene una estructura compatible. Los datos actuales no se modificaron.');return false;}
  const summary=prepared.summary;
  const message=prepared.kind==='match'?`Importar un partido${summary.replacedMatches?' reemplazará el partido con el mismo ID':''}. ¿Continuar?`:`Restaurar esta copia reemplaza los ${summary.currentMatches} partidos actuales por ${summary.incomingMatches} de la copia. Se guardará un respaldo previo. ¿Continuar?`;
  if(!confirm(message))return false;
  try{
    const previous=localStorage.getItem(KEY);
    VolleyData.createBackup(localStorage,KEY,previous,'before-import-'+Date.now());
    // Validación y escritura antes de cambiar el estado de la pantalla.
    const serialized=JSON.stringify(prepared.state);localStorage.setItem(KEY,serialized);if(localStorage.getItem(KEY)!==serialized){if(previous!==null)localStorage.setItem(KEY,previous);throw Error("No se verificó la importación")}
    state=prepared.state;localWriteError='';storageLoadResult={...storageLoadResult,state,readOnly:false,ok:true};
    initializeScout();view='matches';showSetup=false;render();scheduleSheets();toast('Copia restaurada. El estado anterior quedó respaldado.');return true;
  }catch(error){toast('No se pudo resguardar o importar la copia. Los datos actuales se conservan.');return false;}
}
function restoreScoutDraft() {
  const s=activeSet(),draft=s&&state.openRallies?.[s.id];
  resetRivalAttack();rivalDraft={...rivalDraft,...(draft?.rivalDraft||{})};rivalPanel=false;rivalTactics=false;rivalEditor='';
  pending=draft?.actions?structuredCloneSafe(draft.actions):[];
  openRallyId=draft?.id||uid();
  selectedPlayerId=draft?.selectedPlayerId||null;selectedSkill=skills[draft?.selectedSkill]?draft.selectedSkill:'attack';
  attackOriginManual=draft?.attackOriginManual===true;attackDirection=draft?.attackDirection??null;attackDirectionSkipped=draft?.attackDirectionSkipped===true;attackType=draft?.attackType||'conventional';originZone=draft?.originZone??null;destinationZone=draft?.destinationZone??null;selectedZone=null;
  pointCause=draft?.pointCause||null;sequenceComplete=draft?.sequenceComplete===true;
  editingActionIndex=null;awaitingBlockerIndex=draft?.awaitingBlockerIndex??null;ownBlockers=draft?.ownBlockers||[];settingTarget=draft?.settingTarget||'';receiverId=draft?.receiverId||'';
  useBlockerDraft={...(draft?.useBlockerDraft||{}),skill:'attack',outcomeId:'use_block_out'};attackRoleOverride=draft?.attackRoleOverride||'auto';quickCausesOpen=false;
}
function persistScoutDraft() {
  const s=activeSet();if (!s) return;
  state.openRallies ||= {};
  state.openRallies[s.id]={id:openRallyId||uid(),actions:structuredCloneSafe(pending),mode:scoutMode,selectedPlayerId,selectedSkill,
    rivalDraft:structuredCloneSafe(rivalDraft),originZone,destinationZone,pointCause,sequenceComplete,awaitingBlockerIndex,ownBlockers,settingTarget,receiverId,attackRoleOverride,attackOriginManual,attackDirection,attackDirectionSkipped,attackType,useBlockerDraft:structuredCloneSafe(useBlockerDraft)};
  state.preferences={...state.preferences,mode:scoutMode,autoClose:autoClosePoints};
}
function resetActionInputs() {attackOriginManual=false;attackDirection=null;attackDirectionSkipped=false;attackType='conventional';attackRoleOverride='auto';originZone=null;destinationZone=null;selectedZone=null;ownBlockers=[];settingTarget='';receiverId='';useBlockerDraft={skill:'attack',outcomeId:'use_block_out'};editingActionIndex=null;zonePickerOpen=false;}
function scoutActionLabel(action,rally) {
  if(action.skill==='rival_attack')return rivalAttackLabel(activeMatch(),action);
  const result=VolleyCatalog.outcome(action,rally);
  return (skills[action.skill]?.name||action.skill)+' · '+(result?.label||action.outcome)+(typeof blockerText==='function'?blockerText(action):'');
}
function scoutIcon(skill) {
  const paths={serve:'M5 19l5-7 7-3M10 12l-3-5M15 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 20h13',reception:'M7 21l3-8 7 1M10 13l-4-3M10 13l7-5M8 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 5h4',attack:'M7 21l4-7 5 5M11 14V8l5-4M11 8L7 6M9 3a2 2 0 1 0 4 0a2 2 0 1 0-4 0M18 8l3-3',block:'M7 21V11M15 21V11M7 12L5 4M15 12l2-8M8 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 17h18',defense:'M3 20l6-7 6 2 6 2M9 13l-4-2M13 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M1 21h22',setting:'M8 21l2-9h4l2 9M10 12L6 6l3-3M14 12l4-6-3-3M10 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M11 1h2'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[skill]||paths.attack}"/></svg>`;
}
function renderZoneGrid(kind,label,selected) {
  return `<div><div class="row-between"><strong>${label}</strong><button class="btn btn-small" data-action="v2-zone-clear" data-kind="${kind}">Sin zona</button></div><div class="v2-zone-grid">${[4,3,2,5,6,1].map(n=>`<button class="zone ${selected===n?'selected':''}" data-action="v2-zone" data-kind="${kind}" data-zone="${n}" aria-pressed="${selected===n}">${n}</button>`).join('')}</div></div>`;
}
function renderScoutZones() {
  if(selectedSkill==='attack')return `<details class="v2-extra"><summary>Más detalles</summary>${renderZoneGrid('origin','Corregir origen',originZone)}${renderZoneGrid('destination','Destino exacto · opcional',destinationZone)}</details>`;
  const destination=['serve','attack'].includes(selectedSkill);
  let body=selectedSkill==='attack'?renderZoneGrid('origin','Origen · campo propio',originZone):'';
  body+=renderZoneGrid(destination?'destination':'origin',destination?'Destino · campo rival':'Ubicación · campo propio',destination?destinationZone:originZone);
  return `<button class="btn v2-zone-toggle" data-action="toggle-zone" aria-expanded="${zonePickerOpen}" aria-controls="v2-zone-options">${originZone||destinationZone?`Zonas: ${originZone?'origen '+originZone:''} ${destinationZone?'destino '+destinationZone:''}`:'Zonas opcionales · sin registrar'} <span>${zonePickerOpen?'▴':'▾'}</span></button><div id="v2-zone-options" class="v2-zones ${zonePickerOpen?'is-open':''}">${body}<p class="hinttext">Solo se guarda una zona si la seleccionás.</p></div>`;
}
function renderScoutExtras(m,s) {
  if(selectedSkill==='attack')return attackType==='use_block_out'?renderRivalBlockerFields(m,useBlockerDraft,-1):`<details class="v2-extra"><summary>Bloqueadores rivales · opcional</summary>${renderRivalBlockerFields(m,useBlockerDraft,-1)}</details>`;
  if (scoutMode!=='advanced') return '';
  if (selectedSkill==='attack') return `<details class="v2-extra"><summary>Use / block-out · bloqueador rival (opcional)</summary>${renderRivalBlockerFields(m,useBlockerDraft,-1)}</details>`;
  const current=courtPlayers(s),players=m.players.filter(p=>current.includes(p.id));
  let fields='';
  if (selectedSkill==='block') fields=`<fieldset><legend>Bloqueadores participantes</legend>${players.map(p=>`<label class="row"><input type="checkbox" data-v2-blocker="${esc(p.id)}" ${p.id===selectedPlayerId||ownBlockers.includes(p.id)?'checked':''} ${p.id===selectedPlayerId?'disabled':''}>#${esc(p.number)} ${esc(p.name)}</label>`).join('')}<small>Un solo punto colectivo; individual o asistido según participantes.</small></fieldset>`;
  if (selectedSkill==='setting') fields=`<div class="grid-2"><div class="field"><label for="setting-target">Destino del armado</label><select id="setting-target" data-v2-field="settingTarget"><option value="">Sin identificar</option>${[['outside','Punta'],['middle','Central'],['opposite','Opuesto'],['backrow','Zaguero'],['other','Otro']].map(([v,l])=>`<option value="${v}" ${settingTarget===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label for="setting-receiver">Atacante receptor (opcional)</label><select id="setting-receiver" data-v2-field="receiverId"><option value="">Sin identificar</option>${teamOptions(players,receiverId)}</select></div></div>`;
  return fields?`<details class="v2-extra" open><summary>Detalle de ${esc(skills[selectedSkill].name.toLowerCase())}</summary>${fields}</details>`:'';
}
function renderPendingV2(m) {
  return `<div id="rally-current" class="card v2-pending"><div class="section-head"><h2>Rally actual</h2><span class="pill">${pending.length} acciones</span></div>${pending.length?`<ol class="v2-action-list">${pending.map((a,i)=>`<li><span><strong>${esc(a.skill==='rival_attack'?'Rival #'+(rivalPlayer(m,a.playerId)?.number||'?'):pname(m,a.playerId))}</strong><br>${esc(scoutActionLabel(a))}<small>${a.originZone?' · origen '+a.originZone:''}${a.destinationZone?' · destino '+a.destinationZone:''}</small></span>${a.skill==='rival_attack'?'':`<button class="btn btn-small" data-action="v2-edit" data-index="${i}">Editar</button>`}<button class="btn btn-small btn-danger" data-action="remove-draft" data-index="${i}" aria-label="Quitar acción ${i+1}">×</button></li>`).join('')}</ol>`:'<p class="hinttext">Podés sumar un punto sin atribuirlo a un jugador.</p>'}
  ${scoutMode==='advanced'?`<label class="row"><input type="checkbox" data-v2-field="sequenceComplete" ${sequenceComplete?'checked':''}>Registré la secuencia completa de este rally</label>`:'<small>Modo rápido: muestra parcial de acciones.</small>'}
  <div class="field" style="margin-top:10px"><label for="point-cause">Causa del punto (opcional, sin atribución individual)</label><select id="point-cause" data-v2-field="pointCause"><option value="">Sin identificar</option>${Object.entries(SCOUT_CAUSES).map(([value,label])=>`<option value="${value}" ${pointCause===value?'selected':''}>${label}</option>`).join('')}</select></div>
  ${renderBlockerPickers(m)}
  <div class="row" style="margin-top:10px"><button class="btn btn-small" data-action="remove-last-draft" ${!pending.length?'disabled':''}>Quitar última acción</button><button class="btn btn-small" data-action="undo-rally" ${!activeSet()?.rallies.length?'disabled':''}>Deshacer último punto</button><button class="btn btn-small" data-action="v2-correct-winner" ${!activeSet()?.rallies.length?'disabled':''}>Corregir ganador anterior</button></div></div>`;
}
function renderScoutV2(m) {
  const s=activeSet(),wins=matchWinner(m),definition=VolleyCatalog.definitions[selectedSkill],ended=matchEnded(m);
  return `<section class="scout-v2 ${rivalPanel?'has-rival-panel':''}"><header class="v2-live-head"><div class="v2-score"><div><span>${esc(m.team)}</span><strong>${s.score.us}</strong></div><span class="v2-score-sep">:</span><div><span>${esc(m.opponent)}</span><strong>${s.score.them}</strong></div><small>Set ${s.number} · ${wins.us}–${wins.them} sets<br>R${s.rotation} · ${s.finished?'Finalizado':s.serve==='us'?'Sacamos':'Recibimos'}</small></div><div class="v2-mode-controls"><div class="v2-mode-switch" role="group" aria-label="Modo de registro"><button class="${scoutMode==='quick'?'active':''}" data-action="v2-mode" data-mode="quick" aria-pressed="${scoutMode==='quick'}">Modo rápido</button><button class="${scoutMode==='advanced'?'active':''}" data-action="v2-mode" data-mode="advanced" aria-pressed="${scoutMode==='advanced'}">Modo avanzado</button></div><label class="v2-auto"><input type="checkbox" data-v2-field="autoClose" ${autoClosePoints?'checked':''}>Cierre automático</label></div></header>
  ${s.finished?`<div class="callout v2-finished">Set finalizado. ${ended?'Partido terminado.':'Revisá la formación del próximo set.'}<div class="row">${!ended?'<button class="btn btn-primary" data-action="next-set">Siguiente set</button>':''}<button class="btn" data-action="coach-open">Informe del entrenador</button><button class="btn" data-action="undo-rally">Corregir último punto</button></div></div>`:''}
  ${renderRivalAccess(m)}<div class="v2-console"><div class="card v2-player-card"><div class="section-head"><h2>Jugador</h2><button class="btn btn-small" data-action="view" data-view="settings">Cambios / líbero</button></div><div class="player-grid live-court-grid" data-court-side="us">${[4,3,2,5,6,1].map(pos=>{const id=courtPlayers(s)[pos-1],p=playerById(m,id);return `<button class="player ${selectedPlayerId===id?'selected':''} ${p?.isLibero?'is-libero':''}" data-action="select-player" data-player="${esc(id)}" data-court-player="${esc(id)}" aria-pressed="${selectedPlayerId===id}"><span class="jersey">${esc(p?.number||'?')}</span><span class="v2-player-copy"><span class="playername">${esc(p?.name||'Sin jugador')}</span><span class="playerpos">P${pos}${p?.isLibero?' · LÍBERO':''}</span></span></button>`}).join('')}</div><p class="hinttext">Red ↑ · posiciones 4–3–2 / 5–6–1</p></div>
  <div class="card v2-entry-card"><div class="v2-skills" role="group" aria-label="Fundamento">${Object.entries(VolleyCatalog.definitions).map(([key,value])=>`<button class="skill ${key===selectedSkill?'selected':''}" data-action="select-skill" data-skill="${key}" aria-pressed="${key===selectedSkill}">${scoutIcon(key)}<span>${value.name}</span></button>`).join('')}</div><div class="v2-selected"><strong>${selectedPlayerId?esc(pname(m,selectedPlayerId)):'Elegí un jugador'}</strong><small>${esc(definition.name)}${editingActionIndex!==null?' · editando acción '+(editingActionIndex+1):''}</small></div>
  ${awaitingBlockerIndex!==null?`<div class="inline-block-confirm">${renderRivalBlockerFields(m,pending[awaitingBlockerIndex],awaitingBlockerIndex)}<button class="btn btn-primary" data-action="v2-confirm-block">Guardar bloqueo · punto rival</button></div>`:''}${selectedSkill==='attack'?renderAttackControls():''}<div class="outcome-grid v2-outcomes">${definition.outcomes.filter(out=>selectedSkill!=='attack'||attackOutcomeVisible(out)).map(out=>`<button class="outcome ${out.winner==='us'?'good':out.winner==='them'?'bad':'neutral'}" data-action="v2-result" data-result="${out.id}" ${s.finished?'disabled':''}><span aria-hidden="true">${out.winner==='us'?'✓':out.winner==='them'?'×':'↻'}</span>${out.label}</button>`).join('')}</div>
  ${editingActionIndex!==null?'<button class="btn btn-small" data-action="v2-edit-cancel">Cancelar edición</button>':''}${selectedSkill==='attack'?'<p class="hinttext">Toque / colocada: solo una acción ofensiva dirigida al campo rival.</p>':''}${renderScoutZones()}${renderScoutExtras(m,s)}<p class="hinttext">${scoutMode==='advanced'?'Las pelotas gratuitas no se registran como ataques. ':''}${autoClosePoints?'✓ / × cierran el punto automáticamente; ↻ continúa el rally.':'El cierre automático está desactivado. Usá los botones de punto.'}</p></div></div>
  ${renderPendingV2(m)}<details class="card v2-history"><summary>Últimos puntos · ${s.rallies.length} disputados</summary><div class="history">${s.rallies.slice(-8).reverse().map(r=>`<div class="history-row"><div><strong>${r.scoreBefore.us+(r.winner==='us'?1:0)}–${r.scoreBefore.them+(r.winner==='them'?1:0)} · ${esc(r.winner==='us'?m.team:m.opponent)}</strong><br><small>R${r.rotation} · ${r.mode==='advanced'?'Avanzado':r.mode==='quick'?'Rápido':'Registro anterior'} · ${r.actions.length?r.actions.map(a=>esc(scoutActionLabel(a,r))).join(' → '):esc(SCOUT_CAUSES[r.cause]||'Sin acción individual')}</small></div></div>`).join('')||'<p class="hinttext">Sin puntos todavía.</p>'}</div></details>
  ${!s.finished?`<footer class="v2-point-dock no-print">${renderQuickCausePanel()}<div class="v2-dock-top"><button class="btn btn-small" data-action="v2-smart-undo">↶ Deshacer</button><span>${pending.length?esc(scoutActionLabel(pending.at(-1))):'Sin acciones pendientes'}</span><button class="btn btn-small" data-action="v2-current-rally">Rally (${pending.length})</button></div><div class="rally-buttons ${scoutMode==='quick'?'v21-with-causes':''}"><button class="rally-btn us" data-action="finish-rally" data-winner="us">+ Punto · ${esc(m.team)}</button><button class="rally-btn them" data-action="finish-rally" data-winner="them">+ Punto · ${esc(m.opponent)}</button>${scoutMode==='quick'?'<button class="btn v21-cause-toggle" data-action="v21-cause-toggle" aria-label="Cómo nos hicieron el punto">Con causa ▴</button>':''}</div></footer>`:''}</section>`;
}
function addScoutAction(result,input={}) {
  const now=Date.now();if (now-lastPointCommit<600||now-lastActionTap<260) return false;
  const m=activeMatch(),s=activeSet();if (!m||!s) return false;
  const edit=editingActionIndex,previous=edit!==null?pending[edit]:null;
  const base=edit!==null?pending.slice(0,edit):pending;
  const previousMetadata={...(previous?.metadata||{})};
  delete previousMetadata.attackPhase;delete previousMetadata.setterId;
  const useBlocker=selectedSkill==='attack'&&['use_block_out','blocked_point','covered_block'].includes(result)?useBlockerDraft:null;
  if(isRivalBlockContact(previous)||useBlocker){delete previousMetadata.rivalBlockers;delete previousMetadata.rivalBlockerRoles;delete previousMetadata.rivalBlockerUnidentified;}
  const created=VolleyEngine.createAction({id:previous?.id,playerId:selectedPlayerId,skill:selectedSkill,outcomeId:result,
    originZone:selectedSkill==='attack'?(attackOriginManual?originZone:originZone??defaultAttackOrigin()):originZone,destinationZone,attackRoleOverride,participants:ownBlockers,blocker:useBlocker?useBlocker.blocker:isRivalBlockContact(previous)?null:previous?.blocker,metadata:{...previousMetadata,...(selectedSkill==='attack'?{attackDirection,playerPosition:playerPosition(playerById(m,selectedPlayerId)),attackType}:{}),...(useBlocker?{rivalBlockers:rivalBlockers(useBlocker),rivalBlockerRoles:useBlocker.metadata?.rivalBlockerRoles||[],rivalBlockerUnidentified:useBlocker.metadata?.rivalBlockerUnidentified===true}:{}),settingTarget:settingTarget||null,receiverId:receiverId||null},...input},
    {match:m,set:s,actions:base,mode:scoutMode});
  if (created.error) {toast(created.error);return false;}
  if (edit!==null&&created.terminalWinner&&edit!==pending.length-1) {toast('Una acción terminal debe ser la última. Quitá primero las acciones posteriores.');return false;}
  lastActionTap=now;
  if (edit!==null) pending[edit]=created.action;else pending.push(created.action);
  pending.forEach((a,i)=>{if(a.schemaVersion===2)a.order=i+1;});
  awaitingBlockerIndex=null;resetActionInputs();
  if (created.action.outcomeId==='blocked_point'&&created.action.attackRole!=='back'&&autoClosePoints) {awaitingBlockerIndex=edit??pending.length-1;save();render();return true;}
  const locallySaved=save();
  if (created.terminalWinner&&autoClosePoints) return finishRally(created.terminalWinner,{automatic:true});
  render();toast(locallySaved?scoutActionLabel(created.action)+' · acción guardada':'Acción en memoria. Descargá una copia; no se pudo guardar.');return true;
}
function commitScoutRally(winner,options={}) {
  const now=Date.now();if (now-lastPointCommit<600) return false;
  const m=activeMatch(),s=activeSet();if(!m||!s)return false;
  const motion=s.serve!==winner?captureCourtRotation(winner):null;
  const terminal=VolleyEngine.terminalCause(pending);
  // Una terminal corregida reemplaza la causa colectiva recuperada al deshacer.
  const cause=options.automatic&&terminal&&pointCause&&!terminal.allowed.includes(pointCause)?terminal.preferred:pointCause;
  const result=VolleyEngine.closeRally(m,s,pending,{winner,id:openRallyId||uid(),mode:scoutMode,cause,sequenceComplete,...options});
  if(result.error){toast(result.error);return false;}
  lastPointCommit=now;reconcileLibero(s);pending=[];awaitingBlockerIndex=null;openRallyId=uid();pointCause=null;sequenceComplete=false;resetActionInputs();
  const locallySaved=save();render();if(!s.finished)playCourtRotation(motion);
  toast(!locallySaved?'Punto en memoria: no se pudo guardar. Descargá una copia antes de cerrar.':s.finished?'Set finalizado · '+(matchEnded(m)?'Partido terminado':'Podés iniciar el siguiente set'):`Punto ${winner==='us'?m.team:m.opponent} · ${s.score.us}–${s.score.them} · Deshacer disponible`);
  return true;
}
function undoScoutRally() {
  const s=activeSet();if(!s)return false;
  if(pending.length&&!confirm('Hay acciones sin cerrar. ¿Reemplazarlas por las del último punto?'))return false;
  let result=VolleyEngine.undoRally(s);
  if(result.needsConfirmation){if(!confirm('Después del punto se realizaron cambios de jugadores. Deshacer también revertirá esos cambios. ¿Continuar?'))return false;result=VolleyEngine.undoRally(s,{allowLaterChanges:true});}
  if(result.error){toast(result.error);return false;}
  pending=result.actions;openRallyId=result.rally.id;pointCause=result.rally.cause||null;sequenceComplete=result.rally.sequenceComplete===true;
  awaitingBlockerIndex=null;editingActionIndex=null;lastPointCommit=0;lastActionTap=0;const locallySaved=save();render();toast(locallySaved?'Punto deshecho. Corregí sus acciones antes de volver a cerrarlo.':'Corrección en memoria: descargá una copia.');return true;
}
function handleScoutAction(action,t) {
  if(handleRivalAction(action,t))return true;
  if(handleAttackFast(action,t))return true;
  if(handleScoutV21Action(action,t))return true;
  if(action==='add-action'){addScoutAction(t.dataset.outcome);return true;}
  if(action==='v2-result'){if(selectedSkill==='attack'&&!attackDirection&&!attackDirectionSkipped){toast('Elegí una dirección u omití el dato.');return true;}addScoutAction(t.dataset.result);return true;}
  if(action==='finish-rally'){finishRally(t.dataset.winner);return true;}
  if(action==='undo-rally'){undoRally();return true;}
  if(action==='select-skill'){
    selectedSkill=t.dataset.skill;resetActionInputs();save();render();return true;
  }
  if(action==='select-player'){
    selectedPlayerId=t.dataset.player;resetActionInputs();originZone=selectedSkill==='attack'?defaultAttackOrigin():null;save();render();return true;
  }
  if(action==='toggle-zone'){zonePickerOpen=!zonePickerOpen;render();return true;}
  if(action==='select-zone'){
    if(['serve','attack'].includes(selectedSkill))destinationZone=+t.dataset.zone;else originZone=+t.dataset.zone;
    selectedZone=+t.dataset.zone;zonePickerOpen=false;save();render();return true;
  }
  if(action==='remove-draft'||action==='remove-last-draft'){
    const index=action==='remove-draft'?+t.dataset.index:pending.length-1;
    if(index>=0&&index<pending.length)pending.splice(index,1);awaitingBlockerIndex=null;editingActionIndex=null;save();render();return true;
  }
  if(!action?.startsWith('v2-'))return false;
  if(action==='v2-mode'){scoutMode=t.dataset.mode==='advanced'?'advanced':'quick';save();render();}
  if(action==='v2-zone'||action==='v2-zone-clear'){
    const value=action==='v2-zone-clear'?null:+t.dataset.zone;
    if(t.dataset.kind==='origin'){originZone=value;attackOriginManual=true;resetRivalBlockerSelection(useBlockerDraft);}else destinationZone=value;save();render();
  }
  if(action==='v2-edit'){
    const index=+t.dataset.index,a=pending[index];if(!a)return true;
    attackDirection=a.metadata?.attackDirection??null;attackDirectionSkipped=!attackDirection;attackType=a.metadata?.attackType||'conventional';attackOriginManual=true;editingActionIndex=index;selectedPlayerId=a.playerId;selectedSkill=a.skill;originZone=a.originZone??null;destinationZone=a.destinationZone??null;
    ownBlockers=(a.participants||[]).filter(id=>id!==a.playerId);settingTarget=a.metadata?.settingTarget||'';receiverId=a.metadata?.receiverId||'';awaitingBlockerIndex=null;
    useBlockerDraft=a.outcomeId==='use_block_out'?structuredCloneSafe(a):{skill:'attack',outcomeId:'use_block_out'};attackRoleOverride=a.metadata?.attackRoleSource==='manual'?a.attackRole:'auto';render();
  }
  if(action==='v2-edit-cancel'){resetActionInputs();render();}
  if(action==='v2-confirm-block'){awaitingBlockerIndex=null;finishRally('them',{automatic:true});}
  if(action==='v2-smart-undo'){if(pending.length){pending.pop();awaitingBlockerIndex=null;lastActionTap=0;save();render();}else undoRally();}
  if(action==='v2-current-rally')document.getElementById('rally-current')?.scrollIntoView?.({block:'center',behavior:'smooth'});
  if(action==='v2-retry-local'){if(save())toast('Guardado local recuperado.');render();}
  if(action==='v2-correct-winner'){
    const s=activeSet(),old=s?.rallies.at(-1);if(!old)return true;
    if(!confirm('¿Corregir el ganador del último punto? Se recuperará el rally. Si hay una acción terminal incompatible, se archivará como corrección sin atribuir estadísticas individuales.'))return true;
    const other=old.winner==='us'?'them':'us',oldId=old.id;
    if(undoScoutRally()){
      const removed=pending.filter(a=>VolleyCatalog.outcome(a,old)?.winner&&VolleyCatalog.outcome(a,old).winner!==other);
      pending=pending.filter(a=>!removed.includes(a));
      finishRally(other,{correction:{previousWinner:old.winner,rallyId:oldId,removedTerminalActions:removed}});
    }
  }
  if(action==='v2-backup-original'){
    const key=storageLoadResult?.backupKey;const raw=key?VolleyData.readBackup(localStorage,key,KEY):storageLoadResult?.raw||localStorage.getItem(KEY+':backup:before-v2');
    if(raw)download('respaldo_original_volley_v1.json',raw,'application/json');else toast('No hay una copia original anterior en este navegador.');
  }
  return true;
}
document.addEventListener('change',event=>{
  const t=event.target;
  if(t.matches('[data-v2-field]')){
    const field=t.dataset.v2Field;
    if(field==='autoClose')autoClosePoints=t.checked;
    if(field==='sequenceComplete')sequenceComplete=t.checked;
    if(field==='pointCause')pointCause=t.value||null;
    if(field==='settingTarget')settingTarget=t.value;
    if(field==='receiverId')receiverId=t.value;
    save();if(field==='autoClose')render();
  }
  if(t.matches('[data-v2-stat]')){const m=activeMatch();if(m){m.statisticsConfig={...m.statisticsConfig,[t.dataset.v2Stat]:t.checked};save();render();}}
  if(t.matches('[data-v2-blocker]')){
    const id=t.dataset.v2Blocker;
    ownBlockers=t.checked?[...new Set([...ownBlockers,id])]:ownBlockers.filter(x=>x!==id);
    if(ownBlockers.filter(id=>id!==selectedPlayerId).length>2){ownBlockers=ownBlockers.filter(x=>x!==id);toast('El bloqueo tiene hasta tres participantes.');t.checked=false;}
    save();
  }
});
