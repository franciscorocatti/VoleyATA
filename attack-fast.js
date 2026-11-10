'use strict';
let attackOriginManual=false;
let attackDirection=null,attackDirectionSkipped=false,attackType='conventional';
const attackPositions={outside:'Punta / Receptor',opposite:'Opuesto',middle:'Central',setter:'Armador',libero:'Líbero'};
function playerPosition(p){
  if(p?.isLibero)return 'libero';
  if(p?.attackPosition==='')return null;
  const aliases={outside:'outside',punta:'outside',receptor:'outside','punta / receptor':'outside','punta/receptor':'outside',opposite:'opposite',opuesto:'opposite',middle:'middle',central:'middle',setter:'setter',armador:'setter',colocador:'setter',libero:'libero'};
  for(const field of ['attackPosition','position','role','puesto','posicion']){const raw=p?.[field];if(typeof raw==='string'){const value=raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(aliases[value])return aliases[value];}}
  return null;
}
function positionOptions(p){const position=playerPosition(p);return '<option value="">Sin registrar</option>'+Object.entries(attackPositions).map(([v,l])=>`<option value="${v}" ${position===v?'selected':''}>${l}</option>`).join('');}
function rosterPositionField(p,attrs){return `<label class="roster-position">Puesto habitual<select ${attrs}>${positionOptions(p)}</select></label>`;}

