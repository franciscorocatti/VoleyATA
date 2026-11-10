'use strict';
// Pure tactical templates use initial lineup slots, never player identities from
// a different match. Match copies and the reusable library are independent.
const VolleyTactics=(()=>{
  const phases=['serve','reception','defense','attack'],copy=x=>JSON.parse(JSON.stringify(x));
  const labels={serve:'Saque',reception:'Recepción',defense:'Defensa',attack:'Transición ofensiva'};
  const permutation=a=>Array.isArray(a)&&a.length===6&&new Set(a).size===6&&a.every(n=>Number.isInteger(n)&&n>=1&&n<=6);
  function generate(roles,system='5-1',name='Nueva plantilla'){
    if(!Array.isArray(roles)||roles.length!==6)return {error:'Se necesitan seis roles reglamentarios.'};
    const counts=r=>roles.filter(x=>x===r).length;
    if(system!=='custom'&&(counts('middle')!==2||counts('outside')!==2||(system==='5-1'?(counts('setter')!==1||counts('opposite')!==1):counts('setter')!==2)))return {error:'El sistema necesita dos centrales, dos puntas y '+(system==='5-1'?'un armador y un opuesto.':'dos armadores.')};
    const rotations={};
    for(let r=0;r<6;r++){
      const order=Array.from({length:6},(_,i)=>(i+r)%6+1),base=Array(6).fill(null);
      for(let p=0;p<6;p++){
        const slot=order[p],front=[1,2,3].includes(p),role=roles[slot-1];
        const z=system==='custom'?p+1:front?({outside:4,middle:3,setter:2,opposite:2})[role]:({outside:6,middle:5,setter:1,opposite:1})[role];
        if(!z||base[z-1])return {error:'Los roles no forman seis rotaciones válidas. Ubicá los pares opuestos o elegí Personalizado.'};
        base[z-1]=slot;
      }
      rotations[r+1]={};for(const phase of phases)rotations[r+1][phase]=[...base];
      if(system!=='custom'){const serving=rotations[r+1].serve,from=serving.indexOf(order[0]);[serving[0],serving[from]]=[serving[from],serving[0]];}
      if(system!=='custom'){
        const front=order.find((slot,p)=>[1,2,3].includes(p)&&roles[slot-1]==='outside'),back=order.find((slot,p)=>[0,4,5].includes(p)&&roles[slot-1]==='outside'),middle=order.find((slot,p)=>[0,4,5].includes(p)&&roles[slot-1]==='middle');
        const pos=order.indexOf(front)+1,row={4:[5,6,1],3:[5,1,6],2:[1,6,5]}[pos];
        if(row&&front&&back&&middle){
          const rec=Array(6).fill(null),receivers=[front,middle,back];row.forEach((z,i)=>rec[z-1]=receivers[i]);
          for(const slot of base.filter(slot=>!receivers.includes(slot))){const preferred=base.indexOf(slot);if(!rec[preferred])rec[preferred]=slot;else rec[rec.indexOf(null)]=slot;}
          rotations[r+1].reception=rec;
        }
      }
    }
    return {template:{schemaVersion:1,id:null,name,system,roles:[...roles],rotations}};
  }
  function valid(t){return t?.schemaVersion===1&&['5-1','4-2','6-2','custom'].includes(t.system)&&Array.isArray(t.roles)&&t.roles.length===6&&[1,2,3,4,5,6].every(r=>phases.every(p=>permutation(t.rotations?.[r]?.[p])));}
  function phase(m,s,side){const stored=m.tacticalPhases?.[s.id]?.[side];return phases.includes(stored)?stored:s.serve===side?'serve':'reception';}
  function setPhase(m,s,side,skill){
    if(!m||!s||s.training)return;
    const own=skill==='serve'?'serve':skill==='reception'?'reception':['defense','block'].includes(skill)?'defense':'attack';
    const other=own==='serve'?'reception':own==='reception'?'serve':own==='attack'?'defense':'attack';
    m.tacticalPhases ||= {};m.tacticalPhases[s.id]={[side]:own,[VolleyRally.other(side)]:other};
  }
  function layout(m,s,side){
    const t=m.tacticalProfiles?.[side];if(!valid(t))return null;
    const r=side==='us'?s.rotation:s.opponentLineup?.rotation||1,offset=m.tacticalAnchors?.[s.id]?.[side]||0;if(!Number.isInteger(r)||!Number.isInteger(offset))return null;const rotation=((r-1-offset)%6+6)%6+1,kind=phase(m,s,side);
    const raw=VolleyRally.positions(s,side,false),effective=VolleyRally.positions(s,side),slots=t.rotations[rotation][kind];
    if(raw.length!==6||effective.length!==6)return null;
    const ids=slots.map(slot=>effective[((slot-1)-(rotation-1)+6)%6]);
    if(new Set(ids).size!==6||ids.some(id=>!id))return null;
    const override=s.phaseOverrides?.[side]?.[kind],context=VolleyCourt.tacticalKey(s,side);
    if(override?.context===context&&Array.isArray(override.zones)&&override.zones.length===6&&new Set(override.zones).size===6&&override.zones.every(id=>effective.includes(id)))return {ids:[...override.zones],source:'tactical-template-adjusted',tactical:true,phase:kind,templateId:t.id};
    return {ids,source:'tactical-template',tactical:true,phase:kind,templateId:t.id};
  }
  function apply(m,s,side,t){
    if(!valid(t))return {error:'Plantilla inválida.'};
    const roles=VolleyRally.positions(s,side,false).map(id=>playerPosition(VolleyRally.roster(m,side).find(p=>p.id===id)));
    const currentRotation=side==='us'?s.rotation:s.opponentLineup?.rotation||1,anchor=Number.isInteger(t.editorAnchor)?t.editorAnchor:m.tacticalAnchors?.[s.id]?.[side]||0,preferred=((currentRotation-1-anchor)%6+6)%6;
    const alignment=t.system==='custom'?preferred:[preferred,0,1,2,3,4,5].find(k=>roles.every((role,i)=>role===t.roles[(i+k)%6]));
    if(alignment===undefined)return {error:'La plantilla no coincide con los roles actuales. Generá una plantilla desde esta formación.'};
    m.tacticalProfiles ||= {};m.tacticalProfiles[side]=copy(t);delete m.tacticalProfiles[side].editorAnchor;m.tacticalAnchors ||= {};m.tacticalAnchors[s.id] ||= {};m.tacticalAnchors[s.id][side]=(currentRotation-1-alignment+6)%6;
    if(s.phaseOverrides)delete s.phaseOverrides[side];if(s.tacticalOverrides)delete s.tacticalOverrides[side];return {ok:true};
  }
  function init(m,s,choices={}){
    if(!m.integralVersion)return;
    for(const side of ['us','them']){
      const chosen=choices[side]&&(state.preferences?.tacticalTemplates||[]).find(t=>t.id===choices[side]);
      if(chosen){apply(m,s,side,chosen);continue;}
      const roles=VolleyRally.positions(s,side,false).map(id=>playerPosition(VolleyRally.roster(m,side).find(p=>p.id===id))),system=m.tacticalSystems?.[side]||(roles.filter(r=>r==='setter').length===2?'6-2':'5-1'),result=generate(roles,system,'Formación del partido');
      if(result.template)apply(m,s,side,result.template);
    }
  }
  function lineup(players,system){
    const roles=system==='5-1'?['setter','outside','middle','opposite','outside','middle']:['setter','outside','middle','setter','outside','middle'],used=new Set(),ids=[];
    if(system==='custom')return {error:'En Personalizado, elegí la formación reglamentaria y editá las zonas.'};
    for(const role of roles){const p=players.find(p=>!p.isLibero&&!used.has(p.id)&&playerPosition(p)===role);if(!p)return {error:'Faltan jugadores con el rol '+(attackPositions[role]||role)+' para generar '+system+'.'};ids.push(p.id);used.add(p.id);}return {lineup:ids};
  }
  function validateSetup(draft,library){
    for(const side of ['us','them']){const id=draft.tacticalTemplates?.[side];if(!id)continue;const t=library.find(t=>t.id===id);if(!valid(t))return {error:'La plantilla seleccionada no existe o es inválida.'};if(t.system==='custom')continue;
      const roles=side==='us'?draft.lineup.map(id=>playerPosition(draft.players.find(p=>p.id===id))):(draft.opponentFormation||[]).map(p=>playerPosition(p));
      if(roles.length!==6||![0,1,2,3,4,5].some(k=>roles.every((role,i)=>role===t.roles[(i+k)%6])))return {error:'La plantilla de '+(side==='us'?'mi equipo':'rival')+' requiere configurar los seis roles y su orden inicial compatible.'};
    }return {ok:true};
  }
  return {phases,labels,generate,valid,phase,setPhase,layout,apply,init,copy,permutation,validateSetup,lineup};
})();

