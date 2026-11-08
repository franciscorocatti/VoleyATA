'use strict';
// positions[0..5] representa P1..P6, como courtPlayers y la rotación existentes.
const VolleyPosition=(()=>{
  const labels={front:'DELANTERO',back:'ZAGUERO',unknown:'SIN DETERMINAR'};
  function forPlayer(playerId,snapshot){
    const positions=snapshot?.positions;
    if(!playerId||!Array.isArray(positions)||positions.length!==6||positions.some(id=>typeof id!=='string'||!id)||new Set(positions).size!==6)return {role:'unknown',position:null,source:'unknown'};
    const libero=snapshot.libero;
    const effective=positions.map(id=>libero?.replacedId===id?libero.playerId:id);
    if(new Set(effective).size!==6)return {role:'unknown',position:null,source:'unknown'};
    const index=effective.indexOf(playerId);
    if(index<0)return {role:'unknown',position:null,source:'unknown'};
    const position=index+1;
    return {role:[2,3,4].includes(position)?'front':'back',position,source:'rotation'};
  }
  function resolve(action,rally){
    if(action?.skill!=='attack')return {role:'unknown',position:null,source:'unknown'};
    if(Object.prototype.hasOwnProperty.call(action,'attackRole'))return {role:labels[action.attackRole]?action.attackRole:'unknown',position:[1,2,3,4,5,6].includes(action.rotationalPosition)?action.rotationalPosition:null,source:action.metadata?.attackRoleSource||'stored'};
    // Nunca consultar la formación ACTUAL para un ataque histórico.
    const positions=rally?.before?.positions||rally?.positions;
    if(rally?.before?.positions&&rally?.positions&&JSON.stringify(rally.before.positions)!==JSON.stringify(rally.positions))return {role:'unknown',position:null,source:'conflicting-snapshot'};
    if(rally?.before&&Object.prototype.hasOwnProperty.call(rally.before,'libero')&&Object.prototype.hasOwnProperty.call(rally,'liberoBefore')&&JSON.stringify(rally.before.libero)!==JSON.stringify(rally.liberoBefore))return {role:'unknown',position:null,source:'conflicting-snapshot'};
    const libero=rally?.before&&Object.prototype.hasOwnProperty.call(rally.before,'libero')?rally.before.libero:rally?.liberoBefore;
    const result=forPlayer(action.playerId,{positions,libero});
    return {...result,source:result.role==='unknown'?'unknown':'historical-snapshot'};
  }
  return {labels,forPlayer,resolve};
})();
