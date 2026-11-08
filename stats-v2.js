'use strict';
// Pure calculations: stored actions and historical labels are never rewritten here.
(function (root) {
  const defaults = {blockedPointIsError:true,assistsEnabled:true,assistRequiresReceiver:false};
  let configured = {...defaults};
  const aliases = {
    serve:{Ace:'ace',Positivo:'positive',Neutro:'neutral',Continuidad:'neutral',Error:'error'},
    reception:{Perfecta:'perfect',Positiva:'positive',Negativa:'poor',Mala:'poor',Error:'direct_error','Error directo':'direct_error'},
    attack:{Punto:'kill',Sigue:'continue',Continuidad:'continue','Bloqueo cubierto':'covered_block','Bloqueo punto':'blocked_point',Error:'error'},
    block:{Punto:'point',Toque:'positive_touch','Toque positivo':'positive_touch','Toque sin control':'uncontrolled_touch',Falta:'fault',Error:'fault'},
    defense:{Perfecta:'perfect',Positiva:'positive',Negativa:'limited',Limitada:'limited',Error:'direct_error','Error directo':'direct_error'},
    setting:{Perfecta:'perfect',Perfecto:'perfect',Positiva:'good',Bueno:'good',Negativa:'forced',Forzado:'forced',Error:'direct_error','Error directo':'direct_error'}
  };
  const valid = {
    serve:['ace','positive','neutral','error'],reception:['perfect','positive','poor','direct_error'],
    attack:['kill','continue','use_block_out','tip_kill','tip_continue','covered_block','blocked_point','error','ambiguous_block'],
    block:['point','positive_touch','uncontrolled_touch','fault'],defense:['perfect','positive','limited','direct_error'],setting:['perfect','good','forced','direct_error']
  };
  const own = (object,key) => Object.prototype.hasOwnProperty.call(object || {},key);
  function resolveOutcome(action,rally) {
    if (!action) return {outcomeId:'unknown',ambiguous:false,terminal:false};
    if (root.VolleyData?.getActionResult) return root.VolleyData.getActionResult(action,rally);
    const skill = action.skill;
    let id = action.outcomeId || aliases[skill]?.[action.outcome];
    if (!action.outcomeId && skill === 'attack' && action.outcome === 'Bloqueado') {
      const list = rally?.actions || [];
      const i = list.indexOf(action) >= 0 ? list.indexOf(action) : list.findIndex(a=>action.id && a.id === action.id);
      const continued=i >= 0 && list.slice(i+1).some(a=>valid[a?.skill]);
      id = continued ? 'covered_block' : i === list.length-1 && rally?.winner === 'them' ? 'blocked_point' : 'ambiguous_block';
    }
    if (!valid[skill]?.includes(id)) id = 'unknown';
    const winner = (skill === 'serve' && id === 'ace') || (skill === 'attack' && ['kill','use_block_out','tip_kill'].includes(id)) || (skill === 'block' && id === 'point') ? 'us'
      : id === 'direct_error' || (skill === 'serve' && id === 'error') || (skill === 'attack' && ['error','blocked_point'].includes(id)) || (skill === 'block' && id === 'fault') ? 'them' : null;
    return {skill,outcomeId:id,legacy:!action.outcomeId,ambiguous:id === 'ambiguous_block',terminal:!!winner,winner};
  }
  function participants(action) {
    const ids = Array.isArray(action?.participants) ? action.participants.map(p=>typeof p === 'string' ? p : p?.id || p?.playerId).filter(Boolean) : [];
    if (action?.playerId) ids.unshift(action.playerId);
    return [...new Set(ids)];
  }
  function blockComposition(action) {
    const explicit=action.metadata?.blockType || action.blockType;
    if (['double','triple','assisted','doble','triple','asistido'].includes(explicit)) return 'assisted';
    if (['individual','solo','single'].includes(explicit)) return 'solo';
    if (!Array.isArray(action.participants) || !action.participants.length) return 'unknown';
    return participants(action).length>1 ? 'assisted' : 'solo';
  }
  function rallies(match,filter='all') {
    const setFilter = typeof filter === 'object' ? filter.set ?? 'all' : filter ?? 'all';
    return (match.sets || []).flatMap(set => (setFilter === 'all' || String(set.number) === String(setFilter)) ? (set.rallies || []).filter(r=>r.status !== 'open' && ['us','them'].includes(r.winner)).map(r=>({...r,setNo:set.number})) : []);
  }
  function entries(match,filter='all') {
    return rallies(match,filter).flatMap(rally=>(rally.actions || []).map((action,index)=>({action,rally,index,result:resolveOutcome(action,rally)})));
  }
  const percent = (n,d) => d ? 100*n/d : null;
  const zones = () => ({1:0,2:0,3:0,4:0,5:0,6:0,unknown:0});
  function zoneOf(action,kind) {
    const field = kind === 'origin' ? 'originZone' : 'destinationZone';
    if (own(action,field)) return [1,2,3,4,5,6].includes(Number(action[field])) && action[field] !== null ? Number(action[field]) : null;
    // Legacy zone was a destination only for serve/attack; for other skills it was our court.
    const legacyIsDestination = ['serve','attack'].includes(action.skill);
    return (kind === 'destination') === legacyIsDestination && [1,2,3,4,5,6].includes(Number(action.zone)) ? Number(action.zone) : null;
  }
  function attackAttempt(entry) {
    const a = entry.action;
    return a.skill === 'attack' && !a.metadata?.freeBall && !a.isFreeBall && !['free_ball','freeball'].includes(a.metadata?.attackType);
  }
  function summarize(list,config) {
    const count = (skill,id) => list.filter(e=>e.action.skill === skill && e.result.outcomeId === id).length;
    const total = skill => list.filter(e=>e.action.skill === skill).length;
    const attackEntries = list.filter(attackAttempt);
    const ac = id => attackEntries.filter(e=>e.result.outcomeId === id).length;
    const origin = zones(),destination = zones(),phase = {reception:0,counterattack:0,unknown:0};
    for (const {action} of attackEntries) {
      origin[zoneOf(action,'origin') || 'unknown']++;
      destination[zoneOf(action,'destination') || 'unknown']++;
      const p = action.metadata?.attackPhase;
      phase[['reception','counterattack'].includes(p) ? p : 'unknown']++;
    }
    const conventionalKills=attackEntries.filter(e=>e.result.outcomeId==='kill'&&e.action.metadata?.attackType==='conventional').length;
    const unspecifiedKills=ac('kill')-conventionalKills,useBlockOutKills=ac('use_block_out'),tipKills=ac('tip_kill');
    const K=conventionalKills+unspecifiedKills+useBlockOutKills+tipKills,blocked=ac('blocked_point'),E=ac('error')+(config.blockedPointIsError ? blocked : 0);
    const blockPoints = list.filter(e=>e.action.skill === 'block' && e.result.outcomeId === 'point');
    const distribution={};
    for (const e of list.filter(e=>e.action.skill === 'setting')) {
      const target=e.action.metadata?.settingTarget || 'unknown';
      distribution[target]=(distribution[target] || 0)+1;
    }
    const reception = {total:total('reception'),q0:count('reception','direct_error'),q1:count('reception','poor'),q2:count('reception','positive'),q3:count('reception','perfect')};
    const byRole={front:{attempts:0,kills:0,errors:0,useBlockOut:0,tipKills:0,efficiency:null},back:{attempts:0,kills:0,errors:0,useBlockOut:0,tipKills:0,efficiency:null},unknown:{attempts:0,kills:0,errors:0,useBlockOut:0,tipKills:0,efficiency:null}};
    for(const e of attackEntries){
      const role=typeof VolleyPosition!=='undefined'?VolleyPosition.resolve(e.action,e.rally).role:'unknown',bucket=byRole[role]||byRole.unknown,id=e.result.outcomeId;
      bucket.attempts++;if(['kill','use_block_out','tip_kill'].includes(id))bucket.kills++;
      if(id==='error'||id==='blocked_point'&&config.blockedPointIsError)bucket.errors++;
      if(id==='use_block_out')bucket.useBlockOut++;if(id==='tip_kill')bucket.tipKills++;
    }
    for(const bucket of Object.values(byRole))bucket.efficiency=percent(bucket.kills-bucket.errors,bucket.attempts);
    return {
      attack:{total:attackEntries.length,attempts:attackEntries.length,kills:K,conventionalKills,unspecifiedKills,useBlockOutKills,tipKills,tipContinues:ac('tip_continue'),errors:E,continues:ac('continue')+ac('tip_continue'),coveredBlocks:ac('covered_block'),blockedPoints:blocked,ambiguousBlocks:ac('ambiguous_block'),efficiency:percent(K-E,attackEntries.length),killPct:percent(K,attackEntries.length),origin,destination,phase,byRole},
      serve:{total:total('serve'),aces:count('serve','ace'),positive:count('serve','positive'),neutral:count('serve','neutral'),errors:count('serve','error'),acePct:percent(count('serve','ace'),total('serve')),errorPct:percent(count('serve','error'),total('serve'))},
      reception:{...reception,perfectPct:percent(reception.q3,reception.total),positivePct:percent(reception.q2+reception.q3,reception.total),errorPct:percent(reception.q0,reception.total)},
      block:{total:total('block'),points:blockPoints.length,soloPoints:blockPoints.filter(e=>blockComposition(e.action) === 'solo').length,assistedPoints:blockPoints.filter(e=>blockComposition(e.action) === 'assisted').length,unknownPoints:blockPoints.filter(e=>blockComposition(e.action) === 'unknown').length,positiveTouches:count('block','positive_touch'),uncontrolledTouches:count('block','uncontrolled_touch'),faults:count('block','fault')},
      defense:{total:total('defense'),perfect:count('defense','perfect'),positive:count('defense','positive'),limited:count('defense','limited'),directErrors:count('defense','direct_error')},
      setting:{total:total('setting'),perfect:count('setting','perfect'),good:count('setting','good'),forced:count('setting','forced'),directErrors:count('setting','direct_error'),distribution,assists:0}
    };
  }
  function assistEntries(list,config) {
    if (!config.assistsEnabled) return [];
    const assists=[],seen=new Set();
    for (const e of list) {
      if (e.action.skill !== 'attack' || !['kill','use_block_out','tip_kill'].includes(e.result.outcomeId) || e.rally.winner !== 'us' || !e.index || e.index !== e.rally.actions.length-1 || !attackAttempt(e)) continue;
      const previous=e.rally.actions[e.index-1],r=resolveOutcome(previous,e.rally);
      if (previous.skill !== 'setting' || !['perfect','good','forced'].includes(r.outcomeId)) continue;
      const receiver=previous.metadata?.receiverId || previous.receiverId;
      if ((receiver && receiver !== e.action.playerId) || (config.assistRequiresReceiver && !receiver)) continue;
      const previousPossession=previous.metadata?.possessionId ?? previous.possessionId, attackPossession=e.action.metadata?.possessionId ?? e.action.possessionId;
      if (previousPossession != null && attackPossession != null && previousPossession !== attackPossession) continue;
      const setterId=previous.metadata?.setterId || previous.playerId;
      if (!setterId) continue;
      const key=e.rally.setNo+':'+(e.rally.id || list.indexOf(e))+':'+(e.action.id || e.index);
      if (seen.has(key)) continue;
      seen.add(key);assists.push({setterId,attackerId:e.action.playerId,actionId:e.action.id || null,rallyId:e.rally.id || null,setNo:e.rally.setNo});
    }
    return assists;
  }
  function dataQuality(rs) {
    const result={rallies:rs.length,total:rs.length,withActions:0,complete:0,partial:0,unknown:0,withoutActions:0,partialSample:false};
    for (const r of rs) {
      if (r.actions?.length) result.withActions++; else result.withoutActions++;
      const completeness=r.sequenceComplete ?? r.metadata?.sequenceComplete ?? r.dataQuality?.complete;
      if (completeness === true) result.complete++;
      else if (completeness === false || ['quick','rapid','rapido','rápido'].includes(r.mode || r.recordingMode)) result.partial++;
      else result.unknown++;
    }
    result.partialSample=result.complete<result.total;
    return result;
  }
  function configFor(match) {return {...configured,...(match.statisticsConfig || {})};}
  function getMatchData(match,filter='all') {
    const rs=rallies(match,filter),list=entries(match,filter),config=configFor(match),summary=summarize(list,config),assists=assistEntries(list,config);
    summary.setting.assists=assists.length;
    const as=list.map(e=>({...e.action,resolvedOutcomeId:e.result.outcomeId,rallyId:e.rally.id,setNo:e.rally.setNo,winner:e.rally.winner}));
    const recv=rs.filter(r=>r.serveBefore === 'them'),serv=rs.filter(r=>r.serveBefore === 'us');
    return {rs,as,recv,serv,attacks:as.filter(a=>a.skill === 'attack' && !a.metadata?.freeBall && !a.isFreeBall && !['free_ball','freeball'].includes(a.metadata?.attackType)),recs:as.filter(a=>a.skill === 'reception'),serves:as.filter(a=>a.skill === 'serve'),kill:summary.attack.kills,err:summary.attack.errors,
      sideOut:recv.filter(r=>r.winner === 'us').length,breakpoints:serv.filter(r=>r.winner === 'us').length,summary,fundamentals:summary,quality:{...dataQuality(rs),unknownActionResults:list.filter(e=>e.result.outcomeId === 'unknown').length},assists,
      rotations:[1,2,3,4,5,6].map(rotation=>{const rr=rs.filter(r=>Number(r.rotationBefore ?? r.rotation) === rotation),re=rr.filter(r=>r.serveBefore === 'them'),se=rr.filter(r=>r.serveBefore === 'us');return {rotation,total:rr.length,receiving:re.length,sideOut:re.filter(r=>r.winner === 'us').length,serving:se.length,breakPoint:se.filter(r=>r.winner === 'us').length};}),
      offense:{origin:summary.attack.origin,destination:summary.attack.destination,phase:summary.attack.phase},config};
  }
  function getPlayerStats(match,filter='all') {
    const list=entries(match,filter),config=configFor(match),assists=assistEntries(list,config);
    return (match.players || []).map(p=>{
      const playerEntries=list.filter(e=>participants(e.action).includes(p.id)),s=summarize(playerEntries,config),a=s.attack;
      const assistsCount=assists.filter(x=>x.setterId === p.id).length;s.setting.assists=assistsCount;
      return {p,total:playerEntries.length,attack:a.total,K:a.kills,conventionalKills:a.conventionalKills,unspecifiedKills:a.unspecifiedKills,useBlockOutKills:a.useBlockOutKills,tipKills:a.tipKills,tipContinues:a.tipContinues,E:a.errors,eff:a.efficiency,killPct:a.killPct,attackContinue:a.continues,coveredBlocks:a.coveredBlocks,blockedPoints:a.blockedPoints,ambiguousBlocks:a.ambiguousBlocks,
        serve:s.serve.total,aces:s.serve.aces,servePos:s.serve.positive,serveNeutral:s.serve.neutral,serveErr:s.serve.errors,rec:s.reception.total,recPos:s.reception.q2+s.reception.q3,recPerf:s.reception.q3,recPoor:s.reception.q1,recErr:s.reception.q0,
        blk:s.block.points,blkSolo:s.block.soloPoints,blkAssisted:s.block.assistedPoints,blkUnknown:s.block.unknownPoints,blkTouches:s.block.positiveTouches,blkFaults:s.block.faults,
        def:s.defense.total,defPos:s.defense.perfect+s.defense.positive,defPerfect:s.defense.perfect,defLimited:s.defense.limited,defErrors:s.defense.directErrors,setting:s.setting.total,assists:assistsCount,fundamentals:s};
    });
  }
  function renderStatisticsV2(match,filter='all') {
    const d=getMatchData(match,filter),s=d.summary,q=d.quality;
    const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const rate=value=>value == null ? '—' : value.toFixed(1).replace('.',',')+'%';
    const rows=[
      ['Saque',s.serve.total,`Aces ${s.serve.aces} (${rate(s.serve.acePct)}) · Positivos ${s.serve.positive} · Neutros ${s.serve.neutral} · Errores ${s.serve.errors} (${rate(s.serve.errorPct)})`],
      ['Recepción',s.reception.total,`Calidad 3: ${s.reception.q3} · 2: ${s.reception.q2} · 1: ${s.reception.q1} · 0: ${s.reception.q0} · Perfectas ${rate(s.reception.perfectPct)} · Positivas (2+3) ${rate(s.reception.positivePct)} · Errores ${rate(s.reception.errorPct)}`],
      ['Ataque',s.attack.total,`Kills totales ${s.attack.kills} (${rate(s.attack.killPct)}) · Puntos convencionales ${s.attack.conventionalKills} · Sin variante registrada ${s.attack.unspecifiedKills} · Use / block-out ${s.attack.useBlockOutKills} · Toque / colocada punto ${s.attack.tipKills} · Sigue ${s.attack.continues} (colocadas ${s.attack.tipContinues}) · Cubiertos ${s.attack.coveredBlocks} · Bloqueo punto ${s.attack.blockedPoints} · Errores ${s.attack.errors} · Eficacia general ${rate(s.attack.efficiency)}`],
      ['Bloqueo',s.block.total,`Puntos individuales ${s.block.soloPoints} · Puntos asistidos ${s.block.assistedPoints} · Sin composición conocida ${s.block.unknownPoints} · Toques positivos ${s.block.positiveTouches} · Sin control ${s.block.uncontrolledTouches} · Faltas ${s.block.faults}`],
      ['Defensa',s.defense.total,`Perfectas ${s.defense.perfect} · Positivas ${s.defense.positive} · Limitadas ${s.defense.limited} · Errores directos ${s.defense.directErrors}`],
      ['Armado',s.setting.total,`Perfectos ${s.setting.perfect} · Buenos ${s.setting.good} · Forzados ${s.setting.forced} · Errores directos ${s.setting.directErrors} · Asistencias ${s.setting.assists}`]
    ];
    const players=getPlayerStats(match,filter);
    const destinations=Object.entries(s.setting.distribution).map(([key,value])=>`${escape(({outside:'Punta',middle:'Central',opposite:'Opuesto',backrow:'Zaguero',other:'Otro',unknown:'Sin destino registrado'})[key] || key)}: ${value}`).join(' · ');
    const zoneRows=[1,2,3,4,5,6,'unknown'].map(z=>`<tr><td>${z === 'unknown' ? 'Sin zona registrada' : 'Zona '+z}</td><td>${s.attack.origin[z]}</td><td>${s.attack.destination[z]}</td></tr>`).join('');
    return `<div class="card stats-v2-quality"><h2>Calidad de la muestra</h2><p>${q.total} rallies · ${q.withActions} con acciones · ${q.complete} con secuencia marcada completa · ${q.partial} rápidos o parciales · ${q.unknown} sin confirmación de secuencia completa.</p><p class="hinttext">${q.partialSample ? 'Muestra parcial: los porcentajes de fundamentos usan únicamente acciones registradas. La ausencia de una acción no significa que no haya ocurrido.' : 'Las secuencias de esta muestra están marcadas como completas.'} Side-out y break-point usan todos los rallies con servicio previo conocido.</p>${s.attack.ambiguousBlocks ? `<p class="errorbox">${s.attack.ambiguousBlocks} ataques históricos «Bloqueado» son ambiguos: cuentan como intentos y no se convierten automáticamente en errores.</p>` : ''}${q.unknownActionResults ? `<p class="errorbox">${q.unknownActionResults} acciones conservan un resultado desconocido. Cuentan en el total de su fundamento, sin asignarles calidad, punto ni error; los porcentajes pueden tener resultados pendientes de clasificar.</p>` : ''}</div>
    <div class="card"><h2>Fundamentos registrados</h2><div class="tablewrap"><table><thead><tr><th>Fundamento</th><th>Total</th><th>Resultados</th></tr></thead><tbody>${rows.map(row=>`<tr><td><strong>${row[0]}</strong></td><td>${row[1]}</td><td style="white-space:normal;min-width:220px">${row[2]}</td></tr>`).join('')}</tbody></table></div><p class="hinttext">Eficacia de ataque = (kills − errores) / intentos. ${d.config.blockedPointIsError ? 'Bloqueo punto cuenta como error de ataque.' : 'La convención actual excluye bloqueo punto de errores de ataque.'} Bloqueo cubierto continúa sin error. Un bloqueo doble o triple suma un único punto colectivo; cada participante recibe una participación asistida.</p><p class="hinttext">Armados por destino: ${destinations || 'Sin armados registrados'}. Asistencia: armado inmediatamente anterior a un ataque ganador de la misma posesión; si se identifica receptor, debe coincidir con el atacante.</p>
    <details><summary>Ataque por jugador y variante</summary><div class="tablewrap"><table><thead><tr><th>Jugador</th><th>Convencional</th><th>Use / block-out</th><th>Toque / colocada punto</th><th>Sin variante registrada</th><th>Kills totales</th><th>Eficacia general</th></tr></thead><tbody>${players.map(x=>`<tr><td>${escape('#'+x.p.number+' '+x.p.name)}</td><td>${x.conventionalKills}</td><td>${x.useBlockOutKills}</td><td>${x.tipKills}</td><td>${x.unspecifiedKills}</td><td>${x.K}</td><td>${rate(x.eff)}</td></tr>`).join('')}</tbody></table></div><p class="hinttext">Los puntos anteriores sin técnica identificada conservan sus kills e intentos en «Sin variante registrada».</p></details><details style="margin-top:12px"><summary>Asistencias y bloqueos por jugador</summary><div class="tablewrap"><table><thead><tr><th>Jugador</th><th>Asistencias</th><th>Bloqueos individuales</th><th>Participaciones en bloqueo asistido</th><th>Composición desconocida</th></tr></thead><tbody>${players.map(x=>`<tr><td>${escape('#'+x.p.number+' '+x.p.name)}</td><td>${x.assists}</td><td>${x.blkSolo}</td><td>${x.blkAssisted}</td><td>${x.blkUnknown}</td></tr>`).join('')}</tbody></table></div></details>
    <details style="margin-top:12px"><summary>Distribución ofensiva: origen y destino</summary><div class="tablewrap"><table><thead><tr><th>Zona</th><th>Origen propio</th><th>Destino rival</th></tr></thead><tbody>${zoneRows}</tbody></table></div><p class="hinttext">Fase registrada: recepción ${s.attack.phase.reception} · contraataque ${s.attack.phase.counterattack} · sin identificar ${s.attack.phase.unknown}. No se inventan zonas ni fases ausentes.</p></details></div>`;
  }
  root.StatsV2={summarizeEntries:(list,config={})=>summarize(list,{...defaults,...config}),resolveOutcome,participants,rallies,entries,getMatchData,getPlayerStats,renderStatisticsV2,zoneOf,dataQuality,configure:settings=>(configured={...configured,...settings}),defaults:{...defaults}};
  root.renderStatisticsV2=renderStatisticsV2;
})(typeof globalThis !== 'undefined' ? globalThis : window);
