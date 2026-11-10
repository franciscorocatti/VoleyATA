'use strict';
const assert=require('node:assert/strict');
const Data=require('./data-compat.js');

function fixture() {
  const players=Array.from({length:8},(_,i)=>({id:'p'+(i+1),number:String(i+1),name:'Jugador '+(i+1),isLibero:i===7,custom:{keep:true}}));
  const positions=players.slice(0,6).map(p=>p.id);
  const rally=(n,winner,actions)=>({id:'r'+n,timestamp:'2026-11-07T20:00:00.000Z',winner,serveBefore:n===1?'them':'us',rotation:1,positions:[...positions],liberoBefore:null,scoreBefore:{us:n-1,them:0},actions});
  return {version:1,activeId:'m1',customState:{name:'Conservar ñ y acentos'},matches:[{
    id:'m1',createdAt:'2026-11-07T20:00:00.000Z',team:'Atalaya',opponent:'NOB',date:'2026-11-07',bestOf:5,players,sets:[{
      id:'s1',number:1,score:{us:2,them:1},serve:'them',startServe:'them',rotation:2,positions:[...positions],initialLineup:[...positions],libero:null,changes:[],finished:false,winner:null,
      rallies:[rally(1,'us',[{playerId:'p2',skill:'reception',outcome:'Perfecta',zone:6},{playerId:'p1',skill:'setting',outcome:'Positiva',zone:3},{playerId:'p4',skill:'attack',outcome:'Punto',zone:1}]),
        rally(2,'us',[{playerId:'p1',skill:'serve',outcome:'Ace',zone:1}]),
        rally(3,'them',[{playerId:'p4',skill:'attack',outcome:'Bloqueado',zone:4,blocker:{number:'12',name:'Rival'}}])]
    }]
  }],teams:[{id:'team1',name:'Atalaya',players:JSON.parse(JSON.stringify(players)),lineup:[...positions],customSaved:'keep'}]};
}
function storageFor(raw) {
  const map=new Map(raw===undefined?[]:[[Data.DEFAULT_KEY,raw]]);
  return {map,get length(){return map.size;},key(i){return [...map.keys()][i]??null;},getItem(k){return map.has(k)?map.get(k):null;},setItem(k,v){map.set(k,String(v));},removeItem(k){map.delete(k);}};
}
function tallies(value) {
  const result={points:{us:0,them:0},kills:0,errors:0,attempts:0,aces:0,ambiguous:0};
  value.matches.forEach(m=>m.sets.forEach(s=>s.rallies.forEach(r=>{
    result.points[r.winner]++;
    r.actions.forEach(a=>{const resolved=Data.getActionResult(a,r);result.kills+=Number(resolved.kill);result.errors+=Number(resolved.attackError);result.attempts+=Number(resolved.attackAttempt);result.aces+=Number(a.skill==='serve'&&resolved.outcomeId==='ace');result.ambiguous+=Number(resolved.ambiguous);});
  })));
  return result;
}
function verify() {
  let count=0;
  const test=(name,fn)=>{fn();count++;console.log('OK '+name);};
  test('validates actual v1 shape and legitimate empty histories',()=>{
    assert.equal(Data.validateState(fixture()).valid,true);
    assert.equal(Data.validateState({version:1,matches:[]}).valid,true);
    const empty=fixture();empty.matches[0].sets[0].rallies=[];empty.matches[0].sets[0].score={us:0,them:0};empty.teams=[];
    assert.equal(Data.validateState(empty).valid,true);
    empty.matches[0].sets=[]; assert.equal(Data.validateState(empty).valid,true);
  });
  test('migration is additive, pure and keeps all IDs, outcomes and snapshots',()=>{
    const original=fixture(),raw=JSON.stringify(original),next=Data.migrateState(original);
    assert.equal(JSON.stringify(original),raw);
    assert.equal(next.version,1);assert.equal(next.schemaVersion,2);
    assert.equal(next.activeId,original.activeId);assert.deepEqual(next.teams,original.teams);assert.deepEqual(next.customState,original.customState);
    const m=next.matches[0],old=original.matches[0];
    assert.equal(m.id,old.id);assert.deepEqual(m.players,old.players);assert.equal(m.sets[0].id,old.sets[0].id);
    for(const prop of ['score','positions','initialLineup','libero','changes','rotation','serve']) assert.deepEqual(m.sets[0][prop],old.sets[0][prop]);
    m.sets[0].rallies.forEach((r,i)=>{
      const was=old.sets[0].rallies[i];assert.equal(r.id,was.id);
      for(const prop of ['winner','scoreBefore','positions','liberoBefore','serveBefore','rotation','timestamp']) assert.deepEqual(r[prop],was[prop]);
      r.actions.forEach((a,ai)=>{for(const key of Object.keys(was.actions[ai]))assert.deepEqual(a[key],was.actions[ai][key]);assert.equal(a.id,r.id+'_a'+(ai+1));assert.equal(a.order,ai+1);assert.equal(a.compat.legacy,true);});
    });
  });
  test('migration is idempotent and preserves existing action IDs without collisions',()=>{
    const old=fixture();old.matches[0].sets[0].rallies[0].actions[1].id='r1_a1';
    const next=Data.migrateState(old);assert.equal(next.matches[0].sets[0].rallies[0].actions[1].id,'r1_a1');
    assert.equal(next.matches[0].sets[0].rallies[0].actions[0].id,'r1_a1_1');
    assert.deepEqual(Data.migrateState(next),next);
  });
  test('registered statistics are equivalent before and after migration',()=>{
    const old=fixture();assert.deepEqual(tallies(Data.migrateState(old)),tallies(old));
    assert.deepEqual(tallies(old),{points:{us:2,them:1},kills:1,errors:1,attempts:2,aces:1,ambiguous:0});
  });
  test('StatsV2 fundamentals, player rates, rotation rates and sample quality survive migration',()=>{
    const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
    const context=vm.createContext({VolleyData:Data});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'stats-v2.js'),'utf8'),context);
    const original=fixture(),set=original.matches[0].sets[0];
    const blocked=()=>({playerId:'p4',skill:'attack',outcome:'Bloqueado',zone:3});
    set.rallies.push({...JSON.parse(JSON.stringify(set.rallies[0])),id:'covered',actions:[blocked(),{playerId:'p8',skill:'defense',outcome:'Positiva',zone:6}]});
    set.rallies.push({...JSON.parse(JSON.stringify(set.rallies[0])),id:'ambiguous',actions:[blocked()]});
    const migrated=Data.migrateState(original),before=context.StatsV2.getMatchData(original.matches[0]),after=context.StatsV2.getMatchData(migrated.matches[0]);
    for(const key of ['summary','quality','rotations','kill','err','sideOut','breakpoints'])assert.deepEqual(after[key],before[key]);
    assert.deepEqual(context.StatsV2.getPlayerStats(migrated.matches[0]),context.StatsV2.getPlayerStats(original.matches[0]));
    assert.equal(after.summary.attack.ambiguousBlocks,1);assert.equal(after.summary.attack.coveredBlocks,1);assert.equal(after.summary.attack.blockedPoints,1);
  });
  test('historical Bloqueado requires evidence and never becomes an automatic error',()=>{
    const action={playerId:'p1',skill:'attack',outcome:'Bloqueado',zone:3};
    const won={winner:'us',actions:[action]};assert.equal(Data.getActionResult(action,won).outcomeId,'ambiguous_block');assert.equal(Data.getActionResult(action,won).attackError,false);assert.equal(Data.getActionResult(action,won).ambiguous,true);
    const lost={winner:'them',actions:[action]};assert.equal(Data.getActionResult(action,lost).outcomeId,'blocked_point');
    const continued={winner:'them',actions:[action,{skill:'defense',playerId:'p2',outcome:'Positiva'}]};assert.equal(Data.getActionResult(action,continued).outcomeId,'covered_block');assert.equal(Data.getActionResult(action,continued).attackError,false);
    assert.equal(Data.getActionResult({...action},lost).outcomeId,'ambiguous_block');
    const withIds={winner:'them',actions:[{...action,id:'a1'}]};assert.equal(Data.getActionResult({...action,id:'a1'},withIds).outcomeId,'blocked_point');
    assert.equal(Data.getActionResult({...action,outcomeId:'covered_block',schemaVersion:2},lost).outcomeId,'covered_block');
    assert.equal(action.outcome,'Bloqueado');
  });
  test('all legacy fundamentals retain their historical labels and adapt consistently',()=>{
    const expected={serve:{Ace:'ace',Positivo:'positive',Continuidad:'neutral',Error:'error'},reception:{Perfecta:'perfect',Positiva:'positive',Negativa:'poor',Error:'direct_error'},attack:{Punto:'kill',Continuidad:'continue',Error:'error'},block:{Punto:'point',Toque:'positive_touch',Error:'fault'},defense:{Perfecta:'perfect',Positiva:'positive',Negativa:'limited',Error:'direct_error'},setting:{Perfecta:'perfect',Positiva:'good',Negativa:'forced',Error:'direct_error'}};
    for(const [skill,labels] of Object.entries(expected))for(const [outcome,outcomeId]of Object.entries(labels)){const action={skill,outcome};assert.equal(Data.getActionResult(action).outcomeId,outcomeId);assert.equal(action.outcome,outcome);}
    assert.equal(Data.getActionResult({skill:'reception',outcome:'Negativa'}).terminal,false);
    assert.equal(Data.getActionResult({skill:'defense',outcome:'Negativa'}).terminal,false);
    assert.equal(Data.getActionResult({skill:'block',outcomeId:'uncontrolled_touch'}).terminal,false);
    assert.equal(Data.getActionResult({skill:'attack',outcome:'Otro'}).ambiguous,true);
    assert.equal(Data.getActionResult({skill:'__proto__',outcome:'Punto'}).outcomeId,'unknown');
  });
  test('startup preserves the original bytes and verifies its backup before migration',()=>{
    const raw=' \n'+JSON.stringify(fixture(),null,3)+'\n',storage=storageFor(raw),loaded=Data.load(storage);
    assert.equal(loaded.ok,true);assert.equal(loaded.readOnly,false);assert.equal(loaded.migrated,true);
    assert.equal(storage.getItem(Data.DEFAULT_KEY),raw);assert.equal(storage.getItem(loaded.backupKey),raw);
    assert.equal(Data.readBackup(storage,loaded.backupKey),raw);assert.equal(Data.listBackups(storage).length,1);
    assert.equal(Data.load(storage).backupKey,loaded.backupKey);assert.equal(Data.listBackups(storage).length,1);
    storage.setItem(Data.DEFAULT_KEY,JSON.stringify(loaded.state));
    const reloaded=Data.load(storage);assert.equal(reloaded.migrated,false);assert.equal(reloaded.backupKey,loaded.backupKey);assert.equal(Data.readBackup(storage,reloaded.backupKey),raw);
    assert.equal(Data.createBackup(storage,Data.DEFAULT_KEY,'different','before-v2'),loaded.backupKey+':1');
    assert.equal(storage.getItem(loaded.backupKey),raw);
    assert.throws(()=>Data.readBackup(storage,Data.DEFAULT_KEY),/copia/);
  });
  test('blocked, full or corrupt storage never overwrites the original',()=>{
    const raw=JSON.stringify(fixture()),storage=storageFor(raw);
    storage.setItem=()=>{throw new Error('QuotaExceededError');};
    const failed=Data.load(storage);assert.equal(failed.readOnly,true);assert.equal(failed.ok,false);assert.equal(storage.getItem(Data.DEFAULT_KEY),raw);assert.deepEqual(failed.state,fixture());
    const denied=Data.load({getItem(){throw new Error('SecurityError');}});assert.equal(denied.readOnly,true);assert.equal(denied.raw,null);
    const corrupt=storageFor('{broken');const invalid=Data.load(corrupt);assert.equal(invalid.readOnly,true);assert.equal(invalid.raw,'{broken');assert.equal(corrupt.getItem(Data.DEFAULT_KEY),'{broken');
    const fake=storageFor(raw);fake.setItem=()=>{};assert.equal(Data.load(fake).readOnly,true);assert.equal(fake.getItem(Data.DEFAULT_KEY),raw);
  });
  test('invalid references, duplicate identities and impossible zones are rejected',()=>{
    for(const mutate of [x=>x.matches[0].players[0].number='2',x=>x.matches[0].sets[0].positions[0]='missing',x=>x.matches[0].sets[0].rallies[0].actions[0].playerId='missing',x=>x.matches[0].sets[0].rallies[0].actions[0].zone=7,x=>x.matches.push(x.matches[0]),x=>x.schemaVersion=99,x=>delete x.matches[0].createdAt]){
      const obj=fixture();mutate(obj);assert.equal(Data.validateState(obj).valid,false);assert.throws(()=>Data.migrateState(obj));
    }
    const unknown=fixture();unknown.matches[0].sets[0].rallies[0].actions[0].outcome='Resultado histórico';assert.equal(Data.validateState(unknown).valid,true);
  });
  test('JSON export/import round trip preserves v2 state and requires replacement confirmation',()=>{
    const original=Data.migrateState(fixture()),exported=JSON.stringify(original),current=fixture(),before=JSON.stringify(current);
    const prepared=Data.prepareImport(JSON.parse(exported),current);assert.equal(prepared.ok,true);assert.equal(prepared.requiresConfirmation,true);assert.deepEqual(prepared.state,original);assert.equal(JSON.stringify(current),before);
    assert.deepEqual(prepared.conflicts,['m1']);assert.equal(prepared.kind,'full');
    assert.equal(Data.prepareImport({version:1,matches:[]},Data.emptyState()).requiresConfirmation,false);
  });
  test('old backups keep saved teams; single match import merges and reports ID conflicts',()=>{
    const current=fixture(),old=fixture();delete old.teams;
    const prepared=Data.prepareImport(old,current);assert.deepEqual(prepared.state.teams,current.teams);assert.equal(prepared.summary.preservedTeams,1);
    const only={version:1,match:JSON.parse(JSON.stringify(old.matches[0]))};only.match.id='m2';only.match.sets[0].id='s2';
    const merged=Data.prepareImport(only,current);assert.equal(merged.state.matches.length,2);assert.equal(merged.kind,'match');assert.equal(merged.requiresConfirmation,false);assert.equal(current.matches.length,1);
    only.match.id='m1';assert.equal(Data.prepareImport(only,current).requiresConfirmation,true);
    const invalid=Data.prepareImport({version:1,matches:[{}]},current);assert.equal(invalid.ok,false);assert.equal(invalid.state,null);assert.equal(current.matches.length,1);
  });
  test('single match replacement never grafts current drafts onto an older imported match',()=>{
    const current=fixture();current.openRallies={s1:{id:'draft',actions:[{playerId:'p1',skill:'attack',outcome:'Continuidad',zone:3}]}};
    const single={version:1,match:JSON.parse(JSON.stringify(current.matches[0]))};
    const replaced=Data.prepareImport(single,current);assert.equal(replaced.ok,true);assert.equal(replaced.requiresConfirmation,true);assert.equal(replaced.summary.replacedOpenRallies,1);assert.equal(replaced.state.openRallies.s1,undefined);assert.equal(current.openRallies.s1.actions.length,1);
    single.match.id='other_match';const collision=Data.prepareImport(single,current);assert.equal(collision.ok,false);assert.equal(collision.error.code,'SET_ID_CONFLICT');assert.equal(current.openRallies.s1.actions.length,1);
  });
  test('open rallies, offline state, preferences and sync metadata survive export/import',()=>{
    const old=fixture();old.openRallies={s1:{id:'pending1',actions:[{id:'pending_a',playerId:'p1',skill:'attack',outcome:'Continuidad',outcomeId:'continue',zone:null,schemaVersion:2}],mode:'advanced',originZone:null,destinationZone:null}};
    old.preferences={mode:'advanced',autoClose:false};old.sync={pending:true,lastConfirmed:'timestamp'};
    const next=Data.migrateState(old);assert.deepEqual(next.openRallies,old.openRallies);assert.deepEqual(next.preferences,old.preferences);assert.deepEqual(next.sync,old.sync);
    assert.equal(Data.prepareImport(JSON.parse(JSON.stringify(next))).ok,true);
    old.openRallies.s1.actions[0].playerId='missing';assert.equal(Data.validateState(old).valid,false);
    old.openRallies.s1.actions[0].playerId='p1';old.openRallies.s1.selectedSkill='constructor';assert.equal(Data.validateState(old).valid,false);
  });
  test('migration keeps substitutions, libero identities and original team snapshots',()=>{
    const old=fixture(),s=old.matches[0].sets[0];
    s.libero={playerId:'p8',replacedId:'p6'};s.changes=[{id:'change1',type:'libero-in',outgoing:'p6',incoming:'p8',position:6,before:{positions:[...s.positions],libero:null},score:{us:2,them:1}}];s.rallies[0].liberoBefore={playerId:'p8',replacedId:'p6'};
    const next=Data.migrateState(old),now=next.matches[0].sets[0];assert.deepEqual(now.libero,s.libero);assert.deepEqual(now.changes,s.changes);assert.deepEqual(now.rallies[0].liberoBefore,s.rallies[0].liberoBefore);
  });
  console.log('Data V2: '+count+' checks passed.');return count;
}
module.exports=verify;
if(require.main===module)verify();
