'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const runtime=require('./test-runtime.cjs');
module.exports=async function verifyV21(){
  const h=runtime(),{run,fresh,action,point,tick}=h,checks=[];
  const check=(name,fn)=>{fn();checks.push(name)};
  fresh();
  for(const pos of [1,2,3,4,5,6]){
    fresh();run(`selectedPlayerId=activeSet().positions[${pos-1}];originZone=${pos===4?1:4};`);action('attack','kill');
    check('clasificación P'+pos+' independiente de zona física',()=>{assert.equal(run('activeSet().rallies[0].actions[0].attackRole'),[2,3,4].includes(pos)?'front':'back');assert.equal(run('activeSet().rallies[0].actions[0].rotationalPosition'),pos)});
  }
  fresh();run('activeSet().serve="them";selectedPlayerId=activeSet().positions[0]');point('us');action('attack','use_block_out');
  check('rotación P1 pasa a P6 y congela la clasificación',()=>{assert.equal(run('activeSet().rallies[1].actions[0].rotationalPosition'),6);run('activeSet().positions.reverse()');assert.equal(run('getMatchData(activeMatch()).summary.attack.byRole.back.kills'),1)});
  fresh();h.element('sub-out').value=run('activeSet().positions[2]');h.element('sub-in').value=run('activeMatch().players[6].id');run('handleTeamAction("team-substitute");selectedPlayerId=activeMatch().players[6].id');action('attack','tip_kill');
  check('sustituto hereda la posición rotacional, con identidad propia',()=>{assert.equal(run('activeSet().rallies[0].actions[0].attackRole'),'front');assert.equal(run('getPlayerStats(activeMatch())[6].fundamentals.attack.byRole.front.tipKills'),1)});
  fresh();run('activeSet().serve="them";activeMatch().players[7].isLibero=true');h.element('libero-in').value=run('activeMatch().players[7].id');h.element('libero-for').value=run('activeSet().positions[4]');run('handleTeamAction("team-libero-in");selectedPlayerId=activeMatch().players[7].id');action('attack','continue');point('us');
  check('líbero se clasifica por el reemplazo previo, sin confundirlo con central',()=>{assert.equal(run('activeSet().rallies[0].actions[0].rotationalPosition'),5);assert.equal(run('getPlayerStats(activeMatch())[7].fundamentals.attack.byRole.back.attempts'),1);assert.equal(run('getPlayerStats(activeMatch())[4].attack'),0)});
  fresh();run('attackRoleOverride="front"');action('attack','use_block_out');
  check('corrección manual se guarda y no cambia la formación',()=>{assert.equal(run('activeSet().rallies[0].actions[0].attackRole'),'front');assert.equal(run('activeSet().rallies[0].actions[0].metadata.computedAttackRole'),'back');assert.equal(run('activeSet().rallies[0].actions[0].metadata.attackRoleSource'),'manual')});
  fresh();run('attackRoleOverride="unknown"');action('attack','tip_kill');
  check('sin determinar explícito no se rellena con una suposición',()=>assert.equal(run('getMatchData(activeMatch()).summary.attack.byRole.unknown.kills'),1));
  fresh();action('attack','kill');const stored=run('JSON.stringify(activeMatch())');
  run('delete activeSet().rallies[0].actions[0].attackRole;delete activeSet().rallies[0].actions[0].rotationalPosition');
  const historic=run('JSON.stringify(activeMatch())');
  check('histórico con snapshot fiable se calcula sin reescribir',()=>{assert.equal(run('getMatchData(activeMatch()).summary.attack.byRole.back.kills'),1);assert.equal(run('JSON.stringify(activeMatch())'),historic)});
  run('activeSet().rallies[0].before.positions.reverse()');
  check('snapshots históricos contradictorios no inventan clasificación',()=>assert.equal(run('getMatchData(activeMatch()).summary.attack.byRole.unknown.kills'),1));
  run('delete activeSet().rallies[0].before;delete activeSet().rallies[0].positions');
  check('histórico sin snapshot queda desconocido',()=>assert.equal(run('getMatchData(activeMatch()).summary.attack.byRole.unknown.kills'),1));
  fresh();run('selectedPlayerId=activeSet().positions[2]');action('attack','use_block_out');action('attack','tip_kill');action('attack','continue');action('attack','error');
  check('desglose delantero incluye use y colocada una sola vez',()=>{const a=run('getMatchData(activeMatch()).summary.attack.byRole.front');assert.equal(a.attempts,4);assert.equal(a.kills,2);assert.equal(a.errors,1);assert.equal(a.efficiency,25);assert.equal(a.useBlockOut,1);assert.equal(a.tipKills,1)});
  fresh();
  check('informe sin datos, porcentajes indefinidos y sin ranking inventado',()=>{const c=run('CoachReport.compute(activeMatch())');assert.equal(c.data.rs.length,0);assert.equal(c.eligiblePlayers.length,0);assert.equal(c.rotations[0].sideOut,null);assert.doesNotMatch(run('renderCoachReport(activeMatch())'),/NaN|Infinity|undefined/)});
  run('activeSet().serve="them"');run('quickCausePoint("opponent_attack","them")');
  check('informe parcial usa todos los rallies para side-out',()=>{assert.equal(run('CoachReport.compute(activeMatch()).data.recv.length'),1);assert.equal(run('CoachReport.compute(activeMatch()).data.quality.partialSample'),true);assert.match(run('renderCoachReport(activeMatch())'),/Muestra parcial/)});
  fresh();const base=JSON.parse(run('JSON.stringify(activeMatch())'));
  function row(n,rotation,won,setNo=1){const id=base.players[0].id;return {id:'coach-'+setNo+'-'+n,status:'closed',winner:won?'us':'them',serveBefore:'them',rotation,positions:[...base.sets[0].positions],scoreBefore:{us:0,them:0},sequenceComplete:true,mode:'advanced',actions:[{id:'coach-a-'+setNo+'-'+n,playerId:id,participants:[id],skill:'attack',outcomeId:won?'kill':'error',outcome:won?'Punto':'Error',attackRole:'back',rotationalPosition:1,metadata:{attackType:'conventional'}}]}}
  base.sets[0].rallies=Array.from({length:10},(_,i)=>row(i+1,i<5?1:2,i<7));base.sets[0].score={us:7,them:3};
  base.sets.push({...base.sets[0],id:'set-coach-2',number:2,rallies:[row(1,1,true,2)],score:{us:1,them:0}});
  h.ctx.coachFixture=base;
  check('rotaciones comparables, filtros y mínimos de eficacia',()=>{const c=run('CoachReport.compute(coachFixture,"1",{minAttack:5,minRotation:5})');assert.deepEqual(Array.from(c.best),[1]);assert.deepEqual(Array.from(c.worst),[2]);assert.equal(c.rotations[1].efficiency,-20);assert.equal(c.data.rs.length,10);assert.equal(c.sets.length,1);assert.equal(c.eligiblePlayers.length,1);assert.ok(c.notes.length<=5);assert.equal(run('CoachReport.compute(coachFixture,"2").eligiblePlayers.length'),0)});
  check('informe completo muestra muestras y conserva detalle/exportación',()=>{const c=run('CoachReport.compute(coachFixture)');assert.equal(c.data.quality.partialSample,false);assert.match(run('CoachReport.render(coachFixture)'),/data-action="coach-export"/);assert.match(run('CoachReport.render(coachFixture)'),/Sin determinar/);assert.ok(fs.readFileSync(path.join(__dirname,'v21.css'),'utf8').includes('body.coach-print'))});
  for(const cause of ['opponent_attack','opponent_serve','opponent_block','own_error','unknown']){
    fresh();run('activeSet().serve="them"');run(`quickCausePoint('${cause}','them')`);
    check('causa rival '+cause+' sin inventar acción individual',()=>{assert.equal(run('activeSet().score.them'),1);assert.equal(run('activeSet().rallies.length'),1);assert.equal(run('activeSet().rallies[0].cause'),cause);assert.equal(run('getMatchData(activeMatch()).as.length'),0);assert.equal(run('getMatchData(activeMatch()).recv.length'),1);run('undoRally()');assert.equal(run('activeSet().score.them'),0);assert.equal(run('activeSet().serve'),'them')});
  }
  fresh();run('activeSet().serve="them";quickCausePoint("opponent_error","us")');
  check('error rival gana, recupera saque y rota sin kill ficticio',()=>{assert.equal(run('activeSet().score.us'),1);assert.equal(run('activeSet().rotation'),2);assert.equal(run('getMatchData(activeMatch()).kill'),0)});
  fresh();run('autoClosePoints=false');action('attack','blocked_point');run('quickCausePoint("opponent_attack","them")');assert.equal(run('activeSet().rallies.length'),0);run('quickCausePoint("opponent_block","them");quickCausePoint("opponent_block","them")');
  check('terminal compatible usa el mismo rally y protege doble pulsación',()=>{assert.equal(run('activeSet().score.them'),1);assert.equal(run('getMatchData(activeMatch()).summary.attack.errors'),1);assert.equal(run('activeSet().rallies[0].actions.length'),1)});
  fresh();run('autoClosePoints=false');action('attack','kill');run('quickCausePoint("own_error","them")');
  check('ganador incompatible conserva la acción para corregir',()=>{assert.equal(run('pending.length'),1);assert.equal(run('activeSet().rallies.length'),0)});
  fresh();run('quickCausePoint("opponent_attack","them");undoRally()');action('attack','tip_continue');action('attack','tip_kill');
  check('terminal corregida después de deshacer reemplaza causa anterior',()=>{assert.equal(run('activeSet().score.us'),1);assert.equal(run('pending.length'),0);assert.equal(run('activeSet().rallies[0].cause'),null)});
  fresh();run('quickCausePoint("opponent_serve","them")');assert.equal(run('activeSet().rallies.length'),0);run('activeSet().score={us:23,them:24};quickCausePoint("opponent_attack","them")');
  check('servicio validado, cierre del set, informe y restauración completa',()=>{assert.equal(run('activeSet().finished'),true);assert.match(run('renderLive(activeMatch())'),/coach-open/);run('perform("coach-open",{dataset:{}})');assert.equal(run('view'),'stats');assert.equal(run('statSet'),'1');run('undoRally()');assert.equal(run('activeSet().finished'),false);assert.equal(run('activeSet().score.them'),24)});
  fresh();check('PWA bloquea actualización en vivo o con rally abierto',()=>{assert.equal(run('PWA.canUpdate()'),false);run('view="stats"');assert.equal(run('PWA.canUpdate()'),true);action('attack','continue');assert.equal(run('PWA.canUpdate()'),false)});
  run('save()');const reload=runtime(h.storage.get('volley_scout_avanzado_v1'));
  check('borrador, clasificación y datos sobreviven a reapertura',()=>{assert.equal(reload.run('pending.length'),1);assert.equal(reload.run('pending[0].attackRole'),'back');assert.equal(reload.run('VolleyData.validateState(state).valid'),true)});
  fresh();run('attackRoleOverride="front"');action('attack','use_block_out');
  h.ctx.download=(name,content)=>{};run('download=(name,content)=>globalThis.v21Csv=content;exportActions()');
  check('clasificación en CSV y Apps Script sin cambiar contrato',()=>{
    assert.match(h.ctx.v21Csv,/Clasificación atacante/);assert.match(h.ctx.v21Csv,/DELANTERO/);
    const consumer=vm.createContext({input:JSON.parse(run('JSON.stringify({schemaVersion:2,matches:state.matches})'))});vm.runInContext(fs.readFileSync(path.join(__dirname,'google-apps-script.gs'),'utf8'),consumer);
    const result=vm.runInContext('preparePayload(input)',consumer);assert.equal(result.data.accionesV2.length,1);assert.match(result.data.accionesV2[0][22],/"attackRole":"front"/);assert.equal(result.data.bloqueos.length,0);
  });
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.webmanifest'),'utf8'));
  check('manifiesto relativo, íconos y recursos de GitHub Pages',()=>{assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');assert.equal(manifest.name,'Volley Scout');for(const icon of manifest.icons){const png=fs.readFileSync(path.join(__dirname,icon.src));assert.equal(png.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(png.readUInt32BE(20),Number(icon.sizes.split('x')[1]))}assert.equal(fs.readFileSync(path.join(__dirname,'apple-touch-icon.png')).readUInt32BE(16),180)});
  return {passed:checks.length,checks};
};
if(require.main===module)module.exports().then(console.log);
