'use strict';
let attackRoleOverride='auto',quickCausesOpen=false;
function attackRoleControl(){
  const s=activeSet(),computed=VolleyPosition.forPlayer(selectedPlayerId,{positions:s?.positions,libero:s?.libero});
  const role=['front','back','unknown'].includes(attackRoleOverride)?attackRoleOverride:computed.role;
  return `<details class="v21-role-control"><summary><span class="v21-role ${role}">${VolleyPosition.labels[role]}</span><small> · corregir</small></summary><label>Clasificación de este ataque<select data-v21-role><option value="auto" ${attackRoleOverride==='auto'?'selected':''}>Automática${computed.position?' · P'+computed.position:''}</option>${Object.entries(VolleyPosition.labels).map(([value,label])=>`<option value="${value}" ${attackRoleOverride===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="hinttext">La corrección afecta a este ataque; no cambia la formación ni los puntos anteriores.</p></details>`;
}
function renderQuickCausePanel(){
  if(scoutMode!=='quick'||!quickCausesOpen)return '';
  const options=[['opponent_attack',SCOUT_CAUSES.opponent_attack],['opponent_serve','Ace rival'],['opponent_block',SCOUT_CAUSES.opponent_block],['own_error','Error nuestro'],['unknown',SCOUT_CAUSES.unknown]];
  return `<section class="v21-quick-causes" aria-label="Causas rápidas"><div class="row-between"><strong>¿CÓMO NOS HICIERON EL PUNTO?</strong><button class="btn btn-small" data-action="v21-cause-toggle" aria-label="Cerrar causas">×</button></div><div>${options.map(([cause,label])=>`<button class="btn btn-danger" data-action="v21-cause-point" data-cause="${cause}" data-winner="them" ${cause==='opponent_serve'&&activeSet()?.serve!=='them'?'disabled title="Solo cuando recibimos el saque rival"':''}>${esc(label)}</button>`).join('')}<button class="btn btn-soft" data-action="v21-cause-point" data-cause="opponent_error" data-winner="us">Punto nuestro · ${esc(SCOUT_CAUSES.opponent_error)}</button></div><small>La causa es colectiva: no inventa errores individuales.</small></section>`;
}
function quickCausePoint(cause,winner){
  if(!Object.prototype.hasOwnProperty.call(SCOUT_CAUSES,cause)||!['us','them'].includes(winner))return false;
  const terminal=VolleyEngine.terminalCause(pending);
  if(terminal&&terminal.winner!==winner){toast('Hay una acción terminal del otro equipo. Editala o quitála antes de corregir el ganador.');return false;}
  const result=commitScoutRally(winner,{cause,metadata:{causeSource:'quick'}});
  if(result){quickCausesOpen=false;render();}
  return result;
}
function handleScoutV21Action(action,t){
  if(action==='v21-cause-toggle'){quickCausesOpen=!quickCausesOpen;render();return true;}
  if(action==='v21-cause-point'){quickCausePoint(t.dataset.cause,t.dataset.winner);return true;}
  if(action==='coach-export'){exportCoachReport();return true;}
  if(action==='coach-open'){statSet=matchEnded(activeMatch())?'all':String(activeSet().number);view='stats';save();render();document.getElementById('coach-report')?.scrollIntoView?.({block:'start'});return true;}
  return false;
}
document.addEventListener('change',event=>{const t=event.target;if(t.matches('[data-v21-role]')){attackRoleOverride=['front','back','unknown'].includes(t.value)?t.value:'auto';originZone=defaultAttackOrigin();setRivalBlockers(useBlockerDraft,[]);save();render();}});
