'use strict';
function blockerText(action) {
  return action.blocker?.number ? ' · bloqueó rival #'+action.blocker.number+(action.blocker.name ? ' '+action.blocker.name : '') : '';
}
function renderBlockerPickers(match) {
  const candidates = activeSet()?.opponentLineup?.current || [];
  return pending.map((action,index) => {
    if (action.skill !== 'attack' || action.outcome !== 'Bloqueado') return '';
    const blocker = action.blocker || {};
    return `<div class="subtle" style="margin-top:12px"><h3>Ataque bloqueado · ${esc(pname(match,action.playerId))}</h3><div class="field"><label for="blocker-choice-${index}">¿Quién bloqueó del rival? (opcional)</label><select id="blocker-choice-${index}" data-blocker-choice="${index}"><option value="">Sin identificar / ingresar manualmente</option>${candidates.map(p=>`<option value="${esc(p.number)}" ${p.number === blocker.number ? 'selected' : ''}>#${esc(p.number)} ${esc(p.name)}</option>`).join('')}</select></div><div class="grid-2" style="margin-top:10px"><div class="field"><label for="blocker-number-${index}">Número rival</label><input id="blocker-number-${index}" maxlength="3" placeholder="N°" data-blocker-field="number" data-blocker-index="${index}" value="${esc(blocker.number || '')}"></div><div class="field"><label for="blocker-name-${index}">Nombre rival (opcional)</label><input id="blocker-name-${index}" maxlength="50" placeholder="Nombre" data-blocker-field="name" data-blocker-index="${index}" value="${esc(blocker.name || '')}"></div></div><p class="hinttext">Si el bloqueo fue punto, cerrá con «Punto rival». Si no conocés al bloqueador, podés dejarlo sin identificar.</p></div>`;
  }).join('');
}
function getRivalBlockStats(match, filter = 'all') {
  const groups = new Map();
  for (const rally of rowsFor(match,filter)) {
    const action = rally.actions?.at(-1);
    if (rally.winner !== 'them' || action?.skill !== 'attack' || action.outcome !== 'Bloqueado') continue;
    const number = action.blocker?.number || '';
    if (!groups.has(number)) groups.set(number,{number,name:action.blocker?.name || '',points:0,attackers:new Map()});
    const group = groups.get(number);
    if (!group.name && action.blocker?.name) group.name = action.blocker.name;
    group.points++;
    group.attackers.set(action.playerId,(group.attackers.get(action.playerId) || 0)+1);
  }
  return [...groups.values()].sort((a,b)=>b.points-a.points||a.number.localeCompare(b.number));
}
function renderRivalBlockStats(match) {
  const groups = getRivalBlockStats(match,statSet);
  return `<div class="card"><h2>Bloqueos rivales que terminaron en punto</h2><div class="tablewrap"><table><thead><tr><th>Bloqueador rival</th><th>Puntos</th><th>Atacantes bloqueados</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${g.number ? esc('#'+g.number+' '+g.name) : 'Sin identificar'}</td><td><strong>${g.points}</strong></td><td style="white-space:normal;min-width:180px">${[...g.attackers].map(([id,count])=>esc(pname(match,id))+' ('+count+')').join(' · ')}</td></tr>`).join('') || '<tr><td colspan="3">Todavía no hay ataques bloqueados que hayan cerrado con punto rival en este filtro.</td></tr>'}</tbody></table></div><p class="hinttext">Se cuenta un punto cuando la última acción es Ataque · Bloqueado y el rally lo gana el rival. El nombre se conserva como se cargó en esa jugada.</p></div>`;
}
document.addEventListener('change', event => {
  const t = event.target;
  if (t.matches('[data-blocker-choice]')) {
    const action = pending[+t.dataset.blockerChoice];
    if (action?.skill !== 'attack' || action.outcome !== 'Bloqueado') return;
    const player = activeSet()?.opponentLineup?.current.find(p=>p.number === t.value);
    action.blocker = player ? {number:player.number,name:player.name || ''} : null;
    render();
  }
});
document.addEventListener('input', event => {
  const t = event.target;
  if (!t.matches('[data-blocker-field]')) return;
  const action = pending[+t.dataset.blockerIndex], field = t.dataset.blockerField;
  if (action?.skill !== 'attack' || action.outcome !== 'Bloqueado' || !['number','name'].includes(field)) return;
  action.blocker = {...action.blocker,[field]:t.value.trim()};
});