function attackContext(){const s=activeSet(),modern=typeof flowEnabled==='function'&&flowEnabled(),p=modern?flowPlayer(activeMatch(),selectedPlayerId):playerById(activeMatch(),selectedPlayerId);const computed=VolleyPosition.forPlayer(selectedPlayerId,modern?{positions:VolleyRally.positions(s,activeSide)}:{positions:s?.positions,libero:s?.libero});return {player:p,role:attackRoleOverride==='auto'?computed.role:attackRoleOverride};}
function habitualAttackZones(position,role){return (role==='front'?{outside:[4,2],opposite:[2,4],middle:[3],setter:[2,3]}:role==='back'?{outside:[6,1],opposite:[1]}:{})[position]||[];}
function defaultAttackOrigin(){const c=attackContext();return habitualAttackZones(playerPosition(c.player),c.role)[0]??null;}
function renderAttackControls(){const c=attackContext(),zones=habitualAttackZones(playerPosition(c.player),c.role);if(originZone===null&&!attackOriginManual&&editingActionIndex===null)originZone=zones[0]??null;
return attackRoleControl()+`<small class="attack-position-label">${esc(attackPositions[playerPosition(c.player)]||'Puesto sin registrar')} · del plantel</small><details class="v2-extra"><summary>Corregir puesto habitual</summary><label>Puesto<select data-attack-position>${positionOptions(c.player)}</select></label></details><div class="attack-fast" aria-label="Origen">${zones.map(z=>`<button class="btn ${originZone===z?'btn-primary':''}" data-action="attack-origin" data-zone="${z}" aria-pressed="${originZone===z}">Zona ${z}</button>`).join('')}</div>${!zones.length?renderZoneGrid('origin','Origen del ataque',originZone):''}<strong>Dirección</strong><div class="attack-fast">${['diagonal','paralela','olla','zona1','zona5'].map(d=>`<button class="btn ${attackDirection===d?'btn-primary':''}" data-action="attack-direction" data-direction="${d}" aria-pressed="${attackDirection===d}">${d.toUpperCase()}</button>`).join('')}</div><button class="btn btn-small" data-action="attack-skip">${attackDirectionSkipped?'Dirección omitida':'Sin dirección · calcular con defensa'}</button><div class="attack-fast">${[['conventional','REMATE'],['tip','TOQUE / COLOCADA'],['use_block_out','USE / BLOCK-OUT']].map(([v,l])=>`<button class="btn ${attackType===v?'btn-primary':''}" data-action="attack-type" data-type="${v}" aria-pressed="${attackType===v}">${l}</button>`).join('')}</div>`;
}
function attackOutcomeVisible(out){return attackType==='use_block_out'?out.id==='use_block_out':attackType==='tip'?['tip_kill','tip_continue','error'].includes(out.id):!['use_block_out','tip_kill','tip_continue'].includes(out.id);}
function attackSuggestions(action,index){
  const role=index===-1?attackContext().role:action.attackRole,zone=index===-1?originZone:action.originZone;
  const roles=role==='front'?({4:['Opuesto / Armador rival','Central rival'],2:['Punta rival','Central rival'],3:['Central rival']}[zone]||[]):[];
  const known=rivalBlockers(action),selected=action.metadata?.rivalBlockerRoles||[],unidentified=action.metadata?.rivalBlockerUnidentified===true;
  const positions=zone===4?['opposite','setter','middle']:zone===2?['outside','middle']:zone===3?['middle']:[];
  const players=typeof rivalRoster==='function'?rivalRoster().filter(p=>positions.includes(p.position)):[];
  return `<p class="hinttext">${roles.length?'Sugerencia por zona; confirmá la camiseta para atribuir el bloqueo.':'Identificación opcional.'}</p><div class="attack-fast">${roles.map((name,i)=>`<button class="btn ${selected.includes(name)?'btn-primary':i===0&&!selected.length&&!known.length&&!unidentified?'block-suggested':''}" data-action="attack-blocker" data-index="${index}" data-name="${name}" aria-pressed="${selected.includes(name)}">${name}${i===0&&!selected.length&&!known.length&&!unidentified?' ✓ · sugerencia':''}</button>`).join('')}<button class="btn" data-action="attack-blocker-clear" data-index="${index}">Sin identificar</button></div><div class="attack-fast">${players.map(p=>`<button class="btn ${known.some(b=>b.number===p.number)?'btn-primary':''}" data-action="attack-blocker-player" data-index="${index}" data-id="${esc(p.id)}" aria-pressed="${known.some(b=>b.number===p.number)}">#${esc(p.number)} · ${esc(attackPositions[p.position])}</button>`).join('')}</div>`;
}
function handleAttackFast(action,t){
if(!action?.startsWith('attack-'))return false;
if(action==='attack-direction'){attackDirection=t.dataset.direction;attackDirectionSkipped=false;}
if(action==='attack-skip'){attackDirection=null;attackDirectionSkipped=true;}
if(action==='attack-origin'){originZone=+t.dataset.zone;attackOriginManual=true;resetRivalBlockerSelection(useBlockerDraft);}
if(action==='attack-type')attackType=t.dataset.type;
if(['attack-blocker','attack-blocker-clear','attack-blocker-player'].includes(action)){
  const target=rivalBlockerTarget(+t.dataset.index);if(target){target.metadata ||= {};
    if(action==='attack-blocker-clear'){setRivalBlockers(target,[]);target.metadata.rivalBlockerRoles=[];target.metadata.rivalBlockerUnidentified=true;}
    if(action==='attack-blocker'){const roles=target.metadata.rivalBlockerRoles||[],name=t.dataset.name;target.metadata.rivalBlockerRoles=roles.includes(name)?roles.filter(r=>r!==name):roles.length<3?[...roles,name]:roles;target.metadata.rivalBlockerUnidentified=false;}
    if(action==='attack-blocker-player'){const p=rivalPlayer(activeMatch(),t.dataset.id);if(p){const known=rivalBlockers(target);if(!known.some(b=>b.number===p.number)&&known.length>=3){toast('Elegí hasta tres bloqueadores.');return true;}setRivalBlockers(target,known.some(b=>b.number===p.number)?known.filter(b=>b.number!==p.number):[...known,{number:p.number,name:p.name}]);target.metadata.rivalBlockerUnidentified=false;}}
  }
}
save();render();return true;}
document.addEventListener('change',event=>{const t=event.target;if(t.matches('[data-attack-position]')){const p=attackContext().player;if(p){if(!assignPlayerPosition(p,t.value,activeMatch())){render();return;}attackOriginManual=false;originZone=defaultAttackOrigin();if(typeof flowEnabled==='function'&&flowEnabled())flowOriginSource=originZone?'role-zone':'unknown';resetRivalBlockerSelection(useBlockerDraft);save();render();}}});

