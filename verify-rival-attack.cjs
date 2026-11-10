'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const runtime=require('./test-runtime.cjs');
module.exports=function verifyRivalAttack(){
  const h=runtime(),{run,fresh,tick,action,point}=h,checks=[];
  const check=(name,fn)=>{fn();checks.push(name)};
  const eq=(code,value)=>assert.deepEqual(JSON.parse(JSON.stringify(run(code))),value);
  const prepare=(position='outside')=>{fresh();run(`upsertRivalPlayer(activeMatch(),{number:'8',position:'${position}'});selectRivalAttacker(rivalRoster()[0].id);rivalDraft.attackRole='front';rivalDraft.originZone=habitualAttackZones('${position}','front')[0]??null;`);};
  const result=(id,direction='diagonal')=>{tick();run(`rivalDraft.direction=${JSON.stringify(direction)};rivalDraft.skipDirection=${!direction};addRivalAttack('${id}')`);};
  prepare();
  check('plantel parcial, puesto obligatorio, nombre opcional y edición conserva ID',()=>{
    eq('rivalRoster().length',1);eq('rivalRoster()[0].name','');eq('rivalDraft.originZone',4);
    assert.ok(run("upsertRivalPlayer(activeMatch(),{number:'8',position:'outside'}).error"));
    assert.ok(run("upsertRivalPlayer(activeMatch(),{number:'9',position:'invalid'}).error"));
    run("globalThis.rivalId=rivalRoster()[0].id;upsertRivalPlayer(activeMatch(),{id:rivalId,number:'18',name:'Rival editado',position:'opposite'})");
    eq('rivalRoster()[0].id',run('rivalId'));eq('rivalRoster()[0].number','18');
  });
  for(const [position,zone] of [['outside',4],['opposite',2],['middle',3],['setter',2],['libero',null]]){
    prepare(position);check('origen sugerido '+position,()=>{eq('rivalDraft.originZone',zone);run("perform('rival-zone',{dataset:{field:'originZone',zone:'6'}})");eq('rivalDraft.originZone',6);});
  }
  for(const direction of ['diagonal','paralela','olla',null]){
    prepare();result('kill',direction);
    check('dirección '+direction+' y cierre único rival',()=>{
      eq('activeSet().score',{us:0,them:1});eq('activeSet().rallies.length',1);eq('activeSet().rallies[0].actions.length',1);
      eq('activeSet().rallies[0].actions[0].metadata.attackDirection',direction);eq('activeSet().rallies[0].actions[0].destinationZone',null);
      eq('activeSet().rallies[0].actions[0].attackRole','front');eq('rivalDraft.direction',null);
      run("addRivalAttack('kill');finishRally('them')");eq('activeSet().score.them',1);
      eq('getMatchData(activeMatch()).summary.attack.total',0);eq('VolleyData.validateState(state).valid',true);
    });
  }
  prepare();run("addRivalAttack('kill')");check('exige dirección o su omisión explícita',()=>eq('activeSet().rallies.length+pending.length',0));
  prepare();result('continue');
  check('defendido mantiene rally abierto y deshacer quita solo la acción',()=>{
    eq('pending.length',1);eq('activeSet().score',{us:0,them:0});eq('rivalDraft.direction',null);
    run("perform('v2-smart-undo',{dataset:{}})");eq('pending.length',0);
  });
  prepare();result('continue');run('selectRivalAttacker(rivalRoster()[0].id)');result('continue','olla');action('attack','kill');
  check('varios ataques rivales dentro del mismo rally',()=>{eq('activeSet().rallies[0].actions.filter(a=>a.skill==="rival_attack").length',2);eq('activeSet().rallies.length',1);eq('attackTrends(activeMatch())[0].total',2);});
  prepare();run("selectedSkill='attack';attackDirection='olla'");action('attack','kill');
  check('tendencias propias aprovechan dirección de Etapa 1',()=>{eq("attackTrends(activeMatch(),{side:'us'})[0].directions.olla.count",1);eq("attackTrends(activeMatch(),{side:'us'})[0].kills",1);eq('attackTrends(activeMatch()).length',0);});
  prepare();run("rivalDraft.attackType='use_block_out';rivalDraft.destinationZone=5");result('kill');
  check('detalles opcionales conservan tipo y zona real',()=>{eq('activeSet().rallies[0].actions[0].metadata.attackType','use_block_out');eq('activeSet().rallies[0].actions[0].destinationZone',5);});
  prepare();result('error');check('error rival da punto propio sin error propio',()=>{eq('activeSet().score',{us:1,them:0});eq('getMatchData(activeMatch()).summary.attack.errors',0);});
  prepare();result('blocked_point');
  check('bloqueo sin identificar cuenta un punto colectivo y ninguno individual',()=>{
    eq('activeSet().score',{us:1,them:0});eq('getMatchData(activeMatch()).summary.block.points',1);
    eq('getPlayerStats(activeMatch()).reduce((n,p)=>n+p.blk,0)',0);
    eq('attackTrends(activeMatch())[0].errors',1);
    run('activeMatch().statisticsConfig={blockedPointIsError:false}');
    // Match config is read by the same StatsV2 entry point used by the report.
    eq('attackTrends(activeMatch())[0].efficiency',0);eq('attackTrends(activeMatch())[0].errors',0);
  });
  prepare();run('rivalDraft.ownBlockers=activeSet().positions.slice(1,3)');result('blocked_point');
  check('bloqueo doble propio conserva participación sin multiplicar puntos',()=>{
    eq('getMatchData(activeMatch()).summary.block.points',1);eq('getMatchData(activeMatch()).summary.block.assistedPoints',1);
    eq('getPlayerStats(activeMatch()).reduce((n,p)=>n+p.blkAssisted,0)',2);
  });
  prepare();run('autoClosePoints=false');action('block','point');result('blocked_point');
  check('bloqueo propio existente se vincula sin duplicación',()=>{
    eq('activeSet().score.us',1);eq('activeSet().rallies[0].actions.length',2);
    eq('getMatchData(activeMatch()).summary.block.points',1);eq('attackTrends(activeMatch())[0].total',1);
    eq('activeSet().rallies[0].actions[0].metadata.linkedOwnBlockActionId',run('activeSet().rallies[0].actions[1].id'));
  });
  prepare();action('attack','continue');result('continue');action('defense','positive');action('attack','kill');
  check('alternancia y múltiples ataques comparten rally, conservan estadísticas propias',()=>{
    eq('activeSet().rallies.length',1);eq('activeSet().rallies[0].actions.map(a=>a.skill)',['attack','rival_attack','defense','attack']);
    eq('getMatchData(activeMatch()).summary.attack.total',2);eq('getMatchData(activeMatch()).summary.attack.kills',1);eq('attackTrends(activeMatch())[0].total',1);
    eq('activeSet().rallies[0].actions.at(-1).metadata.attackPhase','counterattack');
    run('undoRally()');eq('activeSet().score',{us:0,them:0});eq('pending.length',4);eq('attackTrends(activeMatch()).length',0);
  });
  prepare();result('kill');run('undoRally()');
  check('deshacer punto rival restaura secuencia y estadísticas',()=>{eq('activeSet().score.them',0);eq('pending[0].skill','rival_attack');eq('attackTrends(activeMatch()).length',0);run("perform('v2-smart-undo',{dataset:{}})");eq('pending.length',0);});
  prepare();
  for(const direction of ['diagonal','diagonal','paralela','olla',null]){run('selectRivalAttacker(rivalRoster()[0].id)');result(direction==='paralela'?'error':'kill',direction);}
  check('tendencias usan solo dirección conocida, muestran resultados y eficacia vigente',()=>{
    eq('attackTrends(activeMatch())[0].total',5);eq('attackTrends(activeMatch())[0].known',4);eq('attackTrends(activeMatch())[0].missing',1);
    eq('attackTrends(activeMatch())[0].directions.diagonal.percent',50);eq('attackTrends(activeMatch())[0].directions.paralela.errors',1);
    eq('attackTrends(activeMatch())[0].efficiency',60);eq('attackTrends(activeMatch())[0].smallSample',true);
    eq("attackTrends(activeMatch(),{player:'missing'}).length",0);eq("attackTrends(activeMatch(),{zone:'6'}).length",0);
    assert.match(run('renderAttackTrends(activeMatch())'),/TENDENCIAS DE ATAQUE/);
    run("rivalTactics=true");assert.match(run('renderLive(activeMatch())'),/Muestra reducida/);
  });
  run('activeMatch().sets.push({...structuredCloneSafe(activeSet()),id:uid(),number:2,rallies:[],score:{us:0,them:0}})');
  check('filtro set y equipo propio no mezcla ataques',()=>{eq("attackTrends(activeMatch(),{set:'2'}).length",0);eq("attackTrends(activeMatch(),{set:'1'})[0].total",5);eq("attackTrends(activeMatch(),{side:'us'}).length",0);});
  const before=run('JSON.stringify(activeMatch())'),restored=runtime(h.storage.get('volley_scout_avanzado_v1'));
  check('persistencia y migración conservan plantel y acciones',()=>{
    eq('VolleyData.validateState(state).valid',true);assert.equal(restored.run('rivalRoster().length'),1);assert.equal(restored.run('attackTrends(activeMatch())[0].total'),5);
    run('VolleyData.migrateState(state)');eq('JSON.stringify(activeMatch())',before);
    const prepared=run('VolleyData.prepareImport(JSON.parse(JSON.stringify(state)),VolleyData.emptyState())');assert.equal(prepared.ok,true);
  });
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'google-apps-script.gs'),'utf8'),ctx);ctx.input=JSON.parse(run('JSON.stringify({schemaVersion:2,matches:state.matches})'));
  const payload=vm.runInContext('preparePayload(input)',ctx);
  check('Sheets acepta ataques rivales y preserva metadata, zonas y camisetas',()=>{
    assert.equal(payload.data.atacantesRivales.length,1);
    assert.equal(payload.data.accionesV2.filter(r=>r[9]==='rival_attack').length,5);
    assert.equal(payload.data.acciones[0][12],'8');assert.equal(payload.data.acciones[0][14],'Ataque rival');
    assert.equal(JSON.parse(payload.data.accionesV2[0][21]).attackDirection,'diagonal');
  });
  run('download=(name,content)=>{globalThis.csvCaptured=content};exportActions()');
  check('exportación de acciones conserva rivales sin atribuirlos a propios',()=>{assert.match(h.ctx.csvCaptured,/rival_attack/);assert.match(h.ctx.csvCaptured,/diagonal/);});
  prepare();result('continue');
  const open=runtime(h.storage.get('volley_scout_avanzado_v1'));
  check('rally abierto rival se restaura sin sumar puntos',()=>{assert.equal(open.run('pending[0].skill'),'rival_attack');assert.equal(open.run('activeSet().score.them'),0);assert.equal(open.run('VolleyData.validateState(state).valid'),true);});
  return {passed:checks.length,checks};
};
if(require.main===module)console.log(module.exports());
