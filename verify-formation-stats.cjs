const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

module.exports = function verifyFormationStats() {
  let exported;
  const ctx = vm.createContext({
    statSet:'all',
    playerById:(m,id)=>m.players.find(p=>p.id===id),
    pct:(n,d)=>d ? Math.round(100*n/d)+'%' : '—',
    esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    safeFilename:s=>s,
    toCSV:rows=>rows,
    download:(name,rows)=>{exported={name,rows}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'sequence-stats.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'formation-stats.js'),'utf8'),ctx);
  const players = ['a','b','c','d','e','f','sub','lib'].map((id,i)=>({id,number:String(i+1),name:id,isLibero:id==='lib'}));
  const regular = ['a','b','c','d','e','f'];
  const rotated = ['b','c','d','e','f','a'];
  const substituted = ['a','sub','c','d','e','f'];
  const rally=(positions,winner,serveBefore,rotation=1,liberoBefore=null)=>({positions,winner,serveBefore,rotation,liberoBefore});
  const m={team:'Equipo',opponent:'Rival',date:'2026-11-07',players,sets:[
    {number:1,rallies:[rally(regular,'us','them'),rally(rotated,'them','us',2),rally(rotated,'us','us',2),rally(regular,'them','them'),rally(substituted,'us','them'),rally(regular,'us','them',1,{playerId:'lib',replacedId:'e'}),rally(regular,'them','them',1,{playerId:'lib',replacedId:'e'})]},
    {number:2,rallies:[rally(rotated,'them','them',1),rally(regular,'us','us'),rally(['a','a','c','d','e','f'],'us','them')]}
  ]};
  ctx.m=m;
  const run=s=>vm.runInContext(s,ctx);
  let report=run('getFormationStats(m)');
  assert.equal(report.groups.length,3);
  assert.equal(report.skipped,1);
  const normal=report.groups.find(g=>g.players.includes('e')&&!g.players.includes('sub'));
  assert.equal(normal.played,6);
  assert.equal(normal.won,3);
  assert.equal(normal.lost,3);
  assert.equal(normal.receiving,3);
  assert.equal(normal.sideOut,1);
  assert.equal(normal.serving,3);
  assert.equal(normal.breakPoint,2);
  // Rotation changes group together, but the detailed rows keep set and position order.
  assert.equal(normal.rotations.size,4);
  assert.equal(report.groups.reduce((n,g)=>n+g.played,0),9);
  const lib=report.groups.find(g=>g.players.includes('lib'));
  assert.equal(lib.played,2);
  assert.equal(lib.players.includes('e'),false);
  assert.equal(report.groups.find(g=>g.players.includes('sub')).played,1);
  let onlySecond=run('getFormationStats(m,"2")');
  assert.equal(onlySecond.groups.length,1);
  assert.equal(onlySecond.groups[0].played,2);
  assert.equal(onlySecond.groups[0].sideOut,0);
  assert.equal(onlySecond.groups[0].receiving,1);
  assert.equal(onlySecond.skipped,1);
  assert.match(run('renderFormationStats(m)'),/Muestra pequeña/);
  assert.match(run('renderFormationStats(m)'),/33%/);
  assert.match(run('renderFormationStats(m)'),/Set 2 · R1 · 0%/);
  // An undo removes that point's contribution without cached counters.
  m.sets[0].rallies.pop();
  assert.equal(run('getFormationStats(m).groups.find(g=>g.players.includes("lib")).played'),1);
  m.sets[0].rallies.pop();
  assert.equal(run('getFormationStats(m).groups.length'),2);
  // Nothing is inferred from current positions or today's libero replacement.
  m.sets[0].positions=['sub','b','c','d','e','f'];
  m.sets[0].libero={playerId:'lib',replacedId:'e'};
  assert.equal(run('getFormationStats(m).groups.length'),2);
  ctx.activeMatch=()=>m;
  run('exportFormationStats()');
  assert.equal(exported.rows[0].length,21);
  assert.ok(exported.rows.every(row=>row.length===21));
  assert.equal(exported.rows.filter(row=>row[4]==='Resumen').length,2);
  assert.equal(exported.rows.filter(row=>row[4]==='Rotación').length,5);
  ctx.statSet='2';run('exportFormationStats()');
  assert.equal(exported.rows.filter(row=>row[4]==='Resumen').length,1);
  const saved=JSON.parse(JSON.stringify(m));
  ctx.m=JSON.parse(JSON.stringify(m));
  assert.equal(run('getFormationStats(m).groups.reduce((n,g)=>n+g.played,0)'),7);
  ctx.m={...saved,sets:[]};
  assert.match(run('renderFormationStats(m)'),/Todavía no hay puntos/);
  assert.doesNotMatch(run('renderFormationStats(m)'),/NaN|Infinity/);
  // Safe rendering of names supplied by the user.
  ctx.m=saved;ctx.statSet='all';saved.players[0].name='<img src=x onerror=alert(1)>';
  assert.doesNotMatch(run('renderFormationStats(m)'),/<img src=x/);
  assert.match(run('renderFormationStats(m)'),/&lt;img/);
  return {grouping:'OK',liberoAndSubstitutions:'OK',sideOutAndBreakPoint:'OK',setAndPositions:'OK',undoAndReload:'OK',csv:'OK',emptyAndEscaping:'OK'};
};
