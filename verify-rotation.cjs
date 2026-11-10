const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
module.exports=function verifyRotation(){
  const coordinates={1:[200,100],2:[200,0],3:[100,0],4:[0,0],5:[0,100],6:[100,100]};
  const animations=[];
  let positions=['a','b','c','d','e','f'],reduce=false;
  const court={
    getBoundingClientRect:()=>({left:10,top:20}),
    querySelectorAll:()=>positions.map((id,i)=>({dataset:{courtPlayer:id},getBoundingClientRect:()=>({left:coordinates[i+1][0]+10,top:coordinates[i+1][1]+20}),animate:(frames,options)=>animations.push({id,frames,options})}))
  };
  const ctx=vm.createContext({view:'live',document:{addEventListener(){},querySelector:()=>court},window:{matchMedia:()=>({matches:reduce})}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'team-management.js'),'utf8'),ctx);
  const snap=vm.runInContext('captureCourtRotation("us")',ctx);
  positions=['b','c','d','e','f','a'];ctx.snap=snap;
  vm.runInContext('playCourtRotation(snap)',ctx);
  assert.equal(animations.length,6);
  assert.equal(animations.find(a=>a.id==='a').frames[0].transform,'translate(100px, 0px)');
  assert.equal(animations.find(a=>a.id==='b').frames[0].transform,'translate(0px, -100px)');
  assert.equal(animations[0].options.duration,650);
  reduce=true;
  assert.equal(vm.runInContext('captureCourtRotation("us")',ctx),null);
  reduce=false;ctx.view='settings';
  assert.equal(vm.runInContext('captureCourtRotation("us")',ctx),null);
  // Libero exits do not move the libero into a front row slot: the regular player fades in.
  ctx.view='live';positions=['a','b','c','d','lib','f'];
  ctx.snap=vm.runInContext('captureCourtRotation("us")',ctx);
  positions=['b','c','d','e','f','a'];animations.length=0;
  vm.runInContext('playCourtRotation(snap)',ctx);
  assert.equal(animations.some(a=>a.id==='lib'),false);
  assert.equal(animations.find(a=>a.id==='e').frames[0].opacity,0);
  return {playerMovement:'OK',liberoReplacement:'OK',reducedMotion:'OK',liveOnly:'OK'};
};
