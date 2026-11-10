'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const runtime=require('./test-runtime.cjs');
module.exports=function(){
  const h=runtime(),{run,fresh,tick,action,point,listeners}=h,checks=[];
  const check=(name,fn)=>{fn();checks.push(name);};
  const eq=(code,value)=>{const actual=run(code);assert.deepEqual(actual===undefined?undefined:JSON.parse(JSON.stringify(actual)),value);};
  const change=(selector,dataset,value)=>{const target={dataset,value,matches:s=>s===selector};for(const fn of listeners.change||[])fn({target});};
  const rival=(position='outside')=>{fresh();run(`upsertRivalPlayer(activeMatch(),{number:'8',position:'${position}'});selectRivalAttacker(rivalRoster()[0].id);rivalDraft.direction='diagonal'`);};
  fresh();
  check('puestos existentes se reconocen sin usar la zona rotacional como puesto',()=>{
    for(const [field,value,expected] of [['position','Punta / Receptor','outside'],['role','Opuesto','opposite'],['puesto','Central','middle'],['posicion','Armador','setter'],['attackPosition','outside','outside']]){
      eq(`playerPosition({${field}:${JSON.stringify(value)}})`,expected);
    }
    eq('playerPosition({position:4})',null);eq('playerPosition({isLibero:true,attackPosition:"outside"})','libero');
  });
  check('creación, equipo guardado y recarga conservan puestos',()=>{
    run("setupDraft=freshSetup();setupDraft.players[0].position='Punta';setupDraft.players[1].attackPosition='opposite';showSetup=true;startMatch()");
    eq('activeMatch().players[0].attackPosition','outside');eq('activeMatch().players[1].attackPosition','opposite');
    eq('savedTeams().at(-1).players[0].attackPosition','outside');
    run('loadSavedTeam(activeMatch().savedTeamId)');eq('setupDraft.players[0].attackPosition','outside');
  });
  fresh();run("selectedPlayerId=activeSet().positions[3];attackContext().player.position='Punta';render()");
  check('puesto conocido se muestra sin selector obligatorio en el flujo principal',()=>{
    eq('defaultAttackOrigin()',4);assert.match(run('renderAttackControls()'),/Punta \/ Receptor · del plantel/);
    assert.match(run('renderAttackControls()'),/<details[^>]*><summary>Corregir puesto habitual/);
  });
  check('corregir puesto en Plantel actualiza el origen siguiente',()=>{
    const id=run('selectedPlayerId');change('[data-match-position]',{matchPosition:id},'opposite');eq('defaultAttackOrigin()',2);
  });
  fresh();run("selectedPlayerId=activeSet().positions[3];attackContext().player.attackPosition='outside';render();perform('v2-zone-clear',{dataset:{kind:'origin'}});attackDirection='olla'");action('attack','kill');
  check('origen sin registrar explícito no se sustituye por una zona ficticia',()=>eq('activeSet().rallies[0].actions[0].originZone',null));
  for(const [position,zone,expected] of [['outside',4,'Opuesto / Armador rival'],['opposite',2,'Punta rival'],['middle',3,'Central rival']]){
    fresh();run(`selectedPlayerId=activeSet().positions[3];attackContext().player.attackPosition='${position}';render()`);
    check('sugerencia inicial '+position+' no identifica un bloqueador',()=>{
      eq('originZone',zone);const html=run('attackSuggestions(useBlockerDraft,-1)');assert.ok(html.includes(expected));assert.match(html,/✓ · sugerencia/);eq('rivalBlockers(useBlockerDraft).length',0);
      run(`perform('attack-blocker',{dataset:{index:'-1',name:'${expected}'}})`);eq('rivalBlockers(useBlockerDraft).length',0);
      eq('useBlockerDraft.metadata.rivalBlockerRoles.length',1);
    });
  }
  fresh();run("selectedPlayerId=activeSet().positions[3];attackContext().player.attackPosition='outside';render();perform('attack-blocker',{dataset:{index:'-1',name:'Opuesto / Armador rival'}});perform('attack-origin',{dataset:{zone:'2'}})");
  check('cambiar origen actualiza sugerencias y limpia confirmaciones anteriores',()=>{
    eq('useBlockerDraft.metadata.rivalBlockerRoles',undefined);assert.match(run('attackSuggestions(useBlockerDraft,-1)'),/Punta rival ✓ · sugerencia/);
  });
  fresh();run("selectedPlayerId=activeSet().positions[3];attackContext().player.attackPosition='outside';upsertRivalPlayer(activeMatch(),{number:'12',position:'opposite'});upsertRivalPlayer(activeMatch(),{number:'3',position:'middle'});render();perform('attack-blocker-player',{dataset:{index:'-1',id:rivalRoster()[0].id}});perform('attack-blocker-player',{dataset:{index:'-1',id:rivalRoster()[1].id}});attackDirection='paralela'");action('attack','blocked_point');run("perform('v2-confirm-block',{dataset:{}})");
  check('solo camisetas confirmadas reciben participaciones de bloqueo rival',()=>{
    eq('getRivalBlockStats(activeMatch()).totalPoints',1);eq('getRivalBlockStats(activeMatch()).length',2);eq('getRivalBlockStats(activeMatch()).every(g=>g.assistedPoints===1)',true);
  });
  fresh();run("attackDirection='diagonal'");action('attack','blocked_point');
  check('bloqueo a zaguero cierra sin identificar ni confirmar otra pantalla',()=>{eq('awaitingBlockerIndex',null);eq('activeSet().score.them',1);eq('getRivalBlockStats(activeMatch())[0].number','');});
  rival();
  check('rival desconocido conserva condición y origen sin registrar',()=>{eq('rivalDraft.attackRole','unknown');eq('rivalDraft.originZone',null);assert.equal(run('renderRivalOriginQuick(rivalRoster()[0])'),'');});
  for(const [position,role,zones] of [['outside','front',[4,2]],['opposite','front',[2,4]],['middle','front',[3]],['outside','back',[6,1]],['opposite','back',[1]],['middle','back',[]],['setter','back',[]]]){
    rival(position);change('[data-rival-role]',{},role);
    check('zona rival observada '+position+' '+role,()=>{
      eq('rivalDraft.attackRole',role);eq('rivalDraft.originZone',zones[0]??null);eq(`habitualAttackZones('${position}','${role}')`,zones);
      for(const zone of zones){run(`perform('rival-zone',{dataset:{field:'originZone',zone:'${zone}'}})`);eq('rivalDraft.originZone',zone);}
    });
  }
  for(const zone of [4,2,3]){
    rival();run(`rivalDraft.originZone=${zone};activeMatch().players.find(p=>p.id===activeSet().positions[1]).attackPosition='opposite';activeMatch().players.find(p=>p.id===activeSet().positions[2]).attackPosition='middle';activeMatch().players.find(p=>p.id===activeSet().positions[3]).attackPosition='outside'`);
    check('sugerencias propias por rotación y zona rival '+zone,()=>{
      eq('ownBlockSuggestions(activeMatch()).length',3);eq('ownBlockSuggestions(activeMatch()).filter(p=>p.suggested).length',zone===3?1:2);
      eq('ownBlockSuggestions(activeMatch()).every(p=>VolleyPosition.forPlayer(p.id,{positions:activeSet().positions,libero:activeSet().libero}).role==="front")',true);
      assert.match(run('renderOwnBlockSuggestions(activeMatch())'),/#/);eq('rivalDraft.ownBlockers.length',0);
    });
  }
  rival();run("perform('rival-result',{dataset:{result:'blocked_point'}})");
  check('bloqueo rival abre panel inline sin registrar ni puntuar todavía',()=>{eq('rivalDraft.blockPanel',true);eq('pending.length',0);eq('activeSet().score.us',0);});
  run('ownBlockSuggestions(activeMatch()).forEach(p=>perform("rival-own-blocker",{dataset:{id:p.id}}))');tick();run("perform('rival-block-outcome',{dataset:{result:'covered_block'}})");
  check('bloqueo triple cubierto continúa sin puntos y conserva participantes',()=>{
    eq('pending[0].outcomeId','covered_block');eq('pending[0].metadata.ownBlockers.length',3);eq('activeSet().score',{us:0,them:0});
    action('attack','kill');eq('getMatchData(activeMatch()).summary.block.points',0);eq('getMatchData(activeMatch()).summary.block.positiveTouches',1);
    eq('getPlayerStats(activeMatch()).reduce((n,p)=>n+p.blkTouches,0)',3);eq('attackTrends(activeMatch())[0].continued',1);eq('attackTrends(activeMatch())[0].blockedReceived',1);
  });
  const coveredState=h.storage.get('volley_scout_avanzado_v1');
  check('bloqueo cubierto persiste y es compatible con Sheets',()=>{
    const reopened=runtime(coveredState);assert.equal(reopened.run('getMatchData(activeMatch()).summary.block.positiveTouches'),1);assert.equal(reopened.run('VolleyData.validateState(state).valid'),true);
    const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'google-apps-script.gs'),'utf8'),ctx);ctx.input=JSON.parse(run('JSON.stringify({schemaVersion:2,matches:state.matches})'));
    const prepared=vm.runInContext('preparePayload(input)',ctx);assert.equal(prepared.data.accionesV2[0][10],'covered_block');
  });
  rival();action('block','positive_touch');tick();run("rivalDraft.direction='olla';addRivalAttack('covered_block')");action('attack','kill');
  check('toque de bloqueo ya existente no se duplica',()=>{eq('getMatchData(activeMatch()).summary.block.positiveTouches',1);eq('activeSet().rallies[0].actions.length',3);});
  rival();run('ownBlockSuggestions(activeMatch()).forEach(p=>perform("rival-own-blocker",{dataset:{id:p.id}}))');tick();run("perform('rival-block-outcome',{dataset:{result:'blocked_point'}})");
  check('bloqueo triple ganador suma un punto y tres participaciones asistidas',()=>{
    eq('activeSet().score.us',1);eq('getMatchData(activeMatch()).summary.block.points',1);eq('getPlayerStats(activeMatch()).reduce((n,p)=>n+p.blkAssisted,0)',3);
    run("addRivalAttack('blocked_point');finishRally('us')");eq('activeSet().score.us',1);
    run('undoRally()');eq('activeSet().score.us',0);eq('getMatchData(activeMatch()).summary.block.points',0);eq('pending.length',1);
    run("perform('v2-smart-undo',{dataset:{}})");eq('pending.length',0);
  });
  rival();run("rivalDraft.attackType='use_block_out'");tick();run("addRivalAttack('kill')");
  check('tendencias muestran condición desconocida, origen ausente y use sin inventarlos',()=>{
    eq('attackTrends(activeMatch())[0].byRole',{front:0,back:0,unknown:1});eq('attackTrends(activeMatch())[0].origins.unknown',1);eq('attackTrends(activeMatch())[0].uses',1);
    assert.match(run('renderTrendRows(activeMatch(),{side:"them"})'),/Condición sin registrar: 1/);
  });
  fresh();run("selectedPlayerId=activeSet().positions[3];attackContext().player.attackPosition='outside';attackDirection='olla'");action('attack','use_block_out');
  check('tendencias propias reutilizan condición almacenada y origen real',()=>{eq('attackTrends(activeMatch(),{side:"us"})[0].byRole.front',1);eq('attackTrends(activeMatch(),{side:"us"})[0].origins[4]',1);eq('attackTrends(activeMatch(),{side:"us"})[0].uses',1);});
  fresh();run("selectedPlayerId=activeSet().positions[3];attackContext().player.attackPosition='outside';attackDirection='olla'");action('attack','covered_block');
  check('bloqueo recibido conserva tipo, puesto y dirección del ataque',()=>{eq('pending[0].metadata.attackType','conventional');eq('pending[0].metadata.playerPosition','outside');eq('pending[0].metadata.attackDirection','olla');});
  action('attack','blocked_point');run("perform('v2-confirm-block',{dataset:{}})");
  run("activeSet().rallies[0].actions.at(-1).metadata.rivalBlockers=[{number:'',name:'Central rival'}]");
  const stored=run('JSON.stringify(activeMatch())');
  check('sugerencia histórica sin camiseta no se confunde con identidad confirmada',()=>{eq('getRivalBlockStats(activeMatch()).totalPoints',1);eq('getRivalBlockStats(activeMatch())[0].number','');eq('getRivalBlockStats(activeMatch())[0].name','');eq('JSON.stringify(activeMatch())',stored);});
  return {passed:checks.length,checks};
};
if(require.main===module)console.log(module.exports());
