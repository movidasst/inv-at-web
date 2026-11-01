import {createHash,randomInt,randomUUID} from 'node:crypto';
import {ensure,shape} from '../shared/models.mjs';
import {EVALUATION_RUBRIC,RUBRIC_VERSION,STATE_LABELS} from '../shared/evaluation-rubric.mjs';
import {inspect,RULESET_VERSION} from './deterministic.mjs';
import {buildInput,validateModelResult,EVALUATOR_VERSION,POLICY_VERSION,CONTRACT_VERSION} from './contract.mjs';

export const fingerprint=(document,c)=>createHash('sha256').update(JSON.stringify([c.id,c.version,document])).digest('hex');
const round=n=>Math.round(n*100)/100;
function calibrated(artifact,provider){
 if(!artifact)return false;
 return artifact.rubricVersion===RUBRIC_VERSION&&artifact.evaluatorVersion===EVALUATOR_VERSION&&artifact.providerId===provider.id&&artifact.modelVersion===provider.modelVersion&&
  typeof artifact.approvedBy==='string'&&artifact.approvedBy.length>0&&typeof artifact.datasetDigest==='string'&&/^[a-f0-9]{64}$/.test(artifact.datasetDigest)&&
  Number.isFinite(Date.parse(artifact.validUntil))&&Date.parse(artifact.validUntil)>Date.now()&&Number.isSafeInteger(artifact.alternativeSolutions)&&artifact.alternativeSolutions>0&&Number.isSafeInteger(artifact.doubleRatedCases)&&artifact.doubleRatedCases>0&&
  Number.isFinite(artifact.observedMaxCriterionMAE)&&artifact.observedMaxCriterionMAE>=0&&Number.isFinite(artifact.acceptedMaxCriterionMAE)&&artifact.acceptedMaxCriterionMAE>=0&&artifact.observedMaxCriterionMAE<=artifact.acceptedMaxCriterionMAE&&
  Number.isFinite(artifact.maxPassDifference)&&artifact.maxPassDifference>=0&&artifact.maxPassDifference<=10&&
  Number.isFinite(artifact.auditRate)&&artifact.auditRate>0&&artifact.auditRate<=1;
}
export async function evaluate(submission,c,{provider=null,privacyApproved=false,calibration=null,module='final',limits={},reason='ai_not_configured',sample=()=>randomInt(10000)/10000}={}){
 const policy={maxCalls:4,maxAttempts:2,maxInputChars:150000,maxReservedTokens:80000,maxOutputTokens:8000,timeoutMs:1500,...limits};
 for(const [k,v]of Object.entries(policy))ensure(Number.isSafeInteger(v)&&v>0&&v<=1000000,`Límite de evaluación inválido: ${k}`);
 ensure(policy.maxCalls<=4&&policy.maxAttempts<=2&&policy.timeoutMs<=30000,'Límites exceden el piloto seguro');
 const checks=inspect(submission.document,c,{module});
 const record={id:randomUUID(),submissionId:submission.id,submissionRevision:submission.revision??null,snapshotHash:fingerprint(submission.document,c),caseId:c.id,caseVersion:c.version,
  rubricVersion:RUBRIC_VERSION,rulesetVersion:RULESET_VERSION,evaluatorVersion:EVALUATOR_VERSION,contractVersion:CONTRACT_VERSION,policyVersion:POLICY_VERSION,module,createdAt:new Date().toISOString(),
  state:'incomplete_invalid',reasons:[],checks,proposal:null,reviewCriteria:EVALUATION_RUBRIC.map(c=>c.id),finalGrade:null,published:false,agsEligible:false,
  provider:provider?{id:provider.id,modelVersion:provider.modelVersion}:null,passes:[],usage:{calls:0,reservedTokens:0,inputTokens:0,outputTokens:0},calibrationDigest:null};
 const finish=(state,reasons)=>({...record,state,reasons});
 if(!checks.valid)return finish('incomplete_invalid',['essential_or_structural_errors']);
 if(module!=='final')return finish('review_required',['formative_only']);
 if(!provider)return finish('review_required',[['ai_not_configured','gemini_disabled','external_processing_not_authorized','gemini_configuration_invalid'].includes(reason)?reason:'ai_not_configured']);
 if(!privacyApproved)return finish('review_required',['external_processing_not_authorized']);
 const input=buildInput(submission,c,checks),inputSize=JSON.stringify(input).length;
 if(inputSize>policy.maxInputChars)return finish('incomplete_invalid',['input_limit']);
 const reservation=Math.ceil(inputSize/2)+policy.maxOutputTokens;
 async function call(pass){
  for(let attempt=1;attempt<=policy.maxAttempts;attempt++){
   if(record.usage.calls>=policy.maxCalls||record.usage.reservedTokens+reservation>policy.maxReservedTokens)throw Object.assign(Error('budget'),{code:'budget'});
   record.usage.calls++;record.usage.reservedTokens+=reservation;
   const controller=new AbortController();let timer;
   try{
    const output=await Promise.race([Promise.resolve().then(()=>provider.evaluate(structuredClone(input),{signal:controller.signal,maxOutputTokens:policy.maxOutputTokens,pass})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('timeout'),{code:'timeout'}))},policy.timeoutMs)})]);
    shape(output,['result','usage','providerId','modelVersion'],'respuesta proveedor');ensure(output.providerId===provider.id&&output.modelVersion===provider.modelVersion,'Proveedor o modelo cambiado');
    shape(output.usage,['inputTokens','outputTokens']);for(const v of Object.values(output.usage))ensure(Number.isSafeInteger(v)&&v>=0,'Uso inválido');
    record.usage.inputTokens+=output.usage.inputTokens;record.usage.outputTokens+=output.usage.outputTokens;
    ensure(output.usage.outputTokens<=policy.maxOutputTokens&&output.usage.inputTokens+output.usage.outputTokens<=reservation,'Uso excede límite reservado');
    const score=validateModelResult(output.result,submission.document,c);
    record.passes.push({pass,attempt,result:structuredClone(output.result),score});return score;
   }catch(e){if(e.code==='timeout'||e.code==='budget'||!e.transient||attempt===policy.maxAttempts)throw e;}finally{clearTimeout(timer);controller.abort();}
  }
 }
 try{
  const first=await call(1),second=await call(2);
  const reasons=checks.issues.filter(i=>i.severity==='review').map(i=>i.code);
  if(record.passes.some(p=>p.result.flags.length))reasons.push('model_flags');
  if(first.total===null||second.total===null)reasons.push('unassessable_indicator');
  const validatedCalibration=calibrated(calibration,provider);
  if(!validatedCalibration)reasons.push('calibration_required');else record.calibrationDigest=calibration.datasetDigest;
  const difference=Math.max(...first.criteria.map(x=>{const y=second.criteria.find(y=>y.id===x.id);return x.points===null||y.points===null?Infinity:Math.abs(x.points-y.points)}));
  if(!validatedCalibration||difference>calibration.maxPassDifference)reasons.push('concordance_not_validated');
  // Keep proposals only when all criteria are assessable; never turn missing/error into zero.
  const criteria=first.criteria.map(x=>{const other=second.criteria.find(y=>y.id===x.id);const uncertain=x.points===null||other.points===null;return {id:x.id,points:uncertain?null:round((x.points+other.points)/2),max:x.max}});
  const flagged=new Set(record.passes.flatMap(p=>p.result.flags.flatMap(f=>{const affected=p.result.criteria.filter(c=>c.indicators.some(i=>i.refs.some(ref=>f.refs.includes(ref)))).map(c=>c.id);return affected.length?affected:EVALUATION_RUBRIC.map(c=>c.id)})));
  record.reviewCriteria=criteria.filter(x=>x.points===null||flagged.has(x.id)||validatedCalibration&&Math.abs(first.criteria.find(c=>c.id===x.id).points-second.criteria.find(c=>c.id===x.id).points)>calibration.maxPassDifference||checks.issues.some(i=>i.criterion===x.id&&i.severity==='review')).map(x=>x.id);
  if(criteria.some(x=>x.points!==null))record.proposal={criteria,total:criteria.some(x=>x.points===null)?null:round(criteria.reduce((n,c)=>n+c.points,0))};
  if(validatedCalibration&&sample()<calibration.auditRate)reasons.push('quality_sample');
  return finish(reasons.length?'review_required':'automatic_validated',[...new Set(reasons)]);
 }catch(error){
  record.proposal=null;
  if(['timeout','budget','quota_exhausted','model_unavailable','credentials_rejected','model_version_changed','busy','incomplete_generation','network_failure'].includes(error.code)||error.transient)return finish('review_required',[error.code||'service_failure']);
  // Output/schema errors are execution failures, not evidence of poor student performance.
  return finish('incomplete_invalid',['unsafe_or_invalid_evaluator_output']);
 }
}
// Whitelist-only feedback: no provider reasons, prompt, solution or unpublished scores.
export function studentFeedback(record){
 const feedback={id:record.id,submissionId:record.submissionId,module:record.module,state:record.state,label:STATE_LABELS[record.state],rubricVersion:record.rubricVersion,evaluatorVersion:record.evaluatorVersion,grade:null,preliminary:true,
  strengths:record.checks.strengths.map(x=>({refs:x.refs,message:x.message})),improvements:record.checks.issues.map(x=>({refs:x.refs,message:x.message,action:x.action})),competencies:[],serviceNotice:null};
 if(record.reasons.some(x=>['ai_not_configured','gemini_disabled','gemini_configuration_invalid','external_processing_not_authorized','timeout','budget','service_failure','unsafe_or_invalid_evaluator_output','quota_exhausted','model_unavailable','credentials_rejected','model_version_changed','busy','incomplete_generation','network_failure'].includes(x)))feedback.serviceNotice='La evaluación técnica de competencias está pendiente o no pudo ejecutarse de forma segura. Esto no equivale a un desempeño deficiente ni asigna cero puntos.';
 const result=!feedback.serviceNotice&&record.passes.length===2?record.passes[0].result:null;
 if(result)for(const row of result.criteria){const spec=EVALUATION_RUBRIC.find(s=>s.id===row.id);for(const i of row.indicators){const indicator=spec.indicators.find(x=>x.id===i.id);feedback.competencies.push({criterion:spec.label,indicator:indicator.observable,refs:i.refs,description:i.level==='unassessable'?'No valorable de forma fiable: requiere revisión.':indicator.descriptors[i.level],action:i.level===3?'Conserva el respaldo y explica los límites de tu conclusión.':`Revisa ${indicator.observable.toLowerCase()} usando los elementos citados.`})}}
 return feedback;
}
