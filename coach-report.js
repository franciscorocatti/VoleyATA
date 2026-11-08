'use strict';
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
