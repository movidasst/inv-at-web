import postgres from 'npm:postgres@3.4.8';
import {createEvaluationHandler} from '../../../aula/edge/handler.mjs';
import {createPostgresRepository} from '../../../aula/edge/postgres-repository.mjs';
import {geminiConfiguration} from '../../../aula/evaluation/gemini.mjs';
import {CASE} from '../../../aula/cases/mezclador.mjs';
import {pilotPolicy,isolatedStaging} from '../../../aula/edge/policy.mjs';

// Node-compatible modules are reused, not copied into a new evaluator.
const env = Object.fromEntries([
  'GEMINI_API_KEY','GEMINI_ENABLED','GEMINI_MODEL','GEMINI_MODEL_VERSION',
  'GEMINI_FREE_TIER_CONFIRMED','GEMINI_FICTITIOUS_ONLY',
  'GEMINI_MAX_REQUESTS_PER_DAY','GEMINI_MAX_TOKENS_PER_DAY',
].map(name=>[name,Deno.env.get(name)]).filter(([,value])=>value!==undefined));
// Never retrieve or return this value over HTTP. It stays in the provider closure.
const databaseUrl = Deno.env.get('MAC_AULA_DATABASE_URL');
const configuration = Deno.env.toObject();
const enabled = Deno.env.get('MAC_AULA_EDGE_ENABLED')==='1'&&isolatedStaging(configuration);
let handler: (request: Request)=>Promise<Response>;
if(enabled){
  const sql=postgres(databaseUrl!,{max:1,prepare:false,ssl:'require',connect_timeout:10,idle_timeout:20,onnotice:()=>{}});
  const options=geminiConfiguration(env);
  handler=createEvaluationHandler({
    repository:createPostgresRepository(sql,pilotPolicy(configuration)),caseData:CASE,
    evaluationOptions:{...options,limits:{...options.limits,maxReservedTokens:80000}},allowedOrigin:Deno.env.get('MAC_AULA_ALLOWED_ORIGIN')||'',enabled:true,
    // Only ids and status; never error objects, request headers, submission text or secrets.
    logger:(event: Record<string, unknown>)=>console.info(JSON.stringify(event)),
  });
}else{
  handler=async()=>Response.json({error:{code:'not_enabled',message:'Integración académica pendiente de configuración.'}},{status:503,headers:{'Cache-Control':'no-store'}});
}
Deno.serve(handler);
