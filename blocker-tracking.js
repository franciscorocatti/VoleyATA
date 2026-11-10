'use strict';
function isBlockedAttack(action) {
  return action?.side!=='them' && action?.skill === 'attack' && (['covered_block','blocked_point','ambiguous_block'].includes(action.outcomeId) || ['Bloqueado','Bloqueo cubierto','Bloqueo punto'].includes(action.outcome));
}
function isRivalBlockContact(action) {return isBlockedAttack(action)||(action?.skill==='attack'&&action.outcomeId==='use_block_out');}
function rivalBlockerTarget(index) {return index===-1&&typeof useBlockerDraft!=='undefined'?useBlockerDraft:pending[index];}
function rivalBlockers(action) {
  const items=Array.isArray(action?.metadata?.rivalBlockers) ? action.metadata.rivalBlockers : action?.blocker ? [action.blocker] : [];
  const seen=new Set();
  return items.filter(p=>p && (p.number || p.name)).map(p=>({number:String(p.number || ''),name:String(p.name || '')})).filter(p=>{
    const key=p.number || 'name:'+p.name;if (seen.has(key)) return false;seen.add(key);return true;
  });
}
function setRivalBlockers(action,items) {
  action.metadata={...action.metadata,rivalBlockers:items.filter(p=>p && (p.number || p.name)).map(p=>({number:String(p.number || ''),name:String(p.name || '')}))};
  action.blocker=action.metadata.rivalBlockers[0] ? {...action.metadata.rivalBlockers[0]} : null;
}
function blockerText(action) {
  const blockers=rivalBlockers(action);
  return blockers.length ? ' · bloqueo rival '+blockers.map(p=>(p.number ? '#'+p.number : '')+(p.name ? ' '+p.name : '')).join(' + ') : '';
}
function renderRivalBlockerFields(match,action,index) {
  const candidates=[...(typeof rivalRoster==='function'?rivalRoster(match):[]),...(activeSet()?.opponentLineup?.current||[])].filter((p,i,all)=>all.findIndex(x=>x.number===p.number)===i),blockers=rivalBlockers(action),blocker=action.blocker || blockers[0] || {};
  return `<div class="subtle" style="margin-top:12px">${attackSuggestions(action,index)}<h3>${action.outcomeId==='use_block_out'?'Use / block-out':'Ataque bloqueado'} · ${esc(pname(match,action.playerId||selectedPlayerId))}</h3><details class="v2-extra"><summary>Otra camiseta / bloqueo múltiple</summary><p class="hinttext">¿Quién bloqueó del rival? Identificación opcional; hasta tres bloqueadores.</p><div class="row" role="group" aria-label="Bloqueadores rivales">${candidates.filter(p=>p.number).map(p=>`<label class="tag rival-blocker-option" style="display:inline-flex;align-items:center;gap:6px;min-height:44px"><input type="checkbox" style="width:18px;min-height:18px;height:18px;padding:0" data-rival-blocker-choice="${index}" value="${esc(p.number)}" ${blockers.some(b=>b.number === String(p.number)) ? 'checked' : ''}> #${esc(p.number)} ${esc(p.name || '')}</label>`).join('') || '<small>Podés identificar al bloqueador por camiseta o dejarlo sin identificar.</small>'}</div><div class="grid-2" style="margin-top:10px"><div class="field"><label for="blocker-number-${index}">Número rival</label><input id="blocker-number-${index}" maxlength="3" placeholder="N°" data-blocker-field="number" data-blocker-index="${index}" value="${esc(blocker.number || '')}"></div><div class="field"><label for="blocker-name-${index}">Nombre rival (opcional)</label><input id="blocker-name-${index}" maxlength="50" placeholder="Nombre" data-blocker-field="name" data-blocker-index="${index}" value="${esc(blocker.name || '')}"></div></div></details><p class="hinttext">La identificación no suma otro punto. ${action.outcomeId==='use_block_out'?'El use suma un kill nuestro; no suma un bloqueo rival.':action.outcomeId === 'covered_block' ? 'El bloqueo cubierto mantiene la jugada abierta.' : 'Si fue bloqueo punto, el rally lo gana el rival.'}</p></div>`;
}
function renderBlockerPickers(match) {
  return pending.map((action,index)=>index!==awaitingBlockerIndex&&(isBlockedAttack(action)||(action.outcomeId==='use_block_out'&&scoutMode==='advanced')) ? renderRivalBlockerFields(match,action,index) : '').join('');
}
function getRivalBlockStats(match,filter='all') {
  const groups=new Map();let totalPoints=0;
  const rallies=typeof StatsV2 !== 'undefined' ? StatsV2.rallies(match,filter) : rowsFor(match,filter);
  for (const rally of rallies) {
    const action=rally.actions?.at(-1);
    if (rally.winner !== 'them' || !isBlockedAttack(action)) continue;
    const result=typeof StatsV2 !== 'undefined' ? StatsV2.resolveOutcome(action,rally) : typeof VolleyData !== 'undefined' ? VolleyData.getActionResult(action,rally) : {outcomeId:action.outcomeId || 'blocked_point'};
    if (result.outcomeId !== 'blocked_point') continue;
    totalPoints++;
    const known=rivalBlockers(action).filter(b=>b.number||!['Opuesto / Armador rival','Central rival','Punta rival'].includes(b.name)),blockers=known.length ? known : [{number:'',name:''}];
    for (const blocker of blockers) {
      const key=blocker.number || (blocker.name ? 'name:'+blocker.name : '');
      if (!groups.has(key)) groups.set(key,{number:blocker.number,name:blocker.name,points:0,soloPoints:0,assistedPoints:0,attackers:new Map()});
      const group=groups.get(key);if (!group.name && blocker.name) group.name=blocker.name;
      group.points++;
      if (blockers.length>1) group.assistedPoints++; else group.soloPoints++;
      group.attackers.set(action.playerId,(group.attackers.get(action.playerId) || 0)+1);
    }
  }
  const result=[...groups.values()].sort((a,b)=>b.points-a.points||a.number.localeCompare(b.number));
  result.totalPoints=totalPoints;
  return result;
}
function renderRivalBlockStats(match) {
  const groups=getRivalBlockStats(match,statSet);
  return `<div class="card"><h2>Bloqueos rivales que terminaron en punto</h2><p>${groups.totalPoints} puntos colectivos por bloqueo rival.</p><div class="tablewrap"><table><thead><tr><th>Bloqueador rival</th><th>Participaciones</th><th>Individuales</th><th>Asistidas</th><th>Atacantes bloqueados</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${g.number || g.name ? esc((g.number ? '#'+g.number+' ' : '')+g.name) : 'Sin identificar'}</td><td><strong>${g.points}</strong></td><td>${g.soloPoints}</td><td>${g.assistedPoints}</td><td style="white-space:normal;min-width:180px">${[...g.attackers].map(([id,count])=>esc(pname(match,id))+' ('+count+')').join(' · ')}</td></tr>`).join('') || '<tr><td colspan="5">Todavía no hay ataques bloqueados que hayan cerrado con punto rival en este filtro.</td></tr>'}</tbody></table></div><p class="hinttext">Cada bloqueo ganador suma un punto colectivo. En un bloqueo doble o triple se registra una participación asistida por bloqueador, sin multiplicar ese punto. Los bloqueos cubiertos y los históricos ambiguos no se incluyen.</p></div>`;
}
document.addEventListener('change',event=>{
  const t=event.target;
  if (t.matches('[data-rival-blocker-choice]')) {
    const action=rivalBlockerTarget(+t.dataset.rivalBlockerChoice);if (!isRivalBlockContact(action)) return;
    const candidate=rivalRoster().find(p=>String(p.number)===t.value)||activeSet()?.opponentLineup?.current.find(p=>String(p.number) === t.value);if (!candidate) return;
    const blockers=rivalBlockers(action).filter(p=>p.number !== t.value);
    if(t.checked&&blockers.length>=3){toast('Elegí hasta tres bloqueadores.');render();return;}
    if (t.checked) blockers.push({number:String(candidate.number),name:candidate.name || ''});
    setRivalBlockers(action,blockers);if (typeof save === 'function') save();render();
  }
  if (t.matches('[data-blocker-choice]')) {
    const action=rivalBlockerTarget(+t.dataset.blockerChoice);if (!isRivalBlockContact(action)) return;
    const candidate=activeSet()?.opponentLineup?.current.find(p=>String(p.number) === t.value);
    setRivalBlockers(action,candidate ? [candidate] : []);if (typeof save === 'function') save();render();
  }
});
document.addEventListener('input',event=>{
  const t=event.target;if (!t.matches('[data-blocker-field]')) return;
  const action=rivalBlockerTarget(+t.dataset.blockerIndex),field=t.dataset.blockerField;
  if (!isRivalBlockContact(action) || !['number','name'].includes(field)) return;
  const blockers=rivalBlockers(action),primary={...(action.blocker || blockers[0]),[field]:t.value.trim()};
  const others=blockers.slice(action.blocker || blockers.length ? 1 : 0);
  setRivalBlockers(action,[primary,...others]);
  action.blocker=primary;
  if (typeof save === 'function') save();
});
