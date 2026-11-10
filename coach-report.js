'use strict';
let flowStatsView='live',flowStatsSide='both',flowStatsPlayer='',flowStatsSkill='attack',flowStatsOrigin='',flowStatsRole='',flowStatsRotation='',flowStatsSort='volume',flowMapSelection='',flowStatsType='',flowStatsDirection='',flowStatsProvenance='';
let flowStatsResult='',flowStatsEvidence='';
let flowStatsLivePanel='summary',flowStatsPostPanel='summary',flowStatsMapPlayer='';
const flowRate=(n,d)=>d?(100*n/d).toFixed(1)+'% ('+n+'/'+d+')':'— (sin datos)';
const flowPercent=v=>v==null?'—':v.toFixed(1)+'%';
const flowDirectionLabels={diagonal:'Diagonal',paralela:'Paralela',olla:'Olla',zona1:'Zona 1',zona5:'Zona 5',centro:'Centro'};
function flowReportModel(m,{side='us',set=statSet,player='',origin='',role='',rotation='',type='',direction='',provenance='',result='',evidence='',includeOpen=true}={}){
  const reporting={...m,sets:m.sets.map(s=>{
    const draft=includeOpen&&typeof state!=='undefined'?state.openRallies?.[s.id]:null;
    const open=draft?.actions?.length&&!s.rallies.some(r=>r.id===draft.id)?[{id:draft.id,status:'open',winner:null,serveBefore:s.serve,rotation:s.rotation,positions:[...s.positions],liberoBefore:s.libero,opponentBefore:s.opponentLineup,before:{positions:s.positions,libero:s.libero,opponentLineup:s.opponentLineup},scoreBefore:{...s.score},actions:draft.actions}]:[];
    return {...s,rallies:[...s.rallies,...open]};
  })};
  const view=StatsV2.forSide(reporting,side),matchesSet=s=>set==='all'||String(s.number)===String(set);
  const accepts=a=>{
    if(result&&a.outcomeId!==result)return false;
    if(evidence&&a.skill==='attack'&&({observed:'confirmed',derived:'inferred',predicted:'predicted'})[a.metadata?.directionSource]!==evidence)return false;
    if(player&&!StatsV2.participants(a).includes(player)||origin&&String(a.originZone)!==String(origin))return false;
    if(role&&a.skill==='attack'&&VolleyPosition.resolve(a).role!==role||type&&a.skill==='attack'&&a.metadata?.attackType!==type)return false;
    if(direction&&['serve','attack'].includes(a.skill)&&(a.skill==='serve'?a.metadata?.serveDirection:a.metadata?.attackDirection)!==direction)return false;
    if(provenance&&['serve','attack','reception','defense'].includes(a.skill)&&StatsV2.statusOf(a,['serve','attack'].includes(a.skill)?'destination':'origin')!==provenance)return false;
    return true;
  };
  const filtered={...view,sets:view.sets.map(s=>({...s,rallies:matchesSet(s)?s.rallies.filter(r=>!rotation||String(r.rotation)===String(rotation)).map(r=>({...r,actions:r.actions.filter(accepts)})):[]}))};
  const filter={set:'all',includeOpen},data=StatsV2.getMatchData(filtered,filter),players=StatsV2.getPlayerStats(filtered,filter).filter(p=>!p.p.anonymous&&(!player||p.p.id===player));
  const actions=StatsV2.entries(filtered,filter),attacks=actions.filter(e=>e.action.skill==='attack'&&!e.action.metadata?.freeBall&&!['free_ball','freeball'].includes(e.action.metadata?.attackType)),serves=actions.filter(e=>e.action.skill==='serve');
  const trends=data.summary.trends;
  const recEntries=reporting.sets.filter(matchesSet).flatMap(s=>s.rallies.filter(r=>(r.status==='open'||['us','them'].includes(r.winner))&&(!rotation||String(side==='us'?r.rotation:r.opponentBefore?.rotation)===String(rotation))).flatMap(r=>r.actions.filter(a=>{
    if(a.skill!=='reception'||VolleyRally.side(a)===side)return false;
    const serve=r.actions.find(s=>s.id===a.metadata?.serveActionId);
    const server=serve?.playerId||a.metadata?.serverContext?.playerId;
    return (!player||server===player)&&(!origin||String(serve?.originZone)===String(origin))&&(!direction||serve?.metadata?.serveDirection===direction)&&(!provenance||StatsV2.statusOf(serve||a,serve?'destination':'origin')===provenance);
  }).map(a=>({action:a,rally:r,result:StatsV2.resolveOutcome(a,r)}))));
  return {view:filtered,filter,data,players,actions,attacks,serves,trends,directions:trends.attack.directions,known:trends.attack.known,destinations:trends.serve.destinations,serveKnown:trends.serve.known,pairs:StatsV2.receptionRelations(recEntries),openActions:actions.filter(e=>e.rally.status==='open').length};
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
  return `<h3>${esc(skills[flowStatsSkill]?.name||'Cobertura')} · ${rows[0]?.label||'Sin registros'}</h3><div class="tablewrap"><table><thead><tr><th>Jugador / referencia</th><th>Acciones</th><th>Positivas / puntos</th><th>Errores</th><th>Indicador</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="btn btn-small" data-action="flow-player-stats" data-side="${side}" data-player="${esc(r.p.p.id)}">${esc(r.p.p.provisional?r.p.p.number:'#'+r.p.p.number+' '+r.p.p.name)}</button>${r.p.p.provisional?' · identidad no confirmada':''}</td><td>${r.total}</td><td>${r.good}</td><td>${r.error}</td><td>${flowPercent(r.rate)}</td></tr>`).join('')||'<tr><td colspan="5">Sin acciones registradas.</td></tr>'}</tbody></table></div><p class="hinttext">Una tabla por fundamento. Tocá un jugador para abrir su ficha.</p>`;
}
function renderFlowObservations(model){
  const ps=model.players.filter(x=>!x.p.provisional),items=[];
  for(const [key,total,label]of [['K','attack','puntos de ataque'],['aces','serve','aces'],['serveErr','serve','errores de saque'],['blk','total','participaciones en bloqueo punto']]){
    const p=[...ps].sort((a,b)=>b[key]-a[key])[0];if(p&&p[key])items.push(`<li>#${esc(p.p.number)} ${esc(p.p.name)}: ${p[key]} ${label} en ${p[total]} acciones.${p[total]<5?' MUESTRA REDUCIDA.':''}</li>`);
  }
  return `<ul>${items.slice(0,4).join('')||'<li>Todavía no hay datos suficientes para observaciones.</li>'}</ul>`;
}
function renderFlowRankings(model){
  const metrics=[['Puntos de ataque',p=>p.attack,p=>p.K,false],['Eficacia de ataque',p=>p.attack,p=>p.eff,true],['Recepción positiva',p=>p.rec,p=>100*p.recPos/p.rec,true],['Aces',p=>p.serve,p=>p.aces,false],['Bloqueo punto',p=>p.fundamentals.block.total,p=>p.blk,false],['Defensa positiva',p=>p.def,p=>100*p.defPos/p.def,true]];
  return `<div class="stats-rankings"><p>Criterio: mínimo 5 acciones del fundamento. Porcentajes para eficacia y calidad; cantidades para puntos, aces y participaciones en bloqueo.</p>${!metrics.some(([,total])=>model.players.some(p=>!p.p.provisional&&total(p)>=5))?'<p class="stats-sample">Muestra insuficiente para ordenar jugadores.</p>':''}${metrics.map(([label,total,value,percent])=>{
    const rows=model.players.filter(p=>!p.p.provisional&&total(p)>=5).sort((a,b)=>value(b)-value(a));
    return `<section><h3>${label}</h3>${rows.length?`<ol>${rows.map(p=>`<li>${esc('#'+p.p.number+' '+(p.p.name||''))} · <strong>${percent?flowPercent(value(p)):value(p)}</strong> · ${total(p)} acciones</li>`).join('')}</ol>`:'<p class="stats-cell-note">Sin jugadores con el mínimo de acciones.</p>'}</section>`;
  }).join('')}</div>`;
}
function flowAttackMapGroups(model){
  const groups=new Map();for(const e of model.attacks){const a=e.action,d=a.metadata?.attackDirection,o=a.originZone;
    if(!o||['unknown','reference'].includes(StatsV2.statusOf(a,'origin')))continue;
    let z=['unknown','reference'].includes(StatsV2.statusOf(a,'destination'))?null:a.destinationZone,schematic=!z;
    if(!z)z=({4:{diagonal:5,paralela:1,olla:6},2:{diagonal:1,paralela:5,olla:6},3:{zona1:1,zona5:5,centro:6}})[o]?.[d];
    if(!z&&d==='centro')z=6;if(!z&&[1,5,6].includes(o))z=d==='paralela'?(o===5?1:5):d==='olla'?6:d==='diagonal'?(o===5?5:1):null;
    if(!z)continue;const inferred=schematic||!['confirmed','recorded'].includes(StatsV2.statusOf(a,'origin'))||!['confirmed','recorded'].includes(StatsV2.statusOf(a,'destination'));
    const key=[o,z,d||'sin-clasificar',a.metadata?.directionSource==='predicted'?'predicted':inferred?'inferred':'observed'].join('-');
    if(!groups.has(key))groups.set(key,{key,origin:o,destination:z,direction:d,count:0,kills:0,errors:0,continues:0,inferred:!!inferred,schematic,predicted:a.metadata?.directionSource==='predicted'});
    const g=groups.get(key);g.count++;g.kills+=+['kill','tip_kill','use_block_out'].includes(e.result.outcomeId);g.errors+=+(e.result.outcomeId==='error'||e.result.outcomeId==='blocked_point'&&model.data.config.blockedPointIsError);g.continues+=+['continue','tip_continue','covered_block'].includes(e.result.outcomeId);
  }return [...groups.values()];
}
function renderFlowAttackMap(model,side){
  const groups=flowAttackMapGroups(model),max=Math.max(1,...groups.map(g=>g.count)),known=model.known;
  const own={4:[50,220],3:[150,220],2:[250,220],5:[50,315],6:[150,315],1:[250,315]},opp={1:[50,40],6:[150,40],5:[250,40],2:[50,130],3:[150,130],4:[250,130]};
  const chosen=groups.find(g=>side+':'+g.key===flowMapSelection);
  return `<div class="flow-map ${known<3?'flow-map-small':''}"><h3>Mapa de ataque</h3><svg viewBox="0 0 300 360" role="img" aria-label="Mapa de ataques entre dos canchas enfrentadas"><defs><marker id="flow-arrow-${side}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#147a69"/></marker></defs><rect x="1" y="1" width="298" height="358" fill="#f1faf6" stroke="#9baeb2"/><path d="M0 180H300 M0 90H300 M0 270H300 M100 0V360 M200 0V360" stroke="#ceded9"/><path d="M0 180H300" stroke="#536a74" stroke-width="4"/>${Object.entries(own).concat(Object.entries(opp)).map(([z,[x,y]])=>`<text x="${x}" y="${y}" fill="#82918c" text-anchor="middle">Z${z}</text>`).join('')}${groups.map(g=>{const color=g.predicted?'#9268b2':g.count&&(g.kills-g.errors)/g.count<0?'#bc6559':g.kills>g.errors?'#147a69':'#687e91';const [x,y]=own[g.origin],[tx,ty]=opp[g.destination],d=`M${x} ${y} Q${(x+tx)/2} 170 ${tx} ${ty}`;return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${2+10*g.count/max}" ${g.inferred?'stroke-dasharray="6 5"':''} marker-end="url(#flow-arrow-${side})"/><path d="${d}" fill="none" stroke="transparent" stroke-width="26" tabindex="0" role="button" data-action="flow-map" data-key="${side+':'+g.key}" aria-label="${esc(flowDirectionLabels[g.direction]||'Destino Z'+g.destination)}: ${g.count} ataques"><title>${g.count} ataques · ${g.predicted?'PREDICCIÓN por tendencia':g.inferred?'representación inferida o esquemática':'zonas observadas'}</title></path>`;}).join('')}</svg><p class="hinttext">Atacante abajo; rival arriba. Grosor: frecuencia. Color: eficacia (verde positiva, gris neutra, rojo negativa). Punteado: zona inferida o flecha esquemática. Violeta: predicción sin confirmar. ${model.attacks.length-groups.reduce((n,g)=>n+g.count,0)} ataques sin datos espaciales suficientes.</p><div class="attack-fast">${groups.map(g=>`<button class="btn btn-small" data-action="flow-map" data-key="${side+':'+g.key}">Z${g.origin} · ${esc(flowDirectionLabels[g.direction]||'destino '+g.destination)} · ${g.count}${g.predicted?' · PREDICCIÓN':''}</button>`).join('')}</div>${chosen?`<p role="status"><strong>${esc(flowDirectionLabels[chosen.direction]||'Destino Z'+chosen.destination)}</strong>: ${chosen.count} ataques · ${chosen.predicted?flowRate(chosen.count,model.trends.attack.predictions.total)+' de predicciones sin confirmar':chosen.direction?flowRate(model.directions[chosen.direction].count,known)+' de direcciones conocidas':'sin clasificación'} · ${chosen.kills} puntos · ${chosen.errors} errores · ${chosen.continues} siguen · eficacia ${flowRate(chosen.kills-chosen.errors,chosen.count)}.</p>`:''}</div>`;
}
function flowQualityText(b){const total=b.q0+b.q1+b.q2+b.q3;return 'Calidad 3/2/1/0: '+[b.q3,b.q2,b.q1,b.q0].join(' / ')+' · positivas '+flowRate(b.q2+b.q3,total)+' · perfectas '+flowRate(b.q3,total);}
function renderFlowZoneMap(model,side,kind,m=activeMatch()){
  const serve=kind==='serve',trend=model.trends[kind],zones=serve?trend.destinations:trend.zones,known=serve?trend.known:trend.known;
  const prefix=side+':'+kind+':',selected=flowMapSelection.startsWith(prefix)?+flowMapSelection.slice(prefix.length):null,chosen=zones[selected],max=Math.max(1,...Object.values(zones).map(b=>b.count));
  const title={serve:'Mapa de saque · cancha receptora',reception:'Mapa de recepción',defense:'Mapa de defensa',coverage:'Mapa de cobertura'}[kind];
  const knownLabel=serve?'destino':'zona física';
  const participants=chosen?Object.entries(chosen.players).map(([id,n])=>flowName(m,id,side)+': '+n).join(' · '):'';
  const pairs=serve?trend.pairs:kind==='reception'?trend.vsServers:[];
  const related=chosen?pairs.filter(g=>g.byZone[selected]).map(g=>{const z=g.byZone[selected];return '<p>'+esc(serve?flowName(m,g.receiverId,VolleyRally.other(side)):flowName(m,g.serverId,VolleyRally.other(side)))+': '+z.count+' recepciones · '+flowQualityText(z)+'</p>';}).join(''):'';
  return `<div class="flow-map" data-trend-map="${kind}"><h3>${title}</h3><p>RED ↑</p><div class="flow-heat">${[4,3,2,5,6,1].map(z=>{const b=zones[z];return `<button class="btn" style="background:rgba(25,136,125,${.06+.65*b.count/max})" data-action="flow-map" data-key="${prefix+z}" aria-label="Zona ${z}, ${b.count} acciones"><strong>Z${z}</strong><span>${b.count} acciones · ${flowRate(b.count,known)}</span><small>${b.observed} confirmados · ${b.inferred} inferidos${b.recorded?' · '+b.recorded+' históricos':''}</small></button>`;}).join('')}</div><p>${trend.total} ${serve?'saques':'intervenciones'} · ${known} con ${knownLabel} · ${trend.total-known} sin ${knownLabel} confirmado o estimado${trend.references?' ('+trend.references+' referencias de rotación)':''}.</p>${chosen?`<section role="status"><strong>Zona ${selected}: ${flowRate(chosen.count,known)}</strong>${serve?`<p>${chosen.aces} aces · ${chosen.positive} positivos · ${chosen.neutral} neutros · ${chosen.errors} errores de saque.</p>`:''}<p>${flowQualityText(chosen)}</p><p>${serve?'Sacadores':'Jugadores'}: ${esc(participants||'Sin identificar')}</p><p>${chosen.observed} confirmados · ${chosen.inferred} inferidos · ${chosen.recorded} históricos.</p>${related}</section>`:''}</div>`;
}
function renderFlowServeMap(model,side){return renderFlowZoneMap(model,side,'serve');}
function renderFlowReceptionServers(m,model,side){
  const t=model.trends.reception,total=t.vsServers.reduce((n,g)=>n+g.count,0);
  return `<details ${flowStatsSkill==='reception'?'open':''}><summary>Recepción frente a cada sacador contrario</summary><p>${total} recepciones con sacador identificado · ${t.total-total} sin sacador identificado.</p><div class="tablewrap"><table><thead><tr><th>Receptor</th><th>Sacador contrario</th><th>Recepciones</th><th>Positivas</th><th>Perfectas</th><th>Errores</th><th>Zonas</th></tr></thead><tbody>${t.vsServers.map(g=>`<tr><td>${esc(flowName(m,g.receiverId,side))}</td><td>${esc(flowName(m,g.serverId,VolleyRally.other(side)))}</td><td>${g.count}</td><td>${flowRate(g.positive,g.count)}</td><td>${flowRate(g.perfect,g.count)}</td><td>${g.errors}</td><td>${Object.entries(g.zones).map(([z,n])=>'Z'+z+': '+n).join(' · ')||'Sin zona física'}</td></tr>`).join('')||'<tr><td colspan="7">Sin relaciones registradas.</td></tr>'}</tbody></table></div></details>`;
}
function renderFlowServeDirectionSummary(trend){
  const origins=Object.entries(trend.origins).filter(([z,n])=>z!=='unknown'&&n),max=Math.max(0,...origins.map(([,n])=>n)),preferred=origins.filter(([,n])=>n===max).map(([z])=>'Z'+z);
  const quality=trend.pairs.reduce((total,p)=>{for(const q of [0,1,2,3])total['q'+q]+=p['q'+q];return total;},{q0:0,q1:0,q2:0,q3:0});
  return `<div class="stats-frequency" data-serve-directions>${Object.entries(trend.directions).map(([d,b])=>`<span>${flowDirectionLabels[d]}<strong>${flowRate(b.count,trend.knownDirection)}</strong></span>`).join('')}</div><p class="stats-cell-note">${trend.knownDirection} saques con dirección · ${trend.total-trend.knownDirection} sin clasificar. Origen más utilizado: ${preferred.join(' / ')||'Sin origen conocido'}.</p>${quality.q0+quality.q1+quality.q2+quality.q3?`<details><summary>Calidad de recepción provocada</summary><p>${flowQualityText(quality)}</p></details>`:''}`;
}
function renderFlowAttackTypeBreakdown(model){
  const a=model.trends.attack,s=model.data.summary.attack;
  return `<details data-attack-type-results><summary>Técnica, resultados y zonas de origen</summary><div class="tablewrap"><table><thead><tr><th>Técnica</th><th>Ataques</th><th>Resultados registrados</th></tr></thead><tbody>${Object.entries(a.types).map(([type,b])=>`<tr><th>${esc(({conventional:'Remate',tip:'Toque / colocada',use_block_out:'Use / block-out',unknown:'Sin técnica registrada'})[type]||type)}</th><td>${b.count}</td><td>${Object.entries(b.outcomes).map(([id,n])=>esc(VolleyCatalog.find('attack',id)?.label||id)+': '+n).join(' · ')}</td></tr>`).join('')||'<tr><td colspan="3">Sin ataques.</td></tr>'}</tbody></table></div><p>Origen: ${Object.entries(a.origins).filter(([,n])=>n).map(([z,n])=>(z==='unknown'?'Sin zona':'Z'+z)+': '+n).join(' · ')||'Sin registros'}.</p>${Object.entries(s.byRole).map(([role,b])=>`<p>${{front:'Delanteros',back:'Zagueros',unknown:'Rol sin determinar'}[role]}: ${b.attempts} ataques · ${b.kills} puntos · ${b.errors} errores · eficacia ${flowPercent(b.efficiency)}.</p>`).join('')}</details>`;
}
function renderFlowTrendEvolution(m,side){
  return '<details><summary>Evolución de tendencias por set</summary>'+m.sets.filter(s=>statSet==='all'||String(s.number)===String(statSet)).map(s=>{
    const model=flowReportModel(m,flowStatsPlayer?{side,set:s.number,player:flowStatsPlayer}:{side,set:s.number,origin:flowStatsOrigin,role:flowStatsRole,rotation:flowStatsRotation,type:flowStatsType,direction:flowStatsDirection,provenance:flowStatsProvenance}),t=model.trends;
    return '<section><h4>Set '+s.number+'</h4><p>Ataque: '+Object.entries(t.attack.directions).map(([d,b])=>flowDirectionLabels[d]+': '+flowRate(b.count,t.attack.known)).join(' · ')+'</p><p>Saque por destino: '+Object.entries(t.serve.destinations).map(([z,b])=>'Z'+z+': '+flowRate(b.count,t.serve.known)).join(' · ')+'</p><p>Recepción: '+t.reception.total+' · '+flowQualityText(t.reception.quality)+'</p></section>';
  }).join('')+'</details>';
}
function renderFlowTrendSummary(model){
  const a=model.trends.attack,s=model.trends.serve,r=model.trends.reception;
  return `<section class="flow-trend-summary"><p><strong>Tendencia de ataque:</strong> ${a.predominant.map(d=>flowDirectionLabels[d]).join(' / ')||'Sin clasificar'} · ${a.known} direcciones conocidas${a.known<5?' · MUESTRA REDUCIDA':''}.</p><p><strong>Zona de saque más buscada:</strong> ${s.preferredZones.map(z=>'Z'+z).join(' / ')||'Sin destino conocido'} · ${s.known}/${s.total} saques con destino.</p><p><strong>Dirección de saque:</strong> ${s.predominant.map(d=>flowDirectionLabels[d]).join(' / ')||'Sin clasificar'} · ${Object.entries(s.directions).map(([d,b])=>flowDirectionLabels[d]+': '+flowRate(b.count,s.knownDirection)).join(' · ')}.</p><p>Origen del saque: ${Object.entries(s.origins).filter(([,n])=>n).map(([z,n])=>(z==='unknown'?'Sin zona':'Z'+z)+': '+n).join(' · ')||'Sin saques'}.</p><p>Recepción: ${r.total} acciones · ${flowQualityText(r.quality)}.</p><details><summary>Remate, colocada y otras variantes</summary>${Object.entries(a.types).map(([type,b])=>`<p>${esc(({conventional:'Remate',tip:'Toque / colocada',use_block_out:'Use / block-out',unknown:'Sin técnica registrada'})[type]||type)}: ${b.count} ataques · ${Object.entries(b.outcomes).map(([id,n])=>esc(VolleyCatalog.find('attack',id)?.label||id)+': '+n).join(' · ')}</p>`).join('')||'<p>Sin ataques.</p>'}</details></section>`;
}
function renderFlowServePairs(m,model,side){
  const current=VolleyRally.positions(activeSet(),side)[0],byServer=id=>model.pairs.filter(p=>p.serverId===id).reduce((n,p)=>n+p.count,0);
  return `<details ${flowStatsView==='live'?'open':''}><summary>Saques y receptores · sacador actual ${esc(flowName(m,current,side))}</summary><p class="hinttext">Porcentajes sobre recepciones vinculadas a cada sacador. Un sacador identificado por rotación sin evaluación no genera un saque estadístico.</p><div class="tablewrap"><table><thead><tr><th>Sacador</th><th>Receptor</th><th>Distribución</th><th>Recepción positiva</th><th>Perfectas / errores</th></tr></thead><tbody>${model.pairs.map(p=>`<tr><td>${esc(flowName(m,p.serverId,side))}</td><td>${esc(flowName(m,p.receiverId,VolleyRally.other(side)))}</td><td>${flowRate(p.count,byServer(p.serverId))}${p.count<5?' · MUESTRA REDUCIDA':''}</td><td>${flowRate(p.positive,p.count)}</td><td>${p.perfect} / ${p.errors} · ${p.serveRecorded} saques evaluados</td></tr>`).join('')||'<tr><td colspan="5">Sin relaciones confirmadas.</td></tr>'}</tbody></table></div><p>Direcciones de saque: ${['paralela','diagonal'].map(d=>d+' '+model.trends.serve.directions[d].count).join(' · ')}. Las combinaciones centrales permanecen sin clasificar.</p></details>`;
}
function renderFlowSpatialDetails(model){
  const entries=model.actions.filter(e=>flowStatsSkill==='coverage'?e.action.skill==='defense'&&e.action.metadata?.defenseKind==='coverage':e.action.skill===flowStatsSkill&&(flowStatsSkill!=='defense'||e.action.metadata?.defenseKind!=='coverage'));
  const rows=[1,2,3,4,5,6].map(z=>{
    const origin=entries.filter(e=>e.action.originZone===z),destination=entries.filter(e=>e.action.destinationZone===z);
    const observed=origin.filter(e=>StatsV2.statusOf(e.action,'origin')==='confirmed').length;
    const references=origin.filter(e=>e.action.metadata?.originSource==='rotation-reference').length;
    return `<tr><td>Z${z}</td><td>${origin.length}</td><td>${observed}</td><td>${origin.length-observed-references}</td><td>${references}</td><td>${destination.length}</td></tr>`;
  });
  const sequences={reception:[],defense:[],coverage:[]};
  for(const e of model.attacks){const phase=e.action.metadata?.attackPhase,key=phase==='counterattack'?'defense':phase;if(sequences[key])sequences[key].push(e);}
  return `<details><summary>Zonas y continuidad · ${esc(skills[flowStatsSkill]?.name||'Cobertura')}</summary><p>${entries.length} acciones. Las referencias de rotación permanecen separadas de ubicaciones observadas e inferidas.</p><div class="tablewrap"><table><thead><tr><th>Zona</th><th>Origen</th><th>Observado</th><th>Inferido</th><th>Referencia de rotación</th><th>Destino</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p>${entries.filter(e=>!e.action.originZone).length} acciones sin origen · ${entries.filter(e=>!e.action.destinationZone).length} sin destino.</p><h3>Recepción y ataque / defensa y contraataque</h3>${[['reception','Ataques después de recepción'],['defense','Contraataques después de defensa'],['coverage','Ataques después de cobertura']].map(([key,label])=>{const list=sequences[key],kills=list.filter(e=>['kill','tip_kill','use_block_out'].includes(e.result.outcomeId)).length,errors=list.filter(e=>e.result.outcomeId==='error'||e.result.outcomeId==='blocked_point'&&model.data.config.blockedPointIsError).length;return `<p>${label}: ${list.length} intentos · ${kills} puntos · ${errors} errores · eficacia ${flowRate(kills-errors,list.length)}.</p>`;}).join('')}<p class="hinttext">Sólo se cuentan fases vinculadas por acciones registradas. No se inventan recepciones, armados ni defensas.</p></details>`;
}
function flowUiErrors(s){return s.attack.errors+s.serve.errors+s.reception.q0+s.block.faults+s.defense.directErrors+s.coverage.directErrors+s.setting.directErrors;}
function flowUiOptions(side,extra={}){
  return {side,player:flowStatsView==='post'?flowStatsPlayer:'',origin:flowStatsView==='post'?flowStatsOrigin:'',role:flowStatsView==='post'?flowStatsRole:'',rotation:flowStatsView==='post'?flowStatsRotation:'',type:flowStatsView==='post'?flowStatsType:'',direction:flowStatsView==='post'?flowStatsDirection:'',provenance:flowStatsView==='post'?flowStatsProvenance:'',result:flowStatsView==='post'?flowStatsResult:'',evidence:flowStatsView==='post'?flowStatsEvidence:'',...extra};
}
function flowUiMetricRows(model){
  const d=model.data,s=d.summary;
  return [
    {key:'attack',label:'Eficacia de ataque',value:s.attack.efficiency,n:s.attack.total,detail:s.attack.kills+' puntos · '+s.attack.errors+' errores',rate:true},
    {key:'reception',label:'Recepción positiva',value:s.reception.positivePct,n:s.reception.total,detail:(s.reception.q2+s.reception.q3)+' / '+s.reception.total+' recepciones',rate:true},
    {key:'sideout',label:'Side-out',value:d.recv.length?100*d.sideOut/d.recv.length:null,n:d.recv.length,detail:d.sideOut+' / '+d.recv.length+' rallies recibidos',rate:true},
    {key:'break',label:'Break-point',value:d.serv.length?100*d.breakpoints/d.serv.length:null,n:d.serv.length,detail:d.breakpoints+' / '+d.serv.length+' rallies al saque',rate:true},
    {key:'aces',label:'Aces',value:s.serve.total?s.serve.aces:null,n:s.serve.total,detail:s.serve.total+' saques'},
    {key:'block',label:'Bloqueo punto',value:s.block.total?s.block.points:null,n:s.block.total,detail:s.block.total+' intervenciones'},
    {key:'errors',label:'Errores registrados',value:model.actions.length?flowUiErrors(s):null,n:model.actions.length,detail:model.actions.length+' acciones',lower:true}
  ];
}
function renderFlowUiMetrics(m,side,model){
  const rows=flowUiMetricRows(model),small=rows.some(r=>r.n>0&&r.n<5);
  return `<article class="card stats-team stats-team-${side}" data-summary-side="${side}"><div class="row-between"><h2>${esc(side==='us'?m.team:m.opponent)}</h2><span class="stats-tag">${side==='us'?'Mi equipo':'Rival'}</span></div><div class="stats-summary-grid">${rows.map(r=>`<div class="stats-number"><span>${r.label}</span><strong>${r.value==null?'—':r.rate?flowPercent(r.value):r.value}</strong><small>${r.n?r.detail:'Sin registros'}</small></div>`).join('')}</div>${small?'<p class="stats-sample">Datos iniciales: algunos indicadores tienen menos de 5 acciones.</p>':''}</article>`;
}
function flowUiObservations(m,models){
  const items=[];
  for(const {side,model}of models){
    const team=side==='us'?'Mi equipo':'Rival',s=model.data.summary,ps=model.players.filter(x=>!x.p.provisional);
    const best=(total,value)=>ps.filter(p=>p[total]>0).sort((a,b)=>b[value]-a[value])[0];
    const scorer=best('attack','K');if(scorer?.K)items.push(`${team}: #${scorer.p.number} lidera los puntos de ataque con ${scorer.K} en ${scorer.attack} intentos.`);
    const receiver=ps.filter(p=>p.rec>=5).sort((a,b)=>b.recPos/b.rec-a.recPos/a.rec)[0];
    if(receiver)items.push(`${team}: #${receiver.p.number} tiene ${flowPercent(100*receiver.recPos/receiver.rec)} de recepción positiva en ${receiver.rec} recepciones.`);
    if(model.data.recv.length)items.push(`${team}: ${flowPercent(100*model.data.sideOut/model.data.recv.length)} de side-out en ${model.data.recv.length} rallies recibidos.`);
    if(s.reception.total&&!receiver)items.push(`${team}: ${flowPercent(s.reception.positivePct)} de recepción positiva en ${s.reception.total} recepciones.`);
    if(s.serve.errors)items.push(`${team}: ${s.serve.errors} errores de saque en ${s.serve.total} saques.`);
    if(s.serve.total)items.push(`${team}: ${s.serve.aces} aces en ${s.serve.total} saques; ${model.serveKnown} destinos conocidos.`);
    if(s.attack.total)items.push(`${team}: ${flowPercent(s.attack.efficiency)} de eficacia en ${s.attack.total} ataques.`);
    const blocker=best('blk','blk');if(blocker?.blk)items.push(`${team}: #${blocker.p.number} participó en ${blocker.blk} bloqueos punto.`);
  }
  // Round-robin observations keep both teams represented before adding details.
  const first=models.map(({side})=>items.find(x=>x.startsWith(side==='us'?'Mi equipo:':'Rival:'))).filter(Boolean);
  return [...first,...items.filter(x=>!first.includes(x))].slice(0,5);
}
function renderFlowUiObservations(m,models){
  const notes=flowUiObservations(m,models);
  return `<section class="card stats-reading"><h2>Lectura rápida</h2>${notes.length?`<ul>${notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p>Registrá acciones para ver las primeras tendencias. Los datos faltantes aparecen como —.</p>'}</section>`;
}
function renderFlowUiTeamComparison(m,models){
  if(models.length!==2)return '';
  const left=flowUiMetricRows(models[0].model),right=flowUiMetricRows(models[1].model);
  return `<section class="card" data-team-comparison><h2>Comparación entre equipos</h2><div class="tablewrap"><table><thead><tr><th>Indicador</th><th>${esc(m.team)}</th><th>${esc(m.opponent)}</th><th>Mejor valor</th></tr></thead><tbody>${left.map((a,i)=>{
    const b=right[i],valid=a.value!=null&&b.value!=null,winner=!valid?'Sin comparación':a.value===b.value?'Iguales':(a.lower?a.value<b.value:a.value>b.value)?m.team:m.opponent;
    const val=x=>x.value==null?'—':x.rate?flowPercent(x.value):x.value;
    return `<tr><th>${a.label}</th><td>${val(a)}<small class="stats-cell-note">${a.n} ${['sideout','break'].includes(a.key)?'rallies':'acciones'}</small></td><td>${val(b)}<small class="stats-cell-note">${b.n} ${['sideout','break'].includes(b.key)?'rallies':'acciones'}</small></td><td>${esc(winner)}</td></tr>`;
  }).join('')}</tbody></table></div><small>Se comparan valores registrados; menor cantidad de errores es favorable. La cantidad de acciones puede ser diferente.</small></section>`;
}
function renderFlowUiDirections(model){
  const directions=Object.entries(model.directions),known=model.known;
  const table=items=>`<div class="tablewrap"><table><thead><tr><th>Dirección</th><th>Frecuencia</th><th>Puntos</th><th>Errores</th><th>Eficacia</th></tr></thead><tbody>${items.map(([d,b])=>`<tr><th>${flowDirectionLabels[d]}</th><td>${flowRate(b.count,known)}</td><td>${b.kills}</td><td>${b.errors}</td><td>${flowRate(b.kills-b.errors,b.count)}</td></tr>`).join('')}</tbody></table></div>`;
  return `${model.trends.attack.predictions.total?`<p class="stats-sample">${model.trends.attack.predictions.total} predicciones sin confirmar, separadas de los porcentajes observados.</p>`:''}<h3>Frecuencia y eficacia por dirección</h3>${table(directions.filter(([d])=>['diagonal','paralela','olla','centro'].includes(d)))}${directions.some(([d,b])=>['zona1','zona5'].includes(d)&&b.count)?`<h3>Clasificación de ataques desde zona 3</h3>${table(directions.filter(([d])=>['zona1','zona5'].includes(d)))}`:''}<p class="stats-cell-note">${model.attacks.length} intentos · ${known} con dirección · ${model.attacks.length-known} sin clasificar. Frecuencia: proporción de direcciones conocidas. Eficacia: (puntos − errores) / intentos de esa dirección.</p>`;
}
function renderFlowUiAttackPlayers(m,side,model){
  const ps=model.players.filter(p=>p.trends.attack.total).sort((a,b)=>b.trends.attack.total-a.trends.attack.total);
  return `<section class="card" data-attack-side="${side}"><h2>${esc(side==='us'?m.team:m.opponent)} · ataque</h2>${ps.length?`<div class="stats-player-trends">${ps.map(p=>{
    const t=p.trends.attack,role=attackPositions[playerPosition(p.p)]||'Puesto sin registrar';
    return `<article class="stats-player-trend"><div class="row-between"><button class="btn btn-small" data-action="flow-player-stats" data-side="${side}" data-player="${esc(p.p.id)}">${esc(flowName(m,p.p.id,side))}</button><small>${esc(role)}</small></div><p><strong>${t.total} ataques</strong>${t.predictions.total?' · '+t.predictions.total+' predicciones sin confirmar':''} · ${t.predominant.map(d=>flowDirectionLabels[d]).join(' / ')||'Dirección sin clasificar'}</p><div class="stats-frequency">${['diagonal','paralela','olla'].map(d=>`<span>${flowDirectionLabels[d]}<strong>${flowRate(t.directions[d].count,t.known)}</strong></span>`).join('')}</div>${t.directions.centro.count?`<p>Centro: ${flowRate(t.directions.centro.count,t.known)}</p>`:''}${t.directions.zona1.count+t.directions.zona5.count?`<p class="stats-cell-note">Desde zona 3: Zona 1 ${flowRate(t.directions.zona1.count,t.known)} · Zona 5 ${flowRate(t.directions.zona5.count,t.known)}</p>`:''}<button class="btn btn-small" data-action="flow-player-map" data-side="${side}" data-player="${esc(p.p.id)}" data-kind="attack">Ver mapa</button></article>`;
  }).join('')}</div>`:'<p>Sin ataques registrados.</p>'}${ps.some(p=>p.trends.attack.known<5)?'<p class="stats-sample">Tendencias iniciales: al menos un jugador tiene menos de 5 direcciones conocidas.</p>':''}${renderFlowAttackTypeBreakdown(model)}${flowStatsView==='post'?renderFlowUiDirections(model):''}</section>`;
}
function renderFlowUiServePlayers(m,side,model){
  const s=model.data.summary.serve,t=model.trends.serve,players=model.players.filter(p=>p.serve).sort((a,b)=>b.serve-a.serve),top=players[0];
  return `<section class="card" data-serve-side="${side}"><h2>${esc(side==='us'?m.team:m.opponent)} · saque</h2><div class="stats-inline-metrics"><span><strong>${s.total}</strong> saques</span><span><strong>${s.aces}</strong> aces</span><span><strong>${s.errors}</strong> errores</span></div><p>${top?'Mayor volumen: '+esc(flowName(m,top.p.id,side))+' · '+top.serve+' saques.':'Sin sacadores registrados.'}</p><p>Destino más utilizado: <strong>${t.preferredZones.map(z=>'Z'+z).join(' / ')||'Sin destino conocido'}</strong></p><p>${t.known} con destino · ${t.unknown} sin destino registrado.</p>${renderFlowServeDirectionSummary(t)}${players.length?`<div class="stats-player-trends">${players.map(p=>`<article class="stats-player-trend"><button class="btn btn-small" data-action="flow-player-stats" data-side="${side}" data-player="${esc(p.p.id)}">${esc(flowName(m,p.p.id,side))}</button><p>${p.serve} saques · ${p.aces} aces · ${p.serveErr} errores</p>${renderFlowServeDirectionSummary(p.trends.serve)}<p>Busca ${p.trends.serve.preferredZones.map(z=>'Z'+z).join(' / ')||'destinos sin registrar'} · ${p.trends.serve.known} destinos conocidos</p><button class="btn btn-small" data-action="flow-player-map" data-side="${side}" data-player="${esc(p.p.id)}" data-kind="serve">Ver mapa</button></article>`).join('')}</div>`:''}${t.known>=3?`<details ${flowMapSelection.startsWith(side+':serve:')?'open':''}><summary>Mapa de saque · ${t.known} destinos</summary>${renderFlowServeMap(model,side)}</details>`:'<p class="stats-sample">Con 3 destinos conocidos se habilita el mapa de calor.</p>'}${flowStatsView==='post'?renderFlowServePairs(m,model,side):''}</section>`;
}
function renderFlowUiMaps(m,side,model){
  const attackGroups=flowAttackMapGroups(model),hasAttack=attackGroups.length>0;
  return `<section class="card stats-tactics" data-maps-side="${side}"><h2>${esc(side==='us'?m.team:m.opponent)} · mapas tácticos</h2>${flowStatsMapPlayer?`<p class="stats-tag">Mapa individual: ${esc(flowName(m,flowStatsMapPlayer,side))}</p><button class="btn" data-action="flow-profile-close">Ver todo el equipo</button>`:''}<div class="flow-maps"><div data-map-kind="attack">${hasAttack?renderFlowAttackMap(model,side):'<h3>Mapa de ataque</h3><p>Sin origen y dirección o destino suficientes para dibujar flechas.</p>'}</div><div data-map-kind="serve">${model.serveKnown>=3?renderFlowServeMap(model,side):`<h3>Mapa de saque</h3><p>${model.serves.length} saques registrados · ${model.serveKnown} con destino · ${model.serves.length-model.serveKnown} sin destino registrado.</p><small>Mapa disponible desde 3 destinos conocidos.</small>`}</div></div><details ${['reception','defense','coverage'].some(k=>flowMapSelection.startsWith(side+':'+k+':'))?'open':''}><summary>Mapas de recepción, defensa y cobertura</summary><div class="flow-maps">${['reception','defense','coverage'].map(kind=>model.trends[kind].known?renderFlowZoneMap(model,side,kind,m):`<div data-trend-map="${kind}"><h3>${{reception:'Recepción',defense:'Defensa',coverage:'Cobertura'}[kind]}</h3><p>${model.trends[kind].total} acciones · sin zonas físicas suficientes.</p></div>`).join('')}</div></details></section>`;
}
function renderFlowUiFundamentals(model){
  const s=model.data.summary,k=flowStatsSkill,v=s[k],list={
    attack:[['Intentos',v.total],['Puntos',v.kills],['Errores',v.errors],['Continúan',v.continues],['Bloqueos recibidos',v.blockedPoints+v.coveredBlocks],['Use / block-out',v.useBlockOutKills],['Eficacia',flowPercent(v.efficiency)]],
    reception:[['Total',v.total],['Calidad 3',v.q3],['Calidad 2',v.q2],['Calidad 1',v.q1],['Calidad 0 / errores',v.q0],['Positiva',flowPercent(v.positivePct)],['Perfecta',flowPercent(v.perfectPct)]],
    serve:[['Total',v.total],['Aces',v.aces],['Positivos',v.positive],['Neutros',v.neutral],['Errores',v.errors],['Error',flowPercent(v.errorPct)],['Aces / saques',flowPercent(v.acePct)]],
    block:[['Intervenciones',v.total],['Puntos directos',v.points],['Toques positivos',v.positiveTouches],['Sin control',v.uncontrolledTouches],['Faltas',v.faults],['Puntos individuales',v.soloPoints],['Puntos asistidos',v.assistedPoints],['Composición desconocida',v.unknownPoints]],
    defense:[['Total',v.total],['Perfectas',v.perfect],['Positivas',v.positive],['Continuidades limitadas',v.limited],['Errores',v.directErrors]],
    setting:[['Total',v.total],['Perfectos',v.perfect],['Buenos',v.good],['Forzados',v.forced],['Errores',v.directErrors],['Asistencias',v.assists]],
    coverage:[['Total',v.total],['Perfectas',v.perfect],['Positivas',v.positive],['Limitadas',v.limited],['Errores',v.directErrors]]
  }[k]||[];
  // Each branch reads only the selected fundamental; no alternate formula is introduced.
  const rows=list.map(([label,value])=>[label,v.total?value:'—']);
  return `<div class="stats-fundamental" data-fundamental="${k}"><h3>${esc(skills[k]?.name||'Cobertura')}</h3>${v.total?'':'<p>Sin registros para este fundamento.</p>'}<dl class="stats-detail-grid">${rows.map(([l,n])=>`<div><dt>${l}</dt><dd>${n??'—'}</dd></div>`).join('')}</dl>${k==='attack'?`<details><summary>Delanteros, zagueros y origen</summary>${Object.entries(v.byRole).map(([role,b])=>`<p>${{front:'Delanteros',back:'Zagueros',unknown:'Rol sin identificar'}[role]}: ${b.attempts} intentos · ${b.kills} puntos · eficacia ${flowPercent(b.efficiency)}</p>`).join('')}<p>Origen: ${Object.entries(v.origin).filter(([,n])=>n).map(([z,n])=>(z==='unknown'?'Sin zona':'Z'+z)+': '+n).join(' · ')||'Sin zonas'}</p></details>`:''}${k==='serve'?'<small>Se conservan los indicadores existentes: porcentaje de ace y de error. No se agrega otra fórmula de efectividad.</small>':''}</div>`;
}
function renderFlowUiFundamentalComparison(m,models){
  if(models.length!==2)return '';
  const values=models.map(({model})=>flowComparisonRow({fundamentals:model.data.summary},flowStatsSkill));
  const rows=[['Acciones',x=>x.total,false,false],['Positivas / puntos',x=>x.total?x.good:null,false,true],['Errores',x=>x.total?x.error:null,true,true],['Indicador principal',x=>x.rate,false,true]];
  return '<section class="card" data-fundamental-comparison><h2>Comparación · '+esc(skills[flowStatsSkill]?.name||'Cobertura')+'</h2><div class="tablewrap"><table><thead><tr><th>Rubro</th><th>'+esc(m.team)+'</th><th>'+esc(m.opponent)+'</th><th>Mejor valor</th></tr></thead><tbody>'+rows.map(([label,get,lower,compare])=>{
    const a=get(values[0]),b=get(values[1]),format=v=>v==null?'—':label==='Indicador principal'?flowPercent(v):v;
    const winner=!compare?'Volumen':a==null||b==null?'Sin comparación':a===b?'Iguales':(lower?a<b:a>b)?m.team:m.opponent;
    return '<tr><th>'+label+'</th><td>'+format(a)+'</td><td>'+format(b)+'</td><td>'+esc(winner)+'</td></tr>';
  }).join('')+'</tbody></table></div><p class="stats-cell-note">'+esc(values[0].label)+'. Comparación de registros disponibles; no estima acciones faltantes.</p></section>';
}
function renderFlowUiBlockComposition(model){
  const blocks=model.actions.filter(e=>e.action.skill==='block'),count=n=>blocks.filter(e=>new Set(StatsV2.participants(e.action)).size===n).length;
  return `<p>Composición identificada: ${count(2)} bloqueos dobles · ${count(3)} triples. Cada acción colectiva cuenta una vez.</p>`;
}
function renderFlowUiEvolution(m,side){
  return `<section class="card" data-evolution-side="${side}"><h2>${esc(side==='us'?m.team:m.opponent)} · Evolución por set</h2><div class="tablewrap"><table><thead><tr><th>Set</th><th>Ataque</th><th>Recepción positiva</th><th>Aces</th><th>Bloqueo punto</th><th>Errores</th><th>${esc(skills[flowStatsSkill]?.name||'Cobertura')} · acciones / positivas / errores</th></tr></thead><tbody>${m.sets.map(s=>{
    const model=flowReportModel(m,flowStatsPlayer?{side,player:flowStatsPlayer,set:String(s.number)}:flowUiOptions(side,{set:String(s.number)})),x=model.data.summary,positive=x.reception.q2+x.reception.q3;
    const row=flowComparisonRow({fundamentals:x},flowStatsSkill);
    return `<tr><td>Set ${s.number}</td><td>${flowPercent(x.attack.efficiency)}<small class="stats-cell-note">${x.attack.total} intentos</small></td><td>${flowRate(positive,x.reception.total)}</td><td>${x.serve.total?x.serve.aces:'—'}</td><td>${x.block.total?x.block.points:'—'}</td><td>${model.actions.length?flowUiErrors(x):'—'}</td><td>${row.total?row.total+' / '+row.good+' / '+row.error:'—'}</td></tr>`;
  }).join('')}</tbody></table></div>${renderFlowTrendEvolution(m,side)}</section>`;
}
function renderFlowUiPlayer(m,side,id){
  const p=VolleyRally.roster(m,side).find(p=>p.id===id);if(!p)return '<p>El jugador no pertenece al equipo seleccionado.</p>';
  // A profile includes all of the player's actions; tactical filters apply to team analysis only.
  const model=flowReportModel(m,{side,player:id,set:statSet}),x=model.players.find(x=>x.p.id===id),role=attackPositions[playerPosition(p)];
  return `<article class="card stats-profile" data-player-profile="${esc(id)}"><div class="row-between"><div><span class="stats-tag">Ficha individual · ${side==='us'?'Mi equipo':'Rival'}</span><h2>${esc(flowName(m,id,side))}</h2><p>${esc(role||'Puesto sin registrar')}</p></div><button class="btn" data-action="flow-profile-close">Cerrar ficha</button></div>${x?`<div class="stats-detail-grid">${['attack','reception','serve','block','defense','setting'].map(skill=>{const r=flowComparisonRow(x,skill);return `<section><h3>${esc(skills[skill].name)}</h3><strong>${r.total} acciones</strong><p>${r.good} positivas / puntos · ${r.error} errores</p><small>${r.label}: ${flowPercent(r.rate)}</small></section>`;}).join('')}</div>`:'<p>Sin acciones registradas.</p>'}<details ${flowStatsMapPlayer===id||flowMapSelection.startsWith(side+':')?'open':''}><summary>Tendencias y mapas individuales</summary>${renderFlowReceptionServers(m,model,side)}${renderFlowUiAttackPlayers(m,side,model)}${renderFlowUiServePlayers(m,side,model)}${renderFlowUiMaps(m,side,model)}</details><details><summary>Estadísticas completas por fundamento</summary>${StatsV2.renderStatisticsV2(model.view,model.filter)}</details>${renderFlowUiEvolution(m,side)}</article>`;
}
function renderFlowStatistics(m){
  const post=flowStatsView==='post',panel=post?flowStatsPostPanel:flowStatsLivePanel;
  const sides=flowStatsSide==='both'?['us','them']:[flowStatsSide];
  const models=sides.map(side=>({side,model:flowReportModel(m,flowUiOptions(side,{player:panel==='maps'?flowStatsMapPlayer:''}))}));
  const basic=sides.map(side=>({side,model:flowReportModel(m,{side,set:statSet})}));
  const roster=sides.flatMap(side=>VolleyRally.roster(m,side));
  const select=(field,label,values,value)=>`<label>${label}<select data-flow-stat="${field}">${values.map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
  const tabs=post?[['summary','Resumen'],['fundamentals','Fundamentos'],['attack','Tendencias de ataque'],['serve','Tendencias de saque'],['maps','Mapas tácticos'],['evolution','Evolución por set'],['rankings','Rankings']]:[['summary','Lectura rápida'],['attack','Ataque'],['serve','Saque'],['players','Comparar jugadores'],['maps','Mapas tácticos']];
  const skillTabs=`<div class="stats-pills" role="group" aria-label="Fundamento">${['attack','reception','serve','block','defense','setting','coverage'].map(k=>`<button class="btn ${flowStatsSkill===k?'btn-primary':''}" data-action="flow-stat-skill" data-skill="${k}" aria-pressed="${flowStatsSkill===k}">${esc(skills[k]?.name||'Cobertura')}</button>`).join('')}</div>`;
  const advanced=post?`<details class="card stats-advanced"><summary>Filtrar el análisis táctico${[flowStatsOrigin,flowStatsRole,flowStatsRotation,flowStatsType,flowStatsDirection,flowStatsProvenance].some(Boolean)?' · filtros activos':''}</summary><div class="flow-stat-filters">${select('origin','Zona de origen',[['','Todas'],...[1,2,3,4,5,6].map(z=>[z,'Zona '+z])],flowStatsOrigin)}${select('role','Rol del ataque',[['','Todos'],['front','Delantero'],['back','Zaguero'],['unknown','Sin determinar']],flowStatsRole)}${select('type','Técnica',[['','Todas'],['conventional','Remate'],['tip','Colocada'],['use_block_out','Use / block-out']],flowStatsType)}${select('direction','Dirección (ataque / saque)',[['','Todas'],...Object.entries(flowDirectionLabels)],flowStatsDirection)}${select('rotation','Rotación',[['','Todas'],...[1,2,3,4,5,6].map(z=>[z,'R'+z])],flowStatsRotation)}${select('result','Resultado',[['','Todos'],...(VolleyCatalog.definitions[flowStatsSkill==='coverage'?'defense':flowStatsSkill]?.outcomes||[]).map(o=>[o.id,o.label])],flowStatsResult)}${select('evidence','Evidencia de dirección',[['','Todas'],['confirmed','Confirmada'],['inferred','Inferida por defensa'],['predicted','Predicha por tendencia']],flowStatsEvidence)}${select('provenance','Procedencia de zona',[['','Todas'],['confirmed','Confirmada'],['inferred','Inferida'],['recorded','Histórica']],flowStatsProvenance)}</div><button class="btn" data-action="flow-stat-clear">Limpiar filtros</button><small>Los resúmenes y la comparación de equipos conservan todos los datos del período. Los filtros se aplican al análisis táctico.</small></details>`:'';
  let content='';
  if(post&&flowStatsPlayer){content=renderFlowUiPlayer(m,flowStatsSide==='both'?(m.players.some(p=>p.id===flowStatsPlayer)?'us':'them'):flowStatsSide,flowStatsPlayer);}
  else if(panel==='summary'){
    content=`<div class="stats-team-grid">${basic.map(({side,model})=>renderFlowUiMetrics(m,side,model)).join('')}</div>${renderFlowUiObservations(m,basic)}${renderFlowUiTeamComparison(m,basic)}<div class="stats-team-grid">${basic.map(({side,model})=>`<section class="card stats-tactical-preview"><h2>${esc(side==='us'?m.team:m.opponent)} · lectura táctica</h2><p><strong>Ataque:</strong> ${model.trends.attack.predominant.map(d=>flowDirectionLabels[d]).join(' / ')||'Sin dirección conocida'} · ${model.known}/${model.attacks.length} clasificados.</p><p><strong>Saque:</strong> ${model.trends.serve.preferredZones.map(z=>'Z'+z).join(' / ')||'Sin destino conocido'} · ${model.serveKnown}/${model.serves.length} con destino.</p><div class="row"><button class="btn" data-action="flow-stat-panel" data-panel="attack">Ver ataques</button><button class="btn" data-action="flow-stat-panel" data-panel="serve">Ver saques</button></div></section>`).join('')}</div>`;
  }else if(panel==='attack')content=models.map(({side,model})=>renderFlowUiAttackPlayers(m,side,model)).join('');
  else if(panel==='serve')content=models.map(({side,model})=>renderFlowUiServePlayers(m,side,model)).join('');
  else if(panel==='maps')content=models.map(({side,model})=>renderFlowUiMaps(m,side,model)).join('');
  else if(panel==='evolution')content=skillTabs+models.map(({side})=>renderFlowUiEvolution(m,side)).join('');
  else if(panel==='rankings')content=models.map(({side,model})=>`<section class="card"><h2>${esc(side==='us'?m.team:m.opponent)} · rankings</h2>${renderFlowRankings(model)}</section>`).join('');
  else content=skillTabs+(post?renderFlowUiFundamentalComparison(m,models):'')+`<div class="stats-comparison-controls">${select('sort','Ordenar jugadores',[['volume','Acciones'],['points','Positivas / puntos'],['errors','Errores'],['rate','Indicador']],flowStatsSort)}</div>`+models.map(({side,model})=>`<section class="card"><h2>${esc(side==='us'?m.team:m.opponent)}</h2>${post?renderFlowUiFundamentals(model):''}${flowStatsSkill==='block'&&post?renderFlowUiBlockComposition(model):''}${renderFlowComparison(model,side)}${flowStatsSkill==='reception'?renderFlowReceptionServers(m,model,side):''}${post?`<details><summary>Desglose por zonas y secuencias</summary>${renderFlowSpatialDetails(model)}</details>`:''}</section>`).join('');
  return `<section class="flow-statistics stats-workspace" data-report-mode="${flowStatsView}" data-stat-panel="${panel}"><header class="row-between"><div><p class="stats-eyebrow">VOLLEY SCOUT · ESTADÍSTICAS</p><h1>${post?'Análisis postpartido':'El partido de un vistazo'}</h1></div><button class="btn" data-action="view" data-view="live">Volver al rally</button></header><div class="v2-mode-switch" role="group" aria-label="Vista de estadísticas">${[['live','DURANTE EL PARTIDO'],['post','POSTPARTIDO']].map(([v,l])=>`<button data-action="flow-stat-view" data-mode="${v}" class="${flowStatsView===v?'active':''}" aria-pressed="${flowStatsView===v}">${l}</button>`).join('')}</div><div class="card stats-toolbar"><div class="stats-pills" role="group" aria-label="Equipo">${[['us','Mi equipo'],['them','Rival'],['both','Comparación']].map(([v,l])=>`<button class="btn ${flowStatsSide===v?'btn-primary':''}" data-action="flow-stat-side" data-side="${v}" aria-pressed="${flowStatsSide===v}">${l}</button>`).join('')}</div><div class="stats-period">${select('set','Período',[['all','Partido completo'],...m.sets.map(s=>[s.number,'Set '+s.number])],statSet)}<button class="btn" data-action="flow-current-set">Set actual</button><button class="btn" data-action="flow-all-sets">Partido completo</button></div>${post?select('player','Ficha individual',[['','Elegir jugador'],...roster.map(p=>[p.id,(p.provisional?p.number:'#'+p.number)+' '+(p.name||'')])],flowStatsPlayer):''}</div><nav class="stats-panel-tabs" aria-label="Paneles de estadísticas">${tabs.map(([v,l])=>`<button class="btn ${panel===v?'btn-primary':''}" data-action="flow-stat-panel" data-panel="${v}" aria-pressed="${panel===v}">${l}</button>`).join('')}</nav>${advanced}${content}<footer class="stats-footer"><p>— Sin datos · Los porcentajes usan acciones registradas. El rally abierto cuenta en fundamentos, no como punto.</p>${post?`<div class="row no-print"><button class="btn" data-action="download-stats">CSV jugadores</button><button class="btn" data-action="download-actions">CSV acciones</button><button class="btn" data-action="print">Imprimir / PDF</button></div><details ${flowHistory?'open':''}><summary>Revisar acciones del partido</summary>${renderFlowHistory(m)}</details><details><summary>Informes anteriores del equipo propio</summary>${renderCoachReport(m,statSet)}${renderFormationStats(m)}${renderDirectPointStats(m)}${renderRivalBlockStats(m)}</details>`:''}</footer></section>`;
}

document.addEventListener('change',e=>{const t=e.target;if(!t.matches('[data-flow-stat]'))return;
  const key=t.dataset.flowStat;if(key==='result')flowStatsResult=t.value;if(key==='evidence')flowStatsEvidence=t.value;if(key==='set')statSet=t.value;if(key==='side'){flowStatsSide=t.value;flowStatsPlayer='';flowStatsMapPlayer='';}if(key==='player'){flowStatsPlayer=t.value;flowStatsMapPlayer='';}if(key==='skill'){flowStatsSkill=t.value;flowStatsResult='';}if(key==='origin')flowStatsOrigin=t.value;if(key==='role')flowStatsRole=t.value;if(key==='rotation')flowStatsRotation=t.value;if(key==='sort')flowStatsSort=t.value;if(key==='type')flowStatsType=t.value;if(key==='direction')flowStatsDirection=t.value;if(key==='provenance')flowStatsProvenance=t.value;flowMapSelection='';render();
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
