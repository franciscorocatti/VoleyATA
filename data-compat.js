/* Volley Scout: pure, additive migration and recoverable local data access. */
(function (root) {
  'use strict';
  const SCHEMA_VERSION = 2;
  const DEFAULT_KEY = 'volley_scout_avanzado_v1';
  const SKILLS = ['rival_attack','serve','reception','attack','block','defense','setting'];
  const RESULTS = {
    rival_attack:['kill','continue','error','blocked_point'],
    serve:['ace','positive','neutral','error'],
    reception:['perfect','positive','poor','direct_error'],
    attack:['kill','continue','use_block_out','tip_kill','tip_continue','covered_block','blocked_point','error','ambiguous_block'],
    block:['point','positive_touch','uncontrolled_touch','fault'],
    defense:['perfect','positive','limited','direct_error'],
    setting:['perfect','good','forced','direct_error']
  };
  const LABELS = {
    rival_attack:{'PUNTO RIVAL':'kill','SIGUE / DEFENDIDO':'continue','ERROR RIVAL':'error','BLOQUEO NUESTRO':'blocked_point'},
    serve:{Ace:'ace',Positivo:'positive',Continuidad:'neutral',Neutro:'neutral',Error:'error'},
    reception:{Perfecta:'perfect',Positiva:'positive',Negativa:'poor',Mala:'poor',Error:'direct_error','Error directo':'direct_error'},
    attack:{Punto:'kill',Continuidad:'continue',Sigue:'continue','Bloqueo cubierto':'covered_block','Bloqueo punto':'blocked_point',Error:'error'},
    block:{Punto:'point',Toque:'positive_touch','Toque positivo':'positive_touch','Toque sin control':'uncontrolled_touch',Error:'fault',Falta:'fault'},
    defense:{Perfecta:'perfect',Positiva:'positive',Negativa:'limited',Limitada:'limited',Error:'direct_error','Error directo':'direct_error'},
    setting:{Perfecta:'perfect',Perfecto:'perfect',Positiva:'good',Bueno:'good',Negativa:'forced',Forzado:'forced',Error:'direct_error','Error directo':'direct_error'}
  };
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const id = value => typeof value === 'string' && value.length > 0 && !['__proto__','constructor','prototype'].includes(value);
  const side = value => value === 'us' || value === 'them';
  const clone = value => JSON.parse(JSON.stringify(value));
  function emptyState() { return {version:1,schemaVersion:SCHEMA_VERSION,activeId:null,matches:[],teams:[],openRallies:{},preferences:{mode:'quick',autoClose:true}}; }
  function dataError(message, code, details) {
    const error = new Error(message); error.code = code; if (details) error.details = details; return error;
  }

  // Validation reports rather than fixing anything: historical scores and results are never rewritten.
  function validateState(value) {
    const errors = [], warnings = [];
    const fail = (path,message) => errors.push({path,message});
    const warn = (path,message) => warnings.push({path,message});
    function identities(rows,path) {
      const seen = new Set();
      rows.forEach((row,i) => {
        if (!object(row) || !id(row.id)) fail(path+'['+i+'].id','Falta un ID válido.');
        else if (seen.has(row.id)) fail(path+'['+i+'].id','ID duplicado.');
        else seen.add(row.id);
      });
      return seen;
    }
    function score(value,path) {
      if (!object(value) || !Number.isInteger(value.us) || value.us < 0 || !Number.isInteger(value.them) || value.them < 0) fail(path,'Marcador inválido.');
    }
    function positions(value,path,players) {
      if (!Array.isArray(value) || value.length !== 6 || value.some(p => !id(p)) || new Set(value).size !== 6) { fail(path,'Se necesitan seis IDs de jugadores distintos.'); return; }
      if (players && value.some(p => !players.has(p))) fail(path,'La formación incluye un jugador inexistente.');
    }
    function libero(value,path,players) {
      if (value == null) return;
      if (!object(value) || !players.has(value.playerId) || !players.has(value.replacedId) || value.playerId === value.replacedId) fail(path,'Reemplazo de líbero inválido.');
    }
    function roster(rows,path,template) {
      if (!Array.isArray(rows)) { fail(path,'El plantel debe ser una lista.'); return new Set(); }
      const ids = identities(rows,path), numbers = new Set();
      rows.forEach((p,i) => {
        if (!object(p)) return;
        if (typeof p.name !== 'string' || !p.name.trim() || typeof p.number !== 'string' || !p.number.trim()) fail(path+'['+i+']','El jugador necesita nombre y número.');
        else if (numbers.has(p.number.trim())) fail(path+'['+i+'].number','Número de camiseta duplicado.');
        else numbers.add(p.number.trim());
      });
      if (template && (rows.filter(p => p && !p.isLibero).length < 6 || rows.filter(p => p && p.isLibero).length > 2)) fail(path,'El equipo guardado necesita seis regulares y hasta dos líberos.');
      return ids;
    }
    function opponent(value,path) {
      if (value == null) return;
      if (!object(value)) { fail(path,'Formación rival inválida.'); return; }
      for (const field of ['initial','current']) {
        const rows = value[field];
        if (!Array.isArray(rows) || rows.length !== 6 || rows.some(p => !object(p) || typeof p.number !== 'string' || !p.number.trim()) || new Set(rows.map(p => p.number)).size !== 6) fail(path+'.'+field,'La formación rival debe tener seis números distintos.');
      }
      if (value.scoreAtRegistration !== undefined) score(value.scoreAtRegistration,path+'.scoreAtRegistration');
    }
    function actions(rows,path,players,rivals=new Set()) {
      if (!Array.isArray(rows)) { fail(path,'Las acciones deben ser una lista.'); return; }
      const actionIds = new Set();
      rows.forEach((a,i) => {
        const ap = path+'['+i+']';
        if (!object(a)) { fail(ap,'Acción inválida.'); return; }
        if (a.schemaVersion !== undefined && ![1,2].includes(a.schemaVersion)) fail(ap+'.schemaVersion','Esquema de acción incompatible.');
        if (a.id !== undefined) { if (!id(a.id) || actionIds.has(a.id)) fail(ap+'.id','ID de acción inválido o duplicado.'); actionIds.add(a.id); }
        if (!SKILLS.includes(a.skill)) fail(ap+'.skill','Fundamento desconocido.');
        if (!(a.skill==='rival_attack'?rivals:players).has(a.playerId)) fail(ap+'.playerId','La acción pertenece a un jugador inexistente.');
        if (a.participants !== undefined && (!Array.isArray(a.participants) || a.participants.some(p => !players.has(p)) || new Set(a.participants).size !== a.participants.length)) fail(ap+'.participants','Los participantes deben ser jugadores distintos del plantel.');
        if (typeof a.outcome !== 'string' && typeof a.outcomeId !== 'string') fail(ap+'.outcome','Falta el resultado de la acción.');
        if (a.outcomeId !== undefined && !RESULTS[a.skill]?.includes(a.outcomeId)) warn(ap+'.outcomeId','Resultado desconocido: se conserva sin interpretación estadística.');
        if (a.zone !== undefined && a.zone !== null && (!Number.isInteger(a.zone) || a.zone < 1 || a.zone > 6)) fail(ap+'.zone','Zona inválida.');
        for (const field of ['originZone','destinationZone']) if (a[field] !== undefined && a[field] !== null && (!Number.isInteger(a[field]) || a[field] < 1 || a[field] > 6)) fail(ap+'.'+field,'Zona inválida.');
      });
    }
    if (!object(value)) return {valid:false,errors:[{path:'',message:'La copia debe ser un objeto JSON.'}],warnings};
    if (value.version !== 1 && value.version !== 2) fail('version','Versión de copia incompatible.');
    if (value.schemaVersion !== undefined && ![1,2].includes(value.schemaVersion)) fail('schemaVersion','Esquema más reciente o incompatible.');
    try { JSON.stringify(value); } catch (_) { fail('','La copia no se puede serializar como JSON.'); }
    if (!Array.isArray(value.matches)) fail('matches','La copia debe contener una lista de partidos.');
    else {
      const matchIds = identities(value.matches,'matches');
      if (value.activeId != null && !matchIds.has(value.activeId)) warn('activeId','El partido activo no existe; se conserva la referencia original.');
      value.matches.forEach((m,mi) => {
        const mp = 'matches['+mi+']';
        if (!object(m)) return;
        if(m.rivalPlayers!==undefined){if(!Array.isArray(m.rivalPlayers))fail(mp+'.rivalPlayers','Plantel rival inválido.');else {identities(m.rivalPlayers,mp+'.rivalPlayers');const numbers=new Set();m.rivalPlayers.forEach(p=>{if(!object(p)||typeof p.number!=='string'||!/^\d{1,3}$/.test(p.number)||numbers.has(p.number)||!['outside','opposite','middle','setter','libero'].includes(p.position)||typeof p.name!=='string')fail(mp+'.rivalPlayers','Atacante rival inválido o repetido.');if(object(p))numbers.add(p.number);});}}
        const playerIds = roster(m.players,mp+'.players',false);
        for (const field of ['team','opponent']) if (typeof m[field] !== 'string') fail(mp+'.'+field,'Falta el nombre del equipo.');
        if (typeof m.createdAt !== 'string' || !m.createdAt) fail(mp+'.createdAt','Falta la fecha de creación del partido.');
        if (!Array.isArray(m.sets)) { fail(mp+'.sets','Los sets deben ser una lista.'); return; }
        identities(m.sets,mp+'.sets');
        m.sets.forEach((s,si) => {
          const sp = mp+'.sets['+si+']';
          if (!object(s)) return;
          positions(s.positions,sp+'.positions',playerIds);
          if (s.initialLineup !== undefined) positions(s.initialLineup,sp+'.initialLineup',playerIds);
          score(s.score,sp+'.score');
          if (!side(s.serve)) fail(sp+'.serve','Servicio inválido.');
          if (s.startServe !== undefined && !side(s.startServe)) fail(sp+'.startServe','Servicio inicial inválido.');
          if (!Number.isInteger(s.rotation) || s.rotation < 1 || s.rotation > 6) fail(sp+'.rotation','Rotación inválida.');
          if (!Number.isInteger(s.number) || s.number < 1) fail(sp+'.number','Número de set inválido.');
          if (s.winner != null && !side(s.winner)) fail(sp+'.winner','Ganador inválido.');
          libero(s.libero,sp+'.libero',playerIds); opponent(s.opponentLineup,sp+'.opponentLineup');
          if (s.changes !== undefined && !Array.isArray(s.changes)) fail(sp+'.changes','El historial de cambios debe ser una lista.');
          else if (Array.isArray(s.changes)) {
            identities(s.changes,sp+'.changes');
            s.changes.forEach((c,ci) => {
              if (!object(c)) return;
              const cp=sp+'.changes['+ci+']';
              if (!playerIds.has(c.outgoing) || !playerIds.has(c.incoming)) fail(cp,'El cambio contiene un jugador inexistente.');
              if (c.before?.positions) positions(c.before.positions,cp+'.before.positions',playerIds);
              if (c.before?.libero) libero(c.before.libero,cp+'.before.libero',playerIds);
            });
          }
          if (!Array.isArray(s.rallies)) { fail(sp+'.rallies','El historial de rallies debe ser una lista.'); return; }
          identities(s.rallies,sp+'.rallies');
          s.rallies.forEach((r,ri) => {
            const rp = sp+'.rallies['+ri+']';
            if (!object(r)) return;
            if (r.schemaVersion !== undefined && ![1,2].includes(r.schemaVersion)) fail(rp+'.schemaVersion','Esquema de rally incompatible.');
            if (!side(r.winner)) fail(rp+'.winner','Ganador de rally inválido.');
            if (!side(r.serveBefore)) fail(rp+'.serveBefore','Servicio previo inválido.');
            if (!Number.isInteger(r.rotation) || r.rotation < 1 || r.rotation > 6) fail(rp+'.rotation','Rotación previa inválida.');
            score(r.scoreBefore,rp+'.scoreBefore'); positions(r.positions,rp+'.positions',playerIds);
            libero(r.liberoBefore,rp+'.liberoBefore',playerIds); opponent(r.opponentBefore,rp+'.opponentBefore');
            actions(r.actions,rp+'.actions',playerIds,new Set((Array.isArray(m.rivalPlayers)?m.rivalPlayers:[]).filter(object).map(p=>p.id)));
          });
          if (object(s.score) && s.score.us+s.score.them !== s.rallies.length) warn(sp+'.score','El marcador no coincide con la cantidad de rallies; se conserva tal como fue registrado.');
          if (s.openRally?.actions) actions(s.openRally.actions,sp+'.openRally.actions',playerIds,new Set((Array.isArray(m.rivalPlayers)?m.rivalPlayers:[]).filter(object).map(p=>p.id)));
        });
      });
    }
    if (value.teams !== undefined) {
      if (!Array.isArray(value.teams)) fail('teams','Los equipos guardados deben ser una lista.');
      else {
        identities(value.teams,'teams');
        value.teams.forEach((t,i) => {
          if (!object(t)) return;
          if (typeof t.name !== 'string' || !t.name.trim()) fail('teams['+i+'].name','Falta el nombre del equipo guardado.');
          const players = roster(t.players,'teams['+i+'].players',true);
          if (t.lineup !== undefined) positions(t.lineup,'teams['+i+'].lineup',players);
        });
      }
    }
    if (value.openRallies !== undefined) {
      if (!object(value.openRallies)) fail('openRallies','Los rallies abiertos deben estar indexados por set.');
      else Object.entries(value.openRallies).forEach(([setId,open]) => {
        const match=Array.isArray(value.matches) && value.matches.find(m => Array.isArray(m?.sets) && m.sets.some(s => s?.id === setId));
        if (!match) { warn('openRallies.'+setId,'El rally abierto no tiene un set asociado; se conserva para recuperación.'); return; }
        if (!object(open)) fail('openRallies.'+setId,'Rally abierto inválido.');
        else {
          const players=new Set((Array.isArray(match.players) ? match.players : []).filter(object).map(p => p.id));
          actions(open.actions,'openRallies.'+setId+'.actions',players,new Set((Array.isArray(match.rivalPlayers)?match.rivalPlayers:[]).filter(object).map(p=>p.id)));
          if (open.selectedSkill != null && !SKILLS.includes(open.selectedSkill)) fail('openRallies.'+setId+'.selectedSkill','Fundamento seleccionado inválido.');
          if (open.selectedPlayerId != null && !players.has(open.selectedPlayerId)) warn('openRallies.'+setId+'.selectedPlayerId','El jugador seleccionado ya no existe; se conserva la referencia para revisión.');
        }
      });
    }
    return {valid:errors.length === 0,errors,warnings};
  }

  function migrateState(value) {
    const check = validateState(value);
    if (!check.valid) throw dataError('La copia contiene datos incompatibles. Se mantiene el original.','INVALID_STATE',check);
    const result = clone(value);
    result.version = 1; result.schemaVersion = SCHEMA_VERSION;
    result.matches.forEach(m => m.sets.forEach(s => {
      s.rallies.forEach((r,ri) => {
        const legacyRally = r.schemaVersion !== SCHEMA_VERSION;
        if (r.schemaVersion !== SCHEMA_VERSION) r.schemaVersion = SCHEMA_VERSION;
        if (r.number === undefined) r.number = ri+1;
        if (r.matchId === undefined) r.matchId = m.id;
        if (r.setId === undefined) r.setId = s.id;
        if (r.status === undefined) r.status = 'closed';
        if (r.mode === undefined) r.mode = 'legacy';
        if (legacyRally && r.compat === undefined) r.compat = {legacy:true,sourceSchemaVersion:1,sequenceCoverage:'unknown'};
        // Original IDs/results, scores, lineups and unknown fields are left untouched.
        const usedIds = new Set(r.actions.map(a => a.id).filter(Boolean));
        r.actions.forEach((a,ai) => {
          const legacyAction = a.schemaVersion !== SCHEMA_VERSION && !a.outcomeId;
          if (!a.id) {
            const base = r.id+'_a'+(ai+1); let next = base, suffix = 1;
            while (usedIds.has(next)) next=base+'_'+suffix++;
            a.id=next; usedIds.add(next);
          }
          if (a.order === undefined) a.order=ai+1;
          if (a.schemaVersion !== SCHEMA_VERSION) a.schemaVersion=SCHEMA_VERSION;
          if (legacyAction && a.compat === undefined) a.compat={legacy:true,sourceSchemaVersion:1};
        });
      });
    }));
    return result;
  }

  function getActionResult(action,rally) {
    const a=action || {}, skill=a.skill;
    const validOutcomes=SKILLS.includes(skill) ? RESULTS[skill] : [];
    let outcomeId=a.outcomeId, ambiguous=false, reason=null;
    const legacy = !a.outcomeId || a.compat?.legacy === true || a.legacy === true;
    if (!validOutcomes.includes(outcomeId)) {
      outcomeId = SKILLS.includes(skill) ? LABELS[skill][a.outcome] : undefined;
      if (skill === 'attack' && a.outcome === 'Bloqueado') {
        const rows = Array.isArray(rally?.actions) ? rally.actions : [];
        let index = rows.indexOf(a);
        if (index < 0 && a.id) index=rows.findIndex(row => row.id === a.id);
        const later = index >= 0 && rows.slice(index+1).some(row => object(row) && SKILLS.includes(row.skill));
        if (later) { outcomeId='covered_block'; reason='registered_continuation'; }
        else if (index === rows.length-1 && index >= 0 && rally?.winner === 'them') { outcomeId='blocked_point'; reason='last_action_opponent_point'; }
        else { outcomeId='ambiguous_block'; ambiguous=true; reason='legacy_block_without_terminal_evidence'; }
      }
    }
    if (!outcomeId || !validOutcomes.includes(outcomeId)) { outcomeId='unknown'; ambiguous=true; reason='unknown_legacy_result'; }
    if (outcomeId === 'ambiguous_block') ambiguous=true;
    let winner=null;
    if ((skill === 'serve' && outcomeId === 'ace') || (skill === 'attack' && ['kill','use_block_out','tip_kill'].includes(outcomeId)) || (skill === 'block' && outcomeId === 'point')) winner='us';
    if ((skill === 'serve' && outcomeId === 'error') || (skill === 'attack' && ['error','blocked_point'].includes(outcomeId)) || (skill === 'block' && outcomeId === 'fault') || ['reception','defense','setting'].includes(skill) && outcomeId === 'direct_error') winner='them';
    if(skill==='rival_attack')winner=outcomeId==='kill'?'them':['error','blocked_point'].includes(outcomeId)?'us':null;
    if(skill==='rival_attack'&&a.metadata?.linkedOwnBlockActionId)winner=null;
    const quality = skill === 'reception' ? ({perfect:3,positive:2,poor:1,direct_error:0}[outcomeId] ?? null) : null;
    return {skill,outcomeId,legacy,ambiguous,reason,terminal:winner !== null,winner,quality,
      attackAttempt:skill === 'attack' && outcomeId !== 'unknown',kill:skill === 'attack' && ['kill','use_block_out','tip_kill'].includes(outcomeId),
      attackError:skill === 'attack' && ['error','blocked_point'].includes(outcomeId),originalOutcome:a.outcome ?? null};
  }

  // Backups contain the exact original bytes, not a JSON reserialization or metadata envelope.
  function createBackup(storage,key=DEFAULT_KEY,raw,reason='manual') {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw dataError('El almacenamiento no está disponible.','STORAGE_UNAVAILABLE');
    if (raw === undefined) raw=storage.getItem(key);
    if (raw == null) return null;
    if (typeof raw !== 'string') throw dataError('La copia de seguridad debe conservar el texto original.','INVALID_RAW');
    const label=String(reason).replace(/[^a-zA-Z0-9_-]/g,'_');
    const base=key+':backup:'+label; let backupKey=base, suffix=1;
    while (storage.getItem(backupKey) !== null && storage.getItem(backupKey) !== raw) backupKey=base+':'+suffix++;
    if (storage.getItem(backupKey) !== raw) storage.setItem(backupKey,raw);
    if (storage.getItem(backupKey) !== raw) throw dataError('No se pudo verificar la copia de seguridad.','BACKUP_FAILED');
    return backupKey;
  }
  function listBackups(storage,key=DEFAULT_KEY) {
    const prefix=key+':backup:', rows=[];
    for (let i=0;i<storage.length;i++) { const backupKey=storage.key(i); if (backupKey?.startsWith(prefix)) rows.push({key:backupKey,raw:storage.getItem(backupKey)}); }
    return rows.sort((a,b) => a.key.localeCompare(b.key));
  }
  function readBackup(storage,backupKey,key=DEFAULT_KEY) {
    if (typeof backupKey !== 'string' || !backupKey.startsWith(key+':backup:')) throw dataError('La clave no corresponde a una copia de Volley Scout.','INVALID_BACKUP_KEY');
    const raw=storage.getItem(backupKey);
    if (raw === null) throw dataError('La copia de seguridad no existe.','BACKUP_NOT_FOUND');
    return raw;
  }
  function load(storage,key=DEFAULT_KEY) {
    let raw=null, original=null, backupKey=null;
    try {
      raw=storage.getItem(key);
      if (raw === null) return {state:emptyState(),ok:true,writable:true,readOnly:false,migrated:false,backupKey:null,raw:null,warnings:[]};
      original=JSON.parse(raw);
      const check=validateState(original);
      if (!check.valid) throw dataError('Los datos locales necesitan revisión. El original permanece intacto.','INVALID_STATE',check);
      const state=migrateState(original), migrated=JSON.stringify(state) !== JSON.stringify(original);
      if (migrated) backupKey=createBackup(storage,key,raw,'before-v2');
      else if (storage.getItem(key+':backup:before-v2') !== null) backupKey=key+':backup:before-v2';
      // Do not replace the original key during startup. The caller saves only after this backup succeeds.
      return {state,ok:true,writable:true,readOnly:false,migrated,backupKey,raw,warnings:check.warnings};
    } catch (error) {
      const usable=original && validateState(original).valid;
      return {state:usable ? clone(original) : emptyState(),ok:false,writable:false,readOnly:true,migrated:false,backupKey,raw,error,warnings:[]};
    }
  }

  function prepareImport(value,currentState=emptyState()) {
    try {
      const single=object(value) && object(value.match);
      const source=single ? {version:value.version || 1,schemaVersion:value.schemaVersion,activeId:value.match.id,matches:[value.match]} : value;
      const incoming=migrateState(source), current=migrateState(currentState);
      const conflicts=incoming.matches.filter(m => current.matches.some(old => old.id === m.id)).map(m => m.id);
      let state,replacedOpenRallies=0;
      if (single) {
        state=clone(current);
        const replaced=current.matches.filter(m => conflicts.includes(m.id));
        const incomingSetIds=new Set(incoming.matches.flatMap(m => m.sets.map(s => s.id)));
        const collisions=current.matches.filter(m => !conflicts.includes(m.id)).flatMap(m => m.sets.filter(s => incomingSetIds.has(s.id)).map(s => s.id));
        if (collisions.length) throw dataError('El partido usa IDs de sets que ya pertenecen a otro partido. No se importó para proteger sus acciones pendientes.','SET_ID_CONFLICT',collisions);
        // The imported match replaces its entire version, including drafts tied to its old sets.
        // The caller must confirm and back up the current state before applying this candidate.
        replaced.forEach(m => m.sets.forEach(s => {
          if (state.openRallies && Object.prototype.hasOwnProperty.call(state.openRallies,s.id)) { delete state.openRallies[s.id];replacedOpenRallies++; }
        }));
        state.matches=state.matches.filter(m => !conflicts.includes(m.id)).concat(incoming.matches);
        state.activeId=incoming.activeId;
      } else {
        state=incoming;
        // Old backups predate saved teams. Restoring them must not silently delete today's templates.
        if (value.teams === undefined && currentState.teams !== undefined) state.teams=clone(currentState.teams);
      }
      const destructive = !single && (current.matches.length > 0 || (current.teams?.length || 0) > 0) || conflicts.length > 0;
      return {ok:true,state,kind:single?'match':'full',requiresConfirmation:!!destructive,conflicts,
        summary:{incomingMatches:incoming.matches.length,currentMatches:current.matches.length,resultMatches:state.matches.length,replacedMatches:conflicts.length,replacedOpenRallies,preservedTeams:!single && value.teams === undefined ? (current.teams?.length || 0) : 0},
        warnings:validateState(state).warnings};
    } catch (error) { return {ok:false,state:null,error,requiresConfirmation:false,conflicts:[]}; }
  }
  root.VolleyData=Object.freeze({SCHEMA_VERSION,DEFAULT_KEY,RESULTS,emptyState,validateState,migrateState,getActionResult,load,prepareImport,createBackup,listBackups,readBackup});
  if (typeof module !== 'undefined' && module.exports) module.exports=root.VolleyData;
})(typeof globalThis !== 'undefined' ? globalThis : window);
