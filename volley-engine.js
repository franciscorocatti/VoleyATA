'use strict';
// Catálogo único. outcome mantiene la etiqueta histórica para consumidores v1.
const VolleyCatalog = (() => {
  const o=(id,label,legacy,winner=null)=>({id,label,legacy,winner});
  const definitions={
    serve:{name:'Saque',outcomes:[o('ace','Ace','Ace','us'),o('positive','Positivo','Positivo'),o('neutral','Neutro','Continuidad'),o('error','Error','Error','them')]},
    reception:{name:'Recepción',outcomes:[o('perfect','3 · Perfecta','Perfecta'),o('positive','2 · Positiva','Positiva'),o('poor','1 · Mala','Negativa'),o('direct_error','0 · Error directo','Error','them')]},
    attack:{name:'Ataque',outcomes:[o('kill','Punto','Punto','us'),o('continue','Sigue','Continuidad'),o('use_block_out','Use / block-out','Punto','us'),o('tip_kill','Colocada · punto','Punto','us'),o('tip_continue','Colocada · sigue','Continuidad'),o('covered_block','Bloqueo cubierto','Bloqueo cubierto'),o('blocked_point','Bloqueo punto','Bloqueado','them'),o('error','Error','Error','them')]},
    block:{name:'Bloqueo',outcomes:[o('point','Punto','Punto','us'),o('positive_touch','Toque positivo','Toque'),o('uncontrolled_touch','Sin control','Toque sin control'),o('fault','Falta','Error','them')]},
    defense:{name:'Defensa',outcomes:[o('perfect','Perfecta','Perfecta'),o('positive','Positiva','Positiva'),o('limited','Limitada','Negativa'),o('direct_error','Error directo','Error','them')]},
    setting:{name:'Armado',outcomes:[o('perfect','Perfecto','Perfecta'),o('good','Bueno','Positiva'),o('forced','Forzado','Negativa'),o('direct_error','Error directo','Error','them')]}
  };
  function find(skill,result) { if(skill==='rival_attack'){const r=({kill:{label:'PUNTO RIVAL',winner:'them'},continue:{label:'SIGUE / DEFENDIDO',winner:null},error:{label:'ERROR RIVAL',winner:'us'},blocked_point:{label:'BLOQUEO NUESTRO',winner:'us'},covered_block:{label:'BLOQUEO NUESTRO · SIGUE',winner:null}})[result];return r?{id:result,legacy:r.label,...r}:null;}return definitions[skill]?.outcomes.find(o=>o.id===result||o.label===result||o.legacy===result)||null; }
  function outcome(action,rally) {
    const adapted=typeof VolleyData!=='undefined'?VolleyData.getActionResult(action,rally):null;
    let result=find(action.skill,action.outcomeId||adapted?.outcomeId||action.outcome);if(action.side==='them'&&action.skill!=='rival_attack'&&result?.winner)result={...result,winner:result.winner==='us'?'them':'us'};return action.skill==='rival_attack'&&action.metadata?.linkedOwnBlockActionId&&result?{...result,winner:null}:result;
  }
  return {definitions,find,outcome};
})();