const VolleyPrediction=(()=>{
  const possible=origin=>origin===3?['zona1','centro','zona5']:[2,4,1,5,6].includes(origin)?['diagonal','paralela','olla','centro']:[];
  function direction(origin,dest,type){
    if(origin===3&&[3,6].includes(dest))return 'centro';
    const exact=VolleyRally.attackDirection(origin,dest,type);if(exact)return exact;
    const localX={1:1,2:1,3:0,4:-1,5:-1,6:0},from=localX[origin],to=localX[dest]==null?null:-localX[dest];
    if(from==null||to==null)return null;
    if(to===0)return type==='tip'?'olla':'centro';
    return from===to?'paralela':'diagonal';
  }
  function predict(m,a,previous=[]){
    const choices=possible(a.originZone);if(!choices.length)return null;
    const team=VolleyRally.side(a),unique=new Map([...m.sets.flatMap(s=>s.rallies.flatMap(r=>r.actions)),...previous].map(x=>[x.id,x])),rows=[...unique.values()].filter(x=>x.id!==a.id&&VolleyRally.skill(x)==='attack'&&VolleyRally.side(x)===team&&x.originZone===a.originZone&&x.metadata?.directionSource!=='predicted'&&choices.includes(x.metadata?.attackDirection));
    const personal=rows.filter(x=>x.playerId===a.playerId&&!a.metadata?.anonymous),sample=personal.length?personal:rows,counts=Object.fromEntries(choices.map(d=>[d,0]));for(const x of sample)counts[x.metadata.attackDirection]++;
    const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]),winner=sorted[0],tied=winner[1]&&sorted[1]?.[1]===winner[1];
    return {direction:winner[1]&&!tied?winner[0]:a.originZone===3?'centro':'diagonal',source:personal.length?'player':sample.length?'team-origin':'initial-origin',sample:sample.length,confidence:sample.length>=5&&!tied&&winner[1]/sample.length>=.6?'medium':'low',frequency:sample.length?winner[1]/sample.length:null};
  }
  function apply(m,actions){
    if(!m.integralVersion)return;
    actions.forEach((a,i)=>{
      if(VolleyRally.skill(a)!=='attack'||!a.metadata?.rallyFlow||a.metadata.interpretationVersion!==3)return;
      const md=a.metadata;
      if(md.directionSource!=='observed'&&a.destinationZone&&VolleyRally.spatial(md.originSource)&&['confirmed','inferred','recorded'].includes(VolleyRally.zoneStatus(a,'destination'))){md.attackDirection=direction(a.originZone,a.destinationZone,md.attackType);md.directionSource=md.attackDirection?'derived':'unknown';md.directionEvidence=md.attackDirection?'inferred':'unknown';delete md.prediction;}
      if(md.directionSource==='observed'){md.directionEvidence='confirmed';delete md.prediction;return;}
      if(['kill','tip_kill','use_block_out'].includes(a.outcomeId)&&!a.destinationZone&&(!md.attackDirection||md.directionSource==='predicted')){
        const p=predict(m,a,actions.slice(0,i));if(p){md.attackDirection=p.direction;md.directionSource='predicted';md.directionEvidence='predicted';md.prediction=p;}
      }else if(md.directionSource==='predicted'){md.attackDirection=null;md.directionSource='unknown';delete md.prediction;delete md.directionEvidence;}
    });
    for(const a of actions){const incoming=a.metadata?.incomingAttack;if(incoming){const source=actions.find(x=>x.id===incoming.actionId);if(source){incoming.direction=source.metadata?.attackDirection;incoming.directionSource=source.metadata?.directionSource;}}}
  }
  return {possible,direction,predict,apply};
})();

