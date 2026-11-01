import postgres from 'npm:postgres@3.4.8';
import {jwtVerify,createLocalJWKSet,decodeProtectedHeader} from 'npm:jose@6.1.3';
import {registrationConfig} from '../../../aula/lti/config.mjs';
import {createLaunchVerifier} from '../../../aula/lti/verify.mjs';
import {createAcademicRepository} from '../../../aula/lti/repository.mjs';
import {createAcademicHandler} from '../../../aula/lti/handler.mjs';
import {createPostgresRepository} from '../../../aula/edge/postgres-repository.mjs';
import {createEvaluationHandler} from '../../../aula/edge/handler.mjs';
import {pilotPolicy,isolatedStaging} from '../../../aula/edge/policy.mjs';
import {geminiConfiguration} from '../../../aula/evaluation/gemini.mjs';
import {CASE} from '../../../aula/cases/mezclador.mjs';

const env=Deno.env.toObject();
let handler:(request:Request)=>Promise<Response>=async()=>Response.json({error:{code:'academic_not_enabled'}},{status:503});
if(env.MAC_AULA_LTI_ENABLED==='1'&&isolatedStaging(env)){
 const c=registrationConfig(JSON.parse(env.MAC_AULA_LTI_REGISTRATION||'{}')),policy=pilotPolicy(env);
 const sql=postgres(env.MAC_AULA_DATABASE_URL,{max:1,prepare:false,ssl:'require',connect_timeout:10,idle_timeout:20,onnotice:()=>{}});
 const repository=createAcademicRepository(sql,{caseData:CASE,maxStudents:policy.maxStudents}),evaluationRepository=createPostgresRepository(sql,policy);
 const options=geminiConfiguration(env);
 const evaluateHandler=createEvaluationHandler({repository:evaluationRepository,caseData:CASE,evaluationOptions:{...options,limits:{...options.limits,maxReservedTokens:80000}},enabled:env.MAC_AULA_EDGE_ENABLED==='1'});
 handler=createAcademicHandler({config:c,repository,evaluationRepository,evaluateHandler,verifyLaunch:createLaunchVerifier(c,{jwtVerify,createLocalJWKSet,decodeProtectedHeader}),caseData:CASE,enabled:true,publicJwks:JSON.parse(env.MAC_AULA_TOOL_PUBLIC_JWKS||'{"keys":[]}')});
}
Deno.serve(handler);
