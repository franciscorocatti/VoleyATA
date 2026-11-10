const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
module.exports=function verifySequenceStats(){
  let exported;
  const ctx=vm.createContext({
    statSet:'all',esc:s=>String(s??''),pct:(n,d)=>d?Math.round(100*n/d)+'%':'—',
    skills:{reception:{name:'Recepción'},setting:{name:'Armado'},serve:{name:'Saque'},defense:{name:'Defensa'},attack:{name:'Ataque'}},
    pname:(_m,id)=>id,safeFilename:s=>s,toCSV:rows=>rows,download:(name,rows)=>{exported={name,rows}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'sequence-stats.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'formation-stats.js'),'utf8'),ctx);
  const action=(skill,outcome)=>({skill,outcome,playerId:skill==='attack'?'atacante':'otro'});
  const rec=action('reception','Positiva'),set=action('setting','Perfecta'),serve=action('serve','Continuidad'),def=action('defense','Perfecta'),point=action('attack','Punto'),continues=action('attack','Continuidad');
  const rally=(actions,serveBefore='them',winner='us')=>({actions,serveBefore,winner,positions:['1','2','3','4','5','6'],rotation:2,scoreBefore:{us:3,them:4}});
  const classify=r=>{ctx.r=r;return vm.runInContext('directPointSequence(r)',ctx)};
  assert.equal(classify(rally([rec,point])),'reception');
  assert.equal(classify(rally([rec,set,point])),'reception');
  assert.equal(classify(rally([serve,def,set,point],'us')),'serveDefense');
  assert.equal(classify(rally([serve,action('block','Toque'),def,set,point],'us')),'serveDefense');
  assert.equal(classify(rally([rec,continues,def,point])),null);
  assert.equal(classify(rally([serve,def,continues,def,point],'us')),null);
  assert.equal(classify(rally([rec,def,point])),null);
  assert.equal(classify(rally([def,point],'us')),null);
  assert.equal(classify(rally([serve,point],'us')),null);
  assert.equal(classify(rally([serve,action('serve','Ace'),def,point],'us')),null);
  assert.equal(classify(rally([action('reception','Error'),point])),null);
  assert.equal(classify(rally([rec,point,set])),null);
  assert.equal(classify(rally([rec,point],'us')),null);
  assert.equal(classify(rally([serve,def,point],'them')),null);
  assert.equal(classify(rally([rec,point],'them','them')),null);
  assert.equal(classify(rally([])),null);
  assert.equal(classify({winner:'us'}),null);
  const m={team:'Equipo',opponent:'Rival',date:'2026-11-07',players:[],sets:[
    {number:1,rallies:[rally([rec,set,point]),rally([rec,continues,def,point]),rally([serve,def,set,point],'us'),rally([serve],'us','them')]},
    {number:2,rallies:[rally([rec,point]),rally([],'them'),rally([def,point],'us')]}
  ]};
  ctx.m=m;ctx.activeMatch=()=>m;
  const run=s=>vm.runInContext(s,ctx);
  let stats=run('getDirectPointStats(m)');
  assert.equal(stats.reception,2);assert.equal(stats.serveDefense,1);
  assert.equal(stats.won,6);assert.equal(stats.receiving,4);assert.equal(stats.serving,3);
  assert.equal(stats.bySet[0].reception,1);assert.equal(stats.bySet[1].serveDefense,0);
  assert.equal(run('getDirectPointStats(m,"1").reception'),1);
  assert.equal(run('getDirectPointStats(m,"2").serveDefense'),0);
  const grouped=run('getFormationStats(m).groups[0]');
  assert.equal(grouped.receptionPoint,2);assert.equal(grouped.serveDefensePoint,1);
  assert.match(run('renderDirectPointStats(m)'),/Puntos de primer ataque/);
  run('exportDirectPoints()');assert.equal(exported.rows.length,4);
  assert.equal(exported.rows[0].length,12);assert.ok(exported.rows.every(row=>row.length===12));
  ctx.statSet='2';run('exportDirectPoints()');assert.equal(exported.rows.length,2);
  m.sets[1].rallies.shift();assert.equal(run('getDirectPointStats(m).reception'),1);
  ctx.m=JSON.parse(JSON.stringify(m));assert.equal(run('getDirectPointStats(m).serveDefense'),1);
  ctx.m={...m,sets:[]};assert.doesNotMatch(run('renderDirectPointStats(m)'),/NaN|Infinity/);
  return {firstAttackOnly:'OK',bothSequences:'OK',incompleteAndContradictoryRecords:'OK',setFilters:'OK',formationCounters:'OK',undoAndBackup:'OK',csv:'OK'};
};
