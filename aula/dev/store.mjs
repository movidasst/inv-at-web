import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ensure,shape,blankDocument,validateDocument,validateInvestigation,validateRevision,validateSubmission,validateReview,warnings} from '../shared/models.mjs';
import {CASE} from '../cases/mezclador.mjs';
import {evaluate,studentFeedback,fingerprint} from '../evaluation/engine.mjs';
import {EVALUATOR_VERSION} from '../evaluation/contract.mjs';
import {RUBRIC_VERSION} from '../shared/evaluation-rubric.mjs';

export const SCOPE=Object.freeze({platform:'dev-platform',deployment:'dev-deployment',course:'dev-course',activity:'dev-lab'});
export const PERSONAS=Object.freeze({
 'alumna-a':{id:'student-a',name:'Estudiante A (simulada)',role:'student',scope:SCOPE},
 'alumno-b':{id:'student-b',name:'Estudiante B (simulado)',role:'student',scope:SCOPE},
 docente:{id:'teacher-a',name:'Docente (simulado)',role:'teacher',scope:SCOPE},
 'otro-curso':{id:'teacher-other',name:'Docente de otro curso (simulado)',role:'teacher',scope:{...SCOPE,course:'other-course'}},
 'otra-actividad':{id:'student-a',name:'Estudiante A / otra actividad',role:'student',scope:{...SCOPE,activity:'other-lab'}},
 'otro-deployment':{id:'student-a',name:'Estudiante A / otro deployment',role:'student',scope:{...SCOPE,deployment:'other-deployment'}}
});
const sameScope=(a,b)=>['platform','deployment','course','activity'].every(k=>a[k]===b[k]);
const access=(actor,v,teacherOnly=false)=>{
 ensure(actor&&sameScope(actor.scope,v.scope)&&(actor.role==='teacher'||(!teacherOnly&&actor.role==='student'&&v.ownerId===actor.id)),'Expediente no disponible',404);
};
export async function openStore(file) {
 let data;
 try{data=JSON.parse(await readFile(file,'utf8'))}catch(error){if(error.code==='ENOENT')data={version:1,investigations:[],revisions:[],submissions:[],reviews:[],audit:[]};else throw Error('Almacén ilegible: se conserva el archivo; no se reinicia automáticamente',{cause:error})}
 if(data.version===1&&!Object.hasOwn(data,'assessments')){data.assessments=[];data.version=2}
 shape(data,['version','investigations','revisions','submissions','reviews','audit','assessments'],'almacén');ensure(data.version===2,'Versión de almacén incompatible');
 for(const k of ['investigations','revisions','submissions','reviews','audit'])ensure(Array.isArray(data[k]),'Almacén inválido');
 for(const v of data.investigations)validateInvestigation(v,CASE);for(const r of data.revisions)validateRevision(r,CASE);for(const s of data.submissions)validateSubmission(s,CASE);
 for(const r of data.reviews){const s=data.submissions.find(s=>s.id===r.submissionId);ensure(s,'Evaluación sin entrega');ensure(r.total===validateReview(r.review,s.document),'Total de evaluación inválido')}
 ensure(Array.isArray(data.assessments),'Historial de evaluación inválido');
 for(const a of data.assessments){const s=data.submissions.find(s=>s.id===a.submissionId);ensure(s&&a.snapshotHash===fingerprint(s.document,CASE),'Evaluación sin snapshot coincidente');}
 let queue=Promise.resolve();
 const transaction=fn=>{const task=queue.then(async()=>{const next=structuredClone(data);const result=fn(next);await mkdir(dirname(file),{recursive:true});const temporary=`${file}.${randomUUID()}.tmp`;try{await writeFile(temporary,JSON.stringify(next),{mode:0o600,flag:'wx'});await rename(temporary,file)}catch(e){await unlink(temporary).catch(()=>{});throw e}data=next;return structuredClone(result)});queue=task.catch(()=>{});return task};
 const event=(state,actor,action,objectId)=>state.audit.push({id:randomUUID(),actor:actor.id,scope:{...actor.scope},action,objectId,at:new Date().toISOString()});
 const find=(rows,id)=>{const v=rows.find(x=>x.id===id);ensure(v,'Expediente no disponible',404);return v};
 const pending=new Map();
 const service={
  async list(actor){await queue;return data.investigations.filter(v=>sameScope(actor.scope,v.scope)&&(actor.role==='teacher'||v.ownerId===actor.id)).map(v=>({id:v.id,ownerId:v.ownerId,revision:v.revision,updatedAt:v.updatedAt,submissionCount:data.submissions.filter(s=>s.investigationId===v.id).length}))},
  create(actor){ensure(actor.role==='student','Solo estudiante',403);return transaction(state=>{let v=state.investigations.find(v=>v.ownerId===actor.id&&sameScope(v.scope,actor.scope));if(v)return v;v={id:randomUUID(),ownerId:actor.id,scope:{...actor.scope},caseId:CASE.id,caseVersion:CASE.version,revision:0,document:blankDocument(),updatedAt:new Date().toISOString()};validateInvestigation(v,CASE);state.investigations.push(v);event(state,actor,'created',v.id);return v})},
  async read(actor,id){await queue;const v=find(data.investigations,id);access(actor,v);return structuredClone(v)},
  save(actor,id,payload){shape(payload,['revision','document'],'guardado');validateDocument(payload.document,CASE);return transaction(state=>{const v=find(state.investigations,id);access(actor,v);ensure(actor.role==='student','El docente revisa entregas; no edita borradores',403);ensure(Number.isSafeInteger(payload.revision)&&payload.revision===v.revision,'Conflicto de versiones: conserva tu borrador y recupera la versión del servidor',409);v.revision++;v.document=structuredClone(payload.document);v.updatedAt=new Date().toISOString();validateInvestigation(v,CASE);const r={id:randomUUID(),investigationId:v.id,number:v.revision,createdAt:v.updatedAt,document:structuredClone(v.document)};validateRevision(r,CASE);state.revisions.push(r);event(state,actor,'saved',v.id);return v})},
  async revisions(actor,id){await queue;const v=find(data.investigations,id);access(actor,v);return structuredClone(data.revisions.filter(r=>r.investigationId===id))},
  submit(actor,id,payload){shape(payload,['revision'],'entrega');return transaction(state=>{const v=find(state.investigations,id);access(actor,v);ensure(actor.role==='student','Solo estudiante',403);ensure(payload.revision===v.revision,'Guarda la versión actual antes de entregar',409);ensure(!warnings(v.document).length,'Hay productos incompletos: revisa las advertencias',422);const existing=state.submissions.find(s=>s.investigationId===id&&s.revision===v.revision);if(existing)return existing;const s={...structuredClone(v),id:randomUUID(),investigationId:id,submittedAt:new Date().toISOString(),attempt:1+state.submissions.filter(s=>s.investigationId===id).length};validateSubmission(s,CASE);state.submissions.push(s);event(state,actor,'submitted',s.id);return s})},
  async submissions(actor){await queue;return structuredClone(data.submissions.filter(s=>sameScope(actor.scope,s.scope)&&(actor.role==='teacher'||s.ownerId===actor.id)).map(s=>{const a=data.assessments.filter(a=>a.submissionId===s.id).at(-1);return {...s,evaluation:data.reviews.filter(r=>r.submissionId===s.id&&(actor.role==='teacher'||r.published)).at(-1)||null,assessment:a?(actor.role==='teacher'?a:studentFeedback(a)):null}}))},
  async assess(actor,id,payload){shape(payload,[],'solicitud de evaluación');await queue;const s=find(data.submissions,id);access(actor,s);const key=`${id}:${RUBRIC_VERSION}:${EVALUATOR_VERSION}`;
   const existing=data.assessments.find(a=>a.submissionId===id&&a.rubricVersion===RUBRIC_VERSION&&a.evaluatorVersion===EVALUATOR_VERSION);if(existing)return actor.role==='teacher'?structuredClone(existing):studentFeedback(existing);
   if(!pending.has(key)){const task=(async()=>{const result=await evaluate(structuredClone(s),CASE);return transaction(state=>{const previous=state.assessments.find(a=>a.submissionId===id&&a.rubricVersion===RUBRIC_VERSION&&a.evaluatorVersion===EVALUATOR_VERSION);if(previous)return previous;state.assessments.push(result);event(state,actor,'automatic-assessment',id);return result})})();pending.set(key,task);task.finally(()=>pending.delete(key)).catch(()=>{});}
   const result=await pending.get(key);return actor.role==='teacher'?structuredClone(result):studentFeedback(result);
  },
  async formative(actor,id,payload){shape(payload,['module'],'evaluación formativa');ensure([1,2,3,4].includes(payload.module),'Módulo inválido');const v=await service.read(actor,id);ensure(actor.role==='student','Solo estudiante',403);const result=await evaluate({...v,id:`formative-${v.id}-${v.revision}`},CASE,{module:payload.module});return studentFeedback(result)},
  async exceptions(actor){await queue;ensure(actor.role==='teacher','Solo docente',403);return structuredClone(data.assessments.filter(a=>{const s=data.submissions.find(s=>s.id===a.submissionId);return sameScope(actor.scope,s.scope)}).map(a=>{const review=data.reviews.filter(r=>r.submissionId===a.submissionId&&r.published).at(-1);const appealOpen=!!a.appeal&&(!review||a.appeal.at>review.updatedAt);return {...a,resolved:!!review&&!appealOpen,appealOpen}}))},
  appeal(actor,id,payload){shape(payload,['reason'],'reclamación');ensure(typeof payload.reason==='string'&&payload.reason.trim().length>0&&payload.reason.length<=2000,'Motivo requerido');return transaction(state=>{const s=find(state.submissions,id);access(actor,s);ensure(actor.role==='student','Solo estudiante',403);const a=state.assessments.filter(a=>a.submissionId===id).at(-1);ensure(a,'Solicita evaluación antes de reclamar',409);if(a.appeal)return studentFeedback(a);a.appeal={actorId:actor.id,at:new Date().toISOString(),reason:payload.reason};a.state='review_required';a.reasons=[...new Set([...a.reasons,'student_appeal'])];event(state,actor,'assessment-appealed',id);return studentFeedback(a)})},
  review(actor,id,payload){shape(payload,Object.hasOwn(payload,'adjustmentReason')?['review','publish','adjustmentReason']:['review','publish'],'revisión docente');ensure(typeof payload.publish==='boolean','Publicación inválida');return transaction(state=>{const s=find(state.submissions,id);access(actor,s,true);ensure(actor.role==='teacher','Solo docente',403);const total=validateReview(payload.review,s.document);const r=state.reviews.filter(r=>r.submissionId===id).at(-1);if(r?.published)ensure(typeof payload.adjustmentReason==='string'&&payload.adjustmentReason.trim().length>0&&payload.adjustmentReason.length<=2000,'Justifica el ajuste de la devolución publicada',409);const value={id:randomUUID(),previousReviewId:r?.id||null,adjustmentReason:payload.adjustmentReason||null,assessmentId:state.assessments.filter(a=>a.submissionId===id).at(-1)?.id||null,snapshotHash:fingerprint(s.document,CASE),submissionId:id,reviewerId:actor.id,review:structuredClone(payload.review),total,published:payload.publish,updatedAt:new Date().toISOString(),agsStatus:'not-implemented'};state.reviews.push(value);event(state,actor,payload.publish?'feedback-published':'review-saved',id);return value})},
  async audit(actor){await queue;ensure(actor.role==='teacher','Solo docente',403);return structuredClone(data.audit.filter(e=>sameScope(e.scope,actor.scope)))}
 };
 return service;
}