// Shared, pure rally context. Historical records are only read; relationships are
// rebuilt on the current draft after an explicit edit, never by a statistics view.
const VolleyRally = (() => {
  const side=a=>a?.side==='them'||a?.skill==='rival_attack'?'them':'us';
  const other=s=>s==='us'?'them':'us';
  const skill=a=>a?.skill==='rival_attack'?'attack':a?.skill;
  const roster=(m,s)=>s==='them'?(m.rivalPlayers||[]):m.players;
  function positions(set,team='us',effective=true){
    const ids=team==='them'?(set?.opponentLineup?.current||[]).map(p=>p.id):set?.positions||[];
    const lib=team==='them'?set?.opponentLineup?.libero:set?.libero;
    return effective?ids.map(id=>lib?.replacedId===id?lib.playerId:id):[...ids];
  }
  function receptionZone(m,set,team,id){
    const ids=positions(set,team),pos=ids.indexOf(id)+1,p=roster(m,team).find(p=>p.id===id);
    if(team==='us'&&m.receptionScheme){
      const front=ids.map((id,i)=>({p:roster(m,team).find(p=>p.id===id),pos:i+1})).filter(x=>[2,3,4].includes(x.pos)&&playerPosition(x.p)==='outside');
      if(front.length!==1)return {zone:null,source:'unknown'};
      const table={4:[5,6,1],3:[5,1,6],2:[1,6,5]},row=table[front[0].pos];
      const role=playerPosition(p),index=role==='libero'?1:role==='outside'?(id===front[0].p.id?0:[1,5,6].includes(pos)?2:-1):-1;
      return {zone:row[index]??null,source:row[index]?'reception-scheme':'unknown'};
    }
    return {zone:pos||null,source:pos?'rotation-reference':'unknown'};
  }
  function attackDirection(origin,destination,type){
    if(origin===4){if([4,5].includes(destination))return 'diagonal';if(destination===1)return 'paralela';if(destination===6)return type==='tip'?'olla':'paralela';}
    if(origin===2){if([1,2].includes(destination))return 'diagonal';if(destination===5)return 'paralela';if(destination===6)return type==='tip'?'olla':'paralela';}
    if(origin===3){if([1,2].includes(destination))return 'zona1';if([4,5,6].includes(destination))return 'zona5';}
    return null;
  }
  function serveDirection(origin,destination){
    // Local zones face each other: 1->5 and 5->1 stay on the same global sideline.
    const from={1:1,6:0,5:-1}[origin],to={1:-1,2:-1,3:0,4:1,5:1,6:0}[destination];
    return from==null||to==null||from===0||to===0?null:from===to?'paralela':'diagonal';
  }
  const spatial=source=>['observed','reception-scheme','role-zone','serve-default'].includes(source);
  function relink(actions){
    for(let i=0;i<actions.length;i++){
      const a=actions[i];if(!a.metadata?.rallyFlow)continue;
      const md=a.metadata;a.order=i+1;md.previousActionId=actions[i-1]?.id||null;
      for(const key of ['relatedActionId','relatedAttackOutcome','serveActionId','receiverIdLinked','receptionActionId','defenseActionId','setterId','attackPhase','coverageOf'])delete md[key];
      if(md.destinationSource==='linked-reception'||md.destinationSource==='linked-defense'){a.destinationZone=null;md.destinationSource='unknown';}
      if(md.directionSource==='derived'){md.attackDirection=null;md.directionSource='unknown';}
      md.serveDirection=null;
    }
    for(let i=0;i<actions.length;i++){
      const a=actions[i],prev=actions[i-1],md=a.metadata;if(!md?.rallyFlow)continue;
      if(a.skill==='reception'&&prev?.skill==='serve'&&side(a)!==side(prev)){
        md.serveActionId=prev.id;prev.metadata.receptionActionId=a.id;prev.metadata.receiverIdLinked=a.playerId;
        if(prev.metadata.destinationSource!=='observed'&&spatial(md.originSource)){prev.destinationZone=a.originZone;prev.metadata.destinationSource='linked-reception';prev.metadata.destinationEvidence=md.originSource;}
      }
      if(a.skill==='block'&&skill(prev)==='attack'&&side(a)!==side(prev)){md.relatedActionId=prev.id;md.relatedAttackOutcome=prev.outcomeId;}
      if(a.skill==='defense'&&skill(prev)==='attack'){
        if(md.defenseKind==='coverage'&&side(a)===side(prev)&&prev.outcomeId==='covered_block'){md.coverageOf=prev.id;md.relatedActionId=prev.id;}
        else if(md.defenseKind!=='coverage'&&side(a)!==side(prev)&&['continue','tip_continue'].includes(prev.outcomeId)){
          md.relatedActionId=prev.id;prev.metadata.defenseActionId=a.id;
          if(prev.metadata.destinationSource!=='observed'&&spatial(md.originSource)){prev.destinationZone=a.originZone;prev.metadata.destinationSource='linked-defense';prev.metadata.destinationEvidence=md.originSource;}
        }
      }
      if(a.skill==='attack'){
        if(prev?.skill==='setting'&&side(prev)===side(a))md.setterId=prev.playerId;
        const before=actions.slice(0,i).reverse();const first=before.find(x=>side(x)===side(a)&&['reception','defense','attack'].includes(skill(x)));
        md.attackPhase=first?.skill==='reception'?'reception':first?.skill==='defense'?(first.metadata?.defenseKind==='coverage'?'coverage':'counterattack'):null;
      }
    }
    for(const a of actions){const md=a.metadata;if(!md?.rallyFlow)continue;
      if(a.skill==='serve')md.serveDirection=spatial(md.originSource)&&['observed','linked-reception'].includes(md.destinationSource)?serveDirection(a.originZone,a.destinationZone):null;
      if(a.skill==='attack'&&md.directionSource!=='observed'){
        md.attackDirection=spatial(md.originSource)&&['observed','linked-defense'].includes(md.destinationSource)?attackDirection(a.originZone,a.destinationZone,md.attackType):null;
        md.directionSource=md.attackDirection?'derived':'unknown';
      }
      a.zone=['serve','attack'].includes(a.skill)?a.destinationZone:a.originZone;
    }
    return actions;
  }
  function next(action){
    const team=side(action),s=skill(action),out=action?.outcomeId;
    if(!action||VolleyCatalog.outcome(action)?.winner)return null;
    if(s==='serve')return {side:other(team),skill:'reception'};
    if(['reception','defense','setting'].includes(s))return {side:team,skill:'attack'};
    if(s==='attack')return {side:out==='covered_block'?team:other(team),skill:'defense',coverage:out==='covered_block'};
    if(s==='block')return {side:action.metadata?.relatedAttackOutcome==='covered_block'?other(team):team,skill:'defense',coverage:action.metadata?.relatedAttackOutcome==='covered_block'};
    return null;
  }
  return {side,other,skill,roster,positions,receptionZone,attackDirection,serveDirection,spatial,relink,next};
})();

