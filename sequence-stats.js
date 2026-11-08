'use strict';
function sequenceOutcome(action,rally) {
  if (typeof StatsV2 !== 'undefined') return StatsV2.resolveOutcome(action,rally);
  if (typeof VolleyData !== 'undefined') return VolleyData.getActionResult(action,rally);
  const legacy={serve:{Ace:'ace',Error:'error'},reception:{Error:'direct_error'},attack:{Punto:'kill',Error:'error'},block:{Punto:'point',Error:'fault'},defense:{Error:'direct_error'},setting:{Error:'direct_error'}};
  const outcomeId=action.outcomeId || legacy[action.skill]?.[action.outcome] || 'nonterminal';
  return {outcomeId,terminal:['ace','kill','use_block_out','tip_kill','point','error','direct_error','blocked_point','fault'].includes(outcomeId)};
}
// Definición acordada: el primer ataque propio del rally debe terminar en punto.
function directPointSequence(rally) {
  if (rally.winner !== 'us' || !Array.isArray(rally.actions)) return null;
  const actions = rally.actions;
  const attackIndex = actions.findIndex(a => a.skill === 'attack');
  if (attackIndex < 0 || attackIndex !== actions.length-1 || !['kill','use_block_out','tip_kill'].includes(sequenceOutcome(actions[attackIndex],rally).outcomeId)) return null;
  const before = actions.slice(0,attackIndex);
  // No reconstruir una secuencia a partir de acciones que ya habían cerrado el punto.
  if (before.some(a => sequenceOutcome(a,rally).terminal)) return null;
  const reception = before.findIndex(a => a.skill === 'reception');
  if (rally.serveBefore === 'them' && reception >= 0 && !before.some(a => ['defense','serve'].includes(a.skill))) return 'reception';
  const serve = before.findIndex(a => a.skill === 'serve');
  const defense = before.findIndex(a => a.skill === 'defense');
  if (rally.serveBefore === 'us' && serve >= 0 && defense > serve && reception === -1) return 'serveDefense';
  return null;
}
function getDirectPointStats(match, filter = 'all') {
  const result = {reception:0,serveDefense:0,won:0,receiving:0,serving:0,bySet:[],points:[],total:0,withActions:0,complete:0,partialSample:false};
  for (const set of match.sets) {
    if (filter !== 'all' && String(set.number) !== String(filter)) continue;
    const row = {setNo:set.number,reception:0,serveDefense:0,won:0};
    for (const rally of set.rallies) {
      if (rally.status === 'open' || !['us','them'].includes(rally.winner)) continue;
      result.total++;
      if (rally.actions?.length) result.withActions++;
      if ((rally.sequenceComplete ?? rally.metadata?.sequenceComplete ?? rally.dataQuality?.complete) === true) result.complete++;
      if (rally.serveBefore === 'them') result.receiving++;
      if (rally.serveBefore === 'us') result.serving++;
      if (rally.winner === 'us') { result.won++; row.won++; }
      const kind = directPointSequence(rally);
      if (!kind) continue;
      result[kind]++; row[kind]++;
      result.points.push({kind,setNo:set.number,rally,attackerId:rally.actions.at(-1).playerId});
    }
    result.bySet.push(row);
  }
  result.partialSample=result.complete<result.total;
  return result;
}
function renderDirectPointStats(match) {
  const stats = getDirectPointStats(match,statSet);
  const labels = {reception:'Recepción → ataque punto',serveDefense:'Saque → defensa → ataque punto'};
  return `<div class="card"><div class="section-head"><h2>Puntos de primer ataque</h2><button class="btn btn-small no-print" data-action="download-direct-points" ${stats.points.length ? '' : 'disabled'}>↓ CSV secuencias</button></div>
  <div class="grid-2"><div class="subtle"><span class="eyebrow">Recibiendo</span><h3 style="margin-top:8px">${labels.reception}</h3><strong style="font-size:32px">${stats.reception}</strong><p class="hinttext">${stats.reception} de ${stats.receiving} puntos jugados recibiendo (${pct(stats.reception,stats.receiving)}).</p></div><div class="subtle"><span class="eyebrow">Sacando</span><h3 style="margin-top:8px">${labels.serveDefense}</h3><strong style="font-size:32px">${stats.serveDefense}</strong><p class="hinttext">${stats.serveDefense} de ${stats.serving} puntos jugados sacando (${pct(stats.serveDefense,stats.serving)}).</p></div></div>
  <p class="hinttext">Solo cuenta si nuestro primer ataque de la jugada termina en Punto y ganamos el rally. Se permite el armado intermedio y el toque de bloqueo. Si hubo un ataque anterior, no cuenta aunque después ganemos.</p>
  <p class="hinttext">Cargá las acciones en orden. Para la segunda secuencia hay que registrar también el saque y la defensa. Estos contadores dependen de las acciones observadas; no se deducen solo del marcador. ${stats.partialSample ? 'Muestra parcial: '+stats.complete+' de '+stats.total+' rallies tienen secuencia marcada completa; pueden faltar secuencias no cargadas.' : 'Todos los rallies de este filtro tienen secuencia marcada completa.'}</p>
  <div class="tablewrap" style="margin-top:14px"><table><thead><tr><th>Set</th><th>Recepción → ataque punto</th><th>Saque → defensa → ataque punto</th><th>Total de ambos</th><th>Otros puntos ganados</th></tr></thead><tbody>${stats.bySet.map(row=>`<tr><td>Set ${row.setNo}</td><td>${row.reception}</td><td>${row.serveDefense}</td><td><strong>${row.reception+row.serveDefense}</strong></td><td>${row.won-row.reception-row.serveDefense}</td></tr>`).join('') || '<tr><td colspan="5">Sin sets en este filtro.</td></tr>'}</tbody></table></div>
  <p class="hinttext">«Otros puntos ganados» incluye aces, bloqueos, errores rivales, ataques posteriores y puntos sin una secuencia completa registrada.</p>
  <details style="margin-top:14px"><summary style="cursor:pointer">Ver puntos incluidos (${stats.points.length})</summary><div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Set</th><th>Marcador tras el punto</th><th>Rotación</th><th>Secuencia</th><th>Atacante</th><th>Acciones cargadas</th></tr></thead><tbody>${stats.points.map(p=>`<tr><td>${p.setNo}</td><td>${(p.rally.scoreBefore?.us || 0)+1}–${p.rally.scoreBefore?.them || 0}</td><td>R${esc(p.rally.rotation)}</td><td>${labels[p.kind]}</td><td>${esc(pname(match,p.attackerId))}</td><td style="white-space:normal;min-width:260px">${p.rally.actions.map(a=>esc((skills[a.skill]?.name || a.skill)+' · '+a.outcome)).join(' → ')}</td></tr>`).join('') || '<tr><td colspan="6">Todavía no hay puntos con estas secuencias completas.</td></tr>'}</tbody></table></div></details></div>`;
}
function exportDirectPoints() {
  const match = activeMatch();
  if (!match) return;
  const stats = getDirectPointStats(match,statSet);
  const rows = [['Equipo','Rival','Filtro set','Set','ID rally','Hora','Puntos equipo','Puntos rival','Rotación','Secuencia','Atacante','Acciones']];
  for (const p of stats.points) rows.push([match.team,match.opponent,statSet,p.setNo,p.rally.id,p.rally.timestamp,
    (p.rally.scoreBefore?.us || 0)+1,p.rally.scoreBefore?.them || 0,p.rally.rotation,
    p.kind === 'reception' ? 'Recepción → ataque punto' : 'Saque → defensa → ataque punto',pname(match,p.attackerId),
    p.rally.actions.map(a=>(skills[a.skill]?.name || a.skill)+' '+a.outcome).join(' → ')]);
  download('secuencias_'+safeFilename(match.team)+'_'+match.date+'.csv',toCSV(rows),'text/csv;charset=utf-8');
}
