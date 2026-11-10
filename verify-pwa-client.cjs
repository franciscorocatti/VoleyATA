'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
module.exports=async function verifyPwaClient(){
  function setup(){
    const handlers={},elements=new Map();let reloads=0,saves=0;
    const ctx=vm.createContext({navigator:{onLine:true,serviceWorker:{addEventListener:(name,fn)=>handlers[name]=fn}},location:{protocol:'https:',reload:()=>reloads++},window:{addEventListener(){}},document:{addEventListener(){},getElementById:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)}},pending:[],view:'stats',localWriteError:'',storageLoadResult:{readOnly:false},activeSet:()=>({finished:false}),save:()=>{saves++;return true}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'pwa.js'),'utf8'),ctx);
    function ask(){let reply;handlers.message({data:{type:'PWA_CAN_UPDATE'},ports:[{postMessage:data=>reply=data}]});return reply}
    return {ctx,handlers,ask,run:code=>vm.runInContext(code,ctx),get reloads(){return reloads},get saves(){return saves},elements};
  }
  const checks=[];
  let h=setup();h.handlers.controllerchange();assert.equal(h.reloads,0);checks.push('primera instalación no recarga la pantalla');
  h.ctx.pending.push({id:'open'});assert.equal(h.ask().canUpdate,false);h.handlers.controllerchange();assert.equal(h.reloads,0);checks.push('rally abierto impide confirmar actualización');
  h=setup();h.ctx.view='live';assert.equal(h.ask().canUpdate,false);h.handlers.controllerchange();assert.equal(h.reloads,0);checks.push('partido en vivo impide confirmar aunque no haya acciones');
  h=setup();assert.equal(h.ask().canUpdate,true);assert.equal(h.saves,1);h.handlers.controllerchange();h.handlers.controllerchange();assert.equal(h.reloads,1);checks.push('confirmación precede controllerchange: recarga una vez sin depender del orden de mensajes');
  h=setup();assert.equal(h.ask().canUpdate,true);h.handlers.message({data:{type:'PWA_UPDATE_CANCELLED'}});h.handlers.controllerchange();assert.equal(h.reloads,0);checks.push('cancelación de otra pestaña revoca permiso de recarga');
  h=setup();assert.equal(h.ask().canUpdate,true);h.ctx.pending.push({id:'new-rally'});h.handlers.controllerchange();assert.equal(h.reloads,0);assert.equal(h.elements.get('pwa-update').hidden,false);h.ctx.pending=[];await h.run('PWA.applyUpdate()');assert.equal(h.reloads,1);checks.push('rally iniciado tras confirmar pospone recarga hasta acción segura');
  h=setup();h.ctx.save=()=>false;assert.equal(h.ask().canUpdate,false);h.handlers.controllerchange();assert.equal(h.reloads,0);h.ctx.localWriteError='quota';assert.equal(h.run('PWA.canUpdate()'),false);checks.push('no se recarga si falla guardado local');
  return {passed:checks.length,checks};
};
if(require.main===module)module.exports().then(console.log);
