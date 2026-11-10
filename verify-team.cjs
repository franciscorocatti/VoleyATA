const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = function verifyTeam() {
  const read = name => fs.readFileSync(path.join(__dirname,name),'utf8');
  const html = read('index.html');
  const main = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{innerHTML:'',textContent:'',value:'',classList:{remove(){},add(){}}});
    return elements.get(id);
  };
  const listeners = {};
  const storage = new Map();
  const ctx = vm.createContext({
    document:{getElementById:element,addEventListener:(type, fn) => (listeners[type] ||= []).push(fn)},
    window:{addEventListener(){}},navigator:{onLine:true},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    setTimeout:()=>1,clearTimeout(){},confirm:()=>true,prompt:()=> 'N',console
  });
  const run = text => vm.runInContext(text,ctx);
  for(const [,file] of html.matchAll(/<script src="([^"]+)"/g))run(read(file.split('?')[0]));run(main);run('autoClosePoints=false');
  assert.match(element('app').innerHTML,/Formación inicial/);
  run('setupDraft.players[7].isLibero=true; prepareDraftLineup();');
  assert.equal(run('validateDraftFormation()'),true);
  run('setupDraft.players[0].isLibero=true; setupDraft.players[1].isLibero=true');
  assert.equal(run('validateDraftFormation()'),false);
  assert.equal(run("validOpponentFormation(Array.from({length:6},()=>({number:'1',name:''})))"),false);
  run("setupDraft.opponentFormation=Array.from({length:6},(_,i)=>({number:String(i+11),name:'Rival '+(i+1)}));");
  run('setupDraft.players[0].isLibero=false; setupDraft.players[1].isLibero=false;prepareDraftLineup(); startMatch();');
  assert.equal(run('activeMatch().players.filter(p=>p.isLibero).length'),1);
  assert.equal(run('zonePickerOpen'),false);
  run('perform("toggle-zone",{dataset:{}})');
  assert.equal(run('zonePickerOpen'),true);
  assert.match(element('app').innerHTML,/Más detalles/);
  run('perform("select-zone",{dataset:{zone:"6"}})');
  assert.equal(run('selectedZone'),6);
  assert.equal(run('zonePickerOpen'),false);
  assert.match(element('app').innerHTML,/v2-point-dock/);
  assert.equal(run('savedTeams().length'),1);
  assert.equal(run('savedTeams()[0].players.filter(p=>p.isLibero).length'),1);
  const templateId=run('savedTeams()[0].id');
  const firstMatchRoster=run('JSON.stringify(activeMatch().players)');
  ctx.templateId=templateId;
  run('setupDraft=freshSetup();setupDraft.opponent="Otro rival";loadSavedTeam(templateId)');
  assert.equal(run('setupDraft.opponent'),'Otro rival');
  assert.equal(run('setupDraft.players.some(p=>activeMatch().players.some(x=>x.id===p.id))'),false);
  run('setupDraft.players.push({id:uid(),number:"99",name:"Jugador nuevo",isLibero:false});setupDraft.players[0].name="Nombre editado";handleSavedTeamAction("saved-team-save")');
  assert.equal(run('savedTeams().length'),1);
  assert.equal(run('savedTeams()[0].players.length'),9);
  assert.equal(run('JSON.stringify(activeMatch().players)'),firstMatchRoster);
  assert.equal(run('validBackup(JSON.parse(JSON.stringify(state)))'),true);
  assert.equal(run('validBackup({version:1,matches:[],teams:[{id:"invalid"}]})'),false);
  assert.equal(run('validBackup({version:1,matches:[]})'),true);
  const savedCopy=JSON.parse(storage.get('volley_scout_avanzado_v1'));
  assert.equal(savedCopy.teams[0].players.length,9);
  // The rest of the match tests exercise the original isolated roster.
  assert.equal(run('new Set(activeSet().initialLineup).size'),6);
  assert.equal(run('activeSet().positions.some(id=>playerById(activeMatch(),id).isLibero)'),false);
  const opponentInitial = run('JSON.stringify(activeSet().opponentLineup.initial)');
  assert.match(element('app').innerHTML,/Cancha rival/);
  run("activeSet().serve='us';lastPointCommit=0;lastActionTap=0;finishRally('them')");
  assert.equal(run('activeSet().opponentLineup.current[0].number'),'12');
  assert.equal(run('activeSet().opponentLineup.rotation'),2);
  assert.equal(run('JSON.stringify(activeSet().opponentLineup.initial)'),opponentInitial);
  run("lastPointCommit=0;lastActionTap=0;finishRally('them')");
  assert.equal(run('activeSet().opponentLineup.rotation'),2);
  run('undoRally();pending=[];undoRally();pending=[]');
  assert.equal(run('JSON.stringify(activeSet().opponentLineup.current)'),opponentInitial);
  assert.equal(run('activeSet().opponentLineup.rotation'),1);
  const initial = run('JSON.stringify(activeSet().initialLineup)');
  element('sub-out').value = run('activeSet().positions[1]');
  element('sub-in').value = run('activeMatch().players.find(p=>!p.isLibero&&!activeSet().positions.includes(p.id)).id');
  run("handleTeamAction('team-substitute')");
  assert.equal(run('activeSet().changes[0].type'),'substitution');
  assert.equal(run('JSON.stringify(activeSet().initialLineup)'),initial);
  assert.equal(run('activeSet().score.us'),0);
  run("handleTeamAction('team-undo-change')");
  assert.equal(run('JSON.stringify(activeSet().positions)'),initial);
  run("handleTeamAction('team-substitute')");
  run("pending.push({playerId:activeSet().positions[0],skill:'attack',outcome:'Punto',zone:4})");
  run("handleTeamAction('team-undo-change')");
  assert.equal(run('activeSet().changes.length'),1);
  run('pending=[];activeSet().serve="them";');
  element('libero-in').value = run('activeMatch().players.find(p=>p.isLibero).id');
  // A front row replacement must be rejected.
  element('libero-for').value = run('activeSet().positions[2]');
  run("handleTeamAction('team-libero-in')");
  assert.equal(run('!!activeSet().libero'),false);
  element('libero-for').value = run('activeSet().positions[4]');
  run("handleTeamAction('team-libero-in')");
  assert.equal(run('courtPlayers(activeSet())[4]'),element('libero-in').value);
  run("selectedPlayerId=activeSet().libero.playerId; pending=[{playerId:selectedPlayerId,skill:'reception',outcome:'Perfecta',zone:5}];lastPointCommit=0;lastActionTap=0;finishRally('us');");
  assert.equal(run('activeSet().libero'),null);
  assert.equal(run('activeSet().opponentLineup.recordedAtRally'),0);
  assert.equal(run('activeSet().opponentLineup.current.length'),6);
  assert.equal(run('activeSet().changes.at(-1).type'),'libero-auto-out');
  assert.equal(run('getPlayerStats(activeMatch(),"all").find(x=>x.p.isLibero).rec'),1);
  run('undoRally()');
  assert.equal(run('activeSet().score.us'),0);
  assert.equal(run('!!activeSet().libero'),true);
  assert.equal(run('activeSet().changes.at(-1).type'),'libero-in');
  run("lastPointCommit=0;lastActionTap=0;finishRally('them');pending=[];handleTeamAction('team-libero-switch');");
  assert.equal(run('!!activeSet().libero'),true);
  run("handleTeamAction('team-libero-out');");
  assert.equal(run('activeSet().libero'),null);
  run('activeSet().finished=true;activeSet().winner="us";nextSet();');
  assert.equal(run('activeSet().number'),2);
  assert.equal(run('view'),'settings');
  assert.equal(run('activeSet().changes.length'),0);
  assert.equal(run('activeSet().libero'),null);
  // Older backups receive a recovered formation without losing their rallies.
  run('var legacy={positions:[1,2,3,4,5,6],rallies:[{positions:[6,5,4,3,2,1]}]};teamSet(legacy);');
  assert.equal(run('legacy.initialLineupInferred'),true);
  assert.equal(run('legacy.initialLineup[0]'),6);
  assert.equal(run('legacy.rallies.length'),1);
  run('view="settings";render()');
  assert.match(element('app').innerHTML,/Cancha y cambios/);
  assert.match(element('app').innerHTML,/Líberos del equipo/);
  run('view="stats";render()');
  assert.match(element('app').innerHTML,/Rendimiento por formación/);
  run("view='live';lastPointCommit=0;lastActionTap=0;selectedSkill='attack';selectedPlayerId=activeSet().positions[0];perform('add-action',{dataset:{outcome:'Bloqueado'}})");
  assert.match(element('app').innerHTML,/¿Quién bloqueó del rival/);
  const choice = {matches:selector=>selector==='[data-blocker-choice]',dataset:{blockerChoice:'0'},value:run('activeSet().opponentLineup.current[0].number')};
  for (const listener of listeners.change) listener({target:choice});
  assert.equal(run('pending[0].blocker.number'),choice.value);
  const blockerName = run('pending[0].blocker.name');
  run("lastPointCommit=0;lastActionTap=0;finishRally('them')");
  assert.equal(run('getRivalBlockStats(activeMatch(),"all")[0].points'),1);
  assert.equal(run('activeSet().rallies.at(-1).actions[0].blocker.name'),blockerName);
  run('undoRally()');
  assert.equal(run('getRivalBlockStats(activeMatch(),"all").length'),0);
  assert.equal(run('pending[0].blocker.number'),choice.value);
  // Manual identification works even if the rival formation is unavailable.
  const manual = {matches:selector=>selector==='[data-blocker-field]',dataset:{blockerIndex:'0',blockerField:'number'},value:'99'};
  for (const listener of listeners.input) listener({target:manual});
  manual.dataset.blockerField='name';manual.value='Bloqueador manual';
  for (const listener of listeners.input) listener({target:manual});
  run("lastPointCommit=0;lastActionTap=0;finishRally('them');view='stats';render()");
  assert.equal(run('getRivalBlockStats(activeMatch(),"all")[0].number'),'99');
  assert.equal(run('getRivalBlockStats(activeMatch(),"all")[0].name'),'Bloqueador manual');
  assert.equal(run('getRivalBlockStats(activeMatch(),"1").length'),0);
  assert.match(element('app').innerHTML,/Bloqueador manual/);
  const tables = new Map();
  function sheet() { return {rows:[],getLastRow(){return this.rows.length},getMaxRows(){return 1000},setFrozenRows(){},getRange(r,c,n,w){const self=this;return {
    getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>self.rows[r-1+i]?.[c-1+j]??'')),
    setValues(rows){rows.forEach((row,i)=>self.rows[r-1+i]=[...row]);return this},
    clearContent(){self.rows.splice(r-1,n);return this},setBackground(){return this},setFontColor(){return this},setFontWeight(){return this}
  }}}; }
  const book={getSheetByName:n=>tables.get(n),insertSheet(n){const s=sheet();tables.set(n,s);return s}};
  const sc=vm.createContext({
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'x'.repeat(24)})},
    LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},
    SpreadsheetApp:{openById:()=>book,flush(){}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}
  });
  vm.runInContext(read('google-apps-script.gs'),sc);
  sc.input={matches:JSON.parse(run('JSON.stringify(state.matches)'))};
  const result=vm.runInContext('doPost({postData:{contents:JSON.stringify(input)}})',sc);
  assert.equal(result.ok,true,result.error);
  assert.equal(tables.size,11);
  assert.equal(tables.get('Volley Formaciones').rows.length,13);
  assert.equal(tables.get('Volley Liberos').rows.length,2);
  assert.equal(tables.get('Volley Rival').rows.length,13);
  assert.equal(tables.get('Volley Bloqueos').rows.length,2);
  assert.equal(tables.get('Volley Bloqueos').rows[1][6],'99');
  assert.equal(tables.get('Volley Bloqueos').rows[1][8],true);
  const changes=tables.get('Volley Cambios').rows.length;
  vm.runInContext('doPost({postData:{contents:JSON.stringify(input)}})',sc);
  assert.equal(tables.get('Volley Cambios').rows.length,changes);
  assert.equal(tables.get('Volley Rival').rows.length,13);
  return {savedTeamsLoadUpdateAndIsolation:'OK',savedTeamsBackup:'OK',formation:'OK',opponentFormation:'OK',opponentRotationAndUndo:'OK',substitution:'OK',pendingActionGuard:'OK',liberoAndRotation:'OK',undoRally:'OK',newSet:'OK',legacyBackup:'OK',blockerSelectionManualAndUndo:'OK',sheetsElevenTabs:'OK',idempotentSync:'OK'};
};
