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
    const result=find(action.skill,action.outcomeId||adapted?.outcomeId||action.outcome);return action.skill==='rival_attack'&&action.metadata?.linkedOwnBlockActionId&&result?{...result,winner:null}:result;
  }
  return {definitions,find,outcome};
})();

const VolleyEngine = (() => {
  const clone=value=>JSON.parse(JSON.stringify(value));
  const id=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  const zone=value=>Number.isInteger(value)&&value>=1&&value<=6?value:null;
  const onCourt=set=>set.positions.map(p=>set.libero?.replacedId===p?set.libero.playerId:p);
  function createAction(input,{match,set,actions=[],mode='quick'}) {
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
    if (!repetition&&input.skill==='reception'&&(set.serve!=='them'||actions.some(a=>['serve','reception','attack','defense','rival_attack'].includes(a.skill)))) return {error:'La recepción corresponde al primer contacto de un saque rival. Para una pelota en juego usá Defensa.'};
    const participants=[...new Set([player.id,...(input.skill==='block'?(input.participants||[]):[])])];
    if (participants.length>3||participants.some(p=>!onCourt(set).includes(p)||!match.players.some(x=>x.id===p))) return {error:'Elegí hasta tres bloqueadores que estén en cancha.'};
    if(!repetition&&input.skill==='block'&&participants.some(id=>match.players.find(p=>p.id===id)?.isLibero))return {error:'El líbero no puede participar del bloqueo.'};
    const metadata={...(input.metadata||{})};
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
    return {action,terminalWinner:repetition?null:definition.winner};
  }
  function terminalWinner(actions) {
    return actions.reduce((winner,a)=>VolleyCatalog.outcome(a)?.winner||winner,null);
  }
  function terminalCause(actions){
    const action=actions.at(-1),result=action&&VolleyCatalog.outcome(action);
    if(!result?.winner)return null;
    const allowed=action.skill==='rival_attack'?(action.outcomeId==='kill'?['opponent_attack']:action.outcomeId==='error'?['opponent_error']:[]):result.winner==='us'?[]:action.skill==='attack'&&result.id==='blocked_point'?['opponent_block']:action.skill==='reception'?['opponent_serve','own_error']:['own_error'];
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
    if (actions.some(a=>!(a.skill==='rival_attack'?(match.rivalPlayers||[]):match.players).some(p=>p.id===a.playerId))) return {error:'Hay una acción atribuida a un jugador inexistente.'};
    for(let i=0;i<actions.length;i++){
      const action=actions[i],previous=actions.slice(0,i);
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
  return {createAction,closeRally,undoRally,terminalWinner,terminalCause,onCourt,rotate};
})();
