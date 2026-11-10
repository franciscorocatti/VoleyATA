const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
module.exports=function runtime(initial){
  const base=__dirname,storage=new Map(),elements=new Map(),listeners={};let time=Date.UTC(2026,10,7,15);
  if(initial)storage.set('volley_scout_avanzado_v1',typeof initial==='string'?initial:JSON.stringify(initial));
  class TestDate extends Date {constructor(...args){super(...(args.length?args:[time]))}static now(){return time}}
  function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',title:'',value:'',classList:{remove(){},add(){}},scrollIntoView(){}});return elements.get(id)}
  const store={get length(){return storage.size},key:i=>[...storage.keys()][i]||null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const ctx=vm.createContext({Date:TestDate,console,AbortController,location:{protocol:'file:'},
    localStorage:store,navigator:{onLine:true},window:{addEventListener(){}},
    document:{getElementById:element,addEventListener:(kind,fn)=>(listeners[kind]||=[]).push(fn)},
    setTimeout:()=>1,clearTimeout(){},confirm:()=>true,prompt:()=> 'N',
    fetch:async()=>({ok:true,json:async()=>({ok:true,contractVersion:2})})});
  const run=code=>vm.runInContext(code,ctx);
  const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
  for(const [,file]of html.matchAll(/<script src="([^"]+)"/g))run(fs.readFileSync(path.join(base,file.split('?')[0]),'utf8'));
  run(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
  const tick=(ms=1000)=>{time+=ms};
  function fresh(){tick();run(`state=VolleyData.emptyState();storageLoadResult={readOnly:false};initializeScout();lastPointCommit=0;lastActionTap=0;setupDraft=freshSetup();showSetup=true;render();startMatch();selectedPlayerId=activeSet().positions[0];`)}
  function action(skill,result,extra={}){tick();ctx.inputExtra=extra;run(`selectedSkill=${JSON.stringify(skill)};if(!selectedPlayerId)selectedPlayerId=courtPlayers(activeSet())[0];addScoutAction(${JSON.stringify(result)},inputExtra);`)}
  function point(winner){tick();return run(`finishRally(${JSON.stringify(winner)})`)}
  return {ctx,run,tick,fresh,action,point,storage,store,element,listeners};
};