const VolleyIntegral=(()=>{
  function prepare(m,s,choices={}){m.integralVersion=3;m.rallyAutomation=2;if(m.courtAutomation==null)m.courtAutomation=1;if(choices.system){m.tacticalSystems ||= {};m.tacticalSystems.us=choices.system;}VolleyTactics.init(m,s,choices);}
  function upgrade(){
    if(storageLoadResult?.readOnly)return;
    const targets=state.matches.filter(m=>!m.integralVersion);if(!targets.length)return;
    const raw=localStorage.getItem(KEY);try{if(raw)VolleyData.createBackup(localStorage,KEY,raw,'before-integral-3');}catch(error){toast('No se pudo respaldar la actualización. Los datos se conservan.');return;}
    for(const m of targets){
      const s=m.sets.at(-1);if(!s||s.training)continue;
      // Existing draft actions remain verbatim; only new contacts use the new
      // recorder. Automatic replacements wait until that rally is closed.
      if(!s.opponentLineup?.current?.every(p=>p.id)||m.rallyAutomation!==2)enableRallyFlow(m,s);
      prepare(m,s);if(!state.openRallies?.[s.id]?.actions?.length)VolleyCourt.sync(m,s);
    }
  }
  function blockCandidates(m,s,side,origin){
    const other=VolleyRally.other(side),official=VolleyRally.positions(s,other),layout=VolleyCourt.layout(m,s,other),target=({4:2,5:2,2:4,1:4,3:3,6:3})[origin];
    return [2,3,4].map(p=>{const id=official[p-1],player=VolleyRally.roster(m,other).find(x=>x.id===id);return {id,player,rotation:p,zone:layout.ids.indexOf(id)+1};}).filter(x=>x.player&&!x.player.isLibero).sort((a,b)=>Math.abs(a.zone-target)-Math.abs(b.zone-target));
  }
  return {prepare,upgrade,blockCandidates};
})();

