const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');

function fixture(id='match-1') {
  const players=Array.from({length:8},(_,i)=>({id:'p'+(i+1),number:String(i+1),name:'Jugador '+(i+1),isLibero:i===7}));
  const positions=players.slice(0,6).map(p=>p.id);
  const rally=(n,actions,winner='us')=>({id:id+'-r'+n,timestamp:'2026-11-07T20:00:00Z',winner,serveBefore:'them',rotation:1,positions:[...positions],scoreBefore:{us:n-1,them:0},actions});
  return {id,team:'Equipo',opponent:'Rival',date:'2026-11-07',createdAt:'2026-11-07T19:00:00Z',players,sets:[{number:1,positions,initialLineup:[...positions],rotation:1,score:{us:1,them:0},finished:false,winner:null,changes:[],rallies:[rally(1,[{playerId:'p1',skill:'attack',outcome:'Punto',zone:4}])]}]};
}
function harness() {
  const tables=new Map();let writes=0,failTitle='';
  function sheet(title) {
    return {title,rows:[],maxColumns:17,getLastRow(){return this.rows.length},getMaxRows(){return 1000},getMaxColumns(){return this.maxColumns},
      insertRowsAfter(){},insertColumnsAfter(at,count){this.maxColumns+=count},setFrozenRows(){},
      getRange(r,c,n,w){const self=this;return {
        getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>self.rows[r-1+i]?.[c-1+j]??'')),
        setValues(rows){if(failTitle===title)throw Error('Fallo simulado de escritura');writes++;rows.forEach((row,i)=>{self.rows[r-1+i] ||= [];row.forEach((value,j)=>self.rows[r-1+i][c-1+j]=value)});return this},
        clearContent(){writes++;for(let i=0;i<n;i++)for(let j=0;j<w;j++)if(self.rows[r-1+i])self.rows[r-1+i][c-1+j]='';while(self.rows.length && !self.rows.at(-1).some(value=>value!==''))self.rows.pop();return this},
        setBackground(){return this},setFontColor(){return this},setFontWeight(){return this}
      }}};
  }
  const book={getSheetByName:title=>tables.get(title),insertSheet(title){const s=sheet(title);tables.set(title,s);return s}};
  const ctx=vm.createContext({
    LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},
    SpreadsheetApp:{openById:()=>book,flush(){}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'google-apps-script.gs'),'utf8'),ctx);
  function post(input) {ctx.input=input;return vm.runInContext('doPost({postData:{contents:JSON.stringify(input)}})',ctx)}
  return {tables,book,post,ctx,get writes(){return writes},set failTitle(title){failTitle=title}};
}
module.exports=function verifySheetsV2(){
  const h=harness();
  const legacy=fixture();
  assert.equal(h.post({matches:[legacy]}).ok,true);
  assert.equal(h.tables.size,9,'El cliente V1 conserva exactamente sus pestañas');
  const headers=JSON.stringify(h.tables.get('Volley Acciones').rows[0]);
  assert.equal(h.tables.get('Volley Acciones').rows[0].length,17);
  assert.equal(h.tables.get('Volley Acciones').rows[1][16],4);
  const old=fixture('another-match');
  assert.equal(h.post({matches:[old]}).ok,true);
  const dashboard=h.book.insertSheet('Volley Resumen');
  dashboard.rows=[['Resumen manual','=COUNTIFS(\'Volley Acciones\'!P:P,"Punto")'],['Jugador','Todos']];
  const dashboardBefore=JSON.stringify(dashboard.rows);
  h.tables.get('Volley Acciones').rows[0][17]='Cálculo manual fuera del contrato';
  h.tables.get('Volley Acciones').rows[1][17]='=N2';
  const m=fixture();
  const s=m.sets[0], first=s.rallies[0];
  s.id='set-1';s.schemaVersion=2;
  first.mode='advanced';first.schemaVersion=2;first.status='closed';first.cause='attack_kill';first.number=1;first.sequenceComplete=true;
  first.actions=[
    {id:'a1',schemaVersion:2,order:1,playerId:'p1',participants:['p1'],skill:'reception',outcomeId:'perfect',outcome:'Perfecta',originZone:null,destinationZone:null},
    {id:'a2',schemaVersion:2,order:2,playerId:'p2',participants:['p2'],skill:'setting',outcomeId:'good',outcome:'Positiva',originZone:2,destinationZone:null,metadata:{receiverId:'p1',settingTarget:'punta'}},
    {id:'a3',schemaVersion:2,order:3,playerId:'p1',participants:['p1'],skill:'attack',outcomeId:'kill',outcome:'Punto',originZone:4,destinationZone:1,metadata:{setterId:'p2',attackPhase:'reception'}}
  ];
  const result=h.post({schemaVersion:2,matches:[m]});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.contractVersion,2);
  assert.equal(result.counts.actions,3);
  assert.equal(JSON.stringify(h.tables.get('Volley Acciones').rows[0].slice(0,17)),headers);
  assert.equal(JSON.stringify(dashboard.rows),dashboardBefore,'El resumen manual nunca se toca');
  assert.equal(h.tables.get('Volley Acciones').rows[0][17],'Cálculo manual fuera del contrato');
  assert.equal(h.tables.get('Volley Acciones').rows[1][17],'=N2','Las columnas fuera del contrato no se escriben');
  assert.equal(h.tables.get('Volley Acciones').rows.filter(r=>r[0]==='another-match').length,1);
  const v2=h.tables.get('Volley Acciones V2').rows;
  assert.equal(v2[1][12],'','Null origen se escribe vacío');
  assert.equal(v2[1][13],'','Null destino se escribe vacío');
  assert.equal(v2[3][12],4);assert.equal(v2[3][13],1);
  assert.equal(v2[3][16],'p2');
  assert.equal(JSON.parse(v2[3][22]).originZone,4);
  const rowCounts=JSON.stringify([...h.tables].map(([name,t])=>[name,t.rows.length]));
  assert.equal(h.post({schemaVersion:2,matches:[m]}).ok,true);
  assert.equal(JSON.stringify([...h.tables].map(([name,t])=>[name,t.rows.length])),rowCounts,'Repetir el envío no duplica filas');
  // Bloqueado histórico: sólo el último ataque con ganador rival es error probado.
  const historical=fixture('historic');
  const base=historical.sets[0].rallies[0];
  historical.sets[0].rallies=[
    {...base,id:'h1',winner:'them',actions:[{playerId:'p1',skill:'attack',outcome:'Bloqueado',zone:4,blocker:{number:'9',name:'Rival 9'}}]},
    {...base,id:'h2',winner:'us',actions:[{playerId:'p1',skill:'attack',outcome:'Bloqueado',zone:4},{playerId:'p2',skill:'attack',outcome:'Punto',zone:2}]},
    {...base,id:'h3',winner:'us',actions:[{playerId:'p1',skill:'attack',outcome:'Bloqueado',zone:4}]}
  ];
  const original=JSON.stringify(historical);
  assert.equal(h.post({schemaVersion:2,matches:[historical]}).ok,true);
  assert.equal(JSON.stringify(historical),original,'El adaptador no modifica el input original');
  const historicRows=h.tables.get('Volley Acciones V2').rows.filter(r=>r[0]==='historic');
  assert.deepEqual(historicRows.map(r=>r[10]),['blocked_point','covered_block','kill','ambiguous_block']);
  assert.equal(historicRows[3][15],true);
  assert.equal(JSON.parse(historicRows[3][22]).outcome,'Bloqueado');
  const blockRows=h.tables.get('Volley Bloqueos').rows.filter(r=>r[0]==='historic');
  assert.deepEqual(blockRows.map(r=>r[8]),[true,false,false]);
  const migrated=fixture('migrated');
  const migratedAction=migrated.sets[0].rallies[0].actions[0];
  migratedAction.schemaVersion=2;migratedAction.id='migrated-a1';migratedAction.compat={legacy:true,sourceSchemaVersion:1};
  assert.equal(h.post({schemaVersion:2,matches:[migrated]}).ok,true);
  assert.equal(h.tables.get('Volley Acciones').rows.find(r=>r[0]==='migrated')[16],4,'La zona histórica permanece después de migrar');
  migratedAction.outcome='Resultado histórico desconocido';
  assert.equal(h.post({schemaVersion:2,matches:[migrated]}).ok,true);
  const migratedRow=h.tables.get('Volley Acciones V2').rows.find(r=>r[0]==='migrated');
  assert.equal(migratedRow[10],'legacy_unknown');assert.equal(migratedRow[15],true);
  assert.equal(JSON.parse(migratedRow[22]).outcome,migratedAction.outcome,'No se rechaza ni reinterpreta un resultado histórico desconocido');
  // Bloqueo asistido: una sola fila de acción, con ambos participantes, sin doble punto.
  const assisted=fixture('assisted');
  assisted.sets[0].rallies[0].actions=[{schemaVersion:2,id:'ab1',playerId:'p1',participants:['p1','p2'],skill:'block',outcomeId:'point',outcome:'Punto',originZone:3,destinationZone:null}];
  assert.equal(h.post({schemaVersion:2,matches:[assisted]}).ok,true);
  assert.equal(h.tables.get('Volley Acciones').rows.filter(r=>r[0]==='assisted').length,1);
  assert.equal(h.tables.get('Volley Acciones V2').rows.find(r=>r[0]==='assisted')[8],'["p1","p2"]');
  const badInputs=[
    null,{matches:Array.from({length:201},()=>fixture())},{schemaVersion:3,matches:[fixture()]},{matches:[fixture(),fixture()]}
  ];
  for(const change of [
    x=>x.team={text:'bad'},x=>x.sets[0].score.us=-1,
    x=>x.sets[0].rallies[0].actions[0].playerId='missing',
    x=>x.sets[0].rallies[0].actions[0].participants=['p1','p1'],
    x=>x.sets[0].rallies[0].actions[0].originZone=7,
    x=>x.sets[0].rallies[0].actions[0].outcomeId='invalid',
    x=>x.sets[0].rallies[0].status='open',
    x=>x.sets[0].rallies[0].actions[0].metadata={setterId:'missing'}
  ]){const bad=fixture();change(bad);badInputs.push({schemaVersion:2,matches:[bad]})}
  for(const bad of badInputs) {
    const before=h.writes;const answer=h.post(bad);
    assert.equal(answer.ok,false,JSON.stringify(bad));
    assert.equal(h.writes,before,'La validación falla antes de escribir');
  }
  // Un encabezado incompatible en la última pestaña se detecta antes de escribir en la primera.
  const blockerSheet=h.tables.get('Volley Bloqueos');
  blockerSheet.rows[0][0]='Encabezado manual incompatible';
  const before=h.writes;
  const rejected=h.post({schemaVersion:2,matches:[m]});
  assert.equal(rejected.ok,false);
  assert.match(rejected.error,/Encabezados incompatibles/);
  assert.equal(h.writes,before);
  blockerSheet.rows[0][0]='ID partido';
  h.failTitle='Volley Rallies V2';
  const partial=h.post({schemaVersion:2,matches:[m]});
  assert.equal(partial.ok,false,'Un fallo parcial de Google nunca se confirma');
  h.failTitle='';
  assert.equal(h.post({schemaVersion:2,matches:[m]}).ok,true,'Reintentar repara con los mismos IDs');
  assert.equal(JSON.stringify(dashboard.rows),dashboardBefore);
  return {legacyNineTabsAndFirst17:'OK',v2AuxiliaryTables:'OK',dashboardAndExtraColumnsPreserved:'OK',optionalZones:'OK',idempotencyAndOtherMatches:'OK',historicalBlockedContext:'OK',assistedBlockOneAction:'OK',typedValidationBeforeWrites:'OK',headerPreflight:'OK',writeFailureRetry:'OK'};
};
if(require.main===module){try{console.log(JSON.stringify(module.exports(),null,2))}catch(error){console.error(error);process.exitCode=1}}


module.exports.harness=harness;
module.exports.fixture=fixture;
