'use strict';
// El entrenamiento comparte catálogo, motor y fórmulas; su dominio nunca entra en state.matches.
const TrainingModel=(()=>{
  const copy=x=>JSON.parse(JSON.stringify(x));
  const id=()=>globalThis.crypto?.randomUUID?.()||'tr_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  const now=()=>new Date().toISOString();
  const fail=message=>{throw Error(message)};
  function session(input){
    const players=copy(input.players||[]);
    if(!input.name?.trim()||!input.team?.trim()||!players.length)fail('Completá nombre, equipo y al menos un participante.');
    if(new Set(players.map(p=>p.id)).size!==players.length)fail('Hay participantes repetidos.');
    return {id:id(),type:'training',schemaVersion:1,revision:1,name:input.name.trim(),team:input.team.trim(),teamId:input.teamId||null,date:input.date||now().slice(0,10),objective:input.objective||'',players,createdAt:now(),updatedAt:now(),status:'active',activeExerciseId:null,exercises:[],sync:{confirmedRevision:0}};
  }
  function exercise(s,input){
    const type=input.type==='game'?'game':'repetitions',count=Number(input.size)||6;
    if(!input.name?.trim())fail('Escribí el nombre del ejercicio.');
    const positions=input.positions||s.players.filter(p=>!p.isLibero).slice(0,count).map(p=>p.id);
    if(type==='game'&&(positions.length!==count||new Set(positions).size!==count||positions.some(id=>!s.players.some(p=>p.id===id))))fail('Elegí los jugadores en cancha, sin repetir.');
    const rotations=type==='game'&&count===6&&input.rotations!==false;
    if(type==='game'&&positions.some(id=>s.players.find(p=>p.id===id)?.isLibero))fail('La formación base usa jugadores regulares. Ingresá al líbero con su reemplazo en un juego de seis.');
    const target=input.target==null||input.target===''?null:Number(input.target);
    if(target!==null&&(!Number.isInteger(target)||target<1||target>999))fail('El objetivo debe ser un número entre 1 y 999, o quedar vacío.');
    const eid=id(),set={id:eid,number:s.exercises.length+1,score:{us:0,them:0},serve:input.serve==='them'?'them':'us',rotation:1,positions:type==='game'?copy(positions):s.players.map(p=>p.id),initialLineup:copy(positions),changes:[],rallies:[],libero:null,finished:false,winner:null,
      training:{type,rotations,target,winBy:Number(input.winBy)===2?2:1,validRallies:type==='game'&&input.validRallies!==false}};
    return {id:eid,type,name:input.name.trim(),format:input.format|| (type==='game'?'6v6':'technical'),skill:input.skill||'reception',targetZone:input.targetZone?Number(input.targetZone):null,objective:input.objective||'',meanings:copy(input.meanings||{}),comparisonKey:input.comparisonKey?.trim()||'',status:'active',createdAt:now(),repetitions:[],set,draft:{id:id(),actions:[],mode:'quick',autoClose:true,playerId:positions[0]||s.players[0]?.id,skill:input.skill||'reception',originZone:null,destinationZone:null}};
  }
  const match=s=>({id:s.id,team:s.team,opponent:'Rival de entrenamiento',players:s.players,bestOf:1});
  function record(s,e,result,extra={}){
    if(s.status!=='active'||e.status!=='active'||e.set.finished)fail('Continuá la sesión y abrí un ejercicio para registrar.');
    const d=e.draft;
    const made=VolleyEngine.createAction({playerId:d.playerId,skill:d.skill,outcomeId:result,originZone:d.originZone,destinationZone:d.destinationZone,
      ...extra,metadata:{...(extra.metadata||{}),sessionType:'training',exerciseId:e.id}}, {match:match(s),set:e.set,actions:e.type==='game'?d.actions:[],mode:d.mode});
    if(made.error)fail(made.error);
    const a=made.action;
    if(e.type==='repetitions'){
      if(e.repetitions.some(x=>x.id===a.id))fail('Esta repetición ya está registrada.');
      a.order=e.repetitions.length+1;
      a.metadata.technical=true;
      a.metadata.technicalSuccess=['kill','use_block_out','tip_kill','point'].includes(result);
      a.metadata.targetHit=a.skill==='serve'&&!!e.targetZone&&a.destinationZone===e.targetZone&&result!=='error';
      // El resultado conserva su significado técnico. No hay ganador competitivo.
      a.attackRole='unknown';a.rotationalPosition=null;a.metadata.attackRoleSource='technical-drill';
      e.repetitions.push(a);
    }else d.actions.push(a);
    return {action:a,terminalWinner:made.terminalWinner};
  }
  function point(s,e,winner,options={}){
    if(e.type!=='game'||s.status!=='active'||e.status!=='active')fail('Este ejercicio no admite puntos ahora.');
    const d=e.draft,result=VolleyEngine.closeRally(match(s),e.set,d.actions,{winner,id:d.id,mode:d.mode,sequenceComplete:d.mode==='advanced',...options});
    if(result.error)fail(result.error);
    if(e.set.training.rotations&&typeof reconcileLibero==='function')reconcileLibero(e.set);
    d.actions=[];d.id=id();
    if(e.set.finished)e.status='finished';
    return result;
  }
  function undo(s,e){
    if(s.status!=='active')fail('Continuá la sesión antes de corregir.');
    if(e.type==='repetitions')return e.repetitions.pop()||fail('No hay repeticiones para deshacer.');
    if(e.draft.actions.length)return e.draft.actions.pop();
    const result=VolleyEngine.undoRally(e.set,{allowLaterChanges:true});
    if(result.error)fail(result.error);
    e.draft.actions=result.actions;e.draft.id=result.rally.id;e.status='active';return result;
  }
  function validate(s){
    if(!s||s.type!=='training'||s.schemaVersion!==1||typeof s.id!=='string'||!Number.isInteger(s.revision)||s.revision<1)fail('Sesión de entrenamiento incompatible.');
    if(s.deleted===true)return true;
    if(!['active','paused','finished'].includes(s.status)||typeof s.name!=='string'||typeof s.team!=='string'||!Array.isArray(s.players)||!s.players.length||!Array.isArray(s.exercises))fail('Estructura de entrenamiento incompleta.');
    const players=new Set(),ids=new Set([s.id]);
    for(const p of s.players){if(!p||typeof p.id!=='string'||players.has(p.id)||typeof p.name!=='string'||typeof p.number!=='string')fail('Participante inválido.');players.add(p.id);}
    for(const e of s.exercises){
      if(!e||ids.has(e.id)||typeof e.id!=='string'||!['repetitions','game'].includes(e.type)||typeof e.name!=='string'||!['active','finished'].includes(e.status)||!Array.isArray(e.repetitions)||!e.set||!e.draft||!Array.isArray(e.draft.actions)||!Array.isArray(e.set.rallies)||!Array.isArray(e.set.positions)||!e.set.training||e.set.training.type!==e.type)fail('Ejercicio incompatible.');
      ids.add(e.id);
      if(!e.set.score||!['us','them'].includes(e.set.serve)||!['us','them'].every(k=>Number.isInteger(e.set.score[k])&&e.set.score[k]>=0))fail('Marcador inválido.');
      if(e.type==='repetitions'&&(e.set.rallies.length||e.draft.actions.length||e.set.score.us||e.set.score.them))fail('Un ejercicio técnico no puede contener puntos competitivos.');
      if(e.type==='game'&&e.repetitions.length)fail('Un juego no puede contener repeticiones técnicas fuera de sus rallies.');
      if(e.set.positions.some(p=>!players.has(p))||new Set(e.set.positions).size!==e.set.positions.length)fail('Formación inválida.');
      if(e.type==='game'&&e.set.training.rotations&&e.set.positions.length!==6)fail('Rotación sin seis posiciones.');
      const action=a=>{if(!a||typeof a.id!=='string'||ids.has(a.id)||!players.has(a.playerId)||!VolleyCatalog.find(a.skill,a.outcomeId)||a.participants?.some(p=>!players.has(p)))fail('Acción inválida o repetida.');ids.add(a.id);};
      e.repetitions.forEach(action);e.draft.actions.forEach(action);
      for(const r of e.set.rallies){if(!r||typeof r.id!=='string'||ids.has(r.id)||!['us','them'].includes(r.winner)||!['us','them'].includes(r.serveBefore)||!Array.isArray(r.actions))fail('Rally inválido o repetido.');ids.add(r.id);r.actions.forEach(action);}
    }
    return true;
  }
  return {session,exercise,record,point,undo,validate,match,id,copy,now};
})();

