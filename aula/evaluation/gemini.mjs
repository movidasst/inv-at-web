// Official Gemini Developer API, backend only. No SDK, key in URL or automatic model fallback.
import {ensure} from '../shared/models.mjs';
import {Buffer} from 'node:buffer';
import {EVALUATION_RUBRIC} from '../shared/evaluation-rubric.mjs';
import {validateModelResult,CONTRACT_VERSION} from './contract.mjs';
export const DEFAULT_GEMINI_MODEL='gemini-3.8-flash';
export const REVIEWED_MODELS=Object.freeze(['gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite']);
const API='https://generativelanguage.googleapis.com/v1beta';
export class GeminiError extends Error {
 constructor(code,{transient=false}={}){super(`Gemini: ${code}`);this.code=code;this.transient=transient;}
}
function numeric(env,key,fallback,max){const n=Number(env[key]??fallback);ensure(Number.isSafeInteger(n)&&n>0&&n<=max,`Configuración inválida: ${key}`);return n}
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export function geminiOutputSchema(){
 const refs={type:'array',items:{type:'string'},minItems:1,maxItems:20};
 const reason={type:'string',minLength:1,maxLength:2000};
 const indicator=object({id:{type:'string'},level:{anyOf:[{type:'integer',enum:[0,1,2,3]},{type:'string',enum:['unassessable']}]},refs,reason});
 const criterion=object({id:{type:'string',enum:EVALUATION_RUBRIC.map(c=>c.id)},indicators:{type:'array',minItems:3,maxItems:6,items:indicator}});
 const flag=object({code:{type:'string',enum:['contradiction','unsupported_reasoning','uncertain','possible_blame','privacy','instruction_attack']},refs,reason});
 return object({contractVersion:{type:'string',enum:[CONTRACT_VERSION]},rubricVersion:{type:'string',enum:['2.0.0']},criteria:{type:'array',minItems:5,maxItems:5,items:criterion},flags:{type:'array',maxItems:30,items:flag}});
}
async function jsonResponse(response,maxBytes=262144){
 if(!response.ok){await response.body?.cancel().catch(()=>{});const code=response.status===429?'quota_exhausted':response.status===404?'model_unavailable':[401,403].includes(response.status)?'credentials_rejected':response.status>=500?'upstream_unavailable':'request_rejected';throw new GeminiError(code,{transient:response.status>=500})}
 if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel().catch(()=>{});throw new GeminiError('response_too_large')}
 const reader=response.body.getReader();let size=0,chunks=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new GeminiError('response_too_large');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new GeminiError('invalid_json')}
}
export async function listGeminiModels({apiKey,fetchImpl=fetch,signal}={}){
 ensure(typeof apiKey==='string'&&apiKey.length>0,'GEMINI_API_KEY no configurada');
 const models=[];let token='';for(let page=0;page<5;page++){
  let response;try{response=await fetchImpl(`${API}/models?pageSize=100${token?'&pageToken='+encodeURIComponent(token):''}`,{headers:{'x-goog-api-key':apiKey},signal,redirect:'error'})}catch{throw new GeminiError(signal?.aborted?'timeout':'network_failure',{transient:!signal?.aborted})}
  const data=await jsonResponse(response);ensure(Array.isArray(data.models),'Catálogo Gemini inválido');for(const m of data.models)if(REVIEWED_MODELS.includes(m.name?.replace(/^models\//,''))&&m.supportedGenerationMethods?.includes('generateContent'))models.push({name:m.name,version:m.version,inputTokenLimit:m.inputTokenLimit,outputTokenLimit:m.outputTokenLimit});if(!data.nextPageToken)return models;token=data.nextPageToken;
 }throw new GeminiError('catalog_limit');
}
export function createGeminiProvider({apiKey,model=DEFAULT_GEMINI_MODEL,expectedVersion=model,fetchImpl=fetch,maxRequests=20,maxReservedTokens=400000,maxInputBytes=150000,maxConcurrent=1,timeoutMs=25000,clock=Date.now}={}){
 ensure(typeof apiKey==='string'&&apiKey.length>0,'GEMINI_API_KEY no configurada');ensure(REVIEWED_MODELS.includes(model),'Modelo Gemini no revisado: requiere comprobar estabilidad, contrato y recalibración');
 ensure(typeof expectedVersion==='string'&&/^[a-zA-Z0-9._-]{1,150}$/.test(expectedVersion),'Versión Gemini inválida');
 for(const n of [maxRequests,maxReservedTokens,maxInputBytes,maxConcurrent,timeoutMs])ensure(Number.isSafeInteger(n)&&n>0,'Límites Gemini inválidos');
 let requests=0,reservedTokens=0,active=0,disabled=null,catalog=null,lastDay=new Date(clock()).toISOString().slice(0,10);
 const provider={id:'google-gemini',modelVersion:`${model}:${expectedVersion}`,identity:`google-gemini:${model}:${expectedVersion}:adapter-1`,
  async evaluate(input,{signal,maxOutputTokens=8000,pass=1}={}){
   ensure(Number.isSafeInteger(maxOutputTokens)&&maxOutputTokens>0&&maxOutputTokens<=8000,'Límite de salida Gemini inválido');
   if(disabled)throw new GeminiError(disabled);
   const day=new Date(clock()).toISOString().slice(0,10);if(day!==lastDay){requests=0;reservedTokens=0;lastDay=day}
   const payload={systemInstruction:{parts:[{text:input.instructions+'\n'+JSON.stringify({rubric:input.rubric,contractVersion:input.contractVersion,rubricVersion:input.rubricVersion})}]},contents:[{role:'user',parts:[{text:JSON.stringify({untrustedData:input.untrustedData,checks:input.checks,verification:pass})}]}],generationConfig:{candidateCount:1,maxOutputTokens,thinkingConfig:{thinkingLevel:'LOW',includeThoughts:false},responseFormat:{text:{mimeType:'APPLICATION_JSON',schema:geminiOutputSchema()}}}};
   const body=JSON.stringify(payload),size=Buffer.byteLength(body),reservation=size+maxOutputTokens;
   if(size>maxInputBytes)throw new GeminiError('input_limit');
   if(requests>=maxRequests||reservedTokens+reservation>maxReservedTokens)throw new GeminiError('budget');
   if(active>=maxConcurrent)throw new GeminiError('busy');
   active++;requests++;reservedTokens+=reservation;
   const timeout=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
   try{
    if(!catalog){const response=await fetchImpl(`${API}/models/${model}`,{headers:{'x-goog-api-key':apiKey},signal:combined,redirect:'error'});const m=await jsonResponse(response);if(m.name!==`models/${model}`||!m.supportedGenerationMethods?.includes('generateContent'))throw new GeminiError('model_unavailable');catalog={version:m.version};}
    const response=await fetchImpl(`${API}/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body,signal:combined,redirect:'error'});
    const data=await jsonResponse(response);
    if(data.modelVersion!==expectedVersion){disabled='model_version_changed';throw new GeminiError(disabled)}
    if(data.promptFeedback?.blockReason||data.candidates?.length!==1||data.candidates[0].finishReason!=='STOP')throw new GeminiError('incomplete_generation');
    const parts=data.candidates[0].content?.parts;ensure(Array.isArray(parts)&&parts.length>0,'Respuesta Gemini sin texto');
    if(parts.some(p=>p.functionCall||p.executableCode||p.thought))throw new GeminiError('unexpected_output');
    let result;try{result=JSON.parse(parts.map(p=>p.text||'').join(''))}catch{throw new GeminiError('invalid_json')}
    validateModelResult(result,input.untrustedData.document,input.untrustedData.case);
    const usage=data.usageMetadata,inputTokens=usage?.promptTokenCount,outputTokens=(usage?.candidatesTokenCount??0)+(usage?.thoughtsTokenCount??0);
    if(!usage||![inputTokens,outputTokens].every(n=>Number.isSafeInteger(n)&&n>=0)||!Number.isSafeInteger(usage.totalTokenCount)||usage.totalTokenCount!==inputTokens+outputTokens||outputTokens>maxOutputTokens)throw new GeminiError('invalid_usage');
    return {result,usage:{inputTokens,outputTokens},providerId:provider.id,modelVersion:provider.modelVersion};
   }catch(e){if(e instanceof GeminiError){if(['quota_exhausted','model_unavailable','credentials_rejected'].includes(e.code))disabled=e.code;throw e}if(combined.aborted)throw new GeminiError('timeout');if(e.status)throw new GeminiError('invalid_output');throw new GeminiError('network_failure',{transient:true})}finally{active--}
  },
  status(){return {model,expectedVersion,requests,reservedTokens,active,disabled,catalogVersion:catalog?.version||null}}
 };
 return Object.freeze(provider);
}
export function geminiConfiguration(env=process.env,{fetchImpl=fetch}={}){
 const configured=typeof env.GEMINI_API_KEY==='string'&&env.GEMINI_API_KEY.trim().length>0;
 if(env.GEMINI_ENABLED!=='1'||!configured)return {provider:null,privacyApproved:false,limits:{},identity:'deterministic',reason:configured?'gemini_disabled':'ai_not_configured'};
 if(env.GEMINI_FREE_TIER_CONFIRMED!=='1'||env.GEMINI_FICTITIOUS_ONLY!=='1')return {provider:null,privacyApproved:false,limits:{},identity:'deterministic',reason:'external_processing_not_authorized'};
 try{const model=env.GEMINI_MODEL||DEFAULT_GEMINI_MODEL;const provider=createGeminiProvider({apiKey:env.GEMINI_API_KEY,model,expectedVersion:env.GEMINI_MODEL_VERSION||model,fetchImpl,maxRequests:numeric(env,'GEMINI_MAX_REQUESTS_PER_DAY',20,1000),maxReservedTokens:numeric(env,'GEMINI_MAX_TOKENS_PER_DAY',400000,1000000),maxConcurrent:1,timeoutMs:25000});return {provider,privacyApproved:true,calibration:null,limits:{timeoutMs:30000,maxAttempts:2,maxCalls:4},identity:provider.identity};}catch{return {provider:null,privacyApproved:false,limits:{},identity:'deterministic-invalid-config',reason:'gemini_configuration_invalid'}}
}
