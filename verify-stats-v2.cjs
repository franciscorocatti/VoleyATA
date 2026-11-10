const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
module.exports=function verifyStatsV2(options={}){
  const listeners={};
  const ctx=vm.createContext({console,document:{addEventListener:(type,fn)=>(listeners[type] ||= []).push(fn)},esc:s=>String(s ?? ''),pname:(_m,id)=>id,statSet:'all',pct:(n,d)=>d ? 100*n/d+'%' : '—',activeSet:()=>({opponentLineup:{current:[{number:'9',name:'Rival 9'},{number:'10',name:'Rival 10'}]}}),render(){}});
  for (const filename of [...(options.withAdapter ? ['data-compat.js'] : []),'stats-v2.js','sequence-stats.js','formation-stats.js','blocker-tracking.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,filename),'utf8'),ctx);
  const run=s=>vm.runInContext(s,ctx),stats=ctx.StatsV2;
  let seq=0;
  const action=(skill,outcomeId,playerId='a',extra={})=>({id:'a'+(++seq),skill,outcomeId,playerId,participants:[playerId],schemaVersion:2,...extra});
  const rally=(actions,serveBefore='them',winner='us',extra={})=>({id:'r'+(++seq),status:'closed',actions,serveBefore,winner,positions:['a','b','c','d','e','f'],rotation:2,sequenceComplete:true,...extra});
  const makeMatch=rs=>({players:['a','b','c','d','e','f','lib'].map((id,i)=>({id,number:String(i+1),name:id})),sets:[{number:1,rallies:rs}]});
  let m=makeMatch([rally([action('serve','ace')],'us')]);
  let data=stats.getMatchData(m);
  assert.equal(data.rs.length,1);assert.equal(data.summary.serve.aces,1);assert.equal(data.breakpoints,1);assert.equal(data.summary.attack.kills,0);
  data=stats.getMatchData(makeMatch([rally([action('serve','error')],'us','them')]));
  assert.equal(data.summary.serve.errors,1);assert.equal(data.breakpoints,0);
  const receiver=action('reception','perfect','b'),setting=action('setting','perfect','c',{metadata:{receiverId:'a',settingTarget:'outside',possessionId:'p1'}}),kill=action('attack','kill','a',{originZone:4,destinationZone:1,metadata:{possessionId:'p1',attackPhase:'reception'}});
  m=makeMatch([rally([receiver,setting,kill])]);data=stats.getMatchData(m);ctx.m=m;
  assert.equal(data.summary.reception.q3,1);assert.equal(data.kill,1);assert.equal(data.assists.length,1);assert.equal(data.summary.setting.assists,1);
  assert.equal(data.summary.attack.origin[4],1);assert.equal(data.summary.attack.destination[1],1);assert.equal(data.summary.attack.phase.reception,1);
  assert.equal(stats.getPlayerStats(m).find(x=>x.p.id==='c').assists,1);
  assert.equal(run('getDirectPointStats(m).reception'),1);
  assert.equal(run('getFormationStats(m).groups[0].sideOut'),1);
  assert.equal(run('getFormationStats(m).groups[0].completeSequences'),1);
  const covered=action('attack','covered_block'),continued=action('attack','continue'),defense=action('defense','positive','lib');
  m=makeMatch([rally([covered,defense,kill])]);data=stats.getMatchData(m);
  assert.equal(data.err,0);assert.equal(data.summary.attack.coveredBlocks,1);assert.equal(data.attacks.length,2);
  m=makeMatch([rally([action('attack','blocked_point')],'them','them')]);
  data=stats.getMatchData(m);assert.equal(data.err,1);assert.equal(data.summary.attack.blockedPoints,1);assert.equal(data.summary.attack.efficiency,-100);
  m.statisticsConfig={blockedPointIsError:false};assert.equal(stats.getMatchData(m).err,0);
  const double=action('block','point','a',{participants:['a','b','b']});
  m=makeMatch([rally([double],'us')]);data=stats.getMatchData(m);
  assert.equal(data.summary.block.points,1);assert.equal(data.summary.block.assistedPoints,1);assert.equal(data.rs.filter(r=>r.winner==='us').length,1);
  let ps=stats.getPlayerStats(m);assert.equal(ps.find(x=>x.p.id==='a').blkAssisted,1);assert.equal(ps.find(x=>x.p.id==='b').blkAssisted,1);assert.equal(ps.find(x=>x.p.id==='a').blkSolo,0);assert.equal(ps.find(x=>x.p.id==='c').blk,0);
  const oldBlock={skill:'block',outcome:'Punto',playerId:'a'};
  data=stats.getMatchData(makeMatch([rally([oldBlock])]));assert.equal(data.summary.block.points,1);assert.equal(data.summary.block.unknownPoints,1);assert.equal(data.summary.block.soloPoints,0);
  m=makeMatch([rally([action('serve','neutral'),defense,setting,kill],'us')]);ctx.m=m;
  assert.equal(run('getDirectPointStats(m).serveDefense'),1);assert.equal(stats.getPlayerStats(m).find(x=>x.p.id==='lib').defPos,1);
  m=makeMatch([rally([],'them','them',{sequenceComplete:false,mode:'quick',cause:'attack_rival'})]);data=stats.getMatchData(m);
  assert.equal(data.as.length,0);assert.equal(data.err,0);assert.equal(data.summary.defense.directErrors,0);assert.equal(data.recv.length,1);assert.equal(data.quality.partialSample,true);assert.equal(data.quality.withActions,0);
  // An uncontrolled block touch, poor reception and limited defense are not errors.
  m=makeMatch([rally([action('block','uncontrolled_touch'),action('reception','poor'),action('defense','limited')],'them','them')]);
  data=stats.getMatchData(m);assert.equal(data.summary.block.faults,0);assert.equal(data.summary.reception.q0,0);assert.equal(data.summary.defense.directErrors,0);
  // A setter only assists the immediately following kill, with a matching receiver and possession.
  const badReceiver={...setting,metadata:{receiverId:'b'}},badPossession={...setting,metadata:{possessionId:'p2'}};
  for (const actions of [[setting,defense,kill],[badReceiver,kill],[badPossession,kill],[setting,continued,kill]]) assert.equal(stats.getMatchData(makeMatch([rally(actions)])).assists.length,0);
  m=makeMatch([rally([setting,kill])]);m.statisticsConfig={assistsEnabled:false};assert.equal(stats.getMatchData(m).assists.length,0);
  // Missing optional zones stay unknown. Legacy attack zone means destination, never origin.
  m=makeMatch([rally([action('attack','kill','a',{zone:2,originZone:null,destinationZone:null})]),rally([{skill:'attack',outcome:'Punto',playerId:'a',zone:5}])]);
  data=stats.getMatchData(m);assert.equal(data.summary.attack.origin.unknown,2);assert.equal(data.summary.attack.destination.unknown,1);assert.equal(data.summary.attack.destination[5],1);
  // Never reinterpret every historical "Bloqueado" as an error.
  const blocked=()=>({skill:'attack',outcome:'Bloqueado',playerId:'a'});
  const oldRallies=[rally([blocked()],'them','them'),rally([blocked(),{skill:'defense',outcome:'Positiva',playerId:'lib'},{skill:'attack',outcome:'Punto',playerId:'a'}]),rally([blocked()])];
  m=makeMatch(oldRallies);const preserved=JSON.stringify(m);data=stats.getMatchData(m);
  assert.equal(data.summary.attack.blockedPoints,1);assert.equal(data.summary.attack.coveredBlocks,1);assert.equal(data.summary.attack.ambiguousBlocks,1);assert.equal(data.err,1);assert.equal(JSON.stringify(m),preserved);
  assert.equal(stats.getPlayerStats(m).find(x=>x.p.id==='a').E,1);
  // Explicit schema-2 fields remain authoritative.
  const explicit=action('attack','covered_block','a',{outcome:'Bloqueado'});assert.equal(stats.getMatchData(makeMatch([rally([explicit],'them','them')])).err,0);
  // The same double rival block has two player participations and one collective point.
  const rival=action('attack','blocked_point','a',{metadata:{rivalBlockers:[{number:'9',name:'Rival 9'},{number:'10',name:'Rival 10'},{number:'9',name:'Rival 9'}]}});
  m=makeMatch([rally([rival],'them','them'),rally([action('attack','covered_block')])]);ctx.m=m;
  let rivalStats=run('getRivalBlockStats(m)');assert.equal(rivalStats.length,2);assert.equal(rivalStats.totalPoints,1);assert.equal(rivalStats.reduce((n,x)=>n+x.points,0),2);assert.equal(rivalStats[0].assistedPoints,1);
  assert.match(run('blockerText(m.sets[0].rallies[0].actions[0])'),/#9.*#10/);
  // Closed rally filters include points with no actions; open drafts never contribute.
  m=makeMatch([rally([],'us'),rally([kill],'them','us',{status:'open'})]);m.sets.push({number:2,rallies:[rally([receiver,setting,kill])]});
  assert.equal(stats.getMatchData(m).rs.length,2);assert.equal(stats.getMatchData(m,'2').kill,1);assert.equal(stats.getMatchData(m,'1').kill,0);assert.equal(stats.getMatchData(m,{set:2}).kill,1);
  const before=stats.getMatchData(m).rs.length;m.sets[1].rallies.pop();assert.equal(stats.getMatchData(m).rs.length,before-1);
  m=makeMatch([rally([action('attack','continue','a',{metadata:{freeBall:true}})])]);assert.equal(stats.getMatchData(m).attacks.length,0);
  // Empty samples and untrusted roster names are safe to render.
  m=makeMatch([]);m.players[0].name='<img src=x onerror=alert(1)>';ctx.m=m;
  assert.doesNotMatch(run('renderStatisticsV2(m)'),/NaN|Infinity|<img src=x/);assert.match(run('renderStatisticsV2(m)'),/&lt;img/);
  // Every documented result is recognized, with a result-specific tally.
  const outcomes={serve:['ace','positive','neutral','error'],reception:['perfect','positive','poor','direct_error'],attack:['kill','continue','covered_block','blocked_point','error'],block:['point','positive_touch','uncontrolled_touch','fault'],defense:['perfect','positive','limited','direct_error'],setting:['perfect','good','forced','direct_error']};
  for(const [skill,ids] of Object.entries(outcomes)) for(const id of ids) assert.equal(stats.resolveOutcome(action(skill,id),null).outcomeId,id);
  return {catalogOutcomes:'OK',attackAndAmbiguousHistory:'OK',assistsAndPossessions:'OK',collectiveAndAssistedBlocks:'OK',liberoIdentity:'OK',partialSampleAndNoInventedErrors:'OK',firstAttackSequences:'OK',setFiltersAndUndo:'OK',optionalZones:'OK',renderEscaping:'OK'};
};
if(require.main === module) console.log(module.exports());
