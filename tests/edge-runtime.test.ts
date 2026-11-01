import {createEvaluationHandler} from '../aula/edge/handler.mjs';
import {geminiConfiguration} from '../aula/evaluation/gemini.mjs';
import {CASE} from '../aula/cases/mezclador.mjs';
import {isolatedStaging,pilotPolicy} from '../aula/edge/policy.mjs';
import {registrationConfig,registrationData} from '../aula/lti/config.mjs';
Deno.test('Staging and LTI configuration fail closed in Edge without production configuration',()=>{
 if(isolatedStaging({})||isolatedStaging({MAC_AULA_ENVIRONMENT:'production'}))throw new Error('Staging must be explicit');
 if(pilotPolicy({}).maxStudents!==50)throw new Error('Pilot student capacity must be bounded');
 const c=registrationConfig({id:'test',issuer:'https://moodle.example.invalid',clientId:'test',authorizationUrl:'https://moodle.example.invalid/auth',jwksUrl:'https://moodle.example.invalid/keys',toolBaseUrl:'https://aula.example.invalid/academic',activities:[{deployment:'d',course:'c',resource:'r',fictitious:true}]});
 if(registrationData(c).automatic_grades!==false)throw new Error('Publishing must remain disabled');
});
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
