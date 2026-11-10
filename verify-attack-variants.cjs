'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const runtime=require('./test-runtime.cjs');
module.exports=function verifyAttackVariants(){
  const h=runtime(),{run,fresh,action,point,tick}=h,checks=[];
  const check=(name,fn)=>{fn();checks.push(name)};
  for(const mode of ['quick','advanced'])for(const outcome of ['use_block_out','tip_kill','tip_continue']){
    fresh();run(`perform('v2-mode',{dataset:{mode:'${mode}'}})`);
    run("attackType="+JSON.stringify(outcome==='use_block_out'?'use_block_out':'tip'));
    assert.match(run('renderLive(activeMatch())'),new RegExp('data-result="'+outcome+'"'));
    action('attack',outcome);
    check(mode+' '+outcome,()=>{
      const closed=outcome!=='tip_continue';
      assert.equal(run('activeSet().score.us'),closed?1:0);
      assert.equal(run('activeSet().score.them'),0);
      assert.equal(run('activeSet().rallies.length'),closed?1:0);
      assert.equal(run('pending.length'),closed?0:1);
      if(!closed)point('us');
      assert.equal(run('getMatchData(activeMatch()).summary.attack.total'),1);
      assert.equal(run('getMatchData(activeMatch()).summary.attack.kills'),closed?1:0);
      assert.equal(run('getMatchData(activeMatch()).summary.attack.errors'),0);
      assert.equal(run('getMatchData(activeMatch()).summary.block.points'),0);
      assert.equal(run('getRivalBlockStats(activeMatch()).totalPoints'),0);
      assert.equal(run('activeSet().rallies[0].actions[0].outcomeId'),outcome);
    });
  }
  fresh();run('scoutMode="advanced";setRivalBlockers(useBlockerDraft,[{number:"9",name:"Rival nueve"}]);save()');
  const draft=runtime(h.storage.get('volley_scout_avanzado_v1'));
  assert.equal(draft.run('useBlockerDraft.blocker.number'),'9');
  action('attack','use_block_out');
  check('bloqueador opcional persiste y se adjunta antes del cierre',()=>{
    assert.equal(run('activeSet().rallies[0].actions[0].blocker.number'),'9');
    assert.equal(run('activeSet().rallies[0].actions[0].metadata.rivalBlockers.length'),1);
    assert.equal(run('activeSet().rallies[0].actions[0].metadata.attackType'),'use_block_out');
    assert.equal(run('getRivalBlockStats(activeMatch()).totalPoints'),0);
    assert.equal(run('useBlockerDraft.blocker'),undefined);
  });
  run('addScoutAction("use_block_out");finishRally("us")');
  check('doble pulsación sin duplicar y deshacer íntegro',()=>{
    assert.equal(run('activeSet().score.us'),1);
    run('undoRally()');assert.equal(run('activeSet().score.us'),0);
    assert.equal(run('pending[0].blocker.number'),'9');
    assert.equal(run('getMatchData(activeMatch()).summary.attack.total'),0);
  });
  run('autoClosePoints=false;perform("v2-edit",{dataset:{index:"0"}})');tick();run('addScoutAction("tip_continue")');point('them');
  check('editar use a colocada sigue limpia el bloqueador y kill',()=>{
    assert.equal(run('activeSet().rallies[0].actions[0].metadata.attackType'),'tip');
    assert.equal(run('rivalBlockers(activeSet().rallies[0].actions[0]).length'),0);
    assert.equal(run('getMatchData(activeMatch()).summary.attack.kills'),0);
  });
  fresh();action('attack','kill');tick();action('attack','use_block_out');tick();action('attack','tip_kill');tick();action('attack','tip_continue');action('attack','error');
  check('desglose y eficacia general sin duplicar intentos',()=>{
    const a=run('getMatchData(activeMatch()).summary.attack');
    assert.equal(a.total,5);assert.equal(a.kills,3);assert.equal(a.errors,1);
    assert.equal(a.conventionalKills,1);assert.equal(a.useBlockOutKills,1);assert.equal(a.tipKills,1);assert.equal(a.tipContinues,1);
    assert.equal(a.continues,1);assert.equal(a.efficiency,40);
    assert.equal(run('getPlayerStats(activeMatch())[0].K'),3);
    assert.match(run('renderStats(activeMatch())'),/Puntos convencionales 1/);
  });
  h.ctx.download=(name,content)=>{h.ctx.csvCaptured=content};run('download=(name,content)=>{globalThis.csvCaptured=content};exportPlayerStats()');
  check('CSV mantiene columnas anteriores y agrega indicadores',()=>{
    assert.match(h.ctx.csvCaptured,/Puntos use block-out/);
    assert.match(h.ctx.csvCaptured,/Puntos toque colocada/);
    assert.equal(h.ctx.csvCaptured.split('\r\n')[0].split(';').length,h.ctx.csvCaptured.split('\r\n')[1].split(';').length);
    run('exportActions()');assert.match(h.ctx.csvCaptured,/use_block_out/);assert.match(h.ctx.csvCaptured,/tip_kill/);
  });
  for(const id of ['use_block_out','tip_kill']){
    fresh();run('activeSet().serve="them"');action('reception','perfect');action('setting','good');action('attack',id);
    check(id+' integra primer ataque y asistencia',()=>{assert.equal(run('getDirectPointStats(activeMatch()).reception'),1);assert.equal(run('getMatchData(activeMatch()).summary.setting.assists'),1)});
  }
  fresh();run('activeSet().serve="them"');action('reception','positive');action('attack','tip_continue');action('setting','good');action('attack','use_block_out');
  check('colocada previa impide primer ataque y no inventa asistencia extra',()=>{
    assert.equal(run('getDirectPointStats(activeMatch()).reception'),0);assert.equal(run('getMatchData(activeMatch()).summary.attack.total'),2);assert.equal(run('getMatchData(activeMatch()).summary.setting.assists'),1);
  });
  fresh();action('attack','tip_continue',{metadata:{freeBall:true}});
  assert.equal(run('pending.length'),0);
  action('attack','tip_kill',{metadata:{attackType:'free_ball'}});assert.equal(run('activeSet().score.us'),0);
  action('defense','positive');point('them');
  check('contacto no ofensivo no se convierte en intento',()=>assert.equal(run('getMatchData(activeMatch()).summary.attack.total'),0));
  fresh();run('autoClosePoints=false');action('attack','use_block_out');point('them');assert.equal(run('activeSet().rallies.length'),0);point('us');
  check('cierre manual respeta ganador e IDs sobreviven JSON',()=>{
    const saved=h.storage.get('volley_scout_avanzado_v1'),restored=runtime(saved);
    assert.equal(restored.run('activeSet().rallies[0].actions[0].outcomeId'),'use_block_out');
    assert.equal(restored.run('getMatchData(activeMatch()).summary.attack.useBlockOutKills'),1);
    assert.equal(restored.run('VolleyData.validateState(state).valid'),true);
  });
  fresh();run('autoClosePoints=false');action('attack','kill');point('us');
  run('activeSet().rallies[0].actions[0]={playerId:activeMatch().players[0].id,skill:"attack",outcome:"Punto",zone:4}');
  const historical=run('JSON.stringify(activeMatch())');const old=run('getMatchData(activeMatch()).summary.attack');
  run('StatsV2.getMatchData(VolleyData.migrateState(state).matches[0])');
  check('histórico sin reinterpretación ni modificación',()=>{
    assert.equal(old.kills,1);assert.equal(old.conventionalKills,0);assert.equal(old.unspecifiedKills,1);assert.equal(old.useBlockOutKills,0);assert.equal(old.tipKills,0);
    assert.equal(run('JSON.stringify(activeMatch())'),historical);
  });
  fresh();action('attack','use_block_out');tick();action('attack','tip_kill');tick();action('attack','tip_continue');point('them');
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'google-apps-script.gs'),'utf8'),ctx);
  ctx.input=JSON.parse(run('JSON.stringify({schemaVersion:2,matches:state.matches})'));
  const prepared=vm.runInContext('preparePayload(input)',ctx);
  check('Apps Script conserva contrato viejo y detalle V2',()=>{
    assert.deepEqual(Array.from(prepared.data.accionesV2,r=>r[10]),['use_block_out','tip_kill','tip_continue']);
    assert.deepEqual(Array.from(prepared.data.acciones,r=>r[15]),['Punto','Punto','Continuidad']);
    assert.equal(prepared.data.bloqueos.length,0);
    assert.equal(prepared.data.ralliesV2.length,3);
  });
  return {passed:checks.length,checks};
};
if(require.main===module)console.log(module.exports());
