'use strict';
// IndexedDB contiene las sesiones. El journal recupera escrituras interrumpidas.
// No se migra ni elimina el almacenamiento de partidos.
const TrainingStorage=(()=>{
  const PREFIX='volley_training_v1:journal:';
  function create({storage=localStorage,indexed=globalThis.indexedDB}={}){
    let db=null,loaded=false,readOnly=false,error='',warning='',writing=0,chain=Promise.resolve();
    const records=new Map(),unsaved=new Set();
    const clone=TrainingModel.copy;
    const dataText=s=>{const value=clone(s);delete value.sync;return JSON.stringify(value);};
    function transact(stores,mode,fn){return new Promise((resolve,reject)=>{
      let tx;try{tx=db.transaction(stores,mode,{durability:mode==='readwrite'?'strict':'default'});}catch(_){tx=db.transaction(stores,mode);}
      let value;try{value=fn(tx);}catch(e){tx.abort();reject(e);return;}
      tx.oncomplete=()=>resolve(typeof value==='function'?value():value);
      tx.onabort=tx.onerror=()=>reject(tx.error||Error('No se pudo confirmar IndexedDB.'));
    });}
    async function open(){
      if(!indexed)return;
      db=await new Promise((resolve,reject)=>{
        const req=indexed.open('volley-scout-training',1);
        req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('sessions'))d.createObjectStore('sessions',{keyPath:'id'});if(!d.objectStoreNames.contains('backups'))d.createObjectStore('backups',{keyPath:'id'});};
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Cerrá otras pestañas para abrir el almacenamiento de entrenamiento.'));
      });
      db.onversionchange=()=>{db.close();db=null;warning='Almacenamiento actualizado en otra pestaña. Volvé a abrir la aplicación.';};
    }
    async function start(){
      try{
        try{await open();}catch(e){warning=e.message+' Se utilizará el guardado local de recuperación.';}
        if(db){const all=await transact(['sessions'],'readonly',tx=>{const r=tx.objectStore('sessions').getAll();return ()=>r.result;});for(const s of all){TrainingModel.validate(s);records.set(s.id,s);}}
        const journals=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX))journals.push(key);}
        for(const key of journals){const envelope=JSON.parse(storage.getItem(key));if(envelope.schemaVersion!==1)throw Error('Journal de una versión no compatible.');const s=envelope.session;TrainingModel.validate(s);const old=records.get(s.id);if(old&&(old.revision>s.revision||old.revision===s.revision&&dataText(old)!==dataText(s)))throw Error('Hay dos copias distintas de una sesión. Las originales y el journal se conservan para exportar y resolver el conflicto.');if(!old||s.revision>=old.revision)records.set(s.id,s);}
        loaded=true;
        // La recuperación se valida antes de escribir; el journal permanece hasta confirmar.
        for(const key of journals){const s=records.get(key.slice(PREFIX.length));if(s)await persist(s);}
      }catch(e){readOnly=true;loaded=true;error='No se pudieron validar los entrenamientos: '+e.message+' Descargá los datos originales antes de recuperar una copia.';}
      return api;
    }
    function persist(s){
      if(readOnly)return Promise.reject(Error(error));
      TrainingModel.validate(s);const snapshot=clone(s),raw=JSON.stringify({schemaVersion:1,session:snapshot}),key=PREFIX+s.id;
      records.set(s.id,s);writing++;
      let journalOK=false;
      try{storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('No se verificó el guardado local.');journalOK=true;}catch(e){warning='El journal local no pudo escribirse: '+e.message;}
      const task=async()=>{
        try{
          if(db){await transact(['sessions'],'readwrite',tx=>{const store=tx.objectStore('sessions'),r=store.get(snapshot.id);r.onsuccess=()=>{if(r.result&&(r.result.revision>snapshot.revision||r.result.revision===snapshot.revision&&dataText(r.result)!==dataText(snapshot))){readOnly=true;error='Otra pestaña cambió esta sesión. No se sobrescribió. Exportá las dos copias desde recuperación antes de recargar.';tx.abort();return;}store.put(snapshot);};});
            try{if(storage.getItem(key)===raw)storage.removeItem(key);}catch(_){}
          }else if(!journalOK)throw Error('No hay almacenamiento local disponible.');
          unsaved.delete(s.id);error='';return true;
        }catch(e){
          if(readOnly){unsaved.add(s.id);return false;}
          if(journalOK){warning='IndexedDB no confirmó el guardado. La copia local de recuperación se conserva.';return true;}
          unsaved.add(s.id);error='No se guardaron los últimos cambios. Siguen en memoria: exportá un JSON antes de cerrar. '+e.message;return false;
        }finally{writing--;}
      };
      const result=chain.then(task,task);chain=result.then(()=>{});return result;
    }
    async function save(s,{bump=true}={}){
      if(bump){s.revision++;s.updatedAt=TrainingModel.now();s.sync={...s.sync,error:null};}
      return persist(s);
    }
    async function backup(value){
      const item={id:'backup_'+TrainingModel.id(),createdAt:TrainingModel.now(),value:clone(value)};
      if(db)await transact(['backups'],'readwrite',tx=>tx.objectStore('backups').put(item));
      else{const key='volley_training_v1:backup:'+item.id,raw=JSON.stringify(item);storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('No se verificó el respaldo anterior.');}
      return item.id;
    }
    async function restore(sessions,{replace=false,recover=false}={}){
      if(readOnly&&!recover)throw Error(error);
      const ids=new Set();for(const s of sessions){TrainingModel.validate(s);if(ids.has(s.id))throw Error('Sesión repetida en el archivo.');ids.add(s.id);}
      const before=api.rawRecovery();await backup(before);
      // Se importa como pendiente: una confirmación de otro dispositivo no confirma esta copia.
      const incoming=sessions.map(s=>({...clone(s),revision:Math.max(s.revision,records.get(s.id)?.revision||0)+1,sync:{confirmedRevision:0}}));
      if(db)await transact(['sessions'],'readwrite',tx=>{const st=tx.objectStore('sessions');if(replace)st.clear();incoming.forEach(s=>st.put(s));});
      else{
        // No se borra nada hasta completar todas las escrituras. El respaldo se conserva.
        for(const s of incoming){const raw=JSON.stringify({schemaVersion:1,session:s}),key=PREFIX+s.id;storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('No se verificó la importación.');}
      }
      if(replace){const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX)&&!ids.has(key.slice(PREFIX.length)))keys.push(key);}for(const key of keys)storage.removeItem(key);records.clear();}
      incoming.forEach(s=>{records.set(s.id,s);try{if(db)storage.removeItem(PREFIX+s.id);}catch(_){} });readOnly=false;error='';return true;
    }
    async function backups(){
      const result=db?await transact(['backups'],'readonly',tx=>{const req=tx.objectStore('backups').getAll();return ()=>req.result;}):[];
      for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith('volley_training_v1:backup:')){try{result.push(JSON.parse(storage.getItem(key)));}catch(_){result.push({key,raw:storage.getItem(key)});}}}
      return result;
    }
    const api={start,save,backup,backups,restore,flush:()=>chain,get:id=>records.get(id),all:()=>[...records.values()].filter(s=>!s.deleted),
      pending:()=>[...records.values()].filter(s=>!s.deleted&&!unsaved.has(s.id)&&(s.sync?.confirmedRevision||0)!==s.revision),
      export:()=>({schemaVersion:1,sessions:[...records.values()].map(clone)}),
      rawRecovery:()=>({training:api.export(),journals:Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>k?.startsWith(PREFIX)).map(key=>({key,value:storage.getItem(key)}))}),
      get loaded(){return loaded},get readOnly(){return readOnly},get error(){return error},get warning(){return warning},get writing(){return writing},get backend(){return db?'IndexedDB':'localStorage'},get unsafe(){return !!unsaved.size||!!error}};
    return api;
  }
  return {create,PREFIX};
})();
