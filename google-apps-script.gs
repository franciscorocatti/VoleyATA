// Pegar el archivo completo en Extensiones > Apps Script de la misma hoja.
// Conserva las nueve pestañas anteriores y no modifica Volley Resumen.
const SPREADSHEET_ID = '1zzQpnoHHJNvNVTPdOyPkhcwftZUucV0tFPwxeYZdQpE';
const SHEET_DEFINITIONS = [
  ['partidos','Volley Partidos',['ID partido','Fecha','Equipo','Rival','Creado','Actualizado']],
  ['jugadores','Volley Jugadores',['ID partido','ID jugador','Número','Nombre']],
  ['sets','Volley Sets',['ID partido','Set','Puntos equipo','Puntos rival','Finalizado','Ganador','Rotación']],
  ['acciones','Volley Acciones',['ID partido','Fecha','Equipo','Rival','Set','ID rally','Hora','Puntos equipo','Puntos rival','Servicio previo','Rotación','Ganador rally','Número','Jugador','Fundamento','Resultado','Zona']],
  ['formaciones','Volley Formaciones',['ID partido','Set','Posición inicial','ID jugador','Número','Jugador','Recuperada de registro anterior']],
  ['cambios','Volley Cambios',['ID partido','Set','ID cambio','Hora','Tipo','Puntos equipo','Puntos rival','Rotación','Posición','Número sale','Sale','Número entra','Entra']],
  ['liberos','Volley Liberos',['ID partido','ID jugador','Número','Nombre']],
  ['atacantesRivales','Volley Atacantes Rivales',['ID partido','ID jugador rival','Camiseta','Puesto','Nombre']],
  ['rival','Volley Rival',['ID partido','Rival','Set','Posición al registrar','Número','Nombre','Posición actual','Rotación actual','Puntos equipo al registrar','Puntos rival al registrar']],
  ['bloqueos','Volley Bloqueos',['ID partido','Set','ID rally','Hora','Número atacante','Atacante','Número bloqueador rival','Bloqueador rival','Punto de bloqueo rival']],
  ['accionesV2','Volley Acciones V2',['ID partido','ID set','Set','ID rally','ID acción','Orden','Versión esquema','ID jugador','Participantes','Fundamento ID','Resultado ID','Resultado original','Zona origen','Zona destino','Modo','Dato histórico ambiguo','Armador ID','Atacante receptor ID','Destino armado','Fase ataque','Bloqueadores rivales','Metadatos JSON','Acción original JSON']],
  ['ralliesV2','Volley Rallies V2',['ID partido','ID set','Set','ID rally','Número rally','Versión esquema','Estado','Modo','Causa punto','Servicio previo ID','Ganador ID','Puntos equipo antes','Puntos rival antes','Rotación previa','Formación previa','Secuencia completa','Hora','Rally original JSON']]
];
const OUTCOMES_V2 = {
  rival_attack:{kill:'Punto rival',continue:'Sigue / defendido',error:'Error rival',blocked_point:'Bloqueo nuestro',covered_block:'Bloqueo nuestro · sigue'},
  serve:{ace:'Ace',positive:'Positivo',neutral:'Continuidad',error:'Error'},
  reception:{perfect:'Perfecta',positive:'Positiva',poor:'Negativa',direct_error:'Error'},
  attack:{kill:'Punto',continue:'Continuidad',use_block_out:'Punto',tip_kill:'Punto',tip_continue:'Continuidad',covered_block:'Bloqueo cubierto',blocked_point:'Bloqueado',error:'Error',ambiguous_block:'Bloqueado histórico ambiguo'},
  block:{point:'Punto',positive_touch:'Toque',uncontrolled_touch:'Toque sin control',fault:'Error'},
  defense:{perfect:'Perfecta',positive:'Positiva',limited:'Negativa',direct_error:'Error'},
  setting:{perfect:'Perfecta',good:'Positiva',forced:'Negativa',direct_error:'Error'}
};
function doGet() {
  return jsonResponse({ok:true,contractVersion:2,trainingContractVersion:1,service:'Volley Scout',note:'El guardado se confirma solamente al recibir un POST válido.'});
}
function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') throw new Error('Falta el contenido del envío');
    const input = JSON.parse(e.postData.contents);
    const training=prepareTrainings(input);
    const prepared = Array.isArray(input.matches)&&input.matches.length?preparePayload(input):null;
    if(!prepared&&!training)throw Error('No hay partidos ni entrenamientos válidos para guardar'); // Valida todo antes de abrir o modificar la hoja.
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const definitions = prepared?SHEET_DEFINITIONS.filter(def => (prepared.v2 || !/V2$/.test(def[0])) && (def[0]!=='atacantesRivales'||prepared.data.atacantesRivales.length||book.getSheetByName(def[1]))):[];
    // También se revisan TODOS los encabezados antes de escribir: un fallo no deja nueve pestañas a medias.
    const plans = definitions.map(def => planMatches(book,def[1],def[2],prepared.data[def[0]],prepared.ids));
    if(training){checkTrainingRevisions(book,training);TRAINING_SHEETS.forEach(def=>plans.push(planMatches(book,def[1],def[2],training.data[def[0]],training.ids)));}
    for (const plan of plans) applyMatches(book,plan);
    SpreadsheetApp.flush();
    return jsonResponse({ok:true,contractVersion:2,matchIds:prepared?Array.from(prepared.ids):[],trainingContractVersion:1,trainingAcks:training?training.acks:[],
      counts:{matches:prepared?prepared.data.partidos.length:0,rallies:prepared?prepared.data.ralliesV2.length:0,actions:prepared?prepared.data.accionesV2.length:0}});
  } catch (error) {
    // Apps Script no ofrece transacciones entre pestañas. Si una escritura falla,
    // no se confirma; repetir el mismo envío reemplaza sus IDs y repara sin duplicar.
    return jsonResponse({ok:false,contractVersion:2,error:String(error.message || error)});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
function preparePayload(input) {
  if (!isRecord(input) || (input.schemaVersion !== undefined && input.schemaVersion !== 1 && input.schemaVersion !== 2)) throw new Error('Versión de envío incompatible');
  if (!Array.isArray(input.matches) || !input.matches.length || input.matches.length > 200) throw new Error('Cantidad de partidos inválida (máximo 200 por envío)');
  const ids = new Set(), data = {};
  for (const def of SHEET_DEFINITIONS) data[def[0]] = [];
  let v2 = input.schemaVersion === 2;
  const now = new Date().toISOString();
  const names = {serve:'Saque',reception:'Recepción',attack:'Ataque',block:'Bloqueo',defense:'Defensa',setting:'Armado'};
  for (const m of input.matches) {
    if (!isRecord(m) || typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(m.id) || ids.has(m.id) || !Array.isArray(m.players) || !Array.isArray(m.sets) || !m.sets.length) throw new Error('Partido inválido o ID repetido');
    textValue(m.team,'Equipo'); textValue(m.opponent,'Rival');
    schemaValue(m.schemaVersion);
    if (m.schemaVersion === 2) v2=true;
    ids.add(m.id);
    const players = new Map();
    for (const p of m.players) {
      if (!isRecord(p) || !isID(p.id) || players.has(p.id)) throw new Error('Jugador inválido o ID repetido');
      textValue(p.number,'Número de jugador'); textValue(p.name,'Nombre de jugador');
      players.set(p.id,p);
      data.jugadores.push([m.id,p.id,p.number,p.name]);
      if (p.isLibero) data.liberos.push([m.id,p.id,p.number,p.name]);
    }
    const rivalAttackers=new Map();
    for(const p of (m.rivalPlayers||[])){if(!isRecord(p)||!isID(p.id)||rivalAttackers.has(p.id)||(!p.provisional&&!/^\d{1,3}$/.test(p.number))||!['','outside','opposite','middle','setter','libero'].includes(p.position??''))throw new Error('Atacante rival inválido');rivalAttackers.set(p.id,p);data.atacantesRivales.push([m.id,p.id,p.number,p.position,p.name||'']);}
    data.partidos.push([m.id,m.date,m.team,m.opponent,m.createdAt,now]);
    const setNumbers = new Set(), rallyIDs = new Set(), actionIDs = new Set();
    for (const s of m.sets) {
      if (!isRecord(s) || !Number.isInteger(s.number) || s.number < 1 || setNumbers.has(s.number) || !Array.isArray(s.rallies)) throw new Error('Set inválido o repetido');
      schemaValue(s.schemaVersion);
      setNumbers.add(s.number); scoreValue(s.score,'Marcador del set'); rotationValue(s.rotation);
      const initial = s.initialLineup || (s.rallies[0] && s.rallies[0].positions) || s.positions;
      lineupValue(initial,players,'Formación inicial');
      lineupValue(s.positions,players,'Formación actual');
      if (s.schemaVersion === 2) v2 = true;
      const setId = s.id || m.id+'-set-'+s.number;
      if (!isID(setId)) throw new Error('ID de set inválido');
      if (s.opponentLineup) {
        const o = s.opponentLineup;
        if (!isRecord(o) || !Array.isArray(o.initial) || o.initial.length !== 6 || !Array.isArray(o.current) || o.current.length !== 6) throw new Error('Formación rival inválida');
        scoreValue(o.scoreAtRegistration,'Marcador de formación rival'); rotationValue(o.rotation);
        for (let i=0;i<o.initial.length;i++) {
          const p = o.initial[i];
          if (!isRecord(p)) throw new Error('Jugador rival inválido');
          textValue(p.number,'Número rival'); textValue(p.name || '','Nombre rival');
          const current = o.current.findIndex(x => isRecord(x) && (p.id?x.id===p.id:x.number === p.number))+1;
          data.rival.push([m.id,m.opponent,s.number,i+1,p.number,p.name || '',current,o.rotation,o.scoreAtRegistration.us,o.scoreAtRegistration.them]);
        }
      }
      initial.forEach((id,i) => {
        const p=players.get(id);
        data.formaciones.push([m.id,s.number,i+1,id,p.number,p.name,!!s.initialLineupInferred || (!s.initialLineup && s.rallies.length>0)]);
      });
      if (s.changes !== undefined && !Array.isArray(s.changes)) throw new Error('Historial de cambios inválido');
      for (const c of (s.changes || [])) {
        if (!isRecord(c)) throw new Error('Cambio inválido');
        scoreValue(c.score,'Marcador de cambio'); rotationValue(c.rotation);
        const changeRoster=c.side==='them'?rivalAttackers:players;const out=changeRoster.get(c.outgoing), incoming=changeRoster.get(c.incoming);
        data.cambios.push([m.id,s.number,c.id,c.timestamp,c.type,c.score.us,c.score.them,c.rotation,c.position,out ? out.number:'',out ? out.name:'',incoming ? incoming.number:'',incoming ? incoming.name:'']);
      }
      data.sets.push([m.id,s.number,s.score.us,s.score.them,!!s.finished,s.winner === 'us' ? m.team : s.winner === 'them' ? m.opponent:'',s.rotation]);
      for (let ri=0;ri<s.rallies.length;ri++) {
        const r=s.rallies[ri];
        if (!isRecord(r) || !isID(r.id) || rallyIDs.has(r.id) || !Array.isArray(r.actions) || !['us','them'].includes(r.winner) || !['us','them'].includes(r.serveBefore)) throw new Error('Rally cerrado inválido o repetido');
        rallyIDs.add(r.id); scoreValue(r.scoreBefore,'Marcador previo'); rotationValue(r.rotation);
        schemaValue(r.schemaVersion);
        if (r.number !== undefined && (!Number.isInteger(r.number) || r.number<1)) throw new Error('Número de rally inválido');
        if (r.positions !== undefined) lineupValue(r.positions,players,'Formación previa');
        if (r.status !== undefined && r.status !== 'closed') throw new Error('No se envían rallies abiertos como puntos confirmados');
        if (r.mode !== undefined && !['quick','advanced','legacy'].includes(r.mode)) throw new Error('Modo de registro inválido');
        if (r.sequenceComplete !== undefined && typeof r.sequenceComplete !== 'boolean') throw new Error('Calidad de secuencia inválida');
        if (r.schemaVersion === 2) v2=true;
        const rawRally=Object.assign({},r); delete rawRally.actions;
        data.ralliesV2.push([m.id,setId,s.number,r.id,r.number || ri+1,r.schemaVersion || 1,'closed',r.mode || 'legacy',r.cause || '',r.serveBefore,r.winner,r.scoreBefore.us,r.scoreBefore.them,r.rotation,jsonCell(r.positions || []),r.sequenceComplete === true,r.timestamp,jsonCell(rawRally)]);
        for (let ai=0;ai<Math.max(1,r.actions.length);ai++) {
          const a=r.actions[ai] || null;
          let p=null, view=null, aid='', participants=[], meta={}, origin=null, destination=null;
          if (a) {
            if (!isRecord(a) || !Object.prototype.hasOwnProperty.call(OUTCOMES_V2,a.skill)) throw new Error('Fundamento de acción inválido');
            if (a.schemaVersion !== undefined && a.schemaVersion !== 1 && a.schemaVersion !== 2) throw new Error('Versión de acción incompatible');
            if (a.schemaVersion === 2) v2=true;
            if (a.playerId != null && !(a.skill==='rival_attack'||a.side==='them'?rivalAttackers:players).has(a.playerId)) throw new Error('La acción pertenece a un jugador inexistente');
            p=(a.skill==='rival_attack'||a.side==='them'?rivalAttackers:players).get(a.playerId) || null;
            participants = a.participants === undefined ? (a.playerId ? [a.playerId]:[]) : a.participants;
            if (!Array.isArray(participants) || participants.some(id=>!(a.side==='them'?rivalAttackers:players).has(id)) || new Set(participants).size !== participants.length) throw new Error('Participantes de acción inválidos');
            if (a.metadata !== undefined && !isRecord(a.metadata)) throw new Error('Metadatos de acción inválidos');
            meta=a.metadata || {};
            for (const field of ['setterId','receiverId']) if (meta[field] != null && !(a.side==='them'?rivalAttackers:players).has(meta[field])) throw new Error('Jugador relacionado inexistente');
            if (meta.rivalBlockers !== undefined && (!Array.isArray(meta.rivalBlockers) || meta.rivalBlockers.some(b=>!isRecord(b)))) throw new Error('Bloqueadores rivales inválidos');
            aid=a.id || r.id+'-action-'+(ai+1);
            if (!isID(aid) || actionIDs.has(aid)) throw new Error('ID de acción inválido o repetido');
            actionIDs.add(aid);
            view=actionView(a,r,ai);
            zoneValue(a.zone); zoneValue(a.originZone); zoneValue(a.destinationZone);
            origin=a.originZone == null ? null:a.originZone;
            destination=a.destinationZone == null ? null:a.destinationZone;
            // Un dato histórico explícito conserva su zona; las acciones nuevas nunca inventan una.
            if ((a.schemaVersion !== 2 || (a.compat && a.compat.legacy)) && a.zone != null && a.zone !== '') {
              if (['serve','attack'].includes(a.skill) && destination == null) destination=a.zone;
              if (!['serve','attack'].includes(a.skill) && origin == null) origin=a.zone;
            }
            const rivals=meta.rivalBlockers || (a.blocker ? [a.blocker]:[]);
            if (a.side!=='them' && a.skill === 'attack' && ['blocked_point','covered_block','ambiguous_block'].includes(view.id)) {
              const blocker=rivals[0] || {};
              data.bloqueos.push([m.id,s.number,r.id,r.timestamp,p ? p.number:'',p ? p.name:'',blocker.number || '',blocker.name || '',view.id === 'blocked_point']);
            }
            data.accionesV2.push([m.id,setId,s.number,r.id,aid,ai+1,a.schemaVersion || 1,a.playerId || '',jsonCell(participants),a.skill,view.id,a.outcome || '',origin,destination,r.mode || 'legacy',view.ambiguous,meta.setterId || '',meta.receiverId || '',meta.settingTarget || '',meta.attackPhase || '',jsonCell(rivals),jsonCell(meta),jsonCell(a)]);
          }
          const legacyZone=a ? (['serve','attack'].includes(a.skill) ? destination:origin):null;
          data.acciones.push([m.id,m.date,m.team,m.opponent,s.number,r.id,r.timestamp,r.scoreBefore.us+(r.winner === 'us' ? 1:0),r.scoreBefore.them+(r.winner === 'them' ? 1:0),r.serveBefore === 'us' ? m.team:m.opponent,r.rotation,r.winner === 'us' ? m.team:m.opponent,p ? p.number:'',p ? p.name:'',a ? (a.skill==='rival_attack'?'Ataque rival':names[a.skill]+(a.side==='them'?' rival':'')):'',a ? view.label:'',legacyZone]);
        }
      }
    }
  }
  return {ids:ids,data:data,v2:v2};
}
function actionView(a,r,index) {
  if (a.outcomeId !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(OUTCOMES_V2[a.skill],a.outcomeId)) throw new Error('Resultado de acción incompatible');
    return {id:a.outcomeId,label:OUTCOMES_V2[a.skill][a.outcomeId],ambiguous:a.outcomeId === 'ambiguous_block'};
  }
  textValue(a.outcome,'Resultado de acción');
  const historical = {
    serve:{Ace:'ace',Positivo:'positive',Continuidad:'neutral',Neutro:'neutral',Error:'error'},
    reception:{Perfecta:'perfect',Positiva:'positive',Negativa:'poor',Mala:'poor',Error:'direct_error'},
    attack:{Punto:'kill',Continuidad:'continue',Sigue:'continue','Bloqueo cubierto':'covered_block','Bloqueo punto':'blocked_point',Error:'error'},
    block:{Punto:'point',Toque:'positive_touch','Toque positivo':'positive_touch','Toque sin control':'uncontrolled_touch',Error:'fault',Falta:'fault'},
    defense:{Perfecta:'perfect',Positiva:'positive',Negativa:'limited',Limitada:'limited',Error:'direct_error','Error directo':'direct_error'},
    setting:{Perfecta:'perfect',Perfecto:'perfect',Positiva:'good',Bueno:'good',Negativa:'forced',Forzado:'forced',Error:'direct_error','Error directo':'direct_error'}
  };
  let id=historical[a.skill][a.outcome];
  if (a.skill === 'attack' && a.outcome === 'Bloqueado') {
    id=index<r.actions.length-1 ? 'covered_block' : r.winner === 'them' ? 'blocked_point':'ambiguous_block';
  }
  // Un resultado desconocido histórico se conserva sin atribuirle un significado nuevo.
  return {id:id || 'legacy_unknown',label:id ? OUTCOMES_V2[a.skill][id]:a.outcome,ambiguous:id === 'ambiguous_block' || !id};
}
function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function schemaValue(value) {
  if (value !== undefined && value !== 1 && value !== 2) throw new Error('Versión de registro incompatible');
}
function isID(value) { return typeof value === 'string' && value.length>0 && value.length<=200 && !/[\u0000-\u001f]/.test(value); }
function textValue(value,label) {
  if (!['string','number'].includes(typeof value) || String(value).length>1000) throw new Error(label+' inválido');
}
function scoreValue(value,label) {
  if (!isRecord(value) || !Number.isInteger(value.us) || value.us<0 || !Number.isInteger(value.them) || value.them<0) throw new Error(label+' inválido');
}
function rotationValue(value) {
  if (!Number.isInteger(value) || value<1 || value>6) throw new Error('Rotación inválida');
}
function zoneValue(value) {
  if (value != null && value !== '' && (!Number.isInteger(value) || value<1 || value>6)) throw new Error('Zona inválida');
}
function lineupValue(value,players,label) {
  if (!Array.isArray(value) || value.length!==6 || new Set(value).size!==6 || value.some(id=>!players.has(id))) throw new Error(label+' inválida');
}
function jsonCell(value) {
  const text=JSON.stringify(value);
  if (text.length>45000) throw new Error('Un registro supera el tamaño permitido por Google Sheets; los datos locales se conservan');
  return text;
}
function planMatches(book,title,headers,incoming,ids) {
  const sheet=book.getSheetByName(title);
  const oldLast=sheet ? sheet.getLastRow():0;
  if (oldLast && sheet.getRange(1,1,1,headers.length).getValues()[0].join('|') !== headers.join('|')) throw new Error('Encabezados incompatibles en '+title);
  const existing=oldLast>1 ? sheet.getRange(2,1,oldLast-1,headers.length).getValues().filter(row=>row[0] !== '' && row[0] != null && !ids.has(String(row[0]))):[];
  return {sheet:sheet,title:title,headers:headers,oldLast:oldLast,rows:[headers].concat(existing,incoming).map(row=>row.map(safeCell))};
}
function applyMatches(book,plan) {
  const sheet=plan.sheet || book.insertSheet(plan.title);
  const rows=plan.rows, width=plan.headers.length;
  if (rows.length>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),rows.length-sheet.getMaxRows());
  if (typeof sheet.getMaxColumns === 'function' && width>sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(),width-sheet.getMaxColumns());
  sheet.getRange(1,1,rows.length,width).setValues(rows);
  if (plan.oldLast>rows.length) sheet.getRange(rows.length+1,1,plan.oldLast-rows.length,width).clearContent();
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,width).setBackground('#0b766e').setFontColor('#ffffff').setFontWeight('bold');
}
function replaceMatches(book,title,headers,incoming,ids) {
  applyMatches(book,planMatches(book,title,headers,incoming,ids));
}
function safeCell(value) {
  if (value == null) return '';
  if (typeof value === 'string' && /^[=+@-]/.test(value)) return "'" + value;
  if (typeof value === 'object') throw new Error('Valor de celda inválido');
  return value;
}
function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

