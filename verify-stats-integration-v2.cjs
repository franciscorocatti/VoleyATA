const assert=require('node:assert/strict');
const runtime=require('./test-runtime.cjs');
module.exports=function verifyStatsIntegrationV2(){
  const h=runtime(),{fresh,run,action,point}=h;
  const player=index=>run(`activeSet().positions[${index}]`);
  const select=index=>run(`selectedPlayerId=activeSet().positions[${index}]`);
  fresh();run('activeSet().serve="them";scoutMode="advanced";sequenceComplete=true');
  const setterId=player(1),attackerId=player(2);
  select(0);action('reception','perfect');select(1);action('setting','good',{metadata:{receiverId:attackerId,settingTarget:'middle'}});select(2);action('attack','kill');
  assert.equal(run('activeSet().rallies.length'),1);
  assert.equal(run('getMatchData(activeMatch()).summary.setting.assists'),1);
  h.ctx.expectedSetter=setterId;assert.equal(run('getPlayerStats(activeMatch()).find(x=>x.p.id===expectedSetter).assists'),1);
  assert.equal(run('getMatchData(activeMatch()).summary.setting.distribution.middle'),1);
  assert.equal(run('getDirectPointStats(activeMatch()).reception'),1);
  assert.equal(run('getMatchData(activeMatch()).quality.complete'),1);
  run('undoRally()');assert.equal(run('getMatchData(activeMatch()).summary.setting.assists'),0);assert.equal(run('getPlayerStats(activeMatch()).find(x=>x.p.id===expectedSetter).assists'),0);
  point('us');assert.equal(run('getMatchData(activeMatch()).summary.setting.assists'),1);
  // An identified receiver that differs from the real attacker cannot create an assist.
  fresh();run('activeSet().serve="them"');action('reception','positive');select(1);action('setting','good',{metadata:{receiverId:player(3)}});select(2);action('attack','kill');
  assert.equal(run('getMatchData(activeMatch()).summary.setting.assists'),0);
  // Setter context must not jump over another action of the rally.
  fresh();action('setting','good');action('defense','positive');action('attack','kill');
  assert.equal(run('getMatchData(activeMatch()).summary.setting.assists'),0);
  // Multiple blockers share one collective point, including after undo/re-close.
  fresh();const second=player(1);action('block','point',{participants:[second]});
  assert.equal(run('getMatchData(activeMatch()).summary.block.points'),1);
  assert.equal(run('getPlayerStats(activeMatch()).reduce((n,x)=>n+x.blkAssisted,0)'),2);
  assert.equal(run('getMatchData(activeMatch()).summary.block.soloPoints'),0);
  run('undoRally()');assert.equal(run('getMatchData(activeMatch()).summary.block.points'),0);point('us');assert.equal(run('getMatchData(activeMatch()).summary.block.points'),1);
  // Covered attacks remain attempts without errors; a later kill is not first-attack success.
  fresh();run('activeSet().serve="them"');action('reception','positive');action('attack','covered_block');action('defense','limited');action('setting','forced');action('attack','kill');
  assert.equal(run('getMatchData(activeMatch()).summary.attack.attempts'),2);
  assert.equal(run('getMatchData(activeMatch()).summary.attack.errors'),0);
  assert.equal(run('getMatchData(activeMatch()).summary.attack.coveredBlocks'),1);
  assert.equal(run('getDirectPointStats(activeMatch()).reception'),0);
  // Explicitly identified free balls are not attack attempts.
  fresh();action('attack','continue',{metadata:{freeBall:true}});action('attack','kill');
  assert.equal(run('getMatchData(activeMatch()).summary.attack.attempts'),1);
  assert.equal(run('getMatchData(activeMatch()).summary.attack.kills'),1);
  // Causal labels remain collective and do not invent an individual error.
  fresh();run('pointCause="own_error"');point('them');
  assert.equal(run('getMatchData(activeMatch()).as.length'),0);
  assert.equal(run('getPlayerStats(activeMatch()).reduce((n,x)=>n+x.E+x.recErr+x.serveErr+x.defErrors+x.blkFaults,0)'),0);
  return {firstAttackAndAssists:'OK',receiverMatching:'OK',immediateSettingOnly:'OK',undoRecalculates:'OK',doubleBlockOneCollectivePoint:'OK',coveredAttackContinues:'OK',freeBallExclusion:'OK',noInventedIndividualError:'OK'};
};
if(require.main===module)console.log(module.exports());
