'use strict';
let flowStatsView='live',flowStatsSide='us',flowStatsPlayer='',flowStatsSkill='attack',flowStatsOrigin='',flowStatsRole='',flowStatsRotation='',flowStatsSort='volume',flowMapSelection='';
const flowRate=(n,d)=>d?(100*n/d).toFixed(1)+'% ('+n+'/'+d+')':'— (sin datos)';
const flowPercent=v=>v==null?'—':v.toFixed(1)+'%';
const flowDirectionLabels={diagonal:'Diagonal',paralela:'Paralela',olla:'Olla',zona1:'Zona 1',zona5:'Zona 5'};
function flowReportModel(m,{side='us',set=statSet,player='',origin='',role='',rotation=''}={}){
  const view=StatsV2.forSide(m,side),rs=StatsV2.rallies(view,set).filter(r=>!rotation||String(r.rotation)===String(rotation));
  const filtered={...view,sets:view.sets.map(s=>({...s,rallies:rs.filter(r=>r.setNo===s.number).map(r=>({...r,actions:r.actions.filter(a=>(!player||StatsV2.participants(a).includes(player))&&(!origin||String(a.originZone)===String(origin))&&(!role||a.skill!=='attack'||VolleyPosition.resolve(a,r).role===role))}))}))};
  const data=StatsV2.getMatchData(filtered),players=StatsV2.getPlayerStats(filtered).filter(p=>!player||p.p.id===player);
  const actions=StatsV2.entries(filtered),attacks=actions.filter(e=>e.action.skill==='attack'&&!e.action.metadata?.freeBall&&!['free_ball','freeball'].includes(e.action.metadata?.attackType));
  const directions=Object.fromEntries(Object.keys(flowDirectionLabels).map(d=>[d,{count:0,kills:0,errors:0,continues:0}]));
  for(const e of attacks){const b=directions[e.action.metadata?.attackDirection];if(!b)continue;b.count++;if(['kill','tip_kill','use_block_out'].includes(e.result.outcomeId))b.kills++;if(e.result.outcomeId==='error'||e.result.outcomeId==='blocked_point'&&data.config.blockedPointIsError)b.errors++;if(['continue','tip_continue','covered_block'].includes(e.result.outcomeId))b.continues++;}
  const known=Object.values(directions).reduce((n,b)=>n+b.count,0),serves=actions.filter(e=>e.action.skill==='serve');
  const destinations=Object.fromEntries([1,2,3,4,5,6].map(z=>[z,{count:0,aces:0,errors:0,observed:0,inferred:0}]));
  for(const e of serves){const a=e.action,source=a.metadata?.destinationSource,b=destinations[a.destinationZone];if(!b||source==='rotation-reference')continue;b.count++;b.aces+=+(e.result.outcomeId==='ace');b.errors+=+(e.result.outcomeId==='error');b.observed+=+(!source||source==='observed');b.inferred+=+(!!source&&source!=='observed');}
  const serveKnown=Object.values(destinations).reduce((n,b)=>n+b.count,0);
  const pairs=new Map();
  for(const r of StatsV2.rallies(m,set)){
    const all=r.actions||[];for(const rec of all.filter(a=>a.skill==='reception'&&VolleyRally.side(a)!==side)){
      const serve=all.find(a=>a.id===rec.metadata?.serveActionId&&a.skill==='serve'&&VolleyRally.side(a)===side);
      const serverId=serve?.playerId||rec.metadata?.serverContext?.side===side&&rec.metadata.serverContext.playerId;
      if(!serverId||player&&serverId!==player||rotation&&String(side==='us'?r.rotation:r.opponentBefore?.rotation)!==String(rotation)||origin&&String(serve?.originZone)!==String(origin))continue;
      const key=serverId+':'+rec.playerId;if(!pairs.has(key))pairs.set(key,{serverId,receiverId:rec.playerId,count:0,positive:0,perfect:0,errors:0,serveRecorded:0});
      const p=pairs.get(key);p.count++;p.positive+=+['positive','perfect'].includes(rec.outcomeId);p.perfect+=+(rec.outcomeId==='perfect');p.errors+=+(rec.outcomeId==='direct_error');p.serveRecorded+=+!!serve;
    }
  }
  return {view:filtered,data,players,actions,attacks,directions,known,serves,destinations,serveKnown,pairs:[...pairs.values()]};
}
function renderFlowMetrics(model){const d=model.data,s=d.summary;return `<div class="stat-metrics flow-metrics">${[
  ['Eficacia de ataque',flowPercent(s.attack.efficiency),`${s.attack.kills} puntos − ${s.attack.errors} errores / ${s.attack.total} intentos`],
  ['Recepción positiva',flowRate(s.reception.q2+s.reception.q3,s.reception.total),'Calidades 2 + 3'],
  ['Side-out',flowRate(d.sideOut,d.recv.length),'Rallies recibidos'],['Break-point',flowRate(d.breakpoints,d.serv.length),'Rallies con servicio'],
  ['Aces',s.serve.aces,s.serve.total+' saques'],['Bloqueo punto',s.block.points,s.block.total+' intervenciones colectivas'],
  ['Errores registrados',s.attack.errors+s.serve.errors+s.reception.q0+s.defense.directErrors+s.coverage.directErrors+s.setting.directErrors+s.block.faults,'Criterio de ataque conservado']
].map(([l,v,h])=>`<article class="metric"><strong class="value">${v}</strong><span class="label">${l}</span><small>${h}</small></article>`).join('')}</div>`;}
function flowComparisonRow(p,skill){
  const s=p.fundamentals;
  if(skill==='attack')return {total:s.attack.total,good:s.attack.kills,error:s.attack.errors,rate:s.attack.efficiency,label:'Puntos / eficacia'};
  if(skill==='serve')return {total:s.serve.total,good:s.serve.aces,error:s.serve.errors,rate:s.serve.acePct,label:'Aces / % ace'};
  if(skill==='reception')return {total:s.reception.total,good:s.reception.q2+s.reception.q3,error:s.reception.q0,rate:s.reception.positivePct,label:'Positivas / % positivo'};
  if(skill==='block')return {total:s.block.total,good:s.block.points,error:s.block.faults,rate:null,label:'Participaciones en punto'};
  const v=skill==='coverage'?s.coverage:s[skill],positive=skill==='setting'?v.perfect+v.good:v.perfect+v.positive;
  return {total:v.total,good:positive,error:v.directErrors,rate:v.total?100*positive/v.total:null,label:'Positivas / % positivo'};
}
function renderFlowComparison(model,side){
  const rows=model.players.map(p=>({p,...flowComparisonRow(p,flowStatsSkill)})).filter(r=>r.total);
  const key={volume:'total',points:'good',errors:'error',rate:'rate'}[flowStatsSort]||'total';rows.sort((a,b)=>(b[key]??-Infinity)-(a[key]??-Infinity));
  return `<h3>${esc(skills[flowStatsSkill]?.name||'Cobertura')} · ${rows[0]?.label||'Sin registros'}</h3><div class="tablewrap"><table><thead><tr><th>Jugador / referencia</th><th>Acciones</th><th>Positivas / puntos</th><th>Errores</th><th>Indicador</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="btn btn-small" data-action="flow-player-stats" data-side="${side}" data-player="${esc(r.p.p.id)}">${esc(r.p.p.provisional?r.p.p.number:'#'+r.p.p.number+' '+r.p.p.name)}</button>${r.p.p.provisional?' · identidad no confirmada':''}${r.total<5?' · MUESTRA REDUCIDA':''}</td><td>${r.total}</td><td>${r.good}</td><td>${r.error}</td><td>${flowPercent(r.rate)}</td></tr>`).join('')||'<tr><td colspan="5">Sin acciones registradas.</td></tr>'}</tbody></table></div><p class="hinttext">Los bloqueos asistidos son participaciones, no puntos colectivos adicionales. La cobertura se consulta por separado.</p>`;
}
function renderFlowObservations(model){
  const ps=model.players.filter(x=>!x.p.provisional),items=[];
  for(const [key,total,label]of [['K','attack','puntos de ataque'],['aces','serve','aces'],['serveErr','serve','errores de saque'],['blk','total','participaciones en bloqueo punto']]){
    const p=[...ps].sort((a,b)=>b[key]-a[key])[0];if(p&&p[key])items.push(`<li>#${esc(p.p.number)} ${esc(p.p.name)}: ${p[key]} ${label} en ${p[total]} acciones.${p[total]<5?' MUESTRA REDUCIDA.':''}</li>`);
  }
  return `<ul>${items.slice(0,4).join('')||'<li>Todavía no hay datos suficientes para observaciones.</li>'}</ul>`;
}
function renderFlowRankings(model){
  const metrics=[['Anotación de ataque','attack','K'],['Eficacia de ataque','attack','eff'],['Recepción positiva','rec',p=>100*p.recPos/p.rec],['Aces','serve','aces'],['Bloqueo punto','total','blk'],['Defensa positiva','def',p=>100*p.defPos/p.def]];
  return `<details><summary>Rankings · mínimo 5 acciones del fundamento</summary>${metrics.map(([label,total,metric])=>{
    const rows=model.players.filter(p=>!p.p.provisional&&(label==='Bloqueo punto'?p.fundamentals.block.total:p[total])>=5).sort((a,b)=>(typeof metric==='function'?metric(b):b[metric])-(typeof metric==='function'?metric(a):a[metric]));
    const p=rows[0];return `<p><strong>${label}:</strong> ${p?'#'+esc(p.p.number)+' '+esc(p.p.name)+' · '+Number(typeof metric==='function'?metric(p):p[metric]).toFixed(1)+' · '+(label==='Bloqueo punto'?p.fundamentals.block.total:p[total])+' acciones':'Muestra insuficiente para ordenar'}</p>`;
  }).join('')}</details>`;
}
function flowAttackMapGroups(model){
  const groups=new Map();for(const e of model.attacks){const a=e.action,d=a.metadata?.attackDirection,o=a.originZone;
    if(!o)continue;let z=a.destinationZone,schematic=!z;
    if(!z)z=({4:{diagonal:5,paralela:1,olla:6},2:{diagonal:1,paralela:5,olla:6},3:{zona1:1,zona5:5}})[o]?.[d];
    if(!z)continue;const inferred=schematic||a.metadata?.directionSource==='derived'||a.metadata?.originSource&&a.metadata.originSource!=='observed'||a.metadata?.destinationSource&&a.metadata.destinationSource!=='observed';
    const key=[o,z,d||'sin-clasificar',inferred?'inferred':'observed'].join('-');
    if(!groups.has(key))groups.set(key,{key,origin:o,destination:z,direction:d,count:0,kills:0,errors:0,continues:0,inferred:!!inferred,schematic});
    const g=groups.get(key);g.count++;g.kills+=+['kill','tip_kill','use_block_out'].includes(e.result.outcomeId);g.errors+=+(e.result.outcomeId==='error'||e.result.outcomeId==='blocked_point'&&model.data.config.blockedPointIsError);g.continues+=+['continue','tip_continue','covered_block'].includes(e.result.outcomeId);
  }return [...groups.values()];
}
function renderFlowAttackMap(model,side){
  const groups=flowAttackMapGroups(model),max=Math.max(1,...groups.map(g=>g.count)),known=model.known;
  const own={4:[50,220],3:[150,220],2:[250,220],5:[50,315],6:[150,315],1:[250,315]},opp={1:[50,40],6:[150,40],5:[250,40],2:[50,130],3:[150,130],4:[250,130]};
  const chosen=groups.find(g=>side+':'+g.key===flowMapSelection);
  return `<div class="flow-map"><h3>Mapa de ataque</h3><svg viewBox="0 0 300 360" role="img" aria-label="Mapa de ataques entre dos canchas enfrentadas"><defs><marker id="flow-arrow-${side}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#147a69"/></marker></defs><rect x="1" y="1" width="298" height="358" fill="#f1faf6" stroke="#9baeb2"/><path d="M0 180H300 M0 90H300 M0 270H300 M100 0V360 M200 0V360" stroke="#ceded9"/><path d="M0 180H300" stroke="#536a74" stroke-width="4"/>${Object.entries(own).concat(Object.entries(opp)).map(([z,[x,y]])=>`<text x="${x}" y="${y}" fill="#82918c" text-anchor="middle">Z${z}</text>`).join('')}${groups.map(g=>{const [x,y]=own[g.origin],[tx,ty]=opp[g.destination],d=`M${x} ${y} Q${(x+tx)/2} 170 ${tx} ${ty}`;return `<path d="${d}" fill="none" stroke="#147a69" stroke-width="${2+10*g.count/max}" ${g.inferred?'stroke-dasharray="6 5"':''} marker-end="url(#flow-arrow-${side})"/><path d="${d}" fill="none" stroke="transparent" stroke-width="26" tabindex="0" role="button" data-action="flow-map" data-key="${side+':'+g.key}" aria-label="${esc(flowDirectionLabels[g.direction]||'Destino Z'+g.destination)}: ${g.count} ataques"><title>${g.count} ataques · ${g.inferred?'representación inferida o esquemática':'zonas observadas'}</title></path>`;}).join('')}</svg><p class="hinttext">Campo atacante abajo; rival enfrentado arriba. Líneas punteadas: datos inferidos o dirección esquemática. Líneas continuas: zonas observadas; nunca coordenadas exactas de impacto. ${model.attacks.length-groups.reduce((n,g)=>n+g.count,0)} ataques sin datos espaciales suficientes.</p><div class="attack-fast">${groups.map(g=>`<button class="btn btn-small" data-action="flow-map" data-key="${side+':'+g.key}">Z${g.origin} · ${esc(flowDirectionLabels[g.direction]||'destino '+g.destination)} · ${g.count}</button>`).join('')}</div>${chosen?`<p role="status"><strong>${esc(flowDirectionLabels[chosen.direction]||'Destino Z'+chosen.destination)}</strong>: ${chosen.count} ataques · ${chosen.direction?flowRate(model.directions[chosen.direction].count,known)+' de direcciones conocidas':'sin clasificación'} · ${chosen.kills} puntos · ${chosen.errors} errores · ${chosen.continues} siguen · eficacia ${flowRate(chosen.kills-chosen.errors,chosen.count)}.</p>`:''}</div>`;
}
function renderFlowServeMap(model,side){
  const max=Math.max(1,...Object.values(model.destinations).map(x=>x.count)),chosen=flowMapSelection.startsWith(side+':serve:')?model.destinations[flowMapSelection.split(':')[2]]:null;
  return `<div class="flow-map"><h3>Mapa de saque · cancha receptora</h3><p>RED ↑</p><div class="flow-heat">${[4,3,2,5,6,1].map(z=>{const b=model.destinations[z];return `<button class="btn" style="background:rgba(25,136,125,${.06+.65*b.count/max})" data-action="flow-map" data-key="${side}:serve:${z}"><strong>Z${z}</strong><span>${flowRate(b.count,model.serveKnown)}</span><small>${b.observed} observados · ${b.inferred} inferidos</small></button>`;}).join('')}</div><p>${model.serves.length} saques · ${model.serveKnown} con destino · ${model.serves.length-model.serveKnown} desconocidos.</p>${chosen?`<p role="status">${chosen.count} saques · ${chosen.aces} aces · ${chosen.errors} errores · ${chosen.observed} destinos observados · ${chosen.inferred} inferidos.</p>`:''}</div>`;
}
function renderFlowServePairs(m,model,side){
  const current=VolleyRally.positions(activeSet(),side)[0],byServer=id=>model.pairs.filter(p=>p.serverId===id).reduce((n,p)=>n+p.count,0);
  return `<details ${flowStatsView==='live'?'open':''}><summary>Saques y receptores · sacador actual ${esc(flowName(m,current,side))}</summary><p class="hinttext">Porcentajes sobre recepciones vinculadas a cada sacador. Un sacador identificado por rotación sin evaluación no genera un saque estadístico.</p><div class="tablewrap"><table><thead><tr><th>Sacador</th><th>Receptor</th><th>Distribución</th><th>Recepción positiva</th><th>Perfectas / errores</th></tr></thead><tbody>${model.pairs.map(p=>`<tr><td>${esc(flowName(m,p.serverId,side))}</td><td>${esc(flowName(m,p.receiverId,VolleyRally.other(side)))}</td><td>${flowRate(p.count,byServer(p.serverId))}${p.count<5?' · MUESTRA REDUCIDA':''}</td><td>${flowRate(p.positive,p.count)}</td><td>${p.perfect} / ${p.errors} · ${p.serveRecorded} saques evaluados</td></tr>`).join('')||'<tr><td colspan="5">Sin relaciones confirmadas.</td></tr>'}</tbody></table></div><p>Direcciones de saque: ${['paralela','diagonal'].map(d=>d+' '+model.serves.filter(e=>e.action.metadata?.serveDirection===d).length).join(' · ')}. Las combinaciones centrales permanecen sin clasificar.</p></details>`;
}
function renderFlowSpatialDetails(model){
  const entries=model.actions.filter(e=>flowStatsSkill==='coverage'?e.action.skill==='defense'&&e.action.metadata?.defenseKind==='coverage':e.action.skill===flowStatsSkill&&(flowStatsSkill!=='defense'||e.action.metadata?.defenseKind!=='coverage'));
  const rows=[1,2,3,4,5,6].map(z=>{
    const origin=entries.filter(e=>e.action.originZone===z),destination=entries.filter(e=>e.action.destinationZone===z);
    const observed=origin.filter(e=>!e.action.metadata?.originSource||e.action.metadata.originSource==='observed').length;
    const references=origin.filter(e=>e.action.metadata?.originSource==='rotation-reference').length;
    return `<tr><td>Z${z}</td><td>${origin.length}</td><td>${observed}</td><td>${origin.length-observed-references}</td><td>${references}</td><td>${destination.length}</td></tr>`;
  });
  const sequences={reception:[],defense:[],coverage:[]};
  for(const e of model.attacks){const phase=e.action.metadata?.attackPhase,key=phase==='counterattack'?'defense':phase;if(sequences[key])sequences[key].push(e);}
  return `<details><summary>Zonas y continuidad · ${esc(skills[flowStatsSkill]?.name||'Cobertura')}</summary><p>${entries.length} acciones. Las referencias de rotación permanecen separadas de ubicaciones observadas e inferidas.</p><div class="tablewrap"><table><thead><tr><th>Zona</th><th>Origen</th><th>Observado</th><th>Inferido</th><th>Referencia de rotación</th><th>Destino</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p>${entries.filter(e=>!e.action.originZone).length} acciones sin origen · ${entries.filter(e=>!e.action.destinationZone).length} sin destino.</p><h3>Recepción y ataque / defensa y contraataque</h3>${[['reception','Ataques después de recepción'],['defense','Contraataques después de defensa'],['coverage','Ataques después de cobertura']].map(([key,label])=>{const list=sequences[key],kills=list.filter(e=>['kill','tip_kill','use_block_out'].includes(e.result.outcomeId)).length,errors=list.filter(e=>e.result.outcomeId==='error'||e.result.outcomeId==='blocked_point'&&model.data.config.blockedPointIsError).length;return `<p>${label}: ${list.length} intentos · ${kills} puntos · ${errors} errores · eficacia ${flowRate(kills-errors,list.length)}.</p>`;}).join('')}<p class="hinttext">Sólo se cuentan fases vinculadas por acciones registradas. No se inventan recepciones, armados ni defensas.</p></details>`;
}
function renderFlowStatistics(m){
  const selectedSides=flowStatsSide==='both'?['us','them']:[flowStatsSide],roster=selectedSides.flatMap(side=>VolleyRally.roster(m,side));
  const select=(field,label,values,value)=>`<label>${label}<select data-flow-stat="${field}">${values.map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
  const models=selectedSides.map(side=>({side,model:flowReportModel(m,{side,player:flowStatsPlayer,origin:flowStatsOrigin,role:flowStatsRole,rotation:flowStatsRotation})}));
  return `<section class="flow-statistics"><div class="row-between"><h1>Estadísticas · ${esc(m.team)} vs ${esc(m.opponent)}</h1><button class="btn" data-action="view" data-view="live">Volver al rally</button></div><div class="v2-mode-switch"><button data-action="flow-stat-view" data-mode="live" class="${flowStatsView==='live'?'active':''}">DURANTE EL PARTIDO</button><button data-action="flow-stat-view" data-mode="post" class="${flowStatsView==='post'?'active':''}">POSTPARTIDO</button></div><div class="card flow-stat-filters">${select('set','Set',[['all','Partido completo'],...m.sets.map(s=>[s.number,'Set '+s.number])],statSet)}${select('side','Equipo',[['us',m.team],['them',m.opponent],['both','Comparar ambos']],flowStatsSide)}${select('player','Jugador',[['','Todos'],...roster.map(p=>[p.id,(p.provisional?p.number:'#'+p.number)+' '+p.name])],flowStatsPlayer)}${select('skill','Fundamento',[...Object.entries(skills).map(([k,v])=>[k,v.name]),['coverage','Cobertura']],flowStatsSkill)}${select('origin','Origen',[['','Todas las zonas'],...[1,2,3,4,5,6].map(z=>[z,'Zona '+z])],flowStatsOrigin)}${select('role','Ataque',[['','Delanteros y zagueros'],['front','Delanteros'],['back','Zagueros'],['unknown','Sin determinar']],flowStatsRole)}${select('rotation','Rotación',[['','Todas'],...[1,2,3,4,5,6].map(z=>[z,'R'+z])],flowStatsRotation)}${select('sort','Ordenar comparación',[['volume','Cantidad de acciones'],['points','Positivas / puntos'],['errors','Errores'],['rate','Porcentaje']],flowStatsSort)}</div><div class="row no-print"><button class="btn" data-action="flow-current-set">Set actual</button><button class="btn" data-action="download-stats">CSV jugadores</button><button class="btn" data-action="download-actions">CSV acciones</button><button class="btn" data-action="print">Imprimir / PDF</button></div><p class="hinttext">Se consultan rallies cerrados; el rally abierto sigue guardado y disponible. Menos de 5 acciones: MUESTRA REDUCIDA. Los filtros no alteran el marcador.</p>${models.map(({side,model})=>`<article class="card"><h2>${esc(side==='us'?m.team:m.opponent)}${flowStatsPlayer?' · '+esc(flowName(m,flowStatsPlayer,side)):''}</h2>${renderFlowMetrics(model)}${renderFlowObservations(model)}${renderFlowComparison(model,side)}${renderFlowRankings(model)}<h3>Direcciones de ataque</h3><p>${model.attacks.length} ataques · ${model.known} con dirección · ${model.attacks.length-model.known} sin clasificar.</p>${Object.entries(model.directions).map(([d,b])=>`<div class="flow-direction"><strong>${flowDirectionLabels[d]}</strong><meter min="0" max="${model.known||1}" value="${b.count}"></meter><span>${flowRate(b.count,model.known)} · ${b.kills} puntos · ${b.errors} errores · ${b.continues} siguen · eficacia ${flowRate(b.kills-b.errors,b.count)}</span></div>`).join('')}<div class="flow-maps">${renderFlowAttackMap(model,side)}${renderFlowServeMap(model,side)}</div>${renderFlowServePairs(m,model,side)}${renderFlowSpatialDetails(model)}${flowStatsView==='post'?`${StatsV2.renderStatisticsV2(model.view)}<h3>Cobertura separada de defensa</h3><p>${model.data.summary.coverage.total} coberturas · perfectas ${model.data.summary.coverage.perfect} · positivas ${model.data.summary.coverage.positive} · limitadas ${model.data.summary.coverage.limited} · errores ${model.data.summary.coverage.directErrors}.</p><h3>Evolución por set</h3><div class="tablewrap"><table><thead><tr><th>Set</th><th>Ataque</th><th>Recepción positiva</th><th>Aces</th><th>Bloqueo punto</th><th>Errores</th></tr></thead><tbody>${m.sets.map(s=>{const x=flowReportModel(m,{side,set:String(s.number),player:flowStatsPlayer,origin:flowStatsOrigin,role:flowStatsRole,rotation:flowStatsRotation}).data.summary;return `<tr><td>${s.number}</td><td>${flowPercent(x.attack.efficiency)} · ${x.attack.total} intentos</td><td>${flowRate(x.reception.q2+x.reception.q3,x.reception.total)}</td><td>${x.serve.aces}/${x.serve.total}</td><td>${x.block.points}/${x.block.total}</td><td>${x.attack.errors+x.serve.errors+x.reception.q0+x.defense.directErrors+x.coverage.directErrors+x.setting.directErrors+x.block.faults}</td></tr>`;}).join('')}</tbody></table></div>`:''}</article>`).join('')}${renderFlowHistory(m)}${flowStatsView==='post'?`<details class="card"><summary>Informes anteriores del equipo propio</summary>${renderCoachReport(m,statSet)}${renderFormationStats(m)}${renderDirectPointStats(m)}${renderRivalBlockStats(m)}</details>`:''}</section>`;
}
document.addEventListener('change',e=>{const t=e.target;if(!t.matches('[data-flow-stat]'))return;
  const key=t.dataset.flowStat;if(key==='set')statSet=t.value;if(key==='side'){flowStatsSide=t.value;flowStatsPlayer='';}if(key==='player')flowStatsPlayer=t.value;if(key==='skill')flowStatsSkill=t.value;if(key==='origin')flowStatsOrigin=t.value;if(key==='role')flowStatsRole=t.value;if(key==='rotation')flowStatsRotation=t.value;if(key==='sort')flowStatsSort=t.value;flowMapSelection='';render();
});
const CoachReport=(()=>{
  const pct=(n,d)=>d?100*n/d:null;
  const rate=n=>n==null?'—':n.toFixed(1).replace('.',',')+'%';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const minimum=value=>Math.max(1,Math.min(100,Math.floor(Number(value)||5)));
  function compute(match,filter='all',options={}){
    const minAttack=minimum(options.minAttack),minRotation=minimum(options.minRotation);
    const data=StatsV2.getMatchData(match,filter),players=StatsV2.getPlayerStats(match,filter);
    const rotations=[1,2,3,4,5,6].map(rotation=>{
      const rows=data.rs.filter(r=>Number(r.rotationBefore??r.rotation)===rotation);
      const filtered={...match,sets:[{number:1,rallies:rows}]},d=StatsV2.getMatchData(filtered);
      const receiving=rows.filter(r=>r.serveBefore==='them'),serving=rows.filter(r=>r.serveBefore==='us');
      return {rotation,total:rows.length,won:rows.filter(r=>r.winner==='us').length,lost:rows.filter(r=>r.winner==='them').length,receiving:receiving.length,sideOut:pct(d.sideOut,receiving.length),serving:serving.length,breakPoint:pct(d.breakpoints,serving.length),attack:d.summary.attack,efficiency:d.summary.attack.total>=minAttack?d.summary.attack.efficiency:null};
    });
    const comparable=rotations.filter(r=>r.receiving>=minRotation).sort((a,b)=>b.sideOut-a.sideOut||a.rotation-b.rotation);
    const distinct=comparable.length>=2&&comparable[0].sideOut!==comparable.at(-1).sideOut;
    const best=distinct?comparable.filter(r=>r.sideOut===comparable[0].sideOut).map(r=>r.rotation):[];
    const worst=distinct?comparable.filter(r=>r.sideOut===comparable.at(-1).sideOut).map(r=>r.rotation):[];
    const eligiblePlayers=players.filter(p=>p.attack>=minAttack&&p.eff!==null).sort((a,b)=>b.eff-a.eff||b.attack-a.attack||String(a.p.number).localeCompare(String(b.p.number)));
    const sets=match.sets.filter(s=>filter==='all'||String(s.number)===String(filter)).map(set=>{
      const d=StatsV2.getMatchData(match,String(set.number)),s=d.summary;
      return {number:set.number,score:{...set.score},finished:!!set.finished,attack:s.attack,receiving:d.recv.length,sideOut:pct(d.sideOut,d.recv.length),reception:s.reception,errors:s.serve.errors+s.reception.q0+s.attack.errors+s.block.faults+s.defense.directErrors+s.setting.directErrors};
    });
    const errors={Saque:data.summary.serve.errors,Recepción:data.summary.reception.q0,Ataque:data.summary.attack.errors,Bloqueo:data.summary.block.faults,Defensa:data.summary.defense.directErrors,Armado:data.summary.setting.directErrors};
    const notes=[];
    if(worst.length)notes.push('Menor side-out: '+worst.map(n=>'R'+n).join(', ')+'. Criterio: al menos '+minRotation+' rallies recibiendo por rotación; se comparan porcentajes, no cantidad de puntos.');
    if(eligiblePlayers.length){const top=eligiblePlayers.filter(p=>p.eff===eligiblePlayers[0].eff);notes.push('Mayor eficacia de ataque entre quienes registraron al menos '+minAttack+' intentos: '+top.map(p=>'#'+p.p.number+' ('+rate(p.eff)+'; '+p.attack+' intentos)').join(', ')+'.');}
    if(sets.length>=2){const a=sets[0],b=sets[1];if(a.reception.total>=minRotation&&b.reception.total>=minRotation&&b.reception.positivePct>a.reception.positivePct)notes.push('La recepción positiva registrada pasó de '+rate(a.reception.positivePct)+' ('+a.reception.total+' recepciones, set '+a.number+') a '+rate(b.reception.positivePct)+' ('+b.reception.total+' recepciones, set '+b.number+').');}
    if(data.summary.serve.total)notes.push('Se registraron '+data.summary.serve.errors+' errores de saque en '+data.summary.serve.total+' saques ('+rate(data.summary.serve.errorPct)+').');
    if(data.summary.attack.kills)notes.push('Los '+data.summary.attack.kills+' kills incluyen '+data.summary.attack.useBlockOutKills+' uses y '+data.summary.attack.tipKills+' colocadas ganadoras, sin duplicarlos.');
    if(!notes.length)notes.push(data.rs.length?'Hay '+data.rs.length+' rallies registrados. Todavía no hay una muestra suficiente para las comparaciones de eficacia y rotaciones.':'Todavía no hay rallies cerrados para analizar.');
    const wins={us:match.sets.filter(s=>s.winner==='us').length,them:match.sets.filter(s=>s.winner==='them').length};
    return {data,players,rotations,sets,errors,notes:notes.slice(0,5),wins,best,worst,minAttack,minRotation,eligiblePlayers};
  }
  function bar(label,value,detail='',max=100,count=false){
    const width=value==null?0:Math.min(100,Math.abs(value)/Math.max(1,max)*100);
    return `<div class="coach-bar"><div><span>${esc(label)}</span><strong>${value==null?'—':!count?rate(value):esc(value)}</strong></div><div class="coach-track"><span style="width:${width.toFixed(2)}%;background:${value<0?'var(--red)':'var(--primary)'}"></span></div><small>${esc(detail)}</small></div>`;
  }
  function roleTable(groups){
    return `<div class="tablewrap"><table><thead><tr><th>Ataque</th><th>Intentos</th><th>Kills</th><th>Errores</th><th>Eficacia</th><th>Use</th><th>Colocadas punto</th></tr></thead><tbody>${[['front','Delantero'],['back','Zaguero'],['unknown','Sin determinar']].map(([key,label])=>{const x=groups[key];return `<tr><td>${label}</td><td>${x.attempts}</td><td>${x.kills}</td><td>${x.errors}</td><td>${rate(x.efficiency)}</td><td>${x.useBlockOut}</td><td>${x.tipKills}</td></tr>`}).join('')}</tbody></table></div>`;
  }
  function render(match,filter='all',options={}){
    const c=compute(match,filter,options),d=c.data,s=d.summary;
    const completed=Math.max(c.wins.us,c.wins.them)>=Math.ceil((match.bestOf||5)/2);
    const metrics=[['Side-out',rate(pct(d.sideOut,d.recv.length)),d.sideOut+'/'+d.recv.length+' rallies recibiendo'],['Break-point',rate(pct(d.breakpoints,d.serv.length)),d.breakpoints+'/'+d.serv.length+' rallies sacando'],['Eficacia de ataque',rate(s.attack.efficiency),s.attack.kills+' kills − '+s.attack.errors+' errores / '+s.attack.total+' intentos'],['Recepción positiva',rate(s.reception.positivePct),(s.reception.q2+s.reception.q3)+'/'+s.reception.total+' recepciones (2+3)'],['Saque',s.serve.aces+' aces',s.serve.errors+' errores / '+s.serve.total+' saques'],['Bloqueo',s.block.points+' puntos','Un punto colectivo por bloqueo ganador']];
    return `<section class="coach-report card" id="coach-report"><div class="row-between"><div><div class="eyebrow">INFORME DEL ENTRENADOR · 2.1</div><h2>${esc(match.team)} vs. ${esc(match.opponent)}</h2><p>${esc(match.date)} · ${completed?'Finalizado':'En curso'} · ${c.wins.us}–${c.wins.them} sets · ${filter==='all'?'Partido completo':'Set '+esc(filter)}</p></div><button class="btn btn-primary no-print" data-action="coach-export">Exportar informe</button></div>
    <div class="coach-set-scores">${match.sets.map(set=>`<span class="pill">S${set.number}: ${set.score.us}–${set.score.them}${set.finished?'':' · en curso'}</span>`).join('')}</div>
    <p class="coach-sample ${d.quality.partialSample?'partial':''}">${d.quality.partialSample?'Muestra parcial de acciones.':'Secuencias marcadas completas por el anotador.'} ${d.quality.total} rallies · ${d.quality.withActions} con acciones · ${d.quality.complete} completos · ${d.quality.partial} rápidos/parciales · ${d.quality.unknown} sin confirmación. Los porcentajes usan solo acciones registradas; side-out y break-point usan rallies con servicio previo conocido.</p>
    <div class="coach-metrics">${metrics.map(([label,value,detail])=>`<div><span>${label}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join('')}</div>
    <div class="coach-columns"><div><h3>Errores por fundamento</h3>${Object.entries(c.errors).map(([label,n])=>bar(label,n,'Errores individuales registrados',Math.max(1,...Object.values(c.errors)),true)).join('')}</div><div><h3>Delanteros y zagueros</h3>${roleTable(s.attack.byRole)}<p class="hinttext">Clasificación rotacional guardada al registrar el ataque. Los históricos se clasifican solo si conservan una formación previa fiable. La zona física del ataque no se usa.</p></div></div>
    <div class="coach-thresholds no-print"><label>Mínimo de intentos para comparar eficacia <input type="number" min="1" max="100" value="${c.minAttack}" data-coach-min="attack"></label><label>Mínimo de rallies recibiendo para comparar rotaciones <input type="number" min="1" max="100" value="${c.minRotation}" data-coach-min="rotation"></label></div>
    <h3>Rendimiento individual</h3><p class="hinttext">Los jugadores se presentan en el orden del plantel. Las claves comparan eficacia solo con al menos ${c.minAttack} intentos; se muestran los tamaños de muestra.</p>
    <div class="coach-players">${c.players.map(p=>`<details><summary><strong>${esc('#'+p.p.number+' '+p.p.name)}</strong><span>${p.K} kills · ${p.attack} intentos · ${rate(p.eff)}${p.attack<c.minAttack?' · muestra pequeña':''}</span></summary><div class="coach-player-metrics"><p><strong>Ataque:</strong> ${p.attack} intentos · ${p.K} kills · ${p.E} errores · ${rate(p.eff)} de eficacia · ${p.useBlockOutKills} uses · ${p.tipKills} colocadas ganadoras.</p><p><strong>Recepción:</strong> ${p.rec} totales · ${p.recPerf} perfectas · ${p.fundamentals.reception.q2} positivas (2) · ${p.recErr} errores · ${rate(pct(p.recPos,p.rec))} positiva (2+3).</p><p><strong>Saque:</strong> ${p.serve} totales · ${p.aces} aces · ${p.serveErr} errores · ${rate(pct(p.serveErr,p.serve))} error.</p><p><strong>Bloqueo:</strong> ${p.blk} participaciones en puntos · ${p.blkSolo} individuales · ${p.blkAssisted} asistidas · ${p.blkUnknown} de composición desconocida.</p></div>${roleTable(p.fundamentals.attack.byRole)}</details>`).join('')}</div>
    <h3>Rotaciones R1–R6</h3><p class="hinttext">Mejor/peor: mayor/menor side-out entre rotaciones con al menos ${c.minRotation} rallies recibiendo. Se señalan empates. Eficacia de ataque visible desde ${c.minAttack} intentos por rotación.</p>
    <div class="coach-rotations">${c.rotations.map(r=>`<article class="${c.best.includes(r.rotation)?'coach-best':c.worst.includes(r.rotation)?'coach-worst':''}"><h4>R${r.rotation} ${c.best.includes(r.rotation)?'· Mayor side-out':c.worst.includes(r.rotation)?'· Menor side-out':''}</h4><p>${r.total} rallies · ${r.won} ganados · ${r.lost} perdidos</p>${bar('Side-out',r.sideOut,r.receiving+' rallies recibiendo')}${bar('Break-point',r.breakPoint,r.serving+' rallies sacando')}<small>Eficacia: ${rate(r.efficiency)} · ${r.attack.total} intentos${r.attack.total<c.minAttack?' (muestra insuficiente)':''}</small>${r.receiving<c.minRotation?'<p class="hinttext">Sin comparación: pocos rallies recibiendo.</p>':''}</article>`).join('')}</div>
    <h3>Comparación entre sets</h3><div class="coach-sets">${c.sets.map(set=>`<article><h4>Set ${set.number} · ${set.score.us}–${set.score.them}</h4>${bar('Eficacia ataque',set.attack.efficiency,set.attack.total+' intentos')}${bar('Recepción positiva',set.reception.positivePct,set.reception.total+' recepciones')}${bar('Side-out',set.sideOut,set.receiving+' rallies recibiendo')}${bar('Errores registrados',set.errors,'Suma de errores por fundamento',Math.max(1,...c.sets.map(x=>x.errors)),true)}</article>`).join('')}</div>
    <div class="coach-keys"><h3>CLAVES DEL PARTIDO</h3><ul>${c.notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul><p class="hinttext">Reglas locales; no se infieren causas tácticas. ${d.quality.partialSample?'Estas observaciones describen una muestra parcial de acciones.':'La completitud fue indicada por el anotador.'} Eficacia = (kills − errores) / intentos × 100. Bloqueo punto ${d.config.blockedPointIsError?'incluido':'excluido'} de errores de ataque.</p></div></section>`;
  }
  return {compute,render,roleTable,rate,minimum};
})();
function renderCoachReport(match,filter='all'){return CoachReport.render(match,filter,{minAttack:state.preferences?.coachMinAttack,minRotation:state.preferences?.coachMinRotation});}
let coachPrintRestore=[];
function exportCoachReport(){
  const report=document.getElementById('coach-report');if(!report)return;
  coachPrintRestore=[...report.querySelectorAll('details')].map(node=>({node,open:node.open}));
  coachPrintRestore.forEach(item=>item.node.open=true);document.body.classList.add('coach-print');window.print();
}
window.addEventListener('afterprint',()=>{document.body.classList.remove('coach-print');coachPrintRestore.forEach(item=>item.node.open=item.open);coachPrintRestore=[];});
document.addEventListener('change',event=>{const t=event.target;if(t.matches('[data-coach-min]')){state.preferences||={};state.preferences[t.dataset.coachMin==='attack'?'coachMinAttack':'coachMinRotation']=CoachReport.minimum(t.value);save();render();}});