// Contrato aditivo. Los clientes de partidos siguen usando contractVersion:2.
const TRAINING_SHEETS=[
  ['sessions','Volley Entrenamientos',['ID sesión','Fecha','Equipo','Nombre','Estado','Revisión','Participantes','Ejercicios','Objetivo','Huella']],
  ['players','Volley Entreno Jugadores',['ID sesión','ID jugador','ID estable de plantel','Número','Nombre']],
  ['exercises','Volley Entreno Ejercicios',['ID sesión','ID ejercicio','Nombre','Tipo','Formato','Estado','Objetivo','Configuración JSON']],
  ['actions','Volley Entreno Acciones',['ID sesión','ID ejercicio','ID rally','ID acción','Tipo','ID jugador','Fundamento','Resultado ID','Éxito técnico','Acierto objetivo','Zona origen','Zona destino','Modo','Acción JSON']],
  ['rallies','Volley Entreno Rallies',['ID sesión','ID ejercicio','ID rally','Servicio previo','Ganador','Puntos propios antes','Puntos rival antes','Rotación válida','Rally JSON']],
  ['copies','Volley Entreno Copia',['ID sesión','Revisión','Parte','Total partes','JSON sesión']]
];
function trainingFingerprint(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return text.length+':'+(h>>>0).toString(16);}
function prepareTrainings(input){
  if(!isRecord(input))throw Error('Envío inválido');
  if(input.trainings===undefined)return null;
  if(input.schemaVersion!==2||input.trainingContractVersion!==1||!Array.isArray(input.trainings)||!input.trainings.length||input.trainings.length>50)throw Error('Contrato de entrenamiento incompatible o cantidad inválida');
  const ids=new Set(),data={},acks=[];TRAINING_SHEETS.forEach(d=>data[d[0]]=[]);
  for(const s of input.trainings){
    if(!isRecord(s)||!isID(s.id)||ids.has(s.id)||s.type!=='training'||s.schemaVersion!==1||!Number.isSafeInteger(s.revision)||s.revision<1||s.deleted||!['active','paused','finished'].includes(s.status)||!Array.isArray(s.players)||!s.players.length||!Array.isArray(s.exercises))throw Error('Entrenamiento inválido');
    textValue(s.name,'Nombre de sesión');textValue(s.team,'Equipo');textValue(s.date,'Fecha');textValue(s.objective||'','Objetivo');
    ids.add(s.id);const players=new Set(),recordIds=new Set([s.id]);
    for(const p of s.players){if(!isRecord(p)||!isID(p.id)||players.has(p.id))throw Error('Jugador de entrenamiento inválido');textValue(p.name,'Nombre');textValue(p.number,'Número');players.add(p.id);data.players.push([s.id,p.id,p.sourcePlayerId||p.id,p.number,p.name]);}
    function action(a,e,rid,type){
      if(!isRecord(a)||!isID(a.id)||recordIds.has(a.id)||!players.has(a.playerId)||!OUTCOMES_V2[a.skill]||!Object.prototype.hasOwnProperty.call(OUTCOMES_V2[a.skill],a.outcomeId))throw Error('Acción de entrenamiento inválida o repetida');
      if(!Array.isArray(a.participants)||new Set(a.participants).size!==a.participants.length||a.participants.some(p=>!players.has(p)))throw Error('Participantes inválidos');
      zoneValue(a.originZone);zoneValue(a.destinationZone);recordIds.add(a.id);
      data.actions.push([s.id,e.id,rid,a.id,type,a.playerId,a.skill,a.outcomeId,e.type==='repetitions'&&a.metadata?.technicalSuccess===true,e.type==='repetitions'&&a.metadata?.targetHit===true,a.originZone,a.destinationZone,a.mode,jsonCell(a)]);
    }
    for(const e of s.exercises){
      if(!isRecord(e)||!isID(e.id)||recordIds.has(e.id)||!['game','repetitions'].includes(e.type)||!['active','finished'].includes(e.status)||!Array.isArray(e.repetitions)||!isRecord(e.set)||!Array.isArray(e.set.rallies)||!isRecord(e.draft)||!Array.isArray(e.draft.actions)||!isRecord(e.set.training)||e.set.training.type!==e.type)throw Error('Ejercicio inválido');
      if(e.type==='repetitions'&&(e.set.rallies.length||e.draft.actions.length||e.set.score?.us||e.set.score?.them)||e.type==='game'&&e.repetitions.length)throw Error('No se mezclan repeticiones técnicas y puntos de juego');
      textValue(e.name,'Nombre de ejercicio');scoreValue(e.set.score,'Marcador');recordIds.add(e.id);
      if(!Array.isArray(e.set.positions)||new Set(e.set.positions).size!==e.set.positions.length||e.set.positions.some(p=>!players.has(p))||e.set.training.rotations&&e.set.positions.length!==6)throw Error('Formación de entrenamiento inválida');
      data.exercises.push([s.id,e.id,e.name,e.type,e.format,e.status,e.objective||'',jsonCell({rules:e.set.training,meanings:e.meanings||{},targetZone:e.targetZone,comparisonKey:e.comparisonKey||''})]);
      e.repetitions.forEach(a=>action(a,e,'','repetition'));e.draft.actions.forEach(a=>action(a,e,e.draft.id,'open-rally'));
      for(const r of e.set.rallies){
        if(!isRecord(r)||!isID(r.id)||recordIds.has(r.id)||!['us','them'].includes(r.serveBefore)||!['us','them'].includes(r.winner)||!Array.isArray(r.actions))throw Error('Rally de entrenamiento inválido');
        scoreValue(r.scoreBefore,'Marcador previo');recordIds.add(r.id);const raw=Object.assign({},r);delete raw.actions;
        data.rallies.push([s.id,e.id,r.id,r.serveBefore,r.winner,r.scoreBefore.us,r.scoreBefore.them,e.set.training.rotations?r.rotation:'',jsonCell(raw)]);
        r.actions.forEach(a=>action(a,e,r.id,'game'));
      }
    }
    const clean=Object.assign({},s);delete clean.sync;const serialized=JSON.stringify(clean),parts=Math.ceil(serialized.length/30000);
    data.sessions.push([s.id,s.date,s.team,s.name,s.status,s.revision,s.players.length,s.exercises.length,s.objective||'',trainingFingerprint(serialized)]);
    for(let i=0;i<parts;i++)data.copies.push([s.id,s.revision,i+1,parts,serialized.slice(i*30000,(i+1)*30000)]);
    acks.push({id:s.id,revision:s.revision});
  }
  return {ids:ids,data:data,acks:acks};
}
function checkTrainingRevisions(book,training){
  const sheet=book.getSheetByName('Volley Entrenamientos');if(!sheet||sheet.getLastRow()<2)return;
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,10).getValues();
  for(const incoming of training.data.sessions){const old=rows.find(r=>r[0]===incoming[0]);if(old&&(Number(old[5])>incoming[5]||Number(old[5])===incoming[5]&&old[9]!==incoming[9]))throw Error('Conflicto de revisión de entrenamiento. Exportá ambas copias antes de reemplazar datos de otro dispositivo.');}
}

