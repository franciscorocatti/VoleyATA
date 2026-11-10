'use strict';
function renderCourtControls(m){
  const s=activeSet();
  if(!VolleyCourt.enabled(m,s))return `<section class="card"><h2>Líbero automático y posiciones tácticas</h2><p>Activá estas mejoras para las próximas jugadas. Las acciones anteriores se conservan.</p><button class="btn btn-primary" data-action="court-enable">Activar mejoras de cancha</button></section>`;
  return `<section class="card"><h2>Líbero automático y posiciones tácticas</h2>${['us','them'].map(side=>{
    const roster=VolleyRally.roster(m,side),raw=VolleyRally.positions(s,side,false),middles=roster.filter(p=>raw.includes(p.id)&&playerPosition(p)==='middle'),liberos=roster.filter(p=>p.isLibero),chosen=m.liberoPreferred?.[side]||liberos.find(p=>p.id===(side==='us'?s.libero:s.opponentLineup?.libero)?.playerId)?.id||liberos[0]?.id;
    return `<fieldset><legend>${esc(side==='us'?m.team:m.opponent)}</legend><label class="row"><input type="checkbox" data-court-auto="${side}" ${m.liberoAuto?.[side]!==false?'checked':''}>Reemplazar automáticamente a los centrales zagueros</label><label>Líbero habitual<select data-court-libero="${side}"><option value="">${liberos.length?'Primero disponible':'Sin líbero designado'}</option>${teamOptions(liberos,chosen)}</select></label><p class="hinttext">Centrales en formación: ${middles.map(p=>'#'+esc(p.number)).join(' / ')||'Sin identificar'}. ${middles.length===2?'Asociados por su rol y posición oficial.':'Identificá los dos centrales para habilitar el ingreso automático.'} Cuando saca un central, el equipo juega sin líbero.</p><button class="btn" data-action="court-resume-libero" data-side="${side}">Retomar reemplazos automáticos</button></fieldset>`;
  }).join('')}<p class="hinttext">Un reemplazo manual se respeta hasta el próximo cambio de servicio o formación. Estos reemplazos no consumen sustituciones. Las correcciones tácticas están en cada cancha del panel En vivo.</p></section>`;
}
document.addEventListener('change',e=>{
  const t=e.target;if(t.matches('[data-court-setup]')){setupDraft.courtAutomation=t.checked;return;}const m=activeMatch(),s=activeSet();if(!m||!s)return;
  if(t.matches('[data-court-auto]')||t.matches('[data-court-libero]')){
    if(!betweenRallies(s)){render();return;}
    const side=t.dataset.courtAuto||t.dataset.courtLibero;if(!['us','them'].includes(side))return;
    if(t.matches('[data-court-auto]')){m.liberoAuto ||= {};m.liberoAuto[side]=t.checked;}
    else {if(t.value&&!VolleyRally.roster(m,side).some(p=>p.id===t.value&&p.isLibero)){render();return;}m.liberoPreferred ||= {};m.liberoPreferred[side]=t.value;}
    if(s.liberoManual)delete s.liberoManual[side];VolleyCourt.sync(m,s);beginRallyFlow();save();render();
  }
  if(t.matches('[data-court-move]')){
    const side=t.dataset.side;if(!['us','them'].includes(side))return;
    if(VolleyCourt.move(m,s,side,t.dataset.player,+t.value)){refreshTacticalInput();save();render();}
  }
  if(t.matches('[data-court-setup]'))setupDraft.courtAutomation=t.checked;
});
function enableRallyFlow(m,set,seed){
  m.rallyAutomation=2;m.rivalPlayers ||= [];
  const source=seed||set.opponentLineup?.current||Array.from({length:6},()=>({}));
  const used=new Set();
  const rows=source.map((row,i)=>{
    let p=m.rivalPlayers.find(p=>row.id?p.id===row.id:row.number&&p.number===row.number);
    if(!p){p={id:row.id||uid(),number:row.number?.trim()||'Rival '+(i+1),name:row.name?.trim()||'',position:row.position||'',isLibero:false,provisional:!row.number?.trim()||!!row.provisional};m.rivalPlayers.push(p);}
    if(used.has(p.id))throw Error('La formación rival tiene identidades repetidas.');used.add(p.id);
    return {...p};
  });
  set.opponentLineup={...(set.opponentLineup||{}),initial:set.opponentLineup?.initial?.every(p=>p.id)?set.opponentLineup.initial:structuredCloneSafe(rows),current:rows,rotation:set.opponentLineup?.rotation||1,recordedAtRally:set.opponentLineup?.recordedAtRally??set.rallies.length,scoreAtRegistration:{...set.score},libero:set.opponentLineup?.libero||null};
}
function reconcileRivalLibero(m,set){
  const line=set?.opponentLineup,lib=line?.libero;if(!lib)return;
  const pos=line.current.findIndex(p=>p.id===lib.replacedId)+1;
  if(![1,5,6].includes(pos)||pos===1&&set.serve==='them'){
    set.changes ||= [];set.changes.push({id:uid(),type:'rival-libero-auto-out',side:'them',score:{...set.score},rotation:set.rotation,timestamp:new Date().toISOString(),rallyCount:set.rallies.length,outgoing:lib.playerId,incoming:lib.replacedId,position:pos});line.libero=null;
  }
}
function renderRivalTeamControls(m){
  if(m.rallyAutomation!==2)return '<div class="card"><h2>Scouting de ambos equipos</h2><p>Los registros históricos se conservan. Activá el panel integrado para las próximas acciones.</p><button class="btn btn-primary" data-action="flow-enable">Activar scouting integral</button></div>';
  const s=activeSet(),line=s.opponentLineup,roster=m.rivalPlayers||[],ids=VolleyRally.positions(s,'them',false);
  return `<section class="card"><h2>Plantel rival · ${esc(m.opponent)}</h2><p class="hinttext">Rival 1–6 son referencias provisionales, no dorsales confirmados. Identificá cada referencia cuando la reconozcas; conserva su ID. Cambios y formación se registran entre rallies.</p>${roster.map(p=>`<div class="rival-roster-row"><strong>${p.provisional?'Referencia provisional':'#'+esc(p.number)}</strong><label>Dorsal<input data-flow-rival="${esc(p.id)}" data-prop="number" value="${p.provisional?'':esc(p.number)}" maxlength="3" inputmode="numeric" placeholder="Sin identificar"></label><label>Nombre<input data-flow-rival="${esc(p.id)}" data-prop="name" value="${esc(p.name)}" maxlength="60"></label><label>Puesto<select data-flow-rival="${esc(p.id)}" data-prop="position">${positionOptions(p)}</select></label></div>`).join('')}<button class="btn" data-action="flow-rival-add">Agregar suplente rival</button><h3>Formación actual · R${line?.rotation||1}</h3><div class="lineup-grid">${[4,3,2,5,6,1].map(pos=>`<label>P${pos}<select data-flow-lineup="${pos-1}">${roster.filter(p=>!p.isLibero).map(p=>`<option value="${esc(p.id)}" ${ids[pos-1]===p.id?'selected':''}>${esc(p.number)} ${esc(p.name)}</option>`).join('')}</select></label>`).join('')}</div><p class="hinttext">Elegir un suplente registra sustitución; elegir otro titular intercambia posiciones como corrección manual.</p><button class="btn" data-action="flow-rival-rotate">Corregir: rotar rival una posición</button><h3>Líbero rival</h3>${line?.libero?`<p>${esc(roster.find(p=>p.id===line.libero.playerId)?.number)} en cancha</p><button class="btn" data-action="flow-rival-libero-out">Retirar líbero rival</button>`:`<label>Líbero<select id="flow-libero">${teamOptions(roster.filter(p=>p.isLibero),'')}</select></label><label>Reemplaza a<select id="flow-libero-replaced">${teamOptions(roster.filter(p=>ids.includes(p.id)&&[1,5,6].includes(ids.indexOf(p.id)+1)&&!(ids.indexOf(p.id)===0&&s.serve==='them')),'')}</select></label><button class="btn" data-action="flow-rival-libero-in">Ingresar líbero rival</button>`}<label class="row"><input type="checkbox" data-flow-scheme ${m.receptionScheme?'checked':''}>Usar esquema de recepción propio</label></section>`;
}
function recordRivalChange(type,mutate){
  const m=activeMatch(),s=activeSet();if(!s||!betweenRallies(s))return false;
  const before=structuredCloneSafe(s.opponentLineup);mutate(s,m);s.changes ||= [];
  const lib=s.opponentLineup.libero||before.libero,libChange=type.includes('libero');
  s.changes.push({id:uid(),type,side:'them',score:{...s.score},rotation:s.rotation,position:0,outgoing:libChange?(type==='rival-libero-in'?lib.replacedId:lib.playerId):before.current.find((p,i)=>p.id!==s.opponentLineup.current[i]?.id)?.id||before.current[0].id,incoming:libChange?(type==='rival-libero-in'?lib.playerId:lib.replacedId):s.opponentLineup.current.find((p,i)=>p.id!==before.current[i]?.id)?.id||before.current[0].id,rallyCount:s.rallies.length,beforeOpponent:before,opponentAfter:structuredCloneSafe(s.opponentLineup),timestamp:new Date().toISOString()});
  if(type.includes('libero'))VolleyCourt.manualLibero(s,'them');reconcileRivalLibero(m,s);VolleyCourt.sync(m,s);beginRallyFlow();save();render();return true;
}
document.addEventListener('change',e=>{
  const t=e.target,m=activeMatch();
  if(t.matches('[data-flow-draft-role]')){setupDraft.opponentFormation ||= Array.from({length:6},()=>({number:'',name:''}));setupDraft.opponentFormation[+t.dataset.flowDraftRole].position=t.value;}
  if(t.matches('[data-flow-bench]')){const p=setupDraft.rivalBench?.[+t.dataset.flowBench];if(p&&['number','name','position'].includes(t.dataset.prop))p[t.dataset.prop]=t.value;}
  if(t.matches('[data-flow-setup-scheme]'))setupDraft.receptionScheme=t.checked;
  if(t.matches('[data-flow-scheme]')&&m){m.receptionScheme=t.checked;save();render();}
  if(t.matches('[data-flow-rival]')&&m){
    const p=m.rivalPlayers.find(p=>p.id===t.dataset.flowRival);if(!p)return;
    const key=t.dataset.prop,value=t.value.trim();
    if(key==='number'&&(!/^\d{1,3}$/.test(value)||m.rivalPlayers.some(q=>q!==p&&!q.provisional&&q.number===value))){toast('Usá un dorsal único de hasta tres dígitos.');render();return;}
    if(!['number','name','position'].includes(key))return;
    if(key==='position'&&!['',...Object.keys(attackPositions)].includes(value))return;
    if(key==='position'&&value==='libero'&&m.rivalPlayers.filter(q=>q.isLibero&&q!==p).length>=2){toast('Hasta dos líberos rivales.');render();return;}
    if(key==='position'&&(p.isLibero!== (value==='libero'))&&m.sets.some(s=>s.rallies.some(r=>r.actions.some(a=>a.playerId===p.id))||VolleyRally.positions(s,'them',false).includes(p.id))){toast('Para cambiar la designación de líbero, usá un jugador sin participación y fuera de la formación.');render();return;}
    p[key]=value;if(key==='number')p.provisional=false;if(key==='position'){p.isLibero=value==='libero';delete p.attackPosition;}if(!pending.length){VolleyCourt.sync(m,activeSet());if(VolleyCourt.enabled(m,activeSet()))beginRallyFlow();}save();render();
  }
  if(t.matches('[data-flow-lineup]')&&m){const pos=+t.dataset.flowLineup,id=t.value;
    recordRivalChange('rival-lineup',s=>{const rows=s.opponentLineup.current,index=rows.findIndex(p=>p.id===id);if(index>=0)[rows[pos],rows[index]]=[rows[index],rows[pos]];else {const p=m.rivalPlayers.find(p=>p.id===id&&!p.isLibero);if(p)rows[pos]={...p};}s.opponentLineup.libero=null;});
  }
});
// positions mantiene los seis jugadores regulares; libero es un reemplazo superpuesto.
function teamSet(s) {
  if (!s.changes) s.changes = [];
  if (!s.initialLineup) {
    s.initialLineup = [...(s.rallies[0]?.positions || s.positions)];
    s.initialLineupInferred = s.rallies.length > 0;
  }
  return s;
}
function courtPlayers(s) {
  return s.positions.map(id => s.libero?.replacedId === id ? s.libero.playerId : id);
}
function mobileRallyDock(m,s) {
  if (s.finished) return '';
  return `<div class="mobile-rally-dock no-print"><div class="dock-context"><strong>Set ${s.number} · ${s.score.us}–${s.score.them}</strong><span role="status">${pending.length} ${pending.length === 1 ? 'acción cargada' : 'acciones cargadas'}</span></div><div class="rally-buttons"><button class="rally-btn us" data-action="finish-rally" data-winner="us">+ Punto · ${esc(m.team)}</button><button class="rally-btn them" data-action="finish-rally" data-winner="them">+ Punto · ${esc(m.opponent)}</button></div></div>`;
}
function captureCourtRotation(side) {
  if (view !== 'live' || !document.querySelector || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return null;
  const court = document.querySelector(`[data-court-side="${side}"]`);
  if (!court) return null;
  const origin = court.getBoundingClientRect(), players = new Map();
  for (const node of court.querySelectorAll('[data-court-player]')) {
    const rect = node.getBoundingClientRect();
    players.set(node.dataset.courtPlayer,{x:rect.left-origin.left,y:rect.top-origin.top});
  }
  return {side,players};
}
function playCourtRotation(snapshot) {
  if (!snapshot || !document.querySelector) return;
  const court = document.querySelector(`[data-court-side="${snapshot.side}"]`);
  if (!court) return;
  const origin = court.getBoundingClientRect();
  for (const node of court.querySelectorAll('[data-court-player]')) {
    if (!node.animate) continue;
    const before = snapshot.players.get(node.dataset.courtPlayer), rect = node.getBoundingClientRect();
    const frames = before ? [
      {transform:`translate(${before.x-(rect.left-origin.left)}px, ${before.y-(rect.top-origin.top)}px)`,backgroundColor:'#d6f5ec'},
      {transform:'translate(0, 0)'}
    ] : [{opacity:0,transform:'scale(.85)'},{opacity:1,transform:'scale(1)'}];
    node.animate(frames,{duration:650,easing:'cubic-bezier(.22,.7,.25,1)'});
  }
}
function opponentFields(players, prefix, draft = false) {
  return `<div class="lineup-grid">${[4,3,2,5,6,1].map(pos => {
    const p = players?.[pos-1] || {};
    return `<div class="field"><label for="${prefix}-number-${pos}">Posición ${pos}</label><input id="${prefix}-number-${pos}" aria-label="Número rival posición ${pos}" maxlength="3" placeholder="Número" value="${esc(p.number || '')}" ${draft ? `data-opponent-draft="${pos-1}" data-prop="number"` : ''}><input id="${prefix}-name-${pos}" aria-label="Nombre rival posición ${pos}" maxlength="50" placeholder="Nombre (opcional)" value="${esc(p.name || '')}" ${draft ? `data-opponent-draft="${pos-1}" data-prop="name"` : ''}></div>`;
  }).join('')}</div>`;
}
function opponentDraftCard() {
  return `<div class="card" style="margin-top:16px"><h2>Formación del rival · Set 1</h2><p>Opcional: cargá los números conocidos por posición inicial. Los espacios vacíos quedan como referencias provisionales. Podés agregar suplentes y líberos debajo.</p>${opponentFields(setupDraft.opponentFormation,'draft-rival',true)}<details class="v2-extra"><summary>Roles conocidos de titulares rivales</summary>${[4,3,2,5,6,1].map(pos=>`<label>P${pos}<select data-flow-draft-role="${pos-1}">${positionOptions(setupDraft.opponentFormation?.[pos-1]).replace(/<option value="libero"[^>]*>[^<]*<\/option>/,'')}</select></label>`).join('')}</details><details class="v2-extra"><summary>Suplentes y líberos rivales · opcionales</summary>${(setupDraft.rivalBench||[]).map((p,i)=>`<div class="rival-roster-row"><label>Dorsal<input data-flow-bench="${i}" data-prop="number" value="${esc(p.number)}" maxlength="3"></label><label>Nombre<input data-flow-bench="${i}" data-prop="name" value="${esc(p.name)}" maxlength="60"></label><label>Puesto<select data-flow-bench="${i}" data-prop="position">${positionOptions(p)}</select></label><button class="btn btn-small" data-action="flow-draft-bench-remove" data-index="${i}">Quitar suplente</button></div>`).join('')}<button class="btn" data-action="flow-draft-bench-add">Agregar suplente / líbero rival</button></details><label class="row"><input type="checkbox" data-flow-setup-scheme ${setupDraft.receptionScheme?'checked':''}>USAR ESQUEMA DE RECEPCIÓN propio</label></div>`;
}
function validOpponentFormation(players, optional = false) {
  if(optional){const all=[...(players||[]),...(setupDraft.rivalBench||[]).filter(p=>p.number?.trim())];if(all.filter(p=>p.position==='libero').length>2){toast('Hasta dos líberos rivales.');return false;}const known=all.map(p=>p.number?.trim()).filter(Boolean);if(known.some(n=>!/^\d{1,3}$/.test(n))){toast('Los dorsales rivales deben tener hasta tres dígitos.');return false;}if(new Set(known).size!==known.length){toast('Los dorsales rivales no deben repetirse.');return false;}return true;}
  const empty = !players || players.every(p => !p.number?.trim() && !p.name?.trim());
  if (empty && optional) return true;
  if (!players || players.length !== 6 || players.some(p => !p.number?.trim()) || new Set(players.map(p => p.number.trim())).size !== 6) {
    toast('La formación rival necesita seis números distintos. Los nombres son opcionales.'); return false;
  }
  return true;
}
function setOpponentFormation(s, players) {
  const initial = players.map(p => ({number:p.number.trim(),name:(p.name || '').trim()}));
  s.opponentLineup = {initial, current:structuredCloneSafe(initial), recordedAtRally:s.rallies.length, scoreAtRegistration:{...s.score}, rotation:1};
}
function opponentFormationCard(m, live = false) {
  const s = activeSet(), lineup = s.opponentLineup;
  if (live) {
    if (!lineup) return `<div class="card" style="margin-top:16px"><div class="row-between"><h2 style="margin:0">Formación rival · ${esc(m.opponent)}</h2><button class="btn btn-small" data-action="view" data-view="settings">Cargar formación rival</button></div></div>`;
    return `<div class="card" style="margin-top:16px"><div class="section-head"><h2>Cancha rival · ${esc(m.opponent)}</h2><span class="pill">R${lineup.rotation}</span></div><p class="hinttext" style="margin-bottom:12px">Vista desde el lado del rival · adelante 4–3–2, atrás 5–6–1.</p><div class="mini-court" data-court-side="them">${[4,3,2,5,6,1].map(pos => {
      const p = lineup.current[pos-1];
      return `<div class="mini-zone" data-court-player="${esc(p.number)}"><span class="tiny">Posición ${pos}</span><strong style="display:block">#${esc(p.number)} ${esc(p.name)}</strong></div>`;
    }).join('')}</div></div>`;
  }
  const editable = !s.finished && !pending.length && (!lineup || s.rallies.length === lineup.recordedAtRally);
  return `<div class="card"><h2>Formación del rival · Set ${s.number}</h2><p>${lineup?.recordedAtRally > 0 ? `Formación registrada con el marcador ${lineup.scoreAtRegistration.us}–${lineup.scoreAtRegistration.them}; los puntos anteriores no se modifican.` : 'Cargá los seis números por posición inicial. Los nombres son opcionales.'}</p>
  ${editable ? `${opponentFields(lineup?.initial,'rival')}<button class="btn btn-primary" data-action="opponent-save-formation" style="margin-top:12px">Guardar formación rival</button>` : lineup ? `<div class="lineup-grid">${[4,3,2,5,6,1].map(pos => `<div class="subtle"><small>Posición ${pos} al registrar</small><br><strong>#${esc(lineup.initial[pos-1].number)} ${esc(lineup.initial[pos-1].name)}</strong></div>`).join('')}</div><p class="hinttext">La formación registrada queda conservada durante este set.</p>` : '<p class="hinttext">Cerrá el punto en curso para cargar la formación rival.</p>'}
  <p class="hinttext">La cancha rival rota automáticamente cuando el rival recupera el saque. Podés definir otra formación al comenzar el próximo set.</p></div>`;
}
function handleOpponentAction(action) {
  if (action !== 'opponent-save-formation') return false;
  const s = activeSet();
  if (!s || !betweenRallies(s)) return true;
  if (s.opponentLineup && s.rallies.length !== s.opponentLineup.recordedAtRally) { toast('La formación rival ya tiene puntos registrados.'); return true; }
  const players = Array.from({length:6}, (_,i) => ({number:document.getElementById(`rival-number-${i+1}`).value.trim(),name:document.getElementById(`rival-name-${i+1}`).value.trim()}));
  if (!validOpponentFormation(players)) return true;
  setOpponentFormation(s,players);save();render();toast('Formación rival guardada.');return true;
}
function teamOptions(players, selected) {
  return players.map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>#${esc(p.number)} ${esc(p.name)}${p.isLibero ? ' · L' : ''}</option>`).join('');
}
function prepareDraftLineup() {
  for (const p of setupDraft.players) {if (!p.id) p.id = uid();if(playerPosition(p)==='libero')p.isLibero=true;}
  const regular = setupDraft.players.filter(p => !p.isLibero);
  const allowed = new Set(regular.map(p => p.id));
  const used = new Set();
  setupDraft.lineup = Array.from({length:6}, (_, i) => {
    let id = setupDraft.lineup?.[i];
    if (!allowed.has(id) || used.has(id)) id = regular.find(p => !used.has(p.id))?.id || '';
    used.add(id); return id;
  });
}
function draftFormation() {
  prepareDraftLineup();
  return `<div class="subtle" style="margin-top:16px"><h3>Formación inicial · Set 1</h3><p class="hinttext">Elegí los seis titulares en sus posiciones de rotación. El líbero se registra aparte e ingresa por un zaguero.</p>
  <div class="lineup-grid" style="margin-top:12px">${[4,3,2,5,6,1].map(pos => `<div class="field"><label for="draft-pos-${pos}">Posición ${pos}${pos === 1 ? ' · saque' : ''}</label><select id="draft-pos-${pos}" data-draft-position="${pos-1}"><option value="">Sin jugador</option>${teamOptions(setupDraft.players.filter(p => !p.isLibero), setupDraft.lineup[pos-1])}</select>${renderPlayerJersey(setupDraft,setupDraft.players.find(p=>p.id===setupDraft.lineup[pos-1]))}</div>`).join('')}</div>
  <h3 style="margin-top:16px">Líberos</h3><p class="hinttext">Podés designar hasta dos. Necesitás además seis jugadores regulares.</p>
  ${setupDraft.players.map(p => `<label class="row" style="margin-top:8px"><input type="checkbox" style="width:18px;min-height:18px" data-draft-libero="${esc(p.id)}" ${p.isLibero ? 'checked' : ''}>#${esc(p.number)} ${esc(p.name)} · líbero</label>`).join('')}</div>`;
}
function validateDraftFormation() {
  prepareDraftLineup();
  if (!validOpponentFormation(setupDraft.opponentFormation,true)) return false;
  if (setupDraft.players.filter(p => p.isLibero).length > 2) { toast('Designá como máximo dos líberos.'); return false; }
  if (setupDraft.lineup.some(id => !id) || new Set(setupDraft.lineup).size !== 6) { toast('Elegí seis titulares regulares distintos para la formación inicial.'); return false; }
  return true;
}
function teamChange(s, type, outgoing, incoming, position, before) {
  teamSet(s);
  s.changes.push({id:uid(), timestamp:new Date().toISOString(), type, outgoing, incoming, position,
    score:{...s.score}, rallyCount:s.rallies.length, rotation:s.rotation, before});
}
function teamSnapshot(s) { return {liberoManual:structuredCloneSafe(s.liberoManual||{}),tacticalOverrides:structuredCloneSafe(s.tacticalOverrides||{}),positions:[...s.positions], libero:s.libero ? {...s.libero} : null,serve:s.serve,rotation:s.rotation}; }
function betweenRallies(s) {
  if (s.finished) { toast('El set ya está finalizado.'); return false; }
  if (pending.length) { toast('Cerrá el punto en curso o quitá sus acciones antes de hacer un cambio.'); return false; }
  return true;
}
function reconcileLibero(s) {
  if (!s.libero) return;
  const pos = s.positions.indexOf(s.libero.replacedId) + 1;
  if (![1,5,6].includes(pos) || (pos === 1 && s.serve === 'us') || s.finished) {
    const before = teamSnapshot(s), old = s.libero;
    s.libero = null;
    teamChange(s, 'libero-auto-out', old.playerId, old.replacedId, pos, before);
  }
}
function formationCard(m) {
  const s = teamSet(activeSet()), editable = !s.finished && !s.rallies.length && !s.changes.some(c=>!c.automatic) && (!s.libero||VolleyCourt.enabled(m,s));
  return `<div class="card"><h2>Formación inicial · Set ${s.number}</h2>
  <p>${editable ? 'Elegí un jugador por posición. Los cambios se guardan al seleccionar.' : 'La formación inicial queda conservada. Para cambiar jugadores usá Sustituciones.'}${s.initialLineupInferred ? ' En este set anterior se recuperó la primera formación registrada.' : ''}</p>
  <div class="lineup-grid">${[4,3,2,5,6,1].map(pos => `<div class="field"><label for="initial-${pos}">Posición ${pos}${pos === 1 ? ' · saque' : ''}</label>${renderPlayerJersey(m,playerById(m,(editable?s.positions:s.initialLineup)[pos-1]))}${editable ? `<select id="initial-${pos}" data-initial-position="${pos-1}">${teamOptions(m.players.filter(p => !p.isLibero), s.positions[pos-1])}</select>` : `<strong>${esc(pname(m,s.initialLineup[pos-1]))}</strong>`}</div>`).join('')}</div></div>`;
}
function changesCard(m) {
  const s = teamSet(activeSet()), current = courtPlayers(s);
  const bench = m.players.filter(p => !p.isLibero && !s.positions.includes(p.id));
  const liberos = m.players.filter(p => p.isLibero);
  const disabled = s.finished || pending.length ? 'disabled' : '';
  const labels = {substitution:'Sustitución', 'libero-in':'Entra líbero', 'libero-out':'Sale líbero', 'libero-switch':'Cambio de líbero', 'libero-auto-out':'Sale líbero · automático','libero-auto-in':'Entra líbero · automático','libero-auto-switch':'Reemplazo del líbero · automático','rotation-correction':'Corrección de rotación','serve-correction':'Corrección de servicio'};
  return `<div class="card"><div class="section-head"><h2>Cancha y cambios · Set ${s.number}</h2><span class="pill">${s.changes.filter(c => c.type === 'substitution').length} sustituciones</span></div>
  <div class="mini-court">${[4,3,2,5,6,1].map(pos => `<div class="mini-zone"><span class="tiny">Posición ${pos}</span>${renderPlayerJersey(m,playerById(m,current[pos-1]))}<strong style="display:block">${esc(pname(m,current[pos-1]))}${playerById(m,current[pos-1])?.isLibero ? ' · L' : ''}</strong></div>`).join('')}</div>
  <h3 style="margin-top:18px">Sustitución</h3><div class="grid-2"><div class="field"><label for="sub-out">Sale</label><select id="sub-out" ${disabled}>${teamOptions(m.players.filter(p => s.positions.includes(p.id) && p.id !== s.libero?.replacedId))}</select></div><div class="field"><label for="sub-in">Entra desde el banco</label><select id="sub-in" ${disabled}>${teamOptions(bench)}</select></div></div>
  <button class="btn btn-primary" style="margin-top:10px" data-action="team-substitute" ${disabled || (!bench.length ? 'disabled' : '')}>Registrar sustitución</button>
  ${!bench.length ? '<p class="hinttext">No hay jugadores regulares disponibles en el banco.</p>' : ''}
  <h3 style="margin-top:20px">Líbero</h3>${s.libero ? `<p><strong>${esc(pname(m,s.libero.playerId))}</strong> está por ${esc(pname(m,s.libero.replacedId))}.</p><button class="btn" data-action="team-libero-out" ${disabled}>Retirar líbero y devolver al jugador</button>${liberos.length > 1 ? `<button class="btn" data-action="team-libero-switch" ${disabled}>Cambiar al otro líbero</button>` : ''}` : liberos.length ? `<div class="grid-2"><div class="field"><label for="libero-in">Líbero que entra</label><select id="libero-in" ${disabled}>${teamOptions(liberos)}</select></div><div class="field"><label for="libero-for">Reemplaza a</label><select id="libero-for" ${disabled}>${teamOptions(m.players.filter(p => [1,5,6].includes(s.positions.indexOf(p.id)+1) && !(s.positions.indexOf(p.id) === 0 && s.serve === 'us')))}</select></div></div><button class="btn btn-soft" data-action="team-libero-in" style="margin-top:10px" ${disabled}>Ingresar líbero</button>` : '<p>Designá los líberos en Plantel para habilitar sus ingresos.</p>'}
  <p class="hinttext">El líbero ocupa el lugar de un zaguero sin cambiar el orden de rotación. Sale automáticamente cuando corresponde pasar a la delantera o sacar. Sus acciones se atribuyen a su nombre. Este registro no valida todos los límites reglamentarios de sustituciones.</p>
  ${pending.length ? '<p class="errorbox">Hay acciones pendientes: cerrá el punto para habilitar cambios.</p>' : ''}
  <details style="margin-top:14px"><summary>Historial de cambios (${s.changes.length})</summary><div class="history" style="margin-top:10px">${s.changes.length ? s.changes.slice().reverse().map(c => `<div class="history-row"><div><strong>${esc(labels[c.type] || c.type)}</strong><br><small>${c.description?esc(c.description):esc(pname(m,c.outgoing))+' → '+esc(pname(m,c.incoming))+' · P'+c.position}</small></div><span class="tag">${c.score.us}–${c.score.them} · R${c.rotation}</span></div>`).join('') : '<p>Sin cambios registrados en este set.</p>'}</div></details>
  <button class="btn btn-small" style="margin-top:10px" data-action="team-undo-change" ${disabled || (!s.changes.length || s.changes.at(-1).rallyCount !== s.rallies.length || (s.changes.at(-1).automatic||s.changes.at(-1).side==='them'||s.changes.at(-1).type === 'libero-auto-out') ? 'disabled' : '')}>Deshacer último cambio</button>
  </div>`;
}
function liberoRoles(m) {
  return `<div class="card"><h2>Líberos del equipo</h2><p>Designá hasta dos. Un jugador de la formación o con participación registrada debe conservar su rol.</p>${m.players.map(p => `<label class="row" style="margin-top:8px"><input type="checkbox" style="width:18px;min-height:18px" data-player-libero="${esc(p.id)}" ${p.isLibero ? 'checked' : ''}>#${esc(p.number)} ${esc(p.name)} · líbero</label>`).join('')}</div>`;
}
function setLiberoDesignation(player,enabled,players,match=null) {
  if (!player) return false;
  if (!!player.isLibero !== enabled) {
    const used=match?.sets.some(set=>set.positions.includes(player.id)||set.initialLineup?.includes(player.id)||set.libero?.playerId===player.id||set.rallies.some(r=>r.actions.some(a=>a.playerId===player.id))||set.changes?.some(c=>c.incoming===player.id||c.outgoing===player.id));
    if (used) {toast('Este jugador ya tiene una posición o participación registrada. Conservá su rol de líbero o regular.');return false;}
    if (enabled && players.filter(p=>p.isLibero&&p.id!==player.id).length>=2) {toast('Podés designar hasta dos líberos.');return false;}
  }
  player.isLibero=enabled;
  if (enabled) player.attackPosition='libero';
  else if (player.attackPosition==='libero') player.attackPosition='';
  return true;
}
function handleTeamAction(action) {
  if (!action?.startsWith('team-')) return false;
  const m = activeMatch(), s = activeSet();
  if (!m || !s || !betweenRallies(s)) return true;
  teamSet(s);
  const before = teamSnapshot(s);
  if (action === 'team-substitute') {
    const outgoing = document.getElementById('sub-out').value, incoming = document.getElementById('sub-in').value;
    const idx = s.positions.indexOf(outgoing), p = playerById(m,incoming);
    if (idx < 0 || !p || p.isLibero || s.positions.includes(incoming) || outgoing === s.libero?.replacedId) { toast('Elegí un jugador en cancha y un suplente regular disponible.'); return true; }
    s.positions[idx] = incoming;
    teamChange(s,'substitution',outgoing,incoming,idx+1,before);
  } else if (action === 'team-libero-in') {
    const incoming = document.getElementById('libero-in')?.value, outgoing = document.getElementById('libero-for')?.value;
    const idx = s.positions.indexOf(outgoing);
    if (s.libero || !playerById(m,incoming)?.isLibero || ![0,4,5].includes(idx) || (idx === 0 && s.serve === 'us')) { toast('Elegí un líbero y un zaguero que no esté por sacar.'); return true; }
    s.libero = {playerId:incoming,replacedId:outgoing};
    teamChange(s,'libero-in',outgoing,incoming,idx+1,before);
  } else if (action === 'team-libero-out') {
    if (!s.libero) return true;
    const old = s.libero; s.libero = null;
    teamChange(s,'libero-out',old.playerId,old.replacedId,s.positions.indexOf(old.replacedId)+1,before);
  } else if (action === 'team-libero-switch') {
    const p = m.players.find(p => p.isLibero && p.id !== s.libero?.playerId);
    if (!s.libero || !p) return true;
    const old = s.libero.playerId; s.libero.playerId = p.id;
    teamChange(s,'libero-switch',old,p.id,s.positions.indexOf(s.libero.replacedId)+1,before);
  } else if (action === 'team-undo-change') {
    const change = s.changes.at(-1);
    if (!change || change.rallyCount !== s.rallies.length || !change.before || change.automatic || change.type === 'libero-auto-out') { toast('Solo se puede deshacer un cambio anterior al próximo punto.'); return true; }
    if(change.side==='them'){toast('Corregí los cambios rivales desde su formación.');return true;}
    s.liberoManual=structuredCloneSafe(change.before.liberoManual||{});s.tacticalOverrides=structuredCloneSafe(change.before.tacticalOverrides||{});
    s.positions = [...change.before.positions]; s.libero = change.before.libero ? {...change.before.libero} : null;
    if(change.before.serve)s.serve=change.before.serve;if(change.before.rotation)s.rotation=change.before.rotation;s.changes.pop();
  } else return true;
  if(action.startsWith('team-libero-'))VolleyCourt.manualLibero(s,'us');
  VolleyCourt.sync(m,s);save(); render(); toast('Cambio guardado.'); return true;
}
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-draft-libero]')) {
    const p = setupDraft.players.find(p => p.id === t.dataset.draftLibero);
    setLiberoDesignation(p,t.checked,setupDraft.players);
    render();
  }
  if (t.matches('[data-draft-position]')) {
    const idx = +t.dataset.draftPosition, old = setupDraft.lineup[idx], other = setupDraft.lineup.indexOf(t.value);
    if (other >= 0) setupDraft.lineup[other] = old;
    setupDraft.lineup[idx] = t.value; render();
  }
  const m = activeMatch(), s = activeSet();
  if (t.matches('[data-initial-position]') && m && s) {
    teamSet(s);
    if (s.finished || s.rallies.length || s.changes.some(c=>!c.automatic) || s.libero&&!VolleyCourt.enabled(m,s) || !betweenRallies(s)) { render(); return; }
    const idx = +t.dataset.initialPosition, p = playerById(m,t.value);
    if (!p || p.isLibero || idx < 0 || idx > 5) { render(); return; }
    const old = s.positions[idx], other = s.positions.indexOf(p.id);
    if (other >= 0) s.positions[other] = old;
    s.positions[idx] = p.id; s.initialLineup = [...s.positions];VolleyCourt.sync(m,s); s.initialLineupInferred = false;
    save(); render();
  }
  if (t.matches('[data-player-libero]') && m && s) {
    const p = playerById(m,t.dataset.playerLibero);
    if (!p) return;
    if (!setLiberoDesignation(p,t.checked,m.players,m)) {render();return;}
    rememberPlayerPosition(m,p);if(!pending.length){VolleyCourt.sync(m,s);if(VolleyCourt.enabled(m,s))beginRallyFlow();}save();render();
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (!t.matches('[data-opponent-draft]')) return;
  if (!setupDraft.opponentFormation) setupDraft.opponentFormation = Array.from({length:6}, () => ({number:'',name:''}));
  const player = setupDraft.opponentFormation[+t.dataset.opponentDraft];
  if (player && ['number','name','position'].includes(t.dataset.prop)) player[t.dataset.prop] = t.value;
});
