const assert=require('node:assert/strict');
const runtime=require('./test-runtime.cjs');
module.exports=async function verifyEngineV2(){
  const h=runtime(),{run,fresh,action,point,tick}=h,passed=[];
  function ok(name,fn){fn();passed.push(name)}
  fresh();action('serve','ace');
  ok('1 ace: un punto y un saque',()=>{assert.equal(run('activeSet().score.us'),1);assert.equal(run('activeSet().rallies.length'),1);assert.equal(run('getPlayerStats(activeMatch(),"all")[0].aces'),1)});
  // The immediate second tap cannot close a second rally or add another ace.
  run('addScoutAction("ace");finishRally("us")');
  ok('19 doble pulsación protegida',()=>assert.equal(run('activeSet().score.us'),1));
  fresh();action('serve','error');ok('2 error de saque',()=>assert.equal(run('activeSet().score.them'),1));
  fresh();run('activeSet().serve="them"');action('reception','perfect');action('setting','perfect');action('attack','kill');
  ok('3 recepción y primer ataque',()=>{assert.equal(run('activeSet().score.us'),1);assert.equal(run('getDirectPointStats(activeMatch()).reception'),1);assert.equal(run('getMatchData(activeMatch()).summary.setting.assists'),1)});
  fresh();action('attack','covered_block');ok('4 bloqueo cubierto continúa',()=>{assert.equal(run('activeSet().score.us+activeSet().score.them'),0);assert.equal(run('getPlayerStats(activeMatch())[0].E'),0);assert.equal(run('pending[0].destinationZone'),null)});
  action('attack','blocked_point');run('perform("v2-confirm-block",{dataset:{}})');
  ok('5 bloqueo punto rival',()=>{assert.equal(run('activeSet().score.them'),1);assert.equal(run('getPlayerStats(activeMatch())[0].E'),1);assert.equal(run('getPlayerStats(activeMatch())[0].attack'),2)});
  fresh();const other=run('activeSet().positions[1]');action('block','point',{participants:[other]});
  ok('6 bloqueo doble: punto único',()=>{assert.equal(run('activeSet().score.us'),1);assert.equal(run('getMatchData(activeMatch()).summary.block.points'),1);assert.equal(run('getMatchData(activeMatch()).summary.block.assistedPoints'),1)});
  fresh();action('serve','positive');action('defense','positive');action('attack','kill');ok('7 defensa y primer contraataque',()=>assert.equal(run('getDirectPointStats(activeMatch()).serveDefense'),1));
  fresh();point('them');ok('8 punto rival sin error individual',()=>{assert.equal(run('getMatchData(activeMatch()).as.length'),0);assert.equal(run('activeSet().score.them'),1)});
  fresh();run('activeSet().serve="them"');const before=run('JSON.stringify(activeSet().positions)');point('us');
  ok('9 recuperar saque rota',()=>{assert.equal(run('activeSet().rotation'),2);assert.notEqual(run('JSON.stringify(activeSet().positions)'),before)});
  run('undoRally()');ok('15 deshacer restaura rotación',()=>{assert.equal(run('activeSet().rotation'),1);assert.equal(run('JSON.stringify(activeSet().positions)'),before);assert.equal(run('activeSet().serve'),'them')});
  fresh();const serving=run('JSON.stringify(activeSet().positions)');point('us');ok('10 mantener saque sin rotar',()=>assert.equal(run('JSON.stringify(activeSet().positions)'),serving));
  fresh();run('activeSet().score={us:24,them:23}');point('us');ok('11 set 25-23',()=>assert.equal(run('activeSet().finished'),true));
  run('undoRally()');ok('16 deshacer fin de set',()=>{assert.equal(run('activeSet().finished'),false);assert.equal(run('activeSet().score.us'),24)});
  fresh();run('activeSet().score={us:24,them:24}');point('us');ok('12 set 24 iguales continúa',()=>assert.equal(run('activeSet().finished'),false));
  fresh();run('activeSet().number=5;activeSet().score={us:14,them:13}');point('us');ok('13 quinto 15-13',()=>assert.equal(run('activeSet().finished'),true));
  fresh();run('activeSet().number=5;activeSet().score={us:14,them:14}');point('us');ok('14 quinto 14 iguales continúa',()=>assert.equal(run('activeSet().finished'),false));
  fresh();run('activeMatch().players[7].isLibero=true;activeSet().serve="them"');
  h.element('sub-out').value=run('activeSet().positions[2]');h.element('sub-in').value=run('activeMatch().players[6].id');run('handleTeamAction("team-substitute")');
  h.element('libero-in').value=run('activeMatch().players[7].id');h.element('libero-for').value=run('activeSet().positions[4]');run('handleTeamAction("team-libero-in")');
  ok('17 sustitución y líbero',()=>{assert.equal(run('activeSet().changes.filter(c=>c.type==="substitution").length'),1);assert.equal(run('courtPlayers(activeSet())[4]'),run('activeMatch().players[7].id'))});
  fresh();run('activeSet().serve="them"');action('reception','positive');const openId=run('pending[0].id');run('perform("v2-mode",{dataset:{mode:"advanced"}})');action('setting','good');run('perform("v2-mode",{dataset:{mode:"quick"}})');
  ok('18 cambiar modo conserva rally',()=>{assert.equal(run('pending.length'),2);assert.equal(run('pending[0].id'),openId)});
  run('save()');const saved=h.storage.get('volley_scout_avanzado_v1');const restored=runtime(saved);ok('21 export/import y acciones abiertas',()=>{assert.equal(restored.run('pending.length'),2);assert.equal(restored.run('pending[0].id'),openId);assert.equal(restored.run('VolleyData.validateState(state).valid'),true)});
  fresh();h.ctx.navigator.onLine=false;action('attack','kill');await run('sendSheets()');
  ok('22 uso sin conexión',()=>{assert.equal(run('activeSet().score.us'),1);assert.ok(h.storage.get('volley_scout_avanzado_v1'));assert.equal(run('sheetsPhase'),'offline')});
  h.ctx.navigator.onLine=true;h.ctx.fetch=async()=>{throw Error('red')};await run('sendSheets()');assert.equal(run('sheetsPhase'),'error');h.ctx.fetch=async()=>({ok:true,json:async()=>({ok:true,contractVersion:2})});await run('sendSheets()');
  ok('23 fallo y reintento confirmado',()=>assert.equal(run('sheetsPhase'),'confirmed'));
  // Reception error vs merely poor reception and serve ownership.
  fresh();run('activeSet().serve="them"');action('serve','ace');assert.equal(run('pending.length'),0);action('reception','poor');assert.equal(run('activeSet().rallies.length'),0);action('defense','direct_error');assert.equal(run('activeSet().score.them'),1);
  ok('validaciones servicio y recepción mala',()=>assert.equal(run('getMatchData(activeMatch()).summary.reception.q0'),0));
  // Undo after a legitimate substitution requires explicit confirmation.
  fresh();point('us');h.element('sub-out').value=run('activeSet().positions[0]');h.element('sub-in').value=run('activeMatch().players[6].id');run('handleTeamAction("team-substitute")');
  h.ctx.confirm=()=>false;run('undoRally()');assert.equal(run('activeSet().rallies.length'),1);h.ctx.confirm=()=>true;run('undoRally()');
  ok('sustitución posterior requiere confirmar',()=>assert.equal(run('activeSet().rallies.length'),0));
  // Auto-close off keeps terminal action and rejects an incompatible manual winner.
  fresh();run('autoClosePoints=false');action('attack','kill');assert.equal(run('pending.length'),1);point('them');assert.equal(run('activeSet().rallies.length'),0);point('us');
  ok('cierre manual coherente',()=>assert.equal(run('activeSet().score.us'),1));
  return {passed:passed.length,checks:passed};
};
