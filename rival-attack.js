'use strict';
// Rival attacks share the existing rally, score, persistence and undo paths.
const RIVAL_RESULTS={kill:{label:'PUNTO RIVAL',winner:'them'},continue:{label:'SIGUE / DEFENDIDO',winner:null},error:{label:'ERROR RIVAL',winner:'us'},blocked_point:{label:'BLOQUEO NUESTRO',winner:'us'}};
const RIVAL_POSITIONS={outside:'Punta / Receptor',opposite:'Opuesto',middle:'Central',setter:'Armador',libero:'Líbero'};
let rivalPanel=false,rivalTactics=false,rivalDraft={},trendSide='them',trendPlayer='',trendZone='',rivalEditor='';
function resetRivalAttack(){rivalDraft={playerId:null,direction:null,skipDirection:false,originZone:null,destinationZone:null,attackType:null,ownBlockers:[]};}
function rivalRoster(m=activeMatch()){return m?.rivalPlayers||[];}
function rivalPlayer(m,id){return rivalRoster(m).find(p=>p.id===id);}
function rivalActionPlayer(m,a){return a.skill==='rival_attack'?rivalPlayer(m,a.playerId):playerById(m,a.playerId);}
function upsertRivalPlayer(m,input){
  const number=String(input.number||'').trim(),name=String(input.name||'').trim();
  if(!/^\d{1,3}$/.test(number)||!RIVAL_POSITIONS[input.position])return {error:'Ingresá camiseta (hasta tres dígitos) y puesto.'};
  const roster=rivalRoster(m),previous=input.id?roster.find(p=>p.id===input.id):null;
  if(input.id&&!previous)return {error:'No se encontró el atacante rival.'};
  if(roster.some(p=>p.number===number&&p.id!==previous?.id))return {error:'Ya existe esa camiseta rival.'};
  const player={id:previous?.id||uid(),number,name,position:input.position};
  if(previous)Object.assign(previous,player);else {m.rivalPlayers ||= [];m.rivalPlayers.push(player);}
  return {player:previous||player};
}
function selectRivalAttacker(id){const p=rivalPlayer(activeMatch(),id);if(!p)return;resetRivalAttack();rivalDraft.playerId=id;rivalDraft.originZone=({outside:4,opposite:2,middle:3,setter:2})[p.position]??null;}
function rivalAttackLabel(m,a){const p=rivalPlayer(m,a.playerId)||a.metadata?.rivalPlayer;return `Rival #${p?.number||'?'} · ${RIVAL_RESULTS[a.outcomeId]?.label||a.outcome}${a.metadata?.attackDirection?' · '+a.metadata.attackDirection:''}`;}
function addRivalAttack(result){
  const m=activeMatch(),s=activeSet(),out=RIVAL_RESULTS[result],p=rivalPlayer(m,rivalDraft.playerId),now=Date.now();
  if(!m||!s||s.finished||!out||now-lastPointCommit<600||now-lastActionTap<260)return false;
  if(!p){toast('Elegí un atacante rival.');return false;}
  if(!['diagonal','paralela','olla'].includes(rivalDraft.direction)&&!rivalDraft.skipDirection){toast('Elegí la dirección u omití el dato.');return false;}
  const last=pending.at(-1),link=result==='blocked_point'&&last?.skill==='block'&&last.outcomeId==='point'?last:null;
  if(pending.some(a=>VolleyCatalog.outcome(a)?.winner)&&!link){toast('Cerrá o corregí la acción terminal antes de registrar otro ataque.');return false;}
  if(rivalDraft.attackType==='use_block_out'&&result!=='kill'){toast('Un use / block-out es punto del atacante rival.');return false;}
  const blockers=[...new Set(rivalDraft.ownBlockers||[])];
  if(blockers.length>3||blockers.some(id=>!courtPlayers(s).includes(id)||playerById(m,id)?.isLibero)){toast('Elegí hasta tres bloqueadores propios en cancha.');return false;}
  const action={id:uid(),schemaVersion:2,skill:'rival_attack',playerId:p.id,participants:[],outcomeId:result,outcome:out.label,originZone:rivalDraft.originZone??null,destinationZone:rivalDraft.destinationZone??null,zone:rivalDraft.destinationZone??null,attackRole:'unknown',rotationalPosition:null,order:pending.length+1,timestamp:new Date().toISOString(),mode:scoutMode,metadata:{attackDirection:rivalDraft.direction||null,attackType:rivalDraft.attackType||null,rivalPlayer:{...p},ownBlockers:result==='blocked_point'?blockers:[],linkedOwnBlockActionId:link?.id||null}};
  if(link)pending.splice(pending.length-1,0,action);else pending.push(action);
  pending.forEach((a,i)=>a.order=i+1);lastActionTap=now;awaitingBlockerIndex=null;resetRivalAttack();rivalPanel=false;
  save();
  if(out.winner)return finishRally(out.winner,{automatic:true});
  render();return true;
}
function renderRivalEntry(m){
  const d=rivalDraft,p=rivalPlayer(m,d.playerId),editing=rivalPlayer(m,rivalEditor),disabled=activeSet()?.finished?'disabled':'';
  return `<section class="card rival-entry" aria-label="Registro de ataque rival"><div class="section-head"><h2>ATAQUE RIVAL</h2><button class="btn btn-small" data-action="rival-toggle">Volver a nuestro equipo</button></div><div class="attack-fast rival-players">${rivalRoster(m).map(p=>`<button class="btn ${d.playerId===p.id?'btn-primary':''}" data-action="rival-player" data-id="${esc(p.id)}"><strong>#${esc(p.number)}</strong><small>${esc(RIVAL_POSITIONS[p.position])}</small></button>`).join('')||'<p>Agregá solo los atacantes que necesitás observar.</p>'}</div><details class="v2-extra" ${rivalEditor?'open':''}><summary>Agregar / editar atacante rival</summary><label>Editar<select data-rival-editor><option value="">Nuevo atacante</option>${rivalRoster(m).map(p=>`<option value="${esc(p.id)}" ${rivalEditor===p.id?'selected':''}>#${esc(p.number)} ${esc(p.name)}</option>`).join('')}</select></label><div class="grid-2"><label>Camiseta<input id="rival-number" inputmode="numeric" maxlength="3" value="${esc(editing?.number||'')}"></label><label>Puesto<select id="rival-position">${Object.entries(RIVAL_POSITIONS).map(([v,l])=>`<option value="${v}" ${editing?.position===v?'selected':''}>${l}</option>`).join('')}</select></label></div><label>Nombre (opcional)<input id="rival-name" maxlength="60" value="${esc(editing?.name||'')}"></label><button class="btn" data-action="rival-save-player">Guardar atacante</button></details><h3>${p?'#'+esc(p.number)+' · '+esc(RIVAL_POSITIONS[p.position]):'Elegí un atacante'}</h3><div class="attack-fast">${['diagonal','paralela','olla'].map(v=>`<button class="btn ${d.direction===v?'btn-primary':''}" data-action="rival-direction" data-direction="${v}" aria-pressed="${d.direction===v}">${v.toUpperCase()}</button>`).join('')}</div><button class="btn btn-small" data-action="rival-skip">${d.skipDirection?'Dirección omitida':'Omitir dirección'}</button><div class="attack-fast rival-results">${Object.entries(RIVAL_RESULTS).map(([id,r])=>`<button class="btn ${id==='kill'?'btn-danger':r.winner==='us'?'btn-primary':''}" data-action="rival-result" data-result="${id}" ${disabled}>${r.label}</button>`).join('')}</div><details class="v2-extra"><summary>Más detalles</summary><p class="hinttext">Origen sugerido por puesto; no identifica delantero/zaguero.</p>${renderRivalZone('originZone','Origen sugerido · editable',d.originZone)}${renderRivalZone('destinationZone','Destino exacto · opcional',d.destinationZone)}<label>Tipo (opcional)<select data-rival-field="attackType"><option value="">Sin registrar</option>${[['conventional','Remate'],['tip','Toque'],['use_block_out','Use / block-out']].map(([v,l])=>`<option value="${v}" ${d.attackType===v?'selected':''}>${l}</option>`).join('')}</select></label><fieldset><legend>Bloqueadores propios (opcionales)</legend>${m.players.filter(p=>courtPlayers(activeSet()).includes(p.id)&&!p.isLibero).map(p=>`<label class="row"><input type="checkbox" data-rival-own-blocker="${esc(p.id)}" ${(d.ownBlockers||[]).includes(p.id)?'checked':''}>#${esc(p.number)} ${esc(p.name)}</label>`).join('')}</fieldset></details></section>`;
}
function renderRivalZone(field,label,value){return `<div><strong>${label}</strong><div class="attack-fast">${[1,2,3,4,5,6].map(z=>`<button class="btn ${value===z?'btn-primary':''}" data-action="rival-zone" data-field="${field}" data-zone="${z}">${z}</button>`).join('')}<button class="btn" data-action="rival-zone" data-field="${field}">Sin zona</button></div></div>`;}
function attackTrends(m,{side='them',set='all',player='',zone=''}={}){
  const rows=StatsV2.rallies(m,set).flatMap(r=>r.actions.map(a=>({a,r})));
  const config=StatsV2.getMatchData(m,set).config,groups=new Map();
  for(const {a,r} of rows){
    if(a.skill!==(side==='them'?'rival_attack':'attack')||a.metadata?.freeBall||a.isFreeBall||['free_ball','freeball'].includes(a.metadata?.attackType))continue;
    if(player&&a.playerId!==player||zone&&String(StatsV2.zoneOf(a,'origin'))!==String(zone))continue;
    const p=rivalActionPlayer(m,a)||a.metadata?.rivalPlayer||{id:a.playerId,number:'?',name:''};
    if(!groups.has(p.id))groups.set(p.id,{player:p,total:0,known:0,kills:0,errors:0,continued:0,directions:Object.fromEntries(['diagonal','paralela','olla'].map(d=>[d,{count:0,kills:0,errors:0,continued:0,percent:null}]))});
    const g=groups.get(p.id),id=StatsV2.resolveOutcome(a,r).outcomeId,kill=['kill','tip_kill','use_block_out'].includes(id),error=id==='error'||id==='blocked_point'&&config.blockedPointIsError,continued=['continue','tip_continue','covered_block'].includes(id),bucket=g.directions[a.metadata?.attackDirection];
    g.total++;g.kills+=+kill;g.errors+=+error;g.continued+=+continued;
    if(bucket){g.known++;bucket.count++;bucket.kills+=+kill;bucket.errors+=+error;bucket.continued+=+continued;}
  }
  for(const g of groups.values()){g.efficiency=g.total?100*(g.kills-g.errors)/g.total:null;g.missing=g.total-g.known;g.smallSample=g.known<10;for(const b of Object.values(g.directions))b.percent=g.known?100*b.count/g.known:null;const max=Math.max(...Object.values(g.directions).map(b=>b.count));g.mostUsed=max?Object.entries(g.directions).filter(([,b])=>b.count===max).map(([d])=>d):[];}
  return [...groups.values()];
}
function renderTrendRows(m,options){return attackTrends(m,options).map(g=>`<article class="subtle rival-trend ${options.compact?'rival-trend-compact':''}"><h3>#${esc(g.player.number)} ${esc(g.player.name||'')} · ${esc(RIVAL_POSITIONS[g.player.position||g.player.attackPosition]||'Puesto sin registrar')}</h3><p>${g.total} ataques · ${g.known} con dirección · ${g.missing} sin dirección${g.smallSample?' · <strong>Muestra reducida</strong>':''}</p><p>Más utilizada: ${g.mostUsed.length?g.mostUsed.map(d=>d.toUpperCase()).join(' / '):'Sin datos'}</p>${Object.entries(g.directions).map(([d,b])=>`<p><strong>${d.toUpperCase()}: ${b.percent===null?'—':b.percent.toFixed(1)+'%'} (${b.count}/${g.known})</strong><br>${b.kills} puntos · ${b.errors} errores · ${b.continued} siguen</p>`).join('')}<small>Eficacia: ${g.efficiency.toFixed(1)}% · (${g.kills} puntos − ${g.errors} errores) / ${g.total} intentos. ${options.side==='them'?'Criterio de bloqueo punto igual al del equipo propio.':''}</small></article>`).join('')||'<p>Sin ataques registrados para este filtro.</p>';}
function renderAttackTrends(m){const roster=trendSide==='them'?rivalRoster(m):m.players;return `<section class="card"><h2>TENDENCIAS DE ATAQUE</h2><div class="grid-2"><label>Equipo<select data-trend-filter="side"><option value="them" ${trendSide==='them'?'selected':''}>Equipo rival</option><option value="us" ${trendSide==='us'?'selected':''}>Nuestro equipo</option></select></label><label>Jugador<select data-trend-filter="player"><option value="">Todos</option>${roster.map(p=>`<option value="${esc(p.id)}" ${trendPlayer===p.id?'selected':''}>#${esc(p.number)} ${esc(p.name)}</option>`).join('')}</select></label><label>Zona de origen<select data-trend-filter="zone"><option value="">Todas</option>${[1,2,3,4,5,6].map(z=>`<option value="${z}" ${trendZone===String(z)?'selected':''}>Zona ${z}</option>`).join('')}</select></label></div><p class="hinttext">Usa el filtro de set de Estadísticas. Porcentajes sobre ataques con dirección registrada. Muestra reducida: menos de 10 observaciones con dirección; no implica una tendencia estable.</p>${renderTrendRows(m,{side:trendSide,set:statSet,player:trendPlayer,zone:trendZone})}</section>`;}
function renderRivalAccess(m){return `<div class="rival-access"><button class="btn btn-primary" data-action="rival-toggle" aria-expanded="${rivalPanel}">ATAQUE RIVAL</button><button class="btn" data-action="rival-tactics" aria-expanded="${rivalTactics}">TENDENCIAS RIVALES</button></div>${rivalTactics?`<section class="card"><div class="section-head"><h2>TENDENCIAS RIVALES</h2><button class="btn btn-small" data-action="rival-tactics">Cerrar</button></div><label>Set<select data-rival-tactics-set><option value="all">Partido completo</option>${m.sets.map(s=>`<option value="${s.number}" ${String(rivalDraft.tacticsSet)===String(s.number)?'selected':''}>Set ${s.number}</option>`).join('')}</select></label>${renderTrendRows(m,{side:'them',set:rivalDraft.tacticsSet||'all',compact:true})}</section>`:''}${rivalPanel?renderRivalEntry(m):''}`;}
function handleRivalAction(action,t){
  if(!action?.startsWith('rival-'))return false;
  if(action==='rival-toggle'){rivalPanel=!rivalPanel;if(rivalPanel)resetRivalAttack();}
  if(action==='rival-tactics')rivalTactics=!rivalTactics;
  if(action==='rival-player')selectRivalAttacker(t.dataset.id);
  if(action==='rival-direction'){rivalDraft.direction=t.dataset.direction;rivalDraft.skipDirection=false;}
  if(action==='rival-skip'){rivalDraft.direction=null;rivalDraft.skipDirection=true;}
  if(action==='rival-zone'&&['originZone','destinationZone'].includes(t.dataset.field))rivalDraft[t.dataset.field]=t.dataset.zone?+t.dataset.zone:null;
  if(action==='rival-result'){addRivalAttack(t.dataset.result);return true;}
  if(action==='rival-save-player'){const result=upsertRivalPlayer(activeMatch(),{id:rivalEditor,number:document.getElementById('rival-number').value,position:document.getElementById('rival-position').value,name:document.getElementById('rival-name').value});if(result.error){toast(result.error);return true;}rivalEditor='';selectRivalAttacker(result.player.id);}
  save();render();return true;
}
document.addEventListener('change',event=>{const t=event.target;
  if(t.matches('[data-rival-editor]')){rivalEditor=t.value;render();}
  if(t.matches('[data-rival-field]')){if(t.dataset.rivalField==='attackType')rivalDraft.attackType=t.value||null;save();}
  if(t.matches('[data-rival-own-blocker]')){const id=t.dataset.rivalOwnBlocker;rivalDraft.ownBlockers=(rivalDraft.ownBlockers||[]).filter(x=>x!==id);if(t.checked)rivalDraft.ownBlockers.push(id);save();}
  if(t.matches('[data-trend-filter]')){if(t.dataset.trendFilter==='side'){trendSide=t.value==='us'?'us':'them';trendPlayer='';}if(t.dataset.trendFilter==='player')trendPlayer=t.value;if(t.dataset.trendFilter==='zone')trendZone=t.value;render();}
  if(t.matches('[data-rival-tactics-set]')){rivalDraft.tacticsSet=t.value;render();}
});
