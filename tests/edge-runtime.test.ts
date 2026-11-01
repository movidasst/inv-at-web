import {createEvaluationHandler} from '../aula/edge/handler.mjs';
import {geminiConfiguration} from '../aula/evaluation/gemini.mjs';
import {CASE} from '../aula/cases/mezclador.mjs';
Deno.test('Edge runtime reuses shared modules and denies requests before configuration',async()=>{
 const handler=createEvaluationHandler({repository:{},caseData:CASE,enabled:false});
 const response=await handler(new Request('https://edge.invalid/',{method:'POST'}));
 if(response.status!==503)throw new Error('Unconfigured handler must deny access');
 const data=await response.json();if(data.error.code!=='service_unavailable')throw new Error('Error must be controlled');
 if(geminiConfiguration({}).provider!==null)throw new Error('No key must mean no external provider');
});
Deno.test('Edge runtime requires a verified academic session, not arbitrary identity claims',async()=>{
 const handler=createEvaluationHandler({repository:{authenticate:async()=>null},caseData:CASE,enabled:true});
 const response=await handler(new Request('https://edge.invalid/',{method:'POST',headers:{Authorization:`Bearer ${'a'.repeat(64)}`,'Content-Type':'application/json'},body:JSON.stringify({submissionId:crypto.randomUUID(),role:'teacher'})}));
 if(response.status!==401)throw new Error('Invented session must be denied before processing claims');
});