const VolleyEngine = (() => {
  const clone=value=>JSON.parse(JSON.stringify(value));
  const id=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  const zone=value=>Number.isInteger(value)&&value>=1&&value<=6?value:null;
  const onCourt=set=>set.positions.map(p=>set.libero?.replacedId===p?set.libero.playerId:p);
  function createAction(input,{match,set,actions=[],mode='quick'}) {
    const team=input.side==='them'?'them':'us',originalMatch=match,originalSet=set;
    if(team==='them'){
      match={...match,players:match.rivalPlayers||[]};
      set={...set,positions:VolleyRally.positions(set,'them',false),libero:set.opponentLineup?.libero||null,serve:VolleyRally.other(set.serve)};
    }
    if (!set||set.finished) return {error:'El set ya está cerrado.'};
    if (actions.some(a=>VolleyCatalog.outcome(a)?.winner)) return {error:'Ya hay una acción terminal. Cerrá el punto o corregí esa acción antes de seguir.'};
    const definition=VolleyCatalog.find(input.skill,input.outcomeId||input.outcome);
    if (!definition) return {error:'El resultado no corresponde a este fundamento.'};
    const repetition=set.training?.type==='repetitions';
    const player=match.players.find(p=>p.id===input.playerId);
    if (!player) return {error:'Elegí un jugador antes de registrar la acción.'};
    if (!onCourt(set).includes(player.id)) return {error:'Ese jugador no está en cancha. Registrá primero el cambio o elegí un jugador en cancha.'};
    if(!repetition&&player.isLibero&&['serve','block'].includes(input.skill))return {error:'Con el criterio FIVB, el líbero no puede sacar ni bloquear. Revisá el jugador seleccionado.'};
    if (!repetition&&input.skill==='serve'&&(set.serve!=='us'||actions.length)) return {error:'El saque solo se registra al comenzar un rally con servicio nuestro.'};
    if (!repetition&&input.skill==='reception'&&(set.serve!=='them'||actions.some(a=>!(a.skill==='serve'&&VolleyRally.side(a)!==team)&&['serve','reception','attack','defense','rival_attack'].includes(a.skill)))) return {error:'La recepción corresponde al primer contacto de un saque rival. Para una pelota en juego usá Defensa.'};
    const participants=[...new Set([player.id,...(input.skill==='block'?(input.participants||[]):[])])];
    if (participants.length>3||participants.some(p=>!onCourt(set).includes(p)||!match.players.some(x=>x.id===p))) return {error:'Elegí hasta tres bloqueadores que estén en cancha.'};
    if(!repetition&&input.skill==='block'&&participants.some(id=>match.players.find(p=>p.id===id)?.isLibero))return {error:'El líbero no puede participar del bloqueo.'};
    const metadata={...(input.metadata||{})};
    if(metadata.rallyFlow&&input.skill==='attack'&&['blocked_point','covered_block','use_block_out'].includes(definition.id)){const ids=metadata.blockers||[],opponents=VolleyRally.roster(originalMatch,VolleyRally.other(team)),court=VolleyRally.positions(originalSet,VolleyRally.other(team));if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length>3||ids.some(id=>!court.includes(id)||opponents.find(p=>p.id===id)?.isLibero||![2,3,4].includes(court.indexOf(id)+1)))return {error:'Elegí hasta tres bloqueadores delanteros del equipo contrario.'};}
    if(input.skill==='attack') {
      if(typeof playerPosition==='function')metadata.playerPosition=playerPosition(player);
      if(['use_block_out','tip_kill','tip_continue'].includes(definition.id)) {
        if(metadata.freeBall||input.isFreeBall||['free_ball','freeball'].includes(metadata.attackType))return {error:'Use y colocada deben ser acciones ofensivas dirigidas al campo rival, no pelotas de continuidad.'};
        metadata.attackType=definition.id==='use_block_out'?'use_block_out':'tip';
      } else if(['kill','continue','covered_block','blocked_point','error'].includes(definition.id)) {
        if(!['free_ball','freeball'].includes(metadata.attackType))metadata.attackType=definition.id==='error'&&metadata.attackType==='tip'?'tip':'conventional';
      }
      else if(definition.id!=='error'&&['use_block_out','tip','conventional'].includes(metadata.attackType)) delete metadata.attackType;
    }
    if (input.skill==='attack'&&!metadata.attackPhase) {
      const lastAttack=actions.map(a=>a.skill).lastIndexOf('attack');
      const recent=actions.slice(lastAttack+1);
      metadata.attackPhase=recent.some(a=>['defense','rival_attack'].includes(a.skill))?'counterattack':lastAttack<0&&recent.some(a=>a.skill==='reception')?'reception':null;
      const setter=actions.at(-1);
      if (setter?.skill==='setting') metadata.setterId=setter.playerId;
    }
    if (input.skill==='reception') metadata.quality={perfect:3,positive:2,poor:1,direct_error:0}[definition.id];
    const originZone=zone(input.originZone),destinationZone=zone(input.destinationZone);
    const action={id:input.id||id(),schemaVersion:2,playerId:player.id,participants,skill:input.skill,outcomeId:definition.id,
      outcome:definition.legacy,originZone,destinationZone,zone:['serve','attack'].includes(input.skill)?destinationZone:originZone,
      order:actions.length+1,timestamp:new Date().toISOString(),mode,metadata};
    if (input.blocker?.number) action.blocker=clone(input.blocker);
    if(input.skill==='attack'&&typeof VolleyPosition!=='undefined'){
      const position=set.training?.rotations===false?{role:'unknown',position:null,source:'training-no-rotation'}:VolleyPosition.forPlayer(player.id,{positions:[...set.positions],libero:clone(set.libero||null)});
      const manual=['front','back','unknown'].includes(input.attackRoleOverride);
      action.attackRole=set.training?.rotations===false?'unknown':manual?input.attackRoleOverride:position.role;
      action.rotationalPosition=position.position;
      metadata.attackRoleSource=manual?'manual':position.source;
      metadata.computedAttackRole=position.role;
    }
    if(input.side){action.side=team;action.rotationalPosition=onCourt(set).indexOf(player.id)+1;action.metadata.playerSnapshot={id:player.id,number:player.number,name:player.name,position:typeof playerPosition==='function'?playerPosition(player):null,provisional:!!player.provisional};}
    return {action,terminalWinner:repetition?null:definition.winner?(team==='them'?VolleyRally.other(definition.winner):definition.winner):null};
  }
  function terminalWinner(actions) {
    return actions.reduce((winner,a)=>VolleyCatalog.outcome(a)?.winner||winner,null);
  }
  function terminalCause(actions){
    const action=actions.at(-1),result=action&&VolleyCatalog.outcome(action);
    if(!result?.winner)return null;
    const allowed=action.side==='them'&&action.skill!=='rival_attack'?(result.winner==='us'?['opponent_error']:action.skill==='attack'?['opponent_attack']:action.skill==='serve'?['opponent_serve']:[]):action.skill==='rival_attack'?(action.outcomeId==='kill'?['opponent_attack']:action.outcomeId==='error'?['opponent_error']:[]):result.winner==='us'?[]:action.skill==='attack'&&result.id==='blocked_point'?['opponent_block']:action.skill==='reception'?['opponent_serve','own_error']:['own_error'];
    return {winner:result.winner,allowed,preferred:allowed[0]||null};
  }
  function closeRally(match,set,actions,options={}) {
    if (!set||set.finished) return {error:'El set ya está cerrado.'};
    if(set.training?.type==='repetitions')return {error:'Las repeticiones no generan puntos.'};
    const winner=options.winner;
    if (!['us','them'].includes(winner)) return {error:'Elegí el ganador del punto.'};
    if (options.id&&set.rallies.some(r=>r.id===options.id)) return {error:'Este punto ya está guardado.',duplicate:true};
    const terminals=actions.map((a,i)=>({i,winner:VolleyCatalog.outcome(a)?.winner})).filter(x=>x.winner);
    if (terminals.length>1||terminals.some(t=>t.i!==actions.length-1)) return {error:'Hay una acción terminal antes del final de la secuencia. Corregila antes de cerrar.'};
    if (terminals.length&&terminals[0].winner!==winner) return {error:'El ganador no coincide con la última acción. Editá o quitá esa acción antes de cerrar el punto.'};
    const terminal=terminalCause(actions),cause=options.cause||null;
    if(cause==='opponent_serve'&&set.serve!=='them')return {error:'Un ace rival corresponde a un rally que comenzó con saque rival. Revisá la causa o el servicio.'};
    if(terminal&&cause&&cause!=='unknown'&&!terminal.allowed.includes(cause))return {error:'La causa no coincide con la acción terminal. Corregí la acción o elegí una causa compatible.'};
    if (actions.some(a=>!(VolleyRally.side(a)==='them'?(match.rivalPlayers||[]):match.players).some(p=>p.id===a.playerId))) return {error:'Hay una acción atribuida a un jugador inexistente.'};
    for(let i=0;i<actions.length;i++){
      const action=actions[i],previous=actions.slice(0,i);
      if(action.metadata?.rallyFlow){const checked=createAction({...action,attackRoleOverride:action.attackRole},{match,set,actions:previous,mode:action.mode});if(checked.error)return checked;continue;}
      if(action.skill==='rival_attack'){if(!['kill','continue','error','blocked_point','covered_block'].includes(action.outcomeId))return {error:'Resultado rival inválido.'};if(action.metadata?.linkedOwnBlockActionId&&(!['blocked_point','covered_block'].includes(action.outcomeId)||!actions.slice(i+1).some(b=>b.id===action.metadata.linkedOwnBlockActionId&&b.skill==='block'&&b.outcomeId===(action.outcomeId==='blocked_point'?'point':'positive_touch'))))return {error:'El bloqueo propio asociado ya no existe.'};continue;}
      if(!onCourt(set).includes(action.playerId))return {error:'Hay una acción pendiente de un jugador fuera de cancha. Corregila antes de cerrar.'};
      if(action.skill==='serve'&&(set.serve!=='us'||i!==0))return {error:'La secuencia contiene un saque que no corresponde al servicio inicial.'};
      if(action.skill==='reception'&&(set.serve!=='them'||previous.some(a=>['serve','reception','attack','defense','rival_attack'].includes(a.skill))))return {error:'La recepción pendiente no corresponde al saque rival. Revisá la secuencia.'};
      if(action.skill==='block'&&(action.participants||[]).some(id=>!onCourt(set).includes(id)))return {error:'Hay un bloqueador pendiente fuera de cancha.'};
    }
    const before={score:clone(set.score),serve:set.serve,rotation:set.rotation,positions:[...set.positions],libero:clone(set.libero||null),
      opponentLineup:clone(set.opponentLineup||null),changes:clone(set.changes||[])};
    const rally={id:options.id||id(),schemaVersion:2,matchId:match.id,setId:set.id,number:set.rallies.length+1,status:'closed',
      timestamp:new Date().toISOString(),winner,serveBefore:before.serve,rotation:before.rotation,positions:[...before.positions],
      scoreBefore:clone(before.score),liberoBefore:clone(before.libero),opponentBefore:clone(before.opponentLineup),
      changeCount:before.changes.length,before,actions:clone(actions),mode:options.mode||'quick',
      sequenceComplete:options.sequenceComplete===true,cause:cause==='unknown'&&terminal?terminal.preferred:cause,metadata:{...(options.metadata||{}),closedVia:options.automatic?'automatic':'manual'}};
    if (options.correction) rally.correction=clone(options.correction);
    set.rallies.push(rally);set.score[winner]++;
    if (set.training?.rotations!==false&&set.opponentLineup&&set.serve==='us'&&winner==='them') {
      set.opponentLineup.current=rotate(set.opponentLineup.current);set.opponentLineup.rotation=set.opponentLineup.rotation%6+1;
    }
    if (set.training?.rotations!==false&&set.serve==='them'&&winner==='us') {set.positions=rotate(set.positions);set.rotation=set.rotation%6+1;}
    set.serve=winner;
    const target=set.training?.type==='game'?(set.training.target||Infinity):(match.bestOf===5&&set.number===5?15:25);
    const margin=set.training?.type==='game'?(set.training.winBy||1):2;
    if (Math.max(set.score.us,set.score.them)>=target&&Math.abs(set.score.us-set.score.them)>=margin) {set.finished=true;set.winner=set.score.us>set.score.them?'us':'them';}
    return {rally,rotated:set.training?.rotations!==false&&before.serve!==winner,winningSide:winner};
  }
  function rotate(positions) {return [...positions.slice(1),positions[0]];}
  function undoRally(set,{allowLaterChanges=false}={}) {
    const rally=set?.rallies.at(-1);if (!rally) return {error:'No hay puntos para deshacer.'};
    const count=rally.changeCount??set.changes?.length??0;
    const later=(set.changes||[]).slice(count).filter(c=>c.type!=='libero-auto-out');
    if (later.length&&!allowLaterChanges) return {needsConfirmation:true,changes:later};
    set.rallies.pop();
    set.score=clone(rally.scoreBefore);set.serve=rally.serveBefore;set.rotation=rally.rotation;set.positions=[...rally.positions];
    set.libero=clone(rally.before?.libero||rally.liberoBefore||null);
    if (rally.before||'opponentBefore' in rally) set.opponentLineup=clone(rally.before?.opponentLineup||rally.opponentBefore||null);
    if (rally.before?.changes) set.changes=clone(rally.before.changes);else if (rally.changeCount!=null) set.changes=(set.changes||[]).slice(0,rally.changeCount);
    set.finished=false;set.winner=null;
    return {rally,actions:clone(rally.actions||[])};
  }
  function correctAction(match,setId,rallyId,actionId,patch,{remove=false}={}){
    const original=match.sets.find(s=>s.id===setId),rally=original?.rallies.find(r=>r.id===rallyId),index=rally?.actions.findIndex(a=>a.id===actionId);
    if(!rally||index<0)return {error:'No se encontró la acción histórica.'};
    const action=rally.actions[index],updated=clone(rally.actions);
    const context={...original,finished:false,positions:clone(rally.positions),libero:clone(rally.before?.libero||rally.liberoBefore||null),opponentLineup:clone(rally.before?.opponentLineup||rally.opponentBefore||null),serve:rally.serveBefore};
    if(remove)updated.splice(index,1);
    else {
      const input={...action,...patch,id:action.id,metadata:{...action.metadata,...patch.metadata},attackRoleOverride:action.metadata?.attackRoleSource==='manual'?action.attackRole:'auto'};
      const created=createAction(input,{match,set:context,actions:updated.slice(0,index),mode:action.mode});
      if(created.error)return created;
      updated[index]={...created.action,timestamp:action.timestamp};
    }
    VolleyRally.relink(updated);
    const winner=terminalWinner(updated)||rally.winner;
    if(winner===rally.winner){
      const checkSet={...clone(context),rallies:[],score:clone(rally.scoreBefore),rotation:rally.rotation};
      const checked=closeRally(match,checkSet,updated,{winner,id:rally.id,mode:rally.mode,sequenceComplete:rally.sequenceComplete});
      if(checked.error)return checked;
      rally.corrections ||= [];rally.corrections.push({timestamp:new Date().toISOString(),actionId,before:clone(action),removed:remove});rally.actions=updated;const terminal=terminalCause(updated);if(terminal&&rally.cause&&!terminal.allowed.includes(rally.cause))rally.cause=terminal.preferred;
      return {rally,replayed:0};
    }
    // A terminal correction is transactional. Rebuild score/service/rotations
    // through the existing scorer, and replay explicit substitutions in between.
    // Refuse contradictory later observations instead of silently reassigning them.
    const first=original.rallies[0],firstBefore=first.before||{};
    const simulation={...clone(original),score:clone(first.scoreBefore),serve:first.serveBefore,rotation:first.rotation,positions:clone(first.positions),libero:clone(firstBefore.libero||first.liberoBefore||null),opponentLineup:clone(firstBefore.opponentLineup||first.opponentBefore||null),rallies:[],changes:clone((original.changes||[]).slice(0,first.changeCount||0)),finished:false,winner:null};
    let applied=first.changeCount||0;
    const applyChange=(change,next)=>{
      if(['libero-auto-out','rival-libero-auto-out'].includes(change.type))return;
      if(change.type==='substitution'){const i=simulation.positions.indexOf(change.outgoing);if(i<0)throw Error('Una sustitución posterior necesita revisión.');simulation.positions[i]=change.incoming;}
      if(change.type==='libero-in'||change.type==='libero-switch')simulation.libero=clone(change.after?.libero||next?.libero||null);
      if(change.type==='libero-out')simulation.libero=null;
      if(change.type==='serve-correction')simulation.serve=next?.serve||simulation.serve;
      if(change.type==='rotation-correction')simulation.rotation=next?.rotation||simulation.rotation;
      if(change.type.startsWith('rival-')&&change.opponentAfter){
        if(change.type==='rival-rotation'){simulation.opponentLineup.current=rotate(simulation.opponentLineup.current);simulation.opponentLineup.rotation=simulation.opponentLineup.rotation%6+1;}
        else if(change.type==='rival-lineup'){
          const before=change.beforeOpponent.current,after=change.opponentAfter.current;
          const removed=before.filter(p=>!after.some(q=>q.id===p.id)),added=after.filter(p=>!before.some(q=>q.id===p.id));
          for(let i=0;i<removed.length;i++){const slot=simulation.opponentLineup.current.findIndex(p=>p.id===removed[i].id);if(slot<0)throw Error('Una sustitución rival posterior necesita revisión.');simulation.opponentLineup.current[slot]=clone(added[i]);}
          if(!removed.length){const oldIds=before.map(p=>p.id),permutation=after.map(p=>oldIds.indexOf(p.id)),rows=simulation.opponentLineup.current;simulation.opponentLineup.current=permutation.map(i=>rows[i]);}
          simulation.opponentLineup.libero=null;
        }else simulation.opponentLineup.libero=clone(change.opponentAfter.libero||null);
      }
      simulation.changes.push(clone(change));
    };
    function removeIllegalLiberos(){
      for(const team of ['us','them']){
        const lib=team==='us'?simulation.libero:simulation.opponentLineup?.libero;if(!lib)continue;
        const pos=VolleyRally.positions(simulation,team,false).indexOf(lib.replacedId)+1;
        if(![1,5,6].includes(pos)||pos===1&&simulation.serve===team||simulation.finished){if(team==='us')simulation.libero=null;else simulation.opponentLineup.libero=null;}
      }
    }
    try{
      for(let i=0;i<original.rallies.length;i++){
        const old=original.rallies[i],count=old.changeCount??applied;
        while(applied<count){const c=original.changes[applied++],next=original.changes[applied]?.before||old.before;applyChange(c,next);}
        const actions=old.id===rallyId?updated:clone(old.actions);
        const targetWinner=old.id===rallyId?winner:old.winner;
        const scored=closeRally(match,simulation,actions,{id:old.id,winner:targetWinner,mode:old.mode,sequenceComplete:old.sequenceComplete});
        if(scored.error)return {error:'Corrección sin aplicar: rally '+old.number+' requiere revisión. '+scored.error};
        const regenerated=scored.rally;Object.assign(regenerated,{timestamp:old.timestamp,cause:old.id===rallyId?null:old.cause,metadata:{...old.metadata,scoreRecalculated:true},corrections:clone(old.corrections||[])});
        if(old.id===rallyId)regenerated.corrections.push({timestamp:new Date().toISOString(),actionId,before:clone(action),previousWinner:old.winner});
        removeIllegalLiberos();
      }
      while(applied<(original.changes||[]).length){const c=original.changes[applied++],next=original.changes[applied]?.before||original;applyChange(c,next);}
      removeIllegalLiberos();
    }catch(error){return {error:'Corrección sin aplicar: '+error.message};}
    for(const key of ['score','serve','rotation','positions','libero','opponentLineup','rallies','changes','finished','winner'])original[key]=clone(simulation[key]??null);
    return {rally:original.rallies.find(r=>r.id===rallyId),replayed:original.rallies.length};
  }
  return {createAction,closeRally,undoRally,terminalWinner,terminalCause,onCourt,rotate,correctAction};
})();
