'use strict';
const fs=require('node:fs');
const path=require('node:path');
const suites=['verify-attack-blocks.cjs','verify-rival-attack.cjs','verify-attack-fast.cjs','verify-training.cjs','verify-engine-v2.cjs','verify-v21.cjs','verify-pwa.cjs','verify-pwa-client.cjs','verify-attack-variants.cjs','verify-data-v2.cjs','verify-stats-v2.cjs','verify-stats-integration-v2.cjs','verify-sheets-v2.cjs','verify-auto-sync.cjs','verify-team.cjs','verify-rotation.cjs','verify-sequence-stats.cjs','verify-formation-stats.cjs'];
async function verifyAll(){
  const results={};
  for(const file of suites){
    try{
      const result=await require('./'+file)();
      results[file]={ok:true,checks:typeof result==='number'?result:result.passed??Object.keys(result).length};
    }catch(error){results[file]={ok:false,error:error.stack};}
  }
  fs.writeFileSync(path.join(__dirname,'RESULTADOS_PRUEBAS_ENTRENAMIENTO.json'),JSON.stringify(results,null,2)+'\n');
  const failed=Object.values(results).filter(result=>!result.ok).length;
  console.log(JSON.stringify(results,null,2));
  console.log(Object.values(results).reduce((total,result)=>total+(result.checks||0),0)+' comprobaciones; '+failed+' suites fallidas.');
  if(failed)throw Error('Hay pruebas fallidas; revisar RESULTADOS_PRUEBAS_ENTRENAMIENTO.json.');
  return results;
}
module.exports=verifyAll;
if(require.main===module)verifyAll().catch(error=>{console.error(error.message);process.exitCode=1;});
