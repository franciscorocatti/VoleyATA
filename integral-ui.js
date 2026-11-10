'use strict';
let integralEditor={side:'us',system:'5-1',phase:'defense',rotation:1,draft:null},integralLiveOpen=false,integralAnonymousOrigin=null,integralDrag=null,integralEditorOpen=false,integralAnonymousOpen=false;
const integralPhaseName=p=>VolleyTactics.labels[p]||p;
function persistIntegralEditorDraft(){
  const m=activeMatch();if(!m?.integralVersion||integralEditor.matchId!==m.id||!VolleyTactics.valid(integralEditor.draft))return;
  state.preferences ||= {};state.preferences.tacticalEditorDrafts ||= {};state.preferences.tacticalEditorDrafts[m.id]=VolleyTactics.copy(integralEditor);
}
function restoreIntegralEditorDraft(){
  const m=activeMatch(),saved=state.preferences?.tacticalEditorDrafts?.[m?.id];
  integralEditor=saved&&VolleyTactics.valid(saved.draft)&&['us','them'].includes(saved.side)&&VolleyTactics.phases.includes(saved.phase)&&[1,2,3,4,5,6].includes(saved.rotation)?VolleyTactics.copy(saved):{side:'us',system:'5-1',phase:'defense',rotation:1,draft:null,matchId:m?.id||null};
}
function integralLibrary(){const rows=state.preferences?.tacticalTemplates;return Array.isArray(rows)?rows.filter(VolleyTactics.valid):[];}
function integralDraft(m,side){
  const existing=m.tacticalProfiles?.[side];if(existing)return {...VolleyTactics.copy(existing),editorAnchor:m.tacticalAnchors?.[activeSet().id]?.[side]||0};
  const roles=VolleyRally.positions(activeSet(),side,false).map(id=>playerPosition(VolleyRally.roster(m,side).find(p=>p.id===id))),generated=VolleyTactics.generate(roles,integralEditor.system);
  return generated.template||null;
}
function renderIntegralSetup(){
  const list=integralLibrary();return `<details class="card"><summary>Plantillas tácticas para este partido</summary><label>Sistema base<select data-integral-setup="system">${["5-1","4-2","6-2","custom"].map(system=>`<option value="${system}" ${setupDraft.tacticalTemplates?.system===system?"selected":""}>${system==="custom"?"Personalizado":system}</option>`).join("")}</select></label><button class="btn" data-action="integral-generate-lineup">Generar formación inicial por roles</button><p>Se copian al partido; los ajustes del encuentro conservan la plantilla guardada.</p>${['us','them'].map(side=>`<label>${side==='us'?'Mi equipo':'Rival'}<select data-integral-setup="${side}"><option value="">Generar por roles conocidos</option>${list.map(t=>`<option value="${esc(t.id)}" ${setupDraft.tacticalTemplates?.[side]===t.id?'selected':''}>${esc(t.name)} · ${esc(t.system)}</option>`).join('')}</select></label>`).join('')}<small>La generación requiere roles compatibles con 5–1 o dos armadores. El editor permite elegir 4–2, 6–2 y Personalizado.</small></details>`;
}
function renderIntegralEditor(m){
  if(activeSet()?.training)return '';
  const e=integralEditor,side=e.side,t=e.draft,selected=t?.rotations?.[e.rotation]?.[e.phase],roster=VolleyRally.roster(m,side),current=VolleyRally.positions(activeSet(),side,false),offset=(((side==='us'?activeSet().rotation:activeSet().opponentLineup?.rotation||1)-1-(t?.editorAnchor||0))%6+6)%6,raw=Array.from({length:6},(_,i)=>current[(i-offset+6)%6]),library=integralLibrary();
  return `<details class="card integral-editor" ${integralEditorOpen?'open':''}><summary>Editor de formaciones · fases y seis rotaciones</summary><div class="grid-2"><label>Equipo<select data-integral-editor="side">${['us','them'].map(s=>`<option value="${s}" ${side===s?'selected':''}>${esc(s==='us'?m.team:m.opponent)}</option>`).join('')}</select></label><label>Sistema<select data-integral-editor="system">${[['5-1','5–1'],['4-2','4–2'],['6-2','6–2'],['custom','Personalizado']].map(([s,l])=>`<option value="${s}" ${e.system===s?'selected':''}>${l}</option>`).join('')}</select></label><label>Plantilla guardada<select data-integral-template><option value="">Elegir plantilla</option>${library.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.system)}</option>`).join('')}</select></label><button class="btn" data-action="integral-generate">Generar seis rotaciones por roles</button></div><button class="btn" data-action="integral-edit-current">Editar formación de este partido</button>${t?`<label>Nombre<input data-integral-name value="${esc(t.name)}" maxlength="70"></label><div class="grid-2"><label>Fase<select data-integral-editor="phase">${VolleyTactics.phases.map(p=>`<option value="${p}" ${e.phase===p?'selected':''}>${integralPhaseName(p)}</option>`).join('')}</select></label><label>Rotación de la plantilla<select data-integral-editor="rotation">${[1,2,3,4,5,6].map(r=>`<option value="${r}" ${e.rotation===r?'selected':''}>R${r}</option>`).join('')}</select></label></div><p>RED ↑ · Arrastrá una camiseta a otra zona, o elegí su destino debajo. Se intercambian dos ubicaciones.</p><div class="integral-tactics-grid">${[4,3,2,5,6,1].map(z=>{const slot=selected[z-1],p=roster.find(p=>p.id===raw[slot-1]);return `<div data-integral-cell="${z}"><button class="player" draggable="true" data-integral-drag="${z}" aria-label="Mover puesto ${slot}, zona ${z}">${renderPlayerJersey(m,p)}<span>Zona ${z}<br>${esc(attackPositions[t.roles[slot-1]]||'Puesto '+slot)} · puesto inicial ${slot}</span></button><select data-integral-move="${z}" aria-label="Destino del puesto ${slot}">${[1,2,3,4,5,6].map(dest=>`<option value="${dest}" ${dest===z?'selected':''}>Zona ${dest}</option>`).join('')}</select></div>`;}).join('')}</div><div class="row"><button class="btn btn-primary" data-action="integral-apply">Aplicar copia al partido</button><button class="btn" data-action="integral-save-template">Guardar como nueva plantilla</button></div><small>Guardar crea una plantilla independiente en este navegador y en la copia JSON completa. Aplicar sólo modifica el partido actual.</small>`:'<p>Generá las seis rotaciones o abrí la plantilla actual para editar. Los roles desconocidos requieren configuración explícita.</p>'}</details>`;
}
function integralSwap(from,to){
  const e=integralEditor,a=e.draft?.rotations?.[e.rotation]?.[e.phase];if(!a||![from,to].every(z=>Number.isInteger(z)&&z>=1&&z<=6))return;
  [a[from-1],a[to-1]]=[a[to-1],a[from-1]];persistIntegralEditorDraft();save();render();
}
function renderIntegralLive(m){
  const own=flowReportModel(m,{side:'us',set:activeSet().number}),rival=flowReportModel(m,{side:'them',set:activeSet().number}),s=own.data.summary,a=rival.trends.attack;
  const notes=flowUiObservations(m,[{side:'us',model:own},{side:'them',model:rival}]);
  return `<details class="card integral-live" data-integral-live ${integralLiveOpen?'open':''}><summary>Scout en vivo · set actual</summary><div class="integral-live-metrics">${[['Eficacia de ataque',flowPercent(s.attack.efficiency),s.attack.total+' intentos'],['Recepción positiva',flowPercent(s.reception.positivePct),s.reception.total+' recepciones'],['Errores de saque',s.serve.total?s.serve.errors:'Sin datos',s.serve.total+' saques'],['Bloqueo punto',s.block.total?s.block.points:'Sin datos',s.block.total+' intervenciones']].map(([l,v,n])=>`<article><span>${l}</span><strong>${v==='—'?'Sin datos':v}</strong><small>${n}</small></article>`).join('')}</div><p><strong>Tendencia rival:</strong> ${a.predominant.map(d=>flowDirectionLabels[d]).join(' / ')||'Sin direcciones suficientes'} · ${a.known} ataques clasificados${a.known<5?' · lectura inicial':''}.</p><ul>${notes.slice(0,3).map(n=>`<li>${esc(n)}</li>`).join('')}</ul><button class="btn" data-action="integral-full-stats">Ampliar estadísticas</button><button class="btn" data-action="integral-live-maps">Mapas tácticos</button></details>`;
}
function renderIntegralAnonymous(){
  return `<details class="v2-extra integral-anonymous" ${integralAnonymousOpen?'open':''}><summary>Ataque rival sin identificar</summary><p>Tocá el origen y el resultado. Se guarda como ataque anónimo del rival.</p><div class="attack-fast">${[4,3,2,5,6,1].map(z=>`<button class="btn ${integralAnonymousOrigin===z?'btn-primary':''}" data-action="integral-anonymous-zone" data-zone="${z}">Zona ${z}</button>`).join('')}</div><div class="attack-fast">${[['continue','Sigue / defendido'],['kill','Punto rival'],['use_block_out','Use / bloqueo afuera'],['error','Error rival'],['covered_block','Bloqueo cubierto'],['blocked_point','Bloqueo punto']].map(([r,l])=>`<button class="btn" data-action="integral-anonymous-result" data-result="${r}" ${!integralAnonymousOrigin?'disabled':''}>${l}</button>`).join('')}</div><small>Después podés identificar al atacante desde Corregir acción. Su ID de acción y el total colectivo se conservan.</small></details>`;
}
function integralAnonymous(result){
  const m=activeMatch(),s=activeSet();if(!integralAnonymousOrigin||!m?.integralVersion||s.finished)return;
  const p={id:uid(),number:'Anónimo '+uid(),name:'Sin identificar · Z'+integralAnonymousOrigin,provisional:true,anonymous:true,position:''};m.rivalPlayers.push(p);
  activeSide='them';selectedSkill='attack';selectedPlayerId=p.id;resetActionInputs();originZone=integralAnonymousOrigin;flowOriginSource='observed';VolleyTactics.setPhase(m,s,'them','attack');
  const done=addScoutAction(result,{metadata:{...flowMetadata(),anonymous:true,attackDirection:null}});if(!done)m.rivalPlayers=m.rivalPlayers.filter(x=>x.id!==p.id);else {integralAnonymousOrigin=null;integralAnonymousOpen=false;}
}
function handleIntegralAction(action,t){
  if(!action?.startsWith('integral-'))return false;
  const m=activeMatch(),s=activeSet(),e=integralEditor;
  if(action==='integral-full-stats'){view='stats';flowStatsView='live';flowStatsLivePanel='summary';render();return true;}
  if(action==='integral-live-maps'){view='stats';flowStatsView='live';flowStatsLivePanel='maps';render();return true;}
  if(action==='integral-anonymous-zone'){integralAnonymousOpen=true;integralAnonymousOrigin=+t.dataset.zone;render();return true;}
  if(action==='integral-anonymous-result'){integralAnonymous(t.dataset.result);return true;}
  if(action==='integral-heat-kind'){if(['contacts','landings','estimates'].includes(t.dataset.kind))integralHeatKind=t.dataset.kind;flowMapSelection='';render();return true;}
  if(action==='integral-generate-lineup'){const result=VolleyTactics.lineup(setupDraft.players,setupDraft.tacticalTemplates?.system||'5-1');if(result.error)toast(result.error);else {setupDraft.lineup=result.lineup;render();toast('Formación inicial generada por roles. Revisala antes de comenzar.');}return true;}
  if(!m||!s)return true;integralEditor.matchId=m.id;integralEditorOpen=true;
  if(action==='integral-edit-current'){e.draft=integralDraft(m,e.side);if(!e.draft)toast('Configurá roles o generá un sistema Personalizado.');}
  if(action==='integral-generate'){const roles=VolleyRally.positions(s,e.side,false).map(id=>playerPosition(VolleyRally.roster(m,e.side).find(p=>p.id===id))),out=VolleyTactics.generate(roles,e.system);if(out.error)toast(out.error);else e.draft={...out.template,editorAnchor:(e.side==='us'?s.rotation:s.opponentLineup?.rotation||1)-1};}
  if(action==='integral-apply'&&e.draft){const result=VolleyTactics.apply(m,s,e.side,e.draft);if(result.error)toast(result.error);else {VolleyTactics.setPhase(m,s,activeSide,selectedSkill);prepareFlowInputs();save();toast('Copia aplicada al partido. La plantilla guardada conserva sus posiciones.');}}
  if(action==='integral-save-template'&&VolleyTactics.valid(e.draft)){state.preferences ||= {};state.preferences.tacticalTemplates ||= [];const template={...VolleyTactics.copy(e.draft),id:uid(),name:e.draft.name?.trim()||'Plantilla táctica',updatedAt:new Date().toISOString(),teamName:e.side==='us'?m.team:m.opponent};delete template.editorAnchor;state.preferences.tacticalTemplates.push(template);save();toast('Plantilla nueva guardada.');}
  persistIntegralEditorDraft();save();render();return true;
}
document.addEventListener('change',event=>{
  const t=event.target;if(t.matches('[data-integral-setup]')){setupDraft.tacticalTemplates ||= {};setupDraft.tacticalTemplates[t.dataset.integralSetup]=t.value;}
  if(t.matches('[data-integral-editor]')){const key=t.dataset.integralEditor;integralEditor[key]=key==='rotation'?+t.value:t.value;if(key==='side')integralEditor.draft=null;persistIntegralEditorDraft();save();render();}
  if(t.matches('[data-integral-template]')){const template=integralLibrary().find(p=>p.id===t.value);if(template){integralEditor.draft=VolleyTactics.copy(template);integralEditor.system=template.system;integralEditor.matchId=activeMatch()?.id;}persistIntegralEditorDraft();save();render();}
  if(t.matches('[data-integral-name]')&&integralEditor.draft){integralEditor.draft.name=t.value;persistIntegralEditorDraft();save();}
  if(t.matches('[data-integral-move]'))integralSwap(+t.dataset.integralMove,+t.value);
});
document.addEventListener('toggle',event=>{if(event.target.matches?.('[data-integral-live]'))integralLiveOpen=event.target.open;if(event.target.matches?.('.integral-editor'))integralEditorOpen=event.target.open;if(event.target.matches?.('.integral-anonymous'))integralAnonymousOpen=event.target.open;},true);
document.addEventListener('dragstart',event=>{const node=event.target.closest?.('[data-integral-drag]');if(node){integralDrag=+node.dataset.integralDrag;event.dataTransfer?.setData('text/plain',String(integralDrag));}});
document.addEventListener('dragover',event=>{if(event.target.closest?.('[data-integral-cell]'))event.preventDefault();});
document.addEventListener('drop',event=>{const cell=event.target.closest?.('[data-integral-cell]');if(cell&&integralDrag){event.preventDefault();integralSwap(integralDrag,+cell.dataset.integralCell);integralDrag=null;}});
document.addEventListener('pointerdown',event=>{const node=event.target.closest?.('[data-integral-drag]');if(node&&event.pointerType!=='mouse')integralDrag={zone:+node.dataset.integralDrag,x:event.clientX,y:event.clientY};});
document.addEventListener('pointerup',event=>{if(integralDrag&&typeof integralDrag==='object'){const start=integralDrag;integralDrag=null;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>8){const cell=document.elementFromPoint?.(event.clientX,event.clientY)?.closest?.('[data-integral-cell]');if(cell)integralSwap(start.zone,+cell.dataset.integralCell);}}});
document.addEventListener('pointercancel',()=>{integralDrag=null;});
document.addEventListener('dragend',()=>{integralDrag=null;});
const integralOriginalFlowPlayers=renderFlowPlayers;
renderFlowPlayers=function(m){const base=integralOriginalFlowPlayers(m);if(!m.integralVersion)return base;return `<div class="integral-court-column"><div class="integral-phases">${['us','them'].map(side=>`<span>${side==='us'?'Mi equipo':'Rival'} · ${integralPhaseName(VolleyTactics.phase(m,activeSet(),side))}</span>`).join('')}</div>${base}${renderIntegralLive(m)}</div>`;};
const integralOriginalExtras=renderFlowExtras;
renderFlowExtras=function(m){return integralOriginalExtras(m)+(m.integralVersion?renderIntegralAnonymous():'');};
const integralOriginalActionLabel=scoutActionLabel;
scoutActionLabel=function(a,r){const label=integralOriginalActionLabel(a,r);return label+(a.metadata?.directionSource==='predicted'?' · PREDICCIÓN: '+(flowDirectionLabels[a.metadata.attackDirection]||a.metadata.attackDirection)+' · confianza '+(a.metadata.prediction?.confidence==='medium'?'media':'baja'):'');};

function renderIntegralFoundation(model){
  const k=flowStatsSkill,s=model.data.summary,v=s[k],out=flowComparisonRow({fundamentals:s},k),names={attack:'Eficacia neta de ataque',reception:'Recepción positiva (2 + 3)',serve:'Aces sobre saques',block:'Bloqueos punto',defense:'Defensa positiva (perfecta + positiva)',setting:'Armados positivos (perfecto + bueno)',coverage:'Cobertura positiva (perfecta + positiva)'};
  const principal=k==='block'?(v.total?String(v.points):'Sin datos'):out.rate==null?'Sin datos':flowPercent(out.rate);
  const categories=k==='attack'?[['Puntos',v.kills],['Errores',v.errors],['Continúan',v.continues],['Bloqueo cubierto',v.coveredBlocks]]:k==='reception'?[['Perfectas · 3',v.q3],['Positivas · 2',v.q2],['Negativas · 1',v.q1],['Errores · 0',v.q0]]:k==='serve'?[['Aces',v.aces],['Positivos',v.positive],['Neutros',v.neutral],['Errores',v.errors]]:k==='block'?[['Puntos',v.points],['Toques positivos',v.positiveTouches],['Sin control',v.uncontrolledTouches],['Errores',v.faults]]:k==='setting'?[['Perfectos',v.perfect],['Buenos',v.good],['Forzados',v.forced],['Errores',v.directErrors]]:[['Perfectas',v.perfect],['Positivas',v.positive],['Limitadas',v.limited],['Errores',v.directErrors]];
  const secondary=k==='attack'?[['Porcentaje de ataques punto',flowRate(v.kills,v.total)],['Bloqueados',v.blockedPoints],['Use / block-out',v.useBlockOutKills],['Defendidos / siguen',v.continues]]:[['Acciones',v.total],['Positivas / puntos',out.good],['Errores',out.error]];
  const description=!v.total?'Todavía no hay acciones de este fundamento.':`${out.good} positivas / puntos y ${out.error} errores en ${v.total} acciones registradas.${v.total<5?' Lectura inicial; muestra pequeña.':''}`;
  return `<section class="integral-foundation"><span class="stats-eyebrow">${esc(skills[k]?.name||'Cobertura')}</span><h3>${names[k]}</h3><strong class="integral-principal">${principal}</strong><p>${v.total} acciones · ${k==='attack'?'(puntos − errores) / intentos':k==='block'?'Un punto colectivo por acción':out.label}</p><div class="integral-secondary">${secondary.map(([l,n])=>`<div><span>${l}</span><strong>${v.total?n:'Sin datos'}</strong></div>`).join('')}</div><div class="integral-bars" role="img" aria-label="Resultados de ${esc(skills[k]?.name||'Cobertura')}">${categories.map(([l,n])=>`<div><span>${l}</span><meter min="0" max="${v.total||1}" value="${n||0}"></meter><strong>${n||0}</strong></div>`).join('')}</div><p>${description}</p></section>`;
}
function renderIntegralConnections(model){
  const k=flowStatsSkill,c=model.data.summary.connections;if(!c)return '';
  const m=activeMatch(),side=model.view._statisticsPerspective||'us';
  const rows=(map,name)=>Object.entries(map).map(([key,count])=>`<p>${esc(key==='unknown'?'Sin identificar':name(key))}: <strong>${count}</strong></p>`).join('')||'<p>Sin vínculos registrados.</p>';
  if(k==='setting')return `<details><summary>Distribución y opciones ofensivas</summary><h4>Por zona de destino</h4>${rows(c.setting.zones,z=>'Zona '+z)}<h4>Por atacante</h4>${rows(c.setting.targets,id=>flowName(m,id,side))}<h4>Recepción anterior al armado</h4>${rows(c.setting.receptionQuality,q=>'Calidad '+q)}<small>El destino usa la zona registrada o el origen del ataque siguiente vinculado. Sólo se relacionan contactos guardados.</small></details>`;
  if(k==='defense'||k==='coverage'){const d=c[k];return `<details><summary>Ataques recibidos y continuidad posterior</summary><h4>Direcciones recibidas</h4>${rows(d.directions,key=>flowDirectionLabels[key]||key)}<h4>${k==='coverage'?'Atacante cubierto':'Atacantes contrarios'}</h4>${rows(d.attackers,id=>flowName(m,id,k==='coverage'?side:VolleyRally.other(side)))}<p>${d.counterattack.attempts} ataques posteriores vinculados · ${d.counterattack.kills} puntos de ${k==='coverage'?'continuidad':'contraataque'}.</p></details>`;}
  if(k==='block')return `<details><summary>Participaciones, zonas y atacantes bloqueados</summary><p>${c.block.composition.single} simples · ${c.block.composition.double} dobles · ${c.block.composition.triple} triples · ${c.block.composition.unknown} sin composición.</p><h4>Zona registrada del bloqueo</h4>${rows(c.block.zones,z=>'Zona '+z)}<h4>Atacantes contrarios</h4>${rows(c.block.attackers,id=>flowName(m,id,VolleyRally.other(side)))}</details>`;
  return '';
}
let integralHeatKind='contacts';
function renderIntegralAttackHeat(model,side){
  const a=model.trends.attack,group=a.heat[integralHeatKind],max=Math.max(1,...Object.values(group.zones).map(b=>b.count)),names={contacts:'Contacto defensivo registrado',landings:'Caída conocida en un ataque punto',estimates:'Destino inferido por la formación'};
  return `<section class="flow-map integral-attack-heat"><h3>Mapa de calor de ataque</h3><div class="stats-pills">${Object.entries(names).map(([key,label])=>`<button class="btn ${integralHeatKind===key?'btn-primary':''}" data-action="integral-heat-kind" data-kind="${key}">${label}</button>`).join('')}</div><p>${group.total} ataques · ${names[integralHeatKind]}. ${a.predictions.total} direcciones predichas sin destino exacto se muestran en flechas y se excluyen de esta cancha.</p>${group.total?`<div class="flow-heat">${[4,3,2,5,6,1].map(z=>`<button class="btn" style="background:rgba(20,122,105,${.07+.65*group.zones[z].count/max})" data-action="flow-map" data-key="${side}:attack-heat:${z}"><strong>Z${z}</strong>${group.zones[z].count} · ${flowRate(group.zones[z].count,group.total)}</button>`).join('')}</div>`:'<p>Sin zonas de este tipo registradas.</p>'}${flowMapSelection.startsWith(side+':attack-heat:')?(()=>{const z=+flowMapSelection.split(':').at(-1),b=group.zones[z];return b?`<p>Zona ${z}: ${Object.entries(b.outcomes).map(([id,n])=>esc(VolleyCatalog.find('attack',id)?.label||id)+': '+n).join(' · ')||'Sin acciones'}</p>`:'';})():''}</section>`;
}
const integralOriginalFundamentals=renderFlowUiFundamentals;
renderFlowUiFundamentals=function(model){const detail=integralOriginalFundamentals(model);return model.view.integralVersion?renderIntegralFoundation(model)+renderIntegralConnections(model)+`<details><summary>Desglose completo del fundamento</summary>${detail}</details>`:detail;};
const integralOriginalMaps=renderFlowUiMaps;
renderFlowUiMaps=function(m,side,model){return integralOriginalMaps(m,side,model)+(m.integralVersion?renderIntegralAttackHeat(model,side):'');};
function renderIntegralFullLive(m){
  const sides=flowStatsSide==='both'?['us','them']:[flowStatsSide],models=sides.map(side=>({side,model:flowReportModel(m,{side,set:statSet})}));
  return `<div class="stats-team-grid">${models.map(({side,model})=>{
    const s=model.data.summary,a=model.trends.attack;
    return `<article class="card stats-team stats-team-${side}" data-summary-side="${side}"><h2>${esc(side==='us'?m.team:m.opponent)}</h2><div class="integral-live-metrics">${[['Eficacia de ataque',flowPercent(s.attack.efficiency),s.attack.total+' intentos'],['Recepción positiva',flowPercent(s.reception.positivePct),s.reception.total+' recepciones'],['Errores de saque',s.serve.total?s.serve.errors:'Sin datos',s.serve.total+' saques'],['Bloqueos punto',s.block.total?s.block.points:'Sin datos',s.block.total+' intervenciones']].map(([l,v,n])=>`<article><span>${l}</span><strong>${v==='—'?'Sin datos':v}</strong><small>${n}</small></article>`).join('')}</div><p><strong>Dirección predominante:</strong> ${a.predominant.map(d=>flowDirectionLabels[d]).join(' / ')||'Sin clasificar'} · ${a.known} ataques clasificados${a.known<5?' · lectura inicial':''}.</p>${a.predictions.total?`<small>${a.predictions.total} predicciones se conservan separadas.</small>`:''}</article>`;
  }).join('')}</div>${renderFlowUiObservations(m,models)}<div class="row"><button class="btn" data-action="flow-stat-panel" data-panel="attack">Lectura de ataque</button><button class="btn" data-action="flow-stat-panel" data-panel="serve">Lectura de saque</button><button class="btn" data-action="flow-stat-panel" data-panel="maps">Mapas tácticos</button></div>`;
}
const integralOriginalStatistics=renderFlowStatistics;
renderFlowStatistics=function(m){
  let html=integralOriginalStatistics(m);if(!m.integralVersion)return html;
  if(flowStatsView==='live'&&flowStatsLivePanel==='summary'){const start=html.indexOf('<div class="stats-team-grid">'),end=html.indexOf('<footer class="stats-footer">',start);if(start>=0&&end>=start)html=html.slice(0,start)+renderIntegralFullLive(m)+html.slice(end);}
  return html.replace('DURANTE EL PARTIDO</button>','SCOUT EN VIVO · DURANTE EL PARTIDO</button>').replace('El partido de un vistazo','Scout en vivo');
};