const VolleyLinks=(()=>{
  const bump=(map,key)=>{key=key||'unknown';map[key]=(map[key]||0)+1;};
  function summarize(list){
    const recovery=()=>({directions:{},attackers:{},counterattack:{attempts:0,kills:0}}),defense=recovery(),coverage=recovery(),block={attackers:{},zones:{},composition:{single:0,double:0,triple:0,unknown:0}},setting={zones:{},targets:{},receptionQuality:{}};
    for(const e of list){const a=e.action,md=a.metadata||{};
      if(a.skill==='defense'){
        const out=md.defenseKind==='coverage'?coverage:defense,incoming=md.incomingAttack;
        if(incoming&&incoming.directionSource!=='predicted'){bump(out.directions,incoming.direction);bump(out.attackers,incoming.playerId);}
        const next=md.counterattack;
        if(next){out.counterattack.attempts++;out.counterattack.kills+=+['kill','tip_kill','use_block_out'].includes(next.outcomeId);}
      }
      if(a.skill==='block'){
        const ids=StatsV2.participants(a),n=ids.length;block.composition[n===1?'single':n===2?'double':n===3?'triple':'unknown']++;
        if(!md.derivedBlockFrom)bump(block.zones,a.originZone);
        if(['point','positive_touch','uncontrolled_touch'].includes(e.result.outcomeId))bump(block.attackers,md.incomingAttack?.playerId||(md.derivedBlockFrom?md.playerSnapshot?.id:null));
      }
      if(a.skill==='setting'){
        bump(setting.zones,a.destinationZone||md.linkedAttack?.originZone);bump(setting.targets,md.receiverId||md.linkedAttack?.playerId);
        if(md.receptionQuality!=null)bump(setting.receptionQuality,String(md.receptionQuality));
      }
    }
    return {defense,coverage,block,setting};
  }
  return {summarize};
})();
