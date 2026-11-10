'use strict';
function savedTeams() {
  if (!Array.isArray(state.teams)) state.teams = [];
  return state.teams;
}
function validSavedTeam(team) {
  return team && typeof team.id === 'string' && typeof team.name === 'string' && team.name.trim() &&
    Array.isArray(team.players) && team.players.length >= 6 &&
    team.players.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim() && typeof p.number === 'string' && p.number.trim()) &&
    new Set(team.players.map(p=>p.id)).size === team.players.length &&
    new Set(team.players.map(p=>p.number.trim())).size === team.players.length &&
    team.players.filter(p=>!p.isLibero).length >= 6 && team.players.filter(p=>p.isLibero).length <= 2;
}
function storeTeamTemplate(name, players, lineup, preferredId) {
  const templates = savedTeams();
  const existing = templates.find(t=>t.id === preferredId);
  const team = {id:existing?.id || uid(),name:name.trim(),updatedAt:new Date().toISOString(),
    players:players.map(p=>({id:p.id,number:p.number.trim(),name:p.name.trim(),isLibero:!!p.isLibero||playerPosition(p)==='libero',attackPosition:playerPosition(p)})),lineup:[...lineup]};
  if (!validSavedTeam(team)) { toast('Completá el nombre del equipo y de los jugadores, con números distintos, al menos seis regulares y hasta dos líberos.'); return null; }
  const regular = team.players.filter(p=>!p.isLibero);
  const chosen = new Set();
  team.lineup = Array.from({length:6},(_,i)=>{
    let id = team.lineup[i];
    if (!regular.some(p=>p.id === id) || chosen.has(id)) id = regular.find(p=>!chosen.has(p.id)).id;
    chosen.add(id);return id;
  });
  if (existing) templates[templates.indexOf(existing)] = team; else templates.push(team);
  return team;
}
function loadSavedTeam(id) {
  const team = savedTeams().find(t=>t.id === id);
  if (!team || !validSavedTeam(team)) { toast('No se pudo cargar ese equipo.');return; }
  const ids = new Map(team.players.map(p=>[p.id,uid()]));
  setupDraft.team = team.name;setupDraft.receptionScheme=!!team.receptionScheme;
  setupDraft.players = team.players.map(p=>({...p,id:ids.get(p.id)}));
  setupDraft.lineup = (team.lineup || []).map(id=>ids.get(id));
  setupDraft.savedTeamId = team.id;
  setupDraft.rememberTeam = true;
  prepareDraftLineup();
  render();toast('Equipo cargado. Podés agregar o editar jugadores antes de comenzar.');
}
function rememberMatchTeam(match) {
  if (setupDraft.rememberTeam === false) return;
  const team = storeTeamTemplate(match.team,match.players,match.sets[0].initialLineup,setupDraft.savedTeamId);
  if (team){match.savedTeamId = team.id;team.receptionScheme=!!match.receptionScheme;}
}
function savedTeamPanel() {
  const teams = savedTeams();
  return `<div class="card" style="margin-bottom:16px"><h2>Equipos guardados</h2><div class="field"><label for="saved-team">Elegí un equipo para reutilizar su plantel y formación</label><select id="saved-team" data-saved-team><option value="">${teams.length ? 'Seleccioná un equipo' : 'Todavía no hay equipos guardados'}</option>${teams.map(t=>`<option value="${esc(t.id)}" ${t.id === setupDraft.savedTeamId ? 'selected' : ''}>${esc(t.name)} · ${t.players.length} jugadores</option>`).join('')}</select></div>
  <div class="row" style="margin-top:12px"><button class="btn btn-soft" data-action="saved-team-save">${setupDraft.savedTeamId ? 'Actualizar equipo guardado' : 'Guardar este equipo'}</button><button class="btn" data-action="saved-team-new">Preparar otro equipo</button></div>
  <label class="row" style="margin-top:12px"><input type="checkbox" style="width:18px;min-height:18px" data-remember-team ${setupDraft.rememberTeam !== false ? 'checked' : ''}>Guardar también el plantel al crear el partido</label>
  <p class="hinttext">Podés cargar un equipo, editar su plantel abajo y guardarlo para próximos partidos. Los equipos quedan en este navegador y en la copia JSON completa. Cada partido conserva su propia copia del plantel.</p></div>`;
}
function saveCurrentTeamCard(match) {
  return `<div class="card"><h2>Equipo para próximos partidos</h2><p>Guardá este plantel con sus líberos y formación inicial para volver a usarlo. Podés agregar jugadores arriba y actualizar el equipo guardado.</p><button class="btn btn-soft" data-action="saved-team-from-match">${savedTeams().some(t=>t.id === match.savedTeamId) ? 'Actualizar equipo guardado' : 'Guardar equipo actual'}</button><p class="hinttext">Esto conserva el plantel para el futuro sin modificar partidos anteriores.</p></div>`;
}
function handleSavedTeamAction(action) {
  if (!action?.startsWith('saved-team-')) return false;
  if (action === 'saved-team-save') {
    prepareDraftLineup();
    const team = storeTeamTemplate(setupDraft.team,setupDraft.players,setupDraft.lineup,setupDraft.savedTeamId);
    if (team) { team.receptionScheme=!!setupDraft.receptionScheme;setupDraft.savedTeamId=team.id;save();render();toast('Equipo guardado para próximos partidos.'); }
  }
  if (action === 'saved-team-new') {
    const draft = freshSetup();
    setupDraft.team=draft.team;setupDraft.players=draft.players;setupDraft.lineup=[];setupDraft.savedTeamId=null;setupDraft.rememberTeam=true;
    render();
  }
  if (action === 'saved-team-from-match') {
    const match=activeMatch();if (!match) return true;
    const team=storeTeamTemplate(match.team,match.players,match.sets[0].initialLineup || match.sets[0].positions,match.savedTeamId);
    if (team) { team.receptionScheme=!!match.receptionScheme;match.savedTeamId=team.id;save();render();toast('Equipo guardado para próximos partidos.'); }
  }
  return true;
}
document.addEventListener('change',event=>{
  const t=event.target;
  if (t.matches('[data-saved-team]') && t.value) loadSavedTeam(t.value);
  if (t.matches('[data-remember-team]')) setupDraft.rememberTeam=t.checked;
});

function rememberPlayerPosition(match,player){
  const team=savedTeams().find(t=>t.id===match.savedTeamId);if(!team)return;
  const saved=team.players.find(p=>p.number===player.number);if(!saved)return;
  const updated=team.players.map(p=>p===saved?{...p,attackPosition:playerPosition(player),isLibero:!!player.isLibero}:p);
  if(!validSavedTeam({...team,players:updated}))return;
  Object.assign(saved,{attackPosition:playerPosition(player),isLibero:!!player.isLibero});team.updatedAt=new Date().toISOString();
}
