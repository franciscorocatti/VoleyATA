'use strict';
const TrainingUI=(()=>{
  let mode='match',page='history',activeId=null,editorId=null,sourceKey='',draft=null,exerciseDraft=null,zoneOpen=false,lastTap=0,busy=false;
  let filter={exerciseId:'',playerId:'',skill:''};
  let store=null,loaded=false,startPromise=null,syncing=false,syncError='',timer=null,failures=0;
  try{const saved=JSON.parse(localStorage.getItem('volley_training_v1:ui')||'{}');mode=saved.mode==='training'?'training':'match';activeId=saved.activeId||null;}catch(_){}
  const current=()=>store?.get(activeId),exercise=()=>current()?.exercises.find(e=>e.id===current().activeExerciseId);
  const rate=v=>v==null?'No aplica':v.toFixed(1).replace('.',',')+'%';
  const num=v=>v==null?'No aplica':String(v);
  const button=(action,text,extra='')=>`<button class="btn btn-small" data-action="tr-${action}" ${extra}>${text}</button>`;
  const options=(list,value)=>list.map(([id,name])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`).join('');
  function uiSave(){try{localStorage.setItem('volley_training_v1:ui',JSON.stringify({mode,activeId}));}catch(_){} }
  function modeBar(){return `<nav class="tr-mode-bar no-print" aria-label="Modalidad"><button class="${mode==='match'?'active':''}" data-action="tr-mode" data-mode="match">PARTIDO</button><button class="${mode==='training'?'active':''}" data-action="tr-mode" data-mode="training">ENTRENAMIENTO</button></nav>`;}
  function status(s=current()){
    if(store?.error)return 'Error de guardado local';
    if(store?.writing)return 'Guardando en este dispositivo…';
    if(navigator.onLine===false)return 'Sin conexión · guardado local'+(s&&s.revision!==s.sync?.confirmedRevision?' · pendiente':'');
    if(syncing)return 'Sincronizando…';
    if(s&&s.revision===s.sync?.confirmedRevision)return 'Sincronizado · confirmado por la hoja';
    if(s?.sync?.error||!s&&syncError)return 'Error de sincronización · guardado local';
    if(s)return 'Guardado local · pendiente de sincronización';
    return 'Guardado local';
  }
  function statusBar(){return `<div class="tr-save no-print" role="status"><span id="tr-save-status">${esc(status())}</span>${button('sync','Sincronizar ahora')}<small>${store?.pending().length||0} sesiones pendientes</small></div>`;}
  function alerts(){return (store?.error?`<div class="errorbox" role="alert"><strong>${esc(store.error)}</strong><p>Exportá una copia antes de recargar o cerrar.</p>${button('backup','Descargar copia completa')}${button('recovery','Descargar datos originales')}${!store.readOnly?button('retry','Reintentar guardado'):''}</div>`:'')+(store?.warning?`<p class="hinttext">${esc(store.warning)}</p>`:'');}
  function sources(){const seen=new Set((state.teams||[]).map(t=>t.id));const trainingSources=(store?.all()||[]).sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt)).filter(s=>{const key=s.teamId||s.team;if(seen.has(key))return false;seen.add(key);return true;}).map(s=>({key:'training:'+s.id,id:s.teamId,fromTraining:true,name:s.team+' · plantel de entrenamiento',team:s.team,players:s.players}));return [...trainingSources,...(state.teams||[]).map(t=>({key:'team:'+t.id,id:t.id,name:t.name||t.team,players:t.players})),...state.matches.map(m=>({key:'match:'+m.id,id:'match:'+m.id,name:m.team+' · plantel del '+m.date,team:m.team,players:m.players}))];}
  function freshSession(){const src=sources().find(x=>x.key===sourceKey)||sources()[0];sourceKey=src?.key||'';draft={team:src?.team||src?.name||'Mi equipo',date:localDate(),name:'Entrenamiento',objective:'',players:(src?.players||[]).map(p=>({...TrainingModel.copy(p),sourcePlayerId:p.sourcePlayerId||p.id,selected:true})),newNumber:'',newName:''};}
  function freshExercise(e=null){
    editorId=e?.id||null;exerciseDraft=e?{name:e.name,type:e.type,format:e.format,size:e.set.positions.length,target:e.set.training.target||'',winBy:e.set.training.winBy,rotations:e.set.training.rotations,validRallies:e.set.training.validRallies,serve:e.set.serve,skill:e.skill,targetZone:e.targetZone||'',objective:e.objective,comparisonKey:e.comparisonKey||'',meanings:TrainingModel.copy(e.meanings||{}),positions:[...e.set.positions]}:
      {name:'Recepción',type:'repetitions',format:'technical',size:6,target:'',winBy:1,rotations:true,validRallies:true,serve:'them',skill:'reception',targetZone:'',objective:'',comparisonKey:'',meanings:{},positions:current()?.players.filter(p=>!p.isLibero).slice(0,6).map(p=>p.id)||[]};
  }
  async function start(){
    if(startPromise)return startPromise;
    startPromise=(async()=>{store=TrainingStorage.create();await store.start();loaded=true;if(activeId&&!store.get(activeId))activeId=null;if(mode==='training')render();schedule();return store;})();return startPromise;
  }
  function renderTraining(){
    if(!loaded)return '<div class="card"><h1>Entrenamiento</h1><p>Recuperando sesiones guardadas en este dispositivo…</p></div>';
    const s=current();return `<section class="training">${alerts()}<div class="toolbar no-print"><div class="tabs"><button class="tab ${page==='history'?'active':''}" data-action="tr-history">Mis entrenamientos</button><button class="tab ${page==='live'?'active':''}" data-action="tr-live" ${!s?'disabled':''}>Registrar</button><button class="tab ${page==='stats'?'active':''}" data-action="tr-stats" ${!s?'disabled':''}>Estadísticas</button></div>${button('new','＋ Entrenamiento')}</div>${statusBar()}${store.readOnly?'<p>Los registros originales están protegidos. Exportalos antes de recuperar una copia válida.</p><label class="btn" for="backupInput">Recuperar copia completa JSON</label><input id="backupInput" type="file" accept=".json" hidden>':page==='create'?renderCreate():page==='edit-exercise'&&s?renderExerciseEditor(s):page==='live'&&s?renderLiveTraining(s):page==='stats'&&s?renderReport(s):renderHistory()}<p class="hinttext no-print">Los datos quedan en este navegador. Borrar sus datos, usar navegación privada o eliminar el almacenamiento de la app puede perderlos. Exportá respaldos JSON periódicamente.</p></section>`;
  }
  function renderHistory(){return `<div class="section-head"><div><div class="eyebrow">Historial independiente</div><h1>Mis entrenamientos</h1></div><div class="row">${button('backup','Copia completa JSON')}${button('recovery','Copias de recuperación')}<label class="btn btn-small" for="backupInput">Importar JSON</label><input id="backupInput" type="file" accept=".json" hidden></div></div><div class="stack">${store.all().sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt)).map(s=>`<article class="card"><div class="section-head"><div><h2>${esc(s.name)}</h2><small>${esc(s.date)} · ${esc(s.team)} · ${s.players.length} participantes · ${s.exercises.length} ejercicios</small></div><span class="pill">${s.status==='finished'?'Finalizado':s.status==='paused'?'Pausado':'En curso'}</span></div><p class="hinttext">${esc(status(s))}</p><div class="row">${button('open',s.status==='finished'?'Abrir':'Continuar',`data-id="${esc(s.id)}"`)}${button('stats','Estadísticas',`data-id="${esc(s.id)}"`)}${button('json','JSON',`data-id="${esc(s.id)}"`)}${button('delete','Eliminar',`data-id="${esc(s.id)}"`)}</div></article>`).join('')||'<div class="empty">Todavía no hay entrenamientos. Creá el primero con tu plantel guardado.</div>'}</div>`;}
  function field(label,key,value,type='text',group='session'){return `<label class="field">${label}<input type="${type}" data-tr-${group}="${key}" value="${esc(value)}" maxlength="${type==='text'?500:100}" ${type==='number'?'min="1" max="999"':''}></label>`;}
  function renderCreate(){return `<div class="card stack"><h1>Nuevo entrenamiento</h1><label class="field">Usar un plantel<select data-tr-source><option value="">Plantel nuevo</option>${options(sources().map(x=>[x.key,x.name]),sourceKey)}</select></label><div class="grid-2">${field('Equipo','team',draft.team)}${field('Fecha','date',draft.date,'date')}${field('Sesión','name',draft.name)}${field('Objetivo opcional','objective',draft.objective)}</div><fieldset class="tr-participants"><legend>Participantes</legend>${draft.players.map((p,i)=>`<label><input type="checkbox" data-tr-participant="${i}" ${p.selected?'checked':''}>#${esc(p.number)} ${esc(p.name)}</label>`).join('')||'<p>Agregá jugadores o elegí un plantel guardado.</p>'}</fieldset><div class="grid-2">${field('Número del nuevo jugador','newNumber',draft.newNumber)}${field('Nombre','newName',draft.newName)}</div><div class="row">${button('add-participant','Agregar jugador')}${button('create','Crear y guardar sesión')}${button('history','Volver')}</div></div>`;}
  function renderExerciseEditor(s){
    const d=exerciseDraft,e=s.exercises.find(e=>e.id===editorId),locked=!!e&&(e.repetitions.length||e.set.rallies.length||e.draft.actions.length),disabled=locked?'disabled':'';
    return `<div class="card stack"><h1>${e?'Editar':'Nuevo'} ejercicio</h1>${field('Nombre del ejercicio','name',d.name,'text','exercise')}<div class="grid-2"><label class="field">Tipo<select data-tr-exercise="type" ${disabled}>${options([['repetitions','Repeticiones · sin puntos'],['game','Juego · con marcador']],d.type)}</select></label><label class="field">Fundamento inicial<select data-tr-exercise="skill">${options(Object.entries(VolleyCatalog.definitions).map(([k,v])=>[k,v.name]),d.skill)}</select></label></div>${field('Objetivo / consigna','objective',d.objective,'text','exercise')}${field('Clave de comparación opcional (misma consigna entre sesiones)','comparisonKey',d.comparisonKey,'text','exercise')}
      ${d.type==='repetitions'?`<label class="field">Zona objetivo del saque dirigido<select data-tr-exercise="targetZone" ${disabled}>${options([['','Sin objetivo'],...[1,2,3,4,5,6].map(x=>[String(x),'Zona '+x])],String(d.targetZone))}</select></label><p class="callout">Sin marcador: «Punto» de ataque o bloqueo significa éxito técnico. Un saque sin receptores no es un ace competitivo. Registrá la zona de destino para medir el saque dirigido.</p><details><summary>Definir los resultados del ejercicio</summary><p class="hinttext">Las definiciones quedan guardadas por fundamento y resultado. Se conservan con cada intento y se usan para comparar sesiones compatibles.</p>${Object.entries(VolleyCatalog.definitions).map(([skill,def])=>`<details><summary>${def.name}</summary>${def.outcomes.map(o=>`<label class="field">${o.label}<input data-tr-meaning="${skill}.${o.id}" value="${esc(d.meanings[skill+'.'+o.id]||'')}" maxlength="500" ${disabled}></label>`).join('')}</details>`).join('')}</details>`:
      `<div class="grid-2"><label class="field">Formato<select data-tr-exercise="format" ${disabled}>${options([['6v6','6 contra 6'],['4v4','4 contra 4'],['side-out','Side-out'],['break-point','Break-point'],['conditioned','Juego condicionado'],['training-set','Set de entrenamiento']],d.format)}</select></label><label class="field">Jugadores en cancha<select data-tr-exercise="size" ${disabled}>${options([2,3,4,5,6].map(n=>[String(n),String(n)]),String(d.size))}</select></label>${field('Puntaje objetivo (vacío = cierre manual)','target',d.target,'number','exercise').replace('<input ', '<input '+disabled+' ')}<label class="field">Diferencia para ganar<select data-tr-exercise="winBy" ${disabled}>${options([['1','Un punto'],['2','Dos puntos']],String(d.winBy))}</select></label><label class="field">Servicio inicial<select data-tr-exercise="serve" ${disabled}>${options([['us','Nuestro'],['them','Rival']],d.serve)}</select></label></div><label class="row"><input type="checkbox" data-tr-exercise="rotations" ${d.rotations?'checked':''} ${disabled}>Rotar al recuperar el saque (solo seis posiciones reales)</label><label class="row"><input type="checkbox" data-tr-exercise="validRallies" ${d.validRallies?'checked':''} ${disabled}>Hay rallies con servicio válido (habilitar side-out / break-point)</label><div class="tr-lineup">${Array.from({length:Number(d.size)},(_,i)=>`<label class="field">${Number(d.size)===6?'Posición':'Puesto'} ${i+1}<select data-tr-lineup="${i}" ${disabled}><option value="">Elegir</option>${options(s.players.filter(p=>!p.isLibero).map(p=>[p.id,'#'+p.number+' '+p.name]),d.positions[i])}</select></label>`).join('')}</div><p class="hinttext">Los juegos reducidos no generan rotaciones ni roles delantero/zaguero. Las formaciones de seis usan posiciones 1–6.</p>`}
      ${locked?'<p class="hinttext">El tipo, las consignas de resultados y la formación inicial se protegen una vez que hay registros. Creá otro ejercicio para cambiar el contexto.</p>':''}<div class="row">${button('save-exercise','Guardar ejercicio')}${button('live','Volver')}</div></div>`;
  }
  function playerButtons(s,e){
    const ids=e.type==='game'?VolleyEngine.onCourt(e.set):s.players.map(p=>p.id),ordered=e.type==='game'&&e.set.training.rotations?[4,3,2,5,6,1].map(pos=>({id:ids[pos-1],pos})):ids.map(id=>({id,pos:null}));
    return `<div class="player-grid live-court-grid ${e.type==='repetitions'?'tr-roster':''}">${ordered.map(({id,pos})=>{const p=s.players.find(p=>p.id===id);return `<button class="player ${e.draft.playerId===id?'selected':''}" data-action="tr-player" data-id="${esc(id)}"><span class="jersey">${esc(p?.number)}</span><span class="v2-player-copy"><span class="playername">${esc(p?.name)}</span><span class="playerpos">${pos?'P'+pos:p?.isLibero?'Líbero':'Participante'}</span></span></button>`;}).join('')}</div>`;
  }
  function technicalLabel(skill,o){if(skill==='serve'&&o.id==='ace')return 'Éxito técnico (no ace)';if(['attack','block'].includes(skill)&&o.winner==='us')return o.label+' · técnico';return o.label;}
  function renderLiveTraining(s){
    const e=exercise(),editable=s.status==='active',head=`<div class="section-head tr-session-head"><div><div class="eyebrow">${esc(s.team)} · ${esc(s.date)}</div><h1>${esc(s.name)}</h1></div><div class="row tr-session-actions">${button('new-exercise','＋ Ejercicio',!editable?'disabled':'')}${button('pause',s.status==='paused'?'Continuar':'Pausar',s.status==='finished'?'disabled':'')}${button('finish-session','Finalizar sesión',s.status==='finished'?'disabled':'')}</div></div><div class="tr-exercises no-print">${s.exercises.map(x=>`<button class="btn btn-small ${e?.id===x.id?'btn-primary':''}" data-action="tr-exercise" data-id="${esc(x.id)}">${esc(x.name)}${x.status==='finished'?' ✓':''}</button>`).join('')}</div>`;
    if(!e)return head+'<div class="empty">La sesión ya está guardada. Agregá el primer ejercicio para empezar.</div>';
    const d=e.draft,p=s.players.find(p=>p.id===d.playerId),definition=VolleyCatalog.definitions[d.skill],canRecord=editable&&e.status==='active'&&!e.set.finished,last=e.type==='repetitions'?e.repetitions.at(-1):d.actions.at(-1)||e.set.rallies.at(-1)?.actions.at(-1);
    const lastText=last?`${s.players.find(p=>p.id===last.playerId)?.name} · ${VolleyCatalog.definitions[last.skill].name} · ${VolleyCatalog.outcome(last)?.label}`:'Sin acciones';
    return head+`<section class="scout-v2 tr-live"><header class="v2-live-head"><div>${e.type==='repetitions'?`<strong>${esc(e.name)}</strong><div class="tr-count">${e.repetitions.length} <small>repeticiones</small></div><small>${esc(p?.name||'Elegí jugador')} · ${definition.name}</small>`:`<strong>${esc(e.name)}</strong><div class="tr-count">${e.set.score.us} : ${e.set.score.them}</div><small>${e.set.serve==='us'?'Sacamos':'Recibimos'}${e.set.training.rotations?' · R'+e.set.rotation:' · sin rotación'} · Objetivo ${e.set.training.target||'manual'}</small>`}</div><div class="v2-mode-controls"><div class="v2-mode-switch">${[['quick','Rápido'],['advanced','Avanzado']].map(([v,l])=>`<button class="${d.mode===v?'active':''}" data-action="tr-record-mode" data-mode="${v}">${l}</button>`).join('')}</div>${e.type==='game'?`<label class="row"><input type="checkbox" data-tr-live="autoClose" ${d.autoClose?'checked':''}>Cierre automático</label>`:''}${button('end-exercise',e.status==='finished'?'Ejercicio finalizado':'Finalizar ejercicio',!canRecord?'disabled':'')}</div></header>
      ${!canRecord?`<div class="callout">${s.status==='paused'?'Sesión pausada.':s.status==='finished'?'Sesión finalizada.':'Ejercicio finalizado.'} Los registros se conservan. ${s.status!=='active'?button('resume','Continuar sesión'):button('reopen-exercise','Continuar ejercicio')}</div>`:''}
      <div class="v2-console"><div class="card v2-player-card"><div class="section-head"><h2>Jugador</h2>${button('edit-exercise','Configurar')}</div>${playerButtons(s,e)}${e.type==='game'?renderChanges(s,e):''}</div>
      <div class="card v2-entry-card"><div class="v2-skills">${Object.entries(VolleyCatalog.definitions).map(([key,def])=>`<button class="skill ${d.skill===key?'selected':''}" data-action="tr-skill" data-skill="${key}">${scoutIcon(key)}<span>${def.name}</span></button>`).join('')}</div><div class="v2-selected"><strong>${p?esc('#'+p.number+' '+p.name):'Elegí jugador'}</strong><small>${definition.name}</small></div>
      <div class="outcome-grid v2-outcomes">${definition.outcomes.map(o=>`<button class="outcome ${o.winner==='us'?'good':o.winner==='them'?'bad':'neutral'}" data-action="tr-result" data-result="${o.id}" ${!canRecord?'disabled':''}>${e.type==='repetitions'?technicalLabel(d.skill,o):o.label}</button>`).join('')}</div>
      <button class="btn v2-zone-toggle" data-action="tr-zones">Zonas opcionales · ${d.originZone?'origen '+d.originZone+' ':''}${d.destinationZone?'destino '+d.destinationZone:''} ${zoneOpen?'▴':'▾'}</button>${zoneOpen?renderZones(d):''}
      ${d.skill==='attack'?'<p class="hinttext">Toque / colocada: solo una acción ofensiva dirigida al campo rival.</p>':''}${e.type==='repetitions'?`<p class="hinttext">Cada toque guarda un intento. No suma puntos ni cierra rallies.${e.targetZone?' Saque dirigido a zona '+e.targetZone+'. Indicá el destino real.':''}</p>${Object.keys(e.meanings).some(k=>k.startsWith(d.skill+'.'))?`<details><summary>Consigna de los resultados</summary>${definition.outcomes.filter(o=>e.meanings[d.skill+'.'+o.id]).map(o=>`<p><strong>${esc(o.label)}:</strong> ${esc(e.meanings[d.skill+'.'+o.id])}</p>`).join('')}</details>`:''}`:
      `<p class="hinttext">Se utiliza el motor de Partido. ${d.autoClose?'Los resultados terminales cierran el rally.':'Cerrá el rally con los botones de punto.'}</p>`}
      ${d.mode==='advanced'?renderAdvanced(s,e):''}</div></div>
      <div class="card"><div class="section-head"><h2>Última acción</h2>${button('undo','↶ Deshacer',!editable?'disabled':'')}</div><p>${esc(lastText)}</p>${e.type==='game'?`<h3>Rally abierto · ${d.actions.length} acciones</h3><ol>${d.actions.map(a=>`<li>${esc(s.players.find(p=>p.id===a.playerId)?.name)} · ${esc(VolleyCatalog.outcome(a)?.label)}</li>`).join('')}</ol><p class="hinttext">Deshacer quita primero la última acción pendiente. Sin pendientes, recupera el último rally con su marcador y formación anteriores.</p>`:''}</div>
      ${e.type==='game'&&canRecord?`<footer class="v2-point-dock no-print"><div class="rally-buttons"><button class="rally-btn us" data-action="tr-point" data-winner="us">+ Punto · ${esc(s.team)}</button><button class="rally-btn them" data-action="tr-point" data-winner="them">+ Punto · Rival</button></div></footer>`:''}</section>`;
  }
  function renderZones(d){return ['origin','destination'].map(kind=>`<div class="tr-zone"><strong>${kind==='origin'?'Origen propio':'Destino rival'}</strong><div class="v2-zone-grid">${[4,3,2,5,6,1].map(z=>`<button class="zone ${d[kind+'Zone']===z?'selected':''}" data-action="tr-zone" data-kind="${kind}" data-zone="${z}">${z}</button>`).join('')}</div>${button('zone-clear','Sin zona',`data-kind="${kind}"`)}</div>`).join('');}
  function renderAdvanced(s,e){const d=e.draft;return `<details class="v2-extra" open><summary>Detalle avanzado</summary>${['attack','block'].includes(d.skill)?`<div class="grid-2">${field('Bloqueador rival · número (opcional)','rivalNumber',d.rivalNumber||'','text','live')}${field('Nombre rival (opcional)','rivalName',d.rivalName||'','text','live')}</div>`:''}${d.skill==='block'?`<fieldset class="tr-participants"><legend>Bloqueadores participantes (máximo tres)</legend>${s.players.filter(p=>e.set.positions.includes(p.id)&&!p.isLibero).map(p=>`<label><input type="checkbox" data-tr-blocker="${esc(p.id)}" ${p.id===d.playerId||d.blockers?.includes(p.id)?'checked':''} ${p.id===d.playerId?'disabled':''}>${esc(p.name)}</label>`).join('')}</fieldset>`:''}${d.skill==='setting'?`<label class="field">Atacante receptor<select data-tr-live="receiverId"><option value="">Sin identificar</option>${options(s.players.map(p=>[p.id,p.name]),d.receiverId)}</select></label>`:''}</details>`;}
  function renderChanges(s,e){const ids=e.set.positions;return `<details class="v2-extra"><summary>Cancha / servicio / cambios</summary><p class="hinttext">Cambios permitidos entre rallies. La formación previa queda en el registro.</p><label class="field">Servicio<select data-tr-serve ${e.draft.actions.length?'disabled':''}>${options([['us','Nuestro'],['them','Rival']],e.set.serve)}</select></label>${ids.map((id,i)=>`<label class="field">${e.set.training.rotations?'Posición':'Puesto'} ${i+1}<select data-tr-sub="${i}" ${e.draft.actions.length?'disabled':''}>${options(s.players.filter(p=>!p.isLibero).map(p=>[p.id,'#'+p.number+' '+p.name]),id)}</select></label>`).join('')}${e.set.training.rotations?renderTrainingLibero(s,e):''}</details>`;}
  function renderTrainingLibero(s,e){const free=!e.draft.actions.length&&s.status==='active'&&e.status==='active';return e.set.libero?`<p>Líbero: ${esc(s.players.find(p=>p.id===e.set.libero.playerId)?.name)}</p>${button('libero-out','Retirar líbero',free?'':'disabled')}`:`<label class="field">Líbero<select id="tr-libero">${options(s.players.filter(p=>p.isLibero).map(p=>[p.id,p.name]),'')}</select></label><label class="field">Reemplaza a<select id="tr-libero-for">${options(e.set.positions.filter((id,i)=>[0,4,5].includes(i)&&!(i===0&&e.set.serve==='us')).map(id=>[id,s.players.find(p=>p.id===id)?.name]),'')}</select></label>${button('libero-in','Ingresar líbero',free&&s.players.some(p=>p.isLibero)?'':'disabled')}`;}
  function summaryRows(d){const s=d.summary,a=s.attack,r=s.reception,v=s.serve,b=s.block;return [
    ['reception','Recepción',r.total,`3: ${r.q3} · 2: ${r.q2} · 1: ${r.q1} · 0: ${r.q0} · Positiva ${rate(r.positivePct)} (${r.q2+r.q3}/${r.total})`],
    ['attack','Ataque',a.total,`Juego: ${a.gameAttempts} intentos · Kills ${num(a.kills)} · Convencionales ${num(a.conventionalKills)} · Use punto ${num(a.useBlockOutKills)} · Colocada punto ${num(a.tipKills)} · Eficacia de juego ${rate(a.efficiency)}. Técnico: ${a.technicalAttempts} intentos · Éxitos ${num(a.technicalSuccesses)} (${rate(a.technicalSuccessPct)}). Todos: errores ${a.errors} · Siguen ${a.continues} · Cubiertos ${a.coveredBlocks} · Uses ${a.uses} · Colocadas ${a.tips}.`],
    ['serve','Saque',v.total,`Aces reales ${num(v.aces)} · Positivos ${v.positive} · Neutros ${v.neutral} · Errores ${v.errors} · Objetivo ${num(v.targetHits)} / ${v.directedAttempts}`],
    ['block','Bloqueo',b.total,`Puntos de juego ${num(b.points)} · Éxitos técnicos ${num(b.technicalSuccesses)} · Toques positivos ${b.positiveTouches} · Sin control ${b.uncontrolledTouches} · Faltas ${b.faults}`],
    ['defense','Defensa',s.defense.total,`Perfectas ${s.defense.perfect} · Positivas ${s.defense.positive} · Limitadas ${s.defense.limited} · Errores ${s.defense.directErrors}`],
    ['setting','Armado',s.setting.total,`Perfectos ${s.setting.perfect} · Buenos ${s.setting.good} · Forzados ${s.setting.forced} · Errores ${s.setting.directErrors}`]
  ];}
  function summaryTable(d,skill=''){return `<div class="tablewrap"><table><thead><tr><th>Fundamento</th><th>Intentos</th><th>Resultados</th></tr></thead><tbody>${summaryRows(d).filter(x=>!skill||skill===x[0]).map(x=>`<tr><td>${x[1]}</td><td>${x[2]}</td><td class="tr-wrap">${x[3]}</td></tr>`).join('')}</tbody></table></div>`;}
  function renderReport(s){
    const d=TrainingStats.compute(s,filter),all=TrainingStats.compute(s);
    return `<article id="training-report" class="tr-report"><div class="section-head"><div><div class="eyebrow">Estadísticas del entrenamiento</div><h1>${esc(s.name)}</h1><p>${esc(s.date)} · ${esc(s.team)} · ${s.players.length} participantes · ${s.exercises.length} ejercicios · ${all.repetitions} repeticiones técnicas · ${all.gameActions} acciones de juego</p><p>${esc(s.objective)}</p></div><div class="row no-print">${button('print','Imprimir / PDF')}${button('csv','CSV')}${button('json','JSON')}${button('backup','Copia completa')}</div></div>
      <div class="grid-2 no-print tr-filters"><label class="field">Ejercicio<select data-tr-filter="exerciseId"><option value="">Sesión completa</option>${options(s.exercises.map(e=>[e.id,e.name+' · '+(e.type==='game'?'Juego':'Técnico')]),filter.exerciseId)}</select></label><label class="field">Jugador<select data-tr-filter="playerId"><option value="">Equipo completo</option>${options(s.players.map(p=>[p.id,'#'+p.number+' '+p.name]),filter.playerId)}</select></label><label class="field">Fundamento<select data-tr-filter="skill"><option value="">Todos</option>${options(Object.entries(VolleyCatalog.definitions).map(([k,v])=>[k,v.name]),filter.skill)}</select></label></div>
      <p class="hinttext">Filtro: ${esc(s.exercises.find(e=>e.id===filter.exerciseId)?.name||'Sesión completa')} · ${esc(s.players.find(p=>p.id===filter.playerId)?.name||'Equipo completo')} · ${esc(VolleyCatalog.definitions[filter.skill]?.name||'Todos los fundamentos')}. Solo acciones registradas; un registro parcial no representa todos los contactos del juego.</p>
      <section class="card"><h2>Fundamentos</h2>${summaryTable(d,filter.skill)}<p class="hinttext">Eficacia de juego = (kills − errores, incluyendo bloqueo punto) / intentos de juego. Los éxitos técnicos quedan separados. «No aplica» identifica indicadores sin contexto competitivo o sin intentos.</p><p>Side-out: ${d.validRallies?rate(d.sideOut.pct)+' ('+d.sideOut.n+'/'+d.sideOut.d+')':'No aplica'} · Break-point: ${d.validRallies?rate(d.breakPoint.pct)+' ('+d.breakPoint.n+'/'+d.breakPoint.d+')':'No aplica'}. Datos colectivos del ejercicio, independientes del filtro individual.</p>${d.rotations?`<details open><summary>Ataque por rol (solo juego con información rotacional)</summary>${['front','back','unknown'].map(role=>{const x=d.summary.attack.byRole?.[role];return `<p>${({front:'Delantero',back:'Zaguero',unknown:'Sin rol conocido'})[role]}: ${x?.attempts||0} intentos · ${x?.kills||0} kills · ${rate(x?.efficiency)}</p>`;}).join('')}</details>`:'<p class="hinttext">Desglose delantero / zaguero: No aplica.</p>'}</section>
      <section class="card"><h2>Por jugador</h2>${s.players.filter(p=>!filter.playerId||p.id===filter.playerId).map(p=>`<details><summary>#${esc(p.number)} ${esc(p.name)}</summary>${summaryTable(TrainingStats.compute(s,{...filter,playerId:p.id}),filter.skill)}</details>`).join('')}</section>
      <section class="card"><h2>Comparación entre ejercicios</h2>${s.exercises.map(e=>{const x=TrainingStats.compute(s,{exerciseId:e.id,playerId:filter.playerId,skill:filter.skill});return `<details><summary>${esc(e.name)} · ${e.type==='game'?'Juego':'Técnico'} · ${x.total} acciones</summary><p>${esc(e.objective||'Sin consigna adicional')}</p>${summaryTable(x,filter.skill)}</details>`;}).join('')}</section>
      <section class="card"><h2>Observaciones objetivas</h2><p>${d.repetitions} repeticiones técnicas y ${d.gameActions} acciones competitivas en el filtro actual. Recepción positiva: ${d.summary.reception.q2+d.summary.reception.q3} de ${d.summary.reception.total} (${rate(d.summary.reception.positivePct)}). ${d.summary.reception.total<10?'Muestra de recepción menor a 10 intentos; interpretá el porcentaje con cautela.':''}</p><p>Los intentos técnicos no generan kills ni aces. Los porcentajes describen la muestra registrada y no permiten atribuir por sí solos una causa al rendimiento.</p></section>
      <section class="card"><h2>Evolución individual</h2><p class="hinttext">Se compara con la última sesión finalizada anterior del mismo equipo y jugador, con igual tipo de ejercicio, formato/clave, zona objetivo y definiciones de resultados.</p>${s.players.filter(p=>!filter.playerId||p.id===filter.playerId).map(p=>{const rows=TrainingStats.progression(s,store.all(),p.id);return `<details><summary>${esc(p.name)}</summary>${rows.length?rows.map(x=>`<p><strong>${esc(x.label)} · ${x.context} · ${esc(x.exercise)}</strong><br>Anterior (${esc(x.previousDate)}): ${rate(x.previous.pct)} (${x.previous.n}/${x.previous.d}). Actual: ${rate(x.current.pct)} (${x.current.n}/${x.current.d}). Evolución: ${x.delta>=0?'+':''}${x.delta.toFixed(1).replace('.',',')} puntos porcentuales.</p>`).join(''):'<p>No hay dos muestras compatibles con intentos para comparar.</p>'}</details>`;}).join('')}</section></article>`;
  }
  async function changed(s,bump=true){const ok=await store.save(s,{bump});uiSave();render();schedule();if(!ok)toast(store.error);return ok;}
  function schedule(){clearTimeout(timer);if(!loaded||store.readOnly||navigator.onLine===false||!store.pending().length)return;timer=setTimeout(sync,4000);}
  async function sync(){
    if(!loaded||syncing||store.readOnly||store.unsafe||navigator.onLine===false){if(mode==='training')render();return;}
    await store.flush();const pendingSessions=store.pending();if(!pendingSessions.length){syncError='';if(mode==='training')render();return;}
    syncing=true;syncError='';if(mode==='training')render();let failed=false;
    try{
      for(const s of pendingSessions){
        const sent=TrainingModel.copy(s),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
        try{
          const response=await fetch(sheetsConfig.url,{method:'POST',redirect:'follow',credentials:'omit',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({schemaVersion:2,trainingContractVersion:1,trainings:[sent]}),signal:controller.signal});
          if(!response.ok)throw Error('HTTP '+response.status);
          const result=await response.json();
          if(result?.ok!==true||result.trainingContractVersion!==1||!result.trainingAcks?.some(a=>a.id===sent.id&&a.revision===sent.revision))throw Error(result?.error||'La hoja no confirmó esta sesión. Actualizá Apps Script para aceptar entrenamientos.');
          const latest=store.get(sent.id);if(latest&&!latest.deleted){latest.sync={...latest.sync,confirmedRevision:sent.revision,confirmedAt:TrainingModel.now(),error:null};await store.save(latest,{bump:false});}
        }catch(error){const latest=store.get(sent.id);if(latest){latest.sync={...latest.sync,error:error.message};await store.save(latest,{bump:false});}throw error;}finally{clearTimeout(timeout);}
      }
      failures=0;
    }catch(error){failed=true;syncError=error.name==='AbortError'?'Google no respondió a tiempo.':error.message;failures++;}
    finally{syncing=false;if(mode==='training')render();if(store.pending().length&&navigator.onLine!==false)timer=setTimeout(sync,failed?Math.min(300000,30000*2**Math.min(failures-1,4)):4000);}
  }
  function fullBackup(){return {...TrainingModel.copy(state),training:store?.export()||{schemaVersion:1,sessions:[]}};}
  async function exportFull(){await start();await store.flush();persistScoutDraft();download('respaldo_volley_scout_'+localDate()+'.json',JSON.stringify(fullBackup(),null,2),'application/json');}
  async function importBackup(raw){
    let object;try{object=JSON.parse(raw);}catch(_){toast('El archivo no contiene JSON válido.');return false;}
    if(!object.training&&!object.trainingSession)return null;
    await start();if(store.readOnly&&object.trainingSession){toast('Para recuperar el almacenamiento protegido, usá una copia completa de partidos y entrenamientos.');return false;}
    const sessions=object.trainingSession?[object.trainingSession]:object.training?.sessions;
    try{
      if(!Array.isArray(sessions)||(!object.trainingSession&&object.training.schemaVersion!==1))throw Error('Formato de entrenamientos incompatible.');
      sessions.forEach(TrainingModel.validate);
      let prepared=null;if(!object.trainingSession){const matchData={...object};delete matchData.training;prepared=VolleyData.prepareImport(matchData,state);if(!prepared.ok)throw Error('Los partidos de la copia no son compatibles.');}
      if(!confirm(object.trainingSession?'¿Importar esta sesión? Si existe el mismo ID, se reemplazará conservando un respaldo.':'¿Restaurar partidos y entrenamientos de esta copia? Se conservará un respaldo previo completo.'))return false;
      persistScoutDraft();await store.backup(fullBackup());
      const previous=localStorage.getItem(KEY);VolleyData.createBackup(localStorage,KEY,previous,'before-training-import-'+Date.now());
      // Guardar primero el estado de partidos; si falla entrenamiento, se restaura la copia anterior.
      if(prepared){const serialized=JSON.stringify(prepared.state);localStorage.setItem(KEY,serialized);if(localStorage.getItem(KEY)!==serialized)throw Error('No se verificó el guardado de partidos.');}
      try{await store.restore(sessions,{replace:!object.trainingSession,recover:store.readOnly});}catch(e){if(prepared&&previous!==null)localStorage.setItem(KEY,previous);throw e;}
      if(prepared){state=prepared.state;storageLoadResult={...storageLoadResult,readOnly:false,ok:true,state};initializeScout();}
      activeId=object.trainingSession?.id||store.all()[0]?.id||null;mode='training';page='history';uiSave();render();schedule();scheduleSheets();toast('Copia restaurada. El estado anterior quedó respaldado.');return true;
    }catch(e){toast('No se importó la copia: '+e.message);return false;}
  }
  function exportCSV(s){
    const rows=[['Tipo de sesión','Sesión ID','Fecha','Equipo','Sesión','Ejercicio ID','Ejercicio','Tipo ejercicio','Jugador ID','Número','Jugador','Fundamento','Intentos','Resultados (indicadores separados)']];
    for(const e of s.exercises)for(const p of s.players){const data=TrainingStats.compute(s,{exerciseId:e.id,playerId:p.id});for(const row of summaryRows(data))rows.push(['training',s.id,s.date,s.team,s.name,e.id,e.name,e.type,p.sourcePlayerId||p.id,p.number,p.name,row[1],row[2],row[3]]);}
    download('entrenamiento_'+safeFilename(s.name)+'_'+s.date+'.csv',toCSV(rows),'text/csv;charset=utf-8');
  }
  async function execute(action,t){
    if(action==='mode'){if(mode==='match')save();mode=t.dataset.mode;uiSave();if(mode==='training')await start();render();return;}
    await start();if(action==='backup'){await exportFull();return;}if(action==='recovery'){download('recuperacion_entrenamientos.json',JSON.stringify({...store.rawRecovery(),backups:await store.backups()},null,2),'application/json');return;}
    if(action==='sync'){syncError='';await sync();return;}
    if(store.readOnly)throw Error(store.error);
    if(action==='history'){page='history';render();return;}
    if(action==='new'){freshSession();page='create';render();return;}
    if(action==='add-participant'){
      if(!draft.newNumber.trim()||!draft.newName.trim())throw Error('Completá número y nombre.');
      if(draft.players.some(p=>p.number===draft.newNumber.trim()))throw Error('Ese número ya está en el plantel.');
      const p={id:TrainingModel.id(),number:draft.newNumber.trim(),name:draft.newName.trim(),selected:true};p.sourcePlayerId=p.id;draft.players.push(p);
      const source=sources().find(x=>x.key===sourceKey),team=state.teams.find(x=>x.id===source?.id);if(team){team.players.push({id:p.id,number:p.number,name:p.name});save();}
      draft.newName='';draft.newNumber='';render();return;
    }
    if(action==='create'){
      const src=sources().find(x=>x.key===sourceKey);const s=TrainingModel.session({...draft,teamId:src?.id||(src?.fromTraining?null:TrainingModel.id()),players:draft.players.filter(p=>p.selected).map(({selected,...p})=>p)});
      activeId=s.id;page='live';await changed(s,false);return;
    }
    if(t.dataset.id&&['open','stats','delete','json'].includes(action))activeId=t.dataset.id;
    const s=current();if(!s)throw Error('Elegí una sesión.');const e=exercise();
    if(action==='json'){download('entrenamiento_'+safeFilename(s.name)+'.json',JSON.stringify({version:1,trainingSession:s},null,2),'application/json');return;}
    if(action==='csv'){exportCSV(s);return;}
    if(action==='stats'){page='stats';filter={exerciseId:'',playerId:'',skill:''};uiSave();render();return;}
    if(action==='print'){page='stats';render();document.body.classList.add('training-print');document.querySelectorAll('#training-report details').forEach(x=>x.open=true);window.print();return;}
    if(action==='delete'){if(!confirm('¿Eliminar el entrenamiento '+s.name+' de este dispositivo? Su copia en la hoja no se elimina. Exportá JSON antes de borrar.'))return;s.deleted=true;s.deletedAt=TrainingModel.now();await changed(s);activeId=null;page='history';render();return;}
    if(action==='open'||action==='live'){page='live';if(action==='open'&&s.status==='paused'){s.status='active';await changed(s);}else{uiSave();render();}return;}
    if(action==='resume'){s.status='active';if(e?.status==='finished'&&confirm('¿Continuar también el ejercicio seleccionado?')){e.status='active';e.set.finished=false;e.set.winner=null;}await changed(s);return;}
    if(action==='pause'){s.status=s.status==='paused'?'active':'paused';page=s.status==='paused'?'history':'live';await changed(s);return;}
    if(action==='finish-session'){
      if(s.exercises.some(x=>x.draft.actions.length))throw Error('Cerrá los rallies pendientes antes de finalizar la sesión.');
      if(!confirm('¿Finalizar el entrenamiento y abrir su informe?'))return;s.status='finished';s.finishedAt=TrainingModel.now();s.exercises.forEach(x=>{x.status='finished';x.set.finished=true;});page='stats';filter={exerciseId:'',playerId:'',skill:''};await changed(s);return;
    }
    if(action==='new-exercise'||action==='edit-exercise'){freshExercise(action==='edit-exercise'?e:null);page='edit-exercise';render();return;}
    if(action==='save-exercise'){
      const old=s.exercises.find(x=>x.id===editorId);
      if(old){const locked=old.repetitions.length||old.set.rallies.length||old.draft.actions.length;if(locked){old.name=exerciseDraft.name.trim()||old.name;old.objective=exerciseDraft.objective;old.comparisonKey=exerciseDraft.comparisonKey;old.skill=exerciseDraft.skill;old.draft.skill=exerciseDraft.skill;}else{const replacement=TrainingModel.exercise(s,exerciseDraft);replacement.id=old.id;replacement.set.id=old.id;replacement.set.number=old.set.number;s.exercises[s.exercises.indexOf(old)]=replacement;}}
      else{const x=TrainingModel.exercise(s,exerciseDraft);s.exercises.push(x);s.activeExerciseId=x.id;}
      page='live';await changed(s);return;
    }
    if(action==='exercise'){s.activeExerciseId=t.dataset.id;zoneOpen=false;lastTap=0;await changed(s);return;}
    if(!e)throw Error('Agregá un ejercicio.');
    const d=e.draft;
    if(action==='player'){d.playerId=t.dataset.id;d.blockers=[];await changed(s);return;}
    if(action==='skill'){d.skill=t.dataset.skill;d.blockers=[];await changed(s);return;}
    if(action==='record-mode'){d.mode=t.dataset.mode;await changed(s);return;}
    if(action==='zones'){zoneOpen=!zoneOpen;render();return;}
    if(action==='zone'||action==='zone-clear'){d[t.dataset.kind+'Zone']=action==='zone-clear'?null:Number(t.dataset.zone);await changed(s);return;}
    if(action==='reopen-exercise'){e.status='active';e.set.finished=false;e.set.winner=null;await changed(s);return;}
    if(action==='end-exercise'){if(d.actions.length)throw Error('Cerrá o deshacé el rally pendiente antes de terminar.');e.status='finished';e.set.finished=true;await changed(s);return;}
    if(action==='libero-in'||action==='libero-out'){
      if(e.type!=='game'||!e.set.training.rotations||d.actions.length||s.status!=='active'||e.status!=='active')throw Error('El cambio de líbero requiere un juego de seis y un rally cerrado.');
      const before=teamSnapshot(e.set);
      if(action==='libero-out'){const old=e.set.libero;if(!old)return;teamChange(e.set,'libero-out',old.playerId,old.replacedId,e.set.positions.indexOf(old.replacedId)+1,before);e.set.libero=null;}
      else{const playerId=document.getElementById('tr-libero').value,replacedId=document.getElementById('tr-libero-for').value,index=e.set.positions.indexOf(replacedId);if(e.set.libero||!s.players.some(p=>p.id===playerId&&p.isLibero)||![0,4,5].includes(index)||(index===0&&e.set.serve==='us'))throw Error('Elegí un líbero y un zaguero que no esté por sacar.');teamChange(e.set,'libero-in',replacedId,playerId,index+1,before);e.set.libero={playerId,replacedId};}
      d.playerId=VolleyEngine.onCourt(e.set)[0];await changed(s);return;
    }
    if(action==='undo'){TrainingModel.undo(s,e);lastTap=0;await changed(s);return;}
    if(action==='retry'){await changed(s,false);return;}
    if(['result','point'].includes(action)){
      if(Date.now()-lastTap<180)return;lastTap=Date.now();
      if(action==='result'){
        const blocker=d.mode==='advanced'&&d.rivalNumber?{number:d.rivalNumber,name:d.rivalName||''}:null;
        const result=TrainingModel.record(s,e,t.dataset.result,{participants:d.mode==='advanced'?d.blockers||[]:[],blocker,metadata:{receiverId:d.receiverId||null,rivalBlockers:blocker?[blocker]:[],resultMeaning:e.meanings[d.skill+'.'+t.dataset.result]||null}});
        if(e.type==='game'&&result.terminalWinner&&d.autoClose)TrainingModel.point(s,e,result.terminalWinner,{automatic:true});
      }else TrainingModel.point(s,e,t.dataset.winner);
      await changed(s);return;
    }
  }
  function handle(action,t){
    if(!action?.startsWith('tr-'))return false;
    if(busy)return true;busy=true;
    execute(action.slice(3),t).catch(e=>{toast(e.message);render();}).finally(()=>{busy=false;});return true;
  }
  document.addEventListener('input',event=>{const t=event.target;if(t.dataset?.trSession&&draft)draft[t.dataset.trSession]=t.value;if(t.dataset?.trExercise&&exerciseDraft)exerciseDraft[t.dataset.trExercise]=t.type==='checkbox'?t.checked:t.value;if(t.dataset?.trMeaning&&exerciseDraft)exerciseDraft.meanings[t.dataset.trMeaning]=t.value;if(t.dataset?.trLive&&exercise()){exercise().draft[t.dataset.trLive]=t.type==='checkbox'?t.checked:t.value;}});
  document.addEventListener('change',event=>{
    const t=event.target;
    if(t.matches('[data-tr-source]')){sourceKey=t.value;freshSession();if(!t.value){sourceKey='';draft.players=[];draft.team='Mi equipo';}render();}
    if(t.matches('[data-tr-participant]'))draft.players[Number(t.dataset.trParticipant)].selected=t.checked;
    if(t.matches('[data-tr-exercise]')){exerciseDraft[t.dataset.trExercise]=t.type==='checkbox'?t.checked:t.value;if(['type','size','format'].includes(t.dataset.trExercise)){if(t.dataset.trExercise==='type'&&t.value==='game')exerciseDraft.format='6v6';if(t.dataset.trExercise==='format'){if(t.value==='4v4')exerciseDraft.size=4;else if(t.value==='6v6')exerciseDraft.size=6;else if(t.value==='side-out')exerciseDraft.serve='them';else if(t.value==='break-point')exerciseDraft.serve='us';}exerciseDraft.positions=exerciseDraft.positions.slice(0,Number(exerciseDraft.size));render();}}
    if(t.matches('[data-tr-lineup]'))exerciseDraft.positions[Number(t.dataset.trLineup)]=t.value;
    if(t.matches('[data-tr-filter]')){filter[t.dataset.trFilter]=t.value;render();}
    if(t.matches('[data-tr-live]')){const e=exercise();if(e){e.draft[t.dataset.trLive]=t.type==='checkbox'?t.checked:t.value;changed(current()).catch(e=>toast(e.message));}}
    if(t.matches('[data-tr-blocker]')){const e=exercise();if(e){let ids=e.draft.blockers||[];ids=t.checked?[...new Set([...ids,t.dataset.trBlocker])]:ids.filter(id=>id!==t.dataset.trBlocker);if(ids.filter(id=>id!==e.draft.playerId).length>2){t.checked=false;toast('Hasta tres bloqueadores.');return;}e.draft.blockers=ids;changed(current()).catch(e=>toast(e.message));}}
    if(t.matches('[data-tr-sub]')||t.matches('[data-tr-serve]')){
      const s=current(),e=exercise();if(!e||e.draft.actions.length||s.status!=='active'||e.status!=='active'){render();return;}
      const before=TrainingModel.copy(e.set);
      if(t.matches('[data-tr-sub]')){const index=Number(t.dataset.trSub);if(e.set.positions.some((id,i)=>i!==index&&id===t.value)){toast('Ese jugador ya está en cancha.');render();return;}e.set.positions[index]=t.value;}
      else e.set.serve=t.value;
      if(e.set.training.rotations)reconcileLibero(e.set);
      e.set.changes.push({id:TrainingModel.id(),timestamp:TrainingModel.now(),type:'training-change',before:{positions:before.positions,serve:before.serve},score:before.score,rotation:before.rotation});
      changed(s).catch(e=>toast(e.message));
    }
  });
  window.addEventListener('online',schedule);window.addEventListener('offline',()=>{clearTimeout(timer);if(mode==='training')render();});
  window.addEventListener('afterprint',()=>{document.body.classList.remove('training-print');if(mode==='training')render();});
  window.addEventListener('beforeunload',event=>{if(store?.writing||store?.unsafe){event.preventDefault();event.returnValue='';}});
  return {start,handle,render:renderTraining,modeBar,current,exercise,status,sync,schedule,fullBackup,exportFull,importBackup,
    canUpdate:()=>(mode==='match'||loaded)&&!busy&&!syncing&&!store?.writing&&!store?.unsafe&&!(mode==='training'&&(['create','edit-exercise'].includes(page)||page==='live'&&current()?.status==='active'))&&!store?.all().some(s=>s.exercises.some(e=>e.draft.actions.length)),
    get mode(){return mode},get store(){return store},get loaded(){return loaded}};
})();