const TrainingStats=(()=>{
  const pct=(n,d)=>d?100*n/d:null;
  function entries(s,filter={}){
    return s.exercises.filter(e=>!filter.exerciseId||e.id===filter.exerciseId).flatMap(e=>{
      const list=e.type==='repetitions'?e.repetitions.map(action=>({action,rally:null,index:action.order-1,result:StatsV2.resolveOutcome(action)})):
        StatsV2.entries({...TrainingModel.match(s),sets:[e.set]});
      return list.filter(x=>(!filter.playerId||StatsV2.participants(x.action).includes(filter.playerId))&&(!filter.skill||x.action.skill===filter.skill)).map(x=>({...x,exercise:e}));
    });
  }
  function compute(s,filter={}){
    const list=entries(s,filter),games=list.filter(x=>x.exercise.type==='game'),technical=list.filter(x=>x.exercise.type==='repetitions');
    const summary=StatsV2.summarizeEntries(list),game=StatsV2.summarizeEntries(games),tech=StatsV2.summarizeEntries(technical);
    const selected=s.exercises.filter(e=>!filter.exerciseId||filter.exerciseId===e.id),hasGame=selected.some(e=>e.type==='game'),hasTech=selected.some(e=>e.type==='repetitions');
    const a=summary.attack;
    a.kills=hasGame?game.attack.kills:null;a.conventionalKills=hasGame?game.attack.conventionalKills:null;
    a.useBlockOutKills=hasGame?game.attack.useBlockOutKills:null;a.tipKills=hasGame?game.attack.tipKills:null;
    a.efficiency=hasGame?game.attack.efficiency:null;a.killPct=hasGame?game.attack.killPct:null;
    a.gameAttempts=game.attack.total;a.technicalAttempts=tech.attack.total;
    a.technicalSuccesses=hasTech?technical.filter(x=>x.action.skill==='attack'&&x.action.metadata?.technicalSuccess).length:null;
    a.technicalSuccessPct=pct(a.technicalSuccesses,tech.attack.total);
    a.uses=list.filter(x=>x.action.skill==='attack'&&x.result.outcomeId==='use_block_out').length;
    a.tips=list.filter(x=>x.action.skill==='attack'&&['tip_kill','tip_continue'].includes(x.result.outcomeId)).length;
    a.byRole=hasGame?game.attack.byRole:null;
    summary.serve.aces=hasGame?game.serve.aces:null;summary.serve.acePct=hasGame?game.serve.acePct:null;
    const directed=technical.filter(x=>x.action.skill==='serve'&&x.exercise.targetZone);
    summary.serve.directedAttempts=directed.length;
    summary.serve.targetHits=selected.some(e=>e.type==='repetitions'&&e.targetZone)?directed.filter(x=>x.action.metadata?.targetHit).length:null;
    summary.block.points=hasGame?game.block.points:null;
    summary.block.technicalSuccesses=hasTech?technical.filter(x=>x.action.skill==='block'&&x.action.metadata?.technicalSuccess).length:null;
    const valid=selected.filter(e=>e.type==='game'&&e.set.training.validRallies).flatMap(e=>e.set.rallies),recv=valid.filter(r=>r.serveBefore==='them'),serv=valid.filter(r=>r.serveBefore==='us');
    return {list,total:list.length,repetitions:technical.length,gameActions:games.length,summary,game,technical:tech,hasGame,hasTech,
      sideOut:{n:recv.filter(r=>r.winner==='us').length,d:recv.length,pct:pct(recv.filter(r=>r.winner==='us').length,recv.length)},
      breakPoint:{n:serv.filter(r=>r.winner==='us').length,d:serv.length,pct:pct(serv.filter(r=>r.winner==='us').length,serv.length)},
      validRallies:selected.some(e=>e.type==='game'&&e.set.training.validRallies),rotations:selected.some(e=>e.set.training.rotations)};
  }
  function progression(s,sessions,playerId){
    const player=s.players.find(p=>p.id===playerId);if(!player)return [];
    const identity=player.sourcePlayerId||player.id;
    const previous=sessions.filter(x=>x.id!==s.id&&!x.deleted&&x.status==='finished'&&(x.teamId||x.team)===(s.teamId||s.team)&&x.date<=s.date&&x.players.some(p=>(p.sourcePlayerId||p.id)===identity)).sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt))[0];
    if(!previous)return [];
    const oldPlayer=previous.players.find(p=>(p.sourcePlayerId||p.id)===identity),groups=new Map();
    for(const e of s.exercises){
      const key=JSON.stringify([e.type,e.format,e.comparisonKey||e.name.trim().toLowerCase(),e.targetZone,e.meanings]);
      if(groups.has(key))continue;groups.set(key,true);
      const oldExercises=previous.exercises.filter(x=>JSON.stringify([x.type,x.format,x.comparisonKey||x.name.trim().toLowerCase(),x.targetZone,x.meanings])===key);
      if(!oldExercises.length)continue;
      const current=compute({...s,exercises:s.exercises.filter(x=>JSON.stringify([x.type,x.format,x.comparisonKey||x.name.trim().toLowerCase(),x.targetZone,x.meanings])===key)},{playerId});
      const prior=compute({...previous,exercises:oldExercises},{playerId:oldPlayer.id});
      for(const metric of ['reception','attack','serve']){
        const sample=d=>metric==='reception'?{n:d.summary.reception.q2+d.summary.reception.q3,d:d.summary.reception.total}:metric==='attack'?{n:e.type==='game'?d.game.attack.kills:d.summary.attack.technicalSuccesses,d:e.type==='game'?d.game.attack.total:d.technical.attack.total}:{n:e.type==='game'?d.game.serve.aces:d.summary.serve.targetHits,d:e.type==='game'?d.game.serve.total:d.summary.serve.directedAttempts};
        const a=sample(current),b=sample(prior);if(!a.d||!b.d||a.n==null||b.n==null)continue;
        groups.set(key+metric,{playerId,previousId:previous.id,previousDate:previous.date,context:e.type==='game'?'Juego real':'Técnico',exercise:e.comparisonKey||e.format,metric,label:metric==='reception'?'Recepción positiva':metric==='attack'?(e.type==='game'?'Kills':'Éxito técnico de ataque'):(e.type==='game'?'Aces reales':'Saque al objetivo'),current:{...a,pct:pct(a.n,a.d)},previous:{...b,pct:pct(b.n,b.d)},delta:pct(a.n,a.d)-pct(b.n,b.d)});
      }
    }
    return [...groups.values()].filter(x=>typeof x==='object');
  }
  return {compute,entries,progression};
})();
