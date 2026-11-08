'use strict';
// Cada punto se atribuye a los jugadores presentes antes de jugarlo, no al plantel actual.
function formationPlayers(rally) {
  const positions=rally.positions || rally.formationBefore?.positions;
  if (!Array.isArray(positions) || positions.length !== 6) return null;
  const ids = positions.map(id => rally.liberoBefore?.replacedId === id ? rally.liberoBefore.playerId : id);
  return ids.every(id => typeof id === 'string' && id) && new Set(ids).size === 6 ? ids : null;
}
function formationCounter() {
  return {played:0,won:0,lost:0,receiving:0,sideOut:0,serving:0,breakPoint:0,receptionPoint:0,serveDefensePoint:0,withActions:0,completeSequences:0};
}
function countFormationRally(counter, rally) {
  counter.played++;
  if (rally.actions?.length) counter.withActions++;
  if ((rally.sequenceComplete ?? rally.metadata?.sequenceComplete ?? rally.dataQuality?.complete) === true) counter.completeSequences++;
  const sequence = directPointSequence(rally);
  if (sequence === 'reception') counter.receptionPoint++;
  if (sequence === 'serveDefense') counter.serveDefensePoint++;
  if (rally.winner === 'us') counter.won++; else counter.lost++;
  if (rally.serveBefore === 'them') {
    counter.receiving++;
    if (rally.winner === 'us') counter.sideOut++;
  } else {
    counter.serving++;
    if (rally.winner === 'us') counter.breakPoint++;
  }
}
function getFormationStats(match, filter = 'all') {
  const groups = new Map();
  let skipped = 0;
  for (const set of match.sets) {
    if (filter !== 'all' && String(set.number) !== String(filter)) continue;
    for (const rally of set.rallies) {
      if (rally.status === 'open') continue;
      const players = formationPlayers(rally);
      if (!players || !['us','them'].includes(rally.winner) || !['us','them'].includes(rally.serveBefore)) { skipped++; continue; }
      const key = JSON.stringify([...players].sort());
      if (!groups.has(key)) groups.set(key,{...formationCounter(),key,players:[...players].sort(),sets:new Set(),rotations:new Map()});
      const group = groups.get(key);
      countFormationRally(group,rally);
      group.sets.add(set.number);
      // R1 de dos sets distintos puede tener otro orden; conservamos set y posiciones.
      const rotation=rally.rotationBefore ?? rally.rotation;
      const rotationKey = JSON.stringify([set.number,rotation,players]);
      if (!group.rotations.has(rotationKey)) group.rotations.set(rotationKey,{...formationCounter(),setNo:set.number,rotation,players:[...players]});
      countFormationRally(group.rotations.get(rotationKey),rally);
    }
  }
  return {skipped,groups:[...groups.values()].sort((a,b)=>(b.won-b.lost)-(a.won-a.lost)||b.won-a.won||b.played-a.played||a.key.localeCompare(b.key))};
}
function formationName(match, ids, numbersOnly = false) {
  return ids.map(id => {
    const player = playerById(match,id);
    if (!player) return 'Jugador sin ficha';
    return '#'+player.number+(numbersOnly ? '' : ' '+player.name)+(player.isLibero ? ' (L)' : '');
  }).join(' · ');
}
function signedPoints(n) { return n > 0 ? '+'+n : String(n); }
function formationRate(wins,total) { return `${pct(wins,total)} <small>(${wins}/${total})</small>`; }
function renderFormationStats(match) {
  const {groups,skipped} = getFormationStats(match,statSet);
  const total = groups.reduce((n,g)=>n+g.played,0);
  const complete=groups.reduce((n,g)=>n+g.completeSequences,0);
  const best = groups[0];
  const receiving = groups.flatMap(g => [...g.rotations.values()].map(r => ({...r,group:g}))).filter(r => r.receiving > 0)
    .sort((a,b)=>a.sideOut/a.receiving-b.sideOut/b.receiving||b.receiving-a.receiving||a.setNo-b.setNo||a.rotation-b.rotation);
  const hardest = receiving[0];
  return `<div class="card"><div class="section-head"><div><h2>Rendimiento por formación</h2><small>${groups.length} grupos de seis · ${total} puntos analizados · ${statSet === 'all' ? 'Todos los sets' : 'Set '+esc(statSet)}</small></div><button class="btn btn-small no-print" data-action="download-formations" ${groups.length ? '' : 'disabled'}>↓ CSV formaciones</button></div>
  <p>Comparamos los seis jugadores que estuvieron en cancha en cada punto. Una rotación mantiene el mismo grupo; una sustitución o ingreso de líbero genera otro grupo.</p><p class="hinttext">Side-out y break-point incluyen todos los rallies con formación y servicio conocidos, aunque no tengan acciones. Secuencias de primer ataque: ${complete < total ? 'muestra parcial; ' : ''}${complete} de ${total} rallies marcados como completos.</p>
  ${skipped ? `<p class="errorbox">${skipped} puntos quedaron fuera porque su formación o servicio no están completos en el registro.</p>` : ''}
  ${!groups.length ? '<p class="subtle">Todavía no hay puntos para analizar en este filtro. Cerrá algunos puntos del partido para comparar las formaciones.</p>' : `
  <div class="grid-2" style="margin-bottom:16px"><div class="subtle"><h3>Mayor diferencia de puntos</h3><strong>${signedPoints(best.won-best.lost)} · ${best.won} ganados / ${best.lost} perdidos</strong><p class="hinttext">${esc(formationName(match,best.players))}</p><small>${best.played} puntos observados${best.played < 5 ? ' · muestra pequeña' : ''}</small></div>
  <div class="subtle"><h3>Menor recuperación de saque observada</h3>${hardest ? `<strong>Set ${hardest.setNo} · R${esc(hardest.rotation)} · ${pct(hardest.sideOut,hardest.receiving)}</strong><p class="hinttext">${hardest.sideOut} recuperaciones en ${hardest.receiving} puntos recibiendo${hardest.receiving < 5 ? ' · muestra pequeña' : ''}.</p><small>${esc(formationName(match,hardest.players,true))} (P1 → P6)</small>` : '<p class="hinttext">Aún no hay puntos recibiendo para comparar.</p>'}</div></div>
  <div class="tablewrap"><table><thead><tr><th>Formación · jugadores en cancha</th><th>Sets</th><th>Jugados</th><th>Ganados</th><th>Perdidos</th><th>Diferencia</th><th>% ganados</th><th>Recuperar saque</th><th>Puntos sacando</th><th>Recepción → ataque punto</th><th>Saque → defensa → ataque punto</th></tr></thead><tbody>${groups.map((g,i)=>`<tr><td style="white-space:normal;min-width:230px;max-width:380px"><strong>Formación ${i+1}</strong><br>${esc(formationName(match,g.players))}${g.played < 5 ? '<br><small>Muestra pequeña</small>' : ''}</td><td>${[...g.sets].sort((a,b)=>a-b).join(', ')}</td><td>${g.played}</td><td>${g.won}</td><td>${g.lost}</td><td><strong>${signedPoints(g.won-g.lost)}</strong></td><td>${pct(g.won,g.played)}</td><td>${formationRate(g.sideOut,g.receiving)}</td><td>${formationRate(g.breakPoint,g.serving)}</td><td>${g.receptionPoint}</td><td>${g.serveDefensePoint}</td></tr>`).join('')}</tbody></table></div>
  <p class="hinttext">Ordenadas por diferencia (ganados − perdidos). Recuperar saque = puntos ganados recibiendo ÷ puntos recibiendo. Puntos sacando = puntos ganados sacando ÷ puntos sacando. Los porcentajes muestran la cantidad de oportunidades; pocos puntos no alcanzan para sacar conclusiones.</p>
  <h3 style="margin-top:20px">Rotaciones de cada formación</h3>${groups.map((g,i)=>`<details style="margin-top:10px" class="subtle"><summary style="cursor:pointer"><strong>Formación ${i+1}</strong> · ${g.played} puntos · ver posiciones y recuperación</summary><div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Set</th><th>Rotación</th><th>Jugadores P1 → P6</th><th>Jugados</th><th>Ganados</th><th>Perdidos</th><th>Recuperar saque</th><th>Puntos sacando</th><th>Recepción → ataque punto</th><th>Saque → defensa → ataque punto</th></tr></thead><tbody>${[...g.rotations.values()].sort((a,b)=>a.setNo-b.setNo||a.rotation-b.rotation).map(r=>`<tr><td>${r.setNo}</td><td>R${esc(r.rotation)}</td><td style="white-space:normal;min-width:200px">${esc(formationName(match,r.players,true))}</td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${formationRate(r.sideOut,r.receiving)}</td><td>${formationRate(r.breakPoint,r.serving)}</td><td>${r.receptionPoint}</td><td>${r.serveDefensePoint}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`}
  <p class="hinttext">Se usan las posiciones guardadas antes de cada punto, incluyendo al líbero presente. Las copias antiguas se analizan con la formación que registraron en ese momento.</p></div>`;
}
function exportFormationStats() {
  const match = activeMatch();
  if (!match) return;
  const {groups} = getFormationStats(match,statSet);
  const rows = [['Equipo','Rival','Filtro set','Formación','Tipo fila','Set','Rotación','Jugadores (rotaciones en orden P1 a P6)','Jugados','Ganados','Perdidos','Diferencia','Ganados %','Recibiendo','Saque recuperado','Recuperación %','Sacando','Puntos sacando','Puntos sacando %','Recepción → primer ataque punto','Saque → defensa → primer ataque punto']];
  const rate = (n,d) => d ? (100*n/d).toFixed(1) : '';
  groups.forEach((g,i) => {
    const add = (x,type,set,rotation) => rows.push([match.team,match.opponent,statSet,i+1,type,set,rotation,formationName(match,x.players),x.played,x.won,x.lost,x.won-x.lost,rate(x.won,x.played),x.receiving,x.sideOut,rate(x.sideOut,x.receiving),x.serving,x.breakPoint,rate(x.breakPoint,x.serving),x.receptionPoint,x.serveDefensePoint]);
    add(g,'Resumen',[...g.sets].sort((a,b)=>a-b).join(', '),'');
    [...g.rotations.values()].sort((a,b)=>a.setNo-b.setNo||a.rotation-b.rotation).forEach(r => add(r,'Rotación',r.setNo,r.rotation));
  });
  download('formaciones_'+safeFilename(match.team)+'_'+match.date+'.csv',toCSV(rows),'text/csv;charset=utf-8');
}
