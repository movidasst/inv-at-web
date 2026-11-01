// HTTP boundary for the EXISTING MAC Aula engine. No identity, rubric or grade from the browser.
import {createHash} from 'node:crypto';
import {ensure,shape,validateDocument,validateReview} from '../shared/models.mjs';
import {evaluate,studentFeedback} from '../evaluation/engine.mjs';
import {academicSnapshotHash} from './snapshot.mjs';
import {EVALUATOR_VERSION} from '../evaluation/contract.mjs';
import {RUBRIC_VERSION} from '../shared/evaluation-rubric.mjs';
const uuid=v=>ensure(typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),'Identificador no válido',422);
const pendingReasons=new Set(['ai_not_configured','gemini_disabled','gemini_configuration_invalid','external_processing_not_authorized','quota_exhausted','model_unavailable','credentials_rejected','model_version_changed','timeout','budget','busy','network_failure','service_failure','upstream_unavailable','incomplete_generation','unsafe_or_invalid_evaluator_output']);
export function createEvaluationHandler({repository,caseData,evaluationOptions={},allowedOrigin='',enabled=false,logger=(_event)=>{}}){
 return async request=>{
  const requestId=crypto.randomUUID();
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Request-Id':requestId};
  const origin=request.headers.get('origin');
  if(origin&&origin===allowedOrigin){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin'}
  const reply=(code,body)=>new Response(JSON.stringify({...body,requestId}),{status:code,headers});
  try{
   ensure(enabled,'Servicio pendiente de habilitación en staging',503);
   ensure(!origin||origin===allowedOrigin,'Origen no autorizado',403);
   if(request.method==='OPTIONS'){ensure(origin===allowedOrigin&&!!allowedOrigin,'Origen no autorizado',403);return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Max-Age':'300'}})}
   ensure(request.method==='POST','Método no permitido',405);
   const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')||'')?.[1];ensure(token,'Sesión académica requerida',401);
   // Only a future verified LTI launch backend may issue these opaque sessions.
   const actor=await repository.authenticate(createHash('sha256').update(token).digest('hex'));
   ensure(actor,'Sesión académica no válida',401);
   ensure(request.headers.get('content-type')?.split(';')[0]==='application/json','JSON requerido',415);
   const reader=request.body?.getReader();ensure(reader,'Solicitud vacía',400);let chunks=[],size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;ensure(size<=16384,'Solicitud demasiado grande',413);chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
   let body;try{body=JSON.parse(new TextDecoder().decode(Uint8Array.from(chunks.flatMap(c=>[...c]))))}catch{throw Object.assign(Error('JSON inválido'),{status:400})}
   ensure(body&&typeof body==='object'&&!Array.isArray(body),'Solicitud inválida',422);uuid(body.submissionId);
   const action=body.action||'evaluate';
   if(action==='history'){
    shape(body,['action','submissionId']);const rows=await repository.history(actor,body.submissionId);return reply(200,{status:'history',evaluations:rows.map(row=>project(row,actor))});
   }
   if(action==='review'){
    shape(body,['action','submissionId','evaluationId','review','reason']);ensure(actor.role==='teacher','Revisión reservada al docente',403);uuid(body.evaluationId);
    ensure(typeof body.reason==='string'&&body.reason.trim().length>0&&body.reason.length<=2000,'Motivo de revisión requerido',422);
    const submission=await repository.submission(actor,body.submissionId);ensure(submission,'Entrega no disponible',404);
    const total=validateReview(body.review,submission.document);const result=await repository.review(actor,{submissionId:body.submissionId,evaluationId:body.evaluationId,review:body.review,reason:body.reason,total});
    return reply(200,{status:'reviewed_proposal',reviewId:result.id,total,published:false,agsEligible:false});
   }
   ensure(action==='evaluate','Acción no permitida',422);shape(body,Object.hasOwn(body,'action')?['action','submissionId']:['submissionId']);
   const submission=await repository.submission(actor,body.submissionId);ensure(submission,'Entrega no disponible',404);
   ensure(submission.caseId===caseData.id&&submission.caseVersion===caseData.version,'La versión del caso no está disponible para evaluación',409);
   ensure(submission.rubricVersion===RUBRIC_VERSION,'La rúbrica de la actividad no coincide con el evaluador autorizado',409);
   ensure(submission.fictitious===true,'El piloto admite exclusivamente expedientes ficticios',403);
   validateDocument(submission.document,caseData);ensure(submission.snapshotHash===academicSnapshotHash(submission.document,caseData),'El snapshot de la entrega no coincide',409);
   const identity=evaluationOptions.identity||'deterministic';
   const claim=await repository.claim(actor,{submissionId:submission.id,snapshotHash:submission.snapshotHash,evaluatorVersion:EVALUATOR_VERSION,providerIdentity:identity,requestId});
   if(!claim.acquired){const pending=['running','pending_correction'].includes(claim.job.state);return reply(pending?202:200,{status:claim.job.state,pending,error:pending?{code:'correction_pending',message:'La corrección sigue pendiente; no se ha asignado una nota.'}:null,evaluation:project(claim.job,actor)})}
   let record;
   try{record=await evaluate(submission,caseData,evaluationOptions);record.sourceSnapshotHash=submission.snapshotHash;record.sourceSnapshotHashFormat='canonical-json-v1'}catch{record=null}
   const failed=!record||record.reasons.some(x=>pendingReasons.has(x));
   const state=failed?'pending_correction':'proposed';
   // A durable started attempt already exists, even if Gemini or this persistence call fails.
   const job=await repository.finish(actor,{jobId:claim.job.id,leaseId:claim.leaseId,state,record,errorCode:failed?(record?.reasons[0]||'evaluation_execution_failed'):null});
   logger({event:'mac_aula_evaluation',requestId,evaluationId:job.id,status:state});
   return reply(failed?202:200,{status:state,pending:failed,error:failed?{code:'correction_pending',message:'La corrección no pudo completarse. El intento quedó registrado y no se ha asignado una nota.'}:null,evaluation:project(job,actor)});
  }catch(error){
   const code=error.status&&[400,401,403,404,405,409,413,415,422,429,503].includes(error.status)?error.status:503;
   logger({event:'mac_aula_request_failed',requestId,status:code});
   return reply(code,{error:{code:code===503?'service_unavailable':'request_rejected',message:code===503?'Servicio temporalmente no disponible. No se ha asignado ninguna nota.':safeMessage(code)}});
  }
 };
}
function safeMessage(code){return ({400:'Solicitud no válida.',401:'Sesión académica no válida o vencida.',403:'Operación no autorizada.',404:'Entrega no disponible.',405:'Método no permitido.',409:'El caso, la rúbrica o la entrega cambió; requiere revisión.',413:'Solicitud demasiado grande.',415:'Se requiere JSON.',422:'Datos de evaluación no válidos.',429:'Límite de evaluación alcanzado; la entrega queda pendiente.'})[code]||'Operación no disponible.'}
function project(job,actor){
 const base={id:job.id,status:job.state,createdAt:job.createdAt,score:null,published:false,agsEligible:false};
 if(job.record){base.feedback=studentFeedback(job.record);if(actor.role==='teacher'){base.proposal=job.record.proposal;base.reviewCriteria=job.record.reviewCriteria;base.reasons=job.record.reasons;base.analysis=job.record.passes.map(p=>({verification:p.pass,criteria:p.result.criteria,flags:p.result.flags}));}}
 if(job.reviews?.length)base.reviews=actor.role==='teacher'?job.reviews:[];
 return base;
}