function renderDraftPositions(){return '<details class="v2-extra"><summary>Puestos habituales del plantel</summary>'+setupDraft.players.map((p,i)=>`<div><strong>#${esc(p.number)} ${esc(p.name)}</strong>${rosterPositionField(p,`data-roster-position="${i}"`)}</div>`).join('')+'</details>';}
function renderMatchPositions(m){return '<div class="card"><h2>Puestos habituales</h2>'+m.players.map(p=>`<div><strong>#${esc(p.number)} ${esc(p.name)}</strong>${rosterPositionField(p,`data-match-position="${esc(p.id)}"`)}</div>`).join('')+'</div>';}
document.addEventListener('change',event=>{const t=event.target;let p;if(t.matches('[data-roster-position]'))p=setupDraft.players[+t.dataset.rosterPosition];if(t.matches('[data-match-position]'))p=playerById(activeMatch(),t.dataset.matchPosition);if(p){if(!assignPlayerPosition(p,t.value,t.matches('[data-match-position]')?activeMatch():null)){render();return;}if(t.matches('[data-match-position]')){attackOriginManual=false;originZone=selectedSkill==='attack'?defaultAttackOrigin():originZone;save();}render();}});

function resetRivalBlockerSelection(target){setRivalBlockers(target,[]);delete target.metadata.rivalBlockerRoles;delete target.metadata.rivalBlockerUnidentified;}

function assignPlayerPosition(player,value,match=null){
  if(value!==''&&!Object.prototype.hasOwnProperty.call(attackPositions,value))return false;
  if(match?.rivalPlayers?.includes(player)){
    const libero=value==='libero';
    if(!!player.isLibero!==libero){
      if(rivalDesignationUsed(match,player.id)){toast('La designación de líbero rival se conserva una vez que participó o ingresó en formación.');return false;}
      if(libero&&match.rivalPlayers.filter(p=>p!==player&&p.isLibero).length>=2){toast('Hasta dos líberos rivales.');return false;}
    }
    player.position=value;player.isLibero=libero;delete player.attackPosition;if(typeof pending!=='undefined'&&!pending.length)VolleyCourt.sync(match,activeSet());
    return true;
  }
  const players=match?.players||setupDraft.players;
  if(!setLiberoDesignation(player,value==='libero',players,match))return false;
  player.attackPosition=value;
  if(match){rememberPlayerPosition(match,player);if(typeof pending!=='undefined'&&!pending.length)VolleyCourt.sync(match,activeSet());}
  return true;
}
function jerseyStyle(match){return match?.jerseyStyle==='white'?'white':'blue';}
function playerJerseyStyle(match,player){const style=jerseyStyle(match);return player?.isLibero?(style==='blue'?'white':'blue'):style;}
function renderPlayerJersey(match,player){
  const style=playerJerseyStyle(match,player),number=String(player?.number||'?'),label=style==='blue'?'azul con rayas blancas':'blanca con rayas azules';
  return `<span class="jersey kit-shirt kit-${style}" role="img" aria-label="Camiseta ${label}, número ${esc(number)}${player?.isLibero?', líbero':''}"><span class="kit-number ${number.length>2?'kit-number-long':''}" aria-hidden="true">${esc(number)}</span></span>`;
}
function renderJerseyChoices(){const chosen=jerseyStyle(setupDraft);return `<fieldset class="kit-selector"><legend>Camiseta del equipo</legend><div class="kit-options">${[['blue','Azul con rayas blancas'],['white','Blanca con rayas azules']].map(([style,label])=>`<button type="button" class="btn kit-choice ${chosen===style?'kit-choice-selected':''}" data-action="team-kit" data-style="${style}" aria-pressed="${chosen===style}">${renderPlayerJersey({jerseyStyle:style},{number:'7'})}<strong>${label}</strong><span class="kit-libero-preview">Líbero ${renderPlayerJersey({jerseyStyle:style},{number:'5',isLibero:true})}</span></button>`).join('')}</div><small>El líbero lleva automáticamente la combinación contraria.</small></fieldset>`;}
