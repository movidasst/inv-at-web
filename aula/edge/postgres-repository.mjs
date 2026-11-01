// Parameterized SQL, a non-BYPASSRLS worker and SET LOCAL actor context per transaction.
import {randomUUID,createHash} from 'node:crypto';
import {ensure} from '../shared/models.mjs';
const jobView=r=>({id:r.id,state:r.state,createdAt:new Date(r.created_at).toISOString(),record:r.result||null,reviews:r.reviews||[]});
const submissionView=r=>r?({id:r.id,revision:r.revision,caseId:r.case_id,caseVersion:r.case_version,rubricVersion:r.rubric_version,fictitious:r.fictitious,snapshotHash:r.snapshot_hash,document:r.document}):null;
export function createPostgresRepository(sql,{dailyLimit=10}={}){
 ensure(Number.isSafeInteger(dailyLimit)&&dailyLimit>0&&dailyLimit<=100,'Límite diario inválido');
 let verified;
 async function verifyWorker(){if(!verified)verified=(async()=>{const [r]=await sql`select r.rolsuper,r.rolbypassrls,pg_has_role(current_user,'mac_aula_worker','MEMBER') as worker,exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mac_aula' and c.relowner=r.oid) as owns_tables from pg_roles r where r.rolname=current_user`;ensure(r&&!r.rolsuper&&!r.rolbypassrls&&r.worker&&!r.owns_tables,'Credencial de base de datos no autorizada',503)})();return verified}
 async function scoped(actor,fn){await verifyWorker();return sql.begin(async tx=>{
  await tx`select set_config('mac_aula.actor',${actor.id},true),set_config('mac_aula.role',${actor.role},true),set_config('mac_aula.platform',${actor.platform},true),set_config('mac_aula.deployment',${actor.deployment},true),set_config('mac_aula.course',${actor.course},true),set_config('mac_aula.activity',${actor.activity},true)`;
  const valid=await tx`select 1 from mac_aula.sessions where token_hash=${actor.tokenHash} and expires_at>now() and revoked_at is null`;
  ensure(valid.length===1,'Sesión vencida',401);return fn(tx);
 })}
 return {
  async authenticate(tokenHash){await verifyWorker();const rows=await sql`select actor_id,role,platform_id,deployment_id,course_id,activity_id from mac_aula.sessions where token_hash=${tokenHash} and expires_at>now() and revoked_at is null`;const r=rows[0];return r?{id:r.actor_id,role:r.role,platform:r.platform_id,deployment:r.deployment_id,course:r.course_id,activity:r.activity_id,tokenHash}:null},
  submission(actor,id){return scoped(actor,async tx=>submissionView((await tx`select * from mac_aula.submissions where id=${id}`)[0]))},
  claim(actor,{submissionId,snapshotHash,evaluatorVersion,providerIdentity,requestId}){return scoped(actor,async tx=>{
   const visible=await tx`select id from mac_aula.submissions where id=${submissionId} and snapshot_hash=${snapshotHash}`;ensure(visible.length===1,'Entrega no disponible',404);
   const id=randomUUID();await tx`insert into mac_aula.evaluations(id,submission_id,snapshot_hash,evaluator_version,provider_identity,state) values(${id},${submissionId},${snapshotHash},${evaluatorVersion},${providerIdentity},'queued') on conflict(submission_id,snapshot_hash,evaluator_version,provider_identity) do nothing`;
   const [job]=await tx`select * from mac_aula.evaluations where submission_id=${submissionId} and snapshot_hash=${snapshotHash} and evaluator_version=${evaluatorVersion} and provider_identity=${providerIdentity} for update`;
   if(job.state==='running'&&new Date(job.lease_until).getTime()<=Date.now()){
    await tx`update mac_aula.evaluation_attempts set finished_at=now(),outcome='pending_correction',error_code='worker_interrupted' where evaluation_id=${job.id} and lease_id=${job.lease_id} and finished_at is null`;
    await tx`update mac_aula.evaluations set state='pending_correction',updated_at=now() where id=${job.id}`;
    return {acquired:false,job:jobView({...job,state:'pending_correction'})};
   }
   if(job.state!=='queued')return {acquired:false,job:jobView(job)};
   // Reserve a whole evaluation (<=4 model attempts) across all worker instances.
   const budget=await tx`insert into mac_aula.evaluation_daily_budget(day,used) values(current_date,1) on conflict(day) do update set used=mac_aula.evaluation_daily_budget.used+1 where mac_aula.evaluation_daily_budget.used<${dailyLimit} returning used`;
   if(!budget.length){await tx`update mac_aula.evaluations set state='pending_correction',updated_at=now() where id=${job.id}`;await tx`insert into mac_aula.evaluation_attempts(id,evaluation_id,lease_id,actor_id,request_id,finished_at,outcome,error_code) values(${randomUUID()},${job.id},${randomUUID()},${actor.id},${requestId},now(),'pending_correction','daily_limit')`;return {acquired:false,job:jobView({...job,state:'pending_correction'})}}
   const leaseId=randomUUID();await tx`update mac_aula.evaluations set state='running',lease_id=${leaseId},lease_until=now()+interval '4 minutes',updated_at=now() where id=${job.id}`;
   await tx`insert into mac_aula.evaluation_attempts(id,evaluation_id,lease_id,actor_id,request_id,outcome) values(${randomUUID()},${job.id},${leaseId},${actor.id},${requestId},'started')`;
   return {acquired:true,leaseId,job:jobView({...job,state:'running'})};
  })},
  finish(actor,{jobId,leaseId,state,record,errorCode}){return scoped(actor,async tx=>{
   ensure(['proposed','pending_correction'].includes(state),'Estado inválido');
   const rows=await tx`update mac_aula.evaluations set state=${state},result=${tx.json(record)},updated_at=now() where id=${jobId} and state='running' and lease_id=${leaseId} returning *`;
   ensure(rows.length===1,'La evaluación cambió de estado',409);
   await tx`update mac_aula.evaluation_attempts set finished_at=now(),outcome=${state},error_code=${errorCode} where evaluation_id=${jobId} and lease_id=${leaseId} and finished_at is null`;
   return jobView(rows[0]);
  })},
  history(actor,submissionId){return scoped(actor,async tx=>{
   const visible=await tx`select id from mac_aula.submissions where id=${submissionId}`;ensure(visible.length===1,'Entrega no disponible',404);
   const jobs=await tx`select * from mac_aula.evaluations where submission_id=${submissionId} order by created_at`;
   for(const j of jobs)if(actor.role==='teacher')j.reviews=await tx`select id,reviewer_id,total,reason,created_at,review from mac_aula.evaluation_reviews where evaluation_id=${j.id} order by created_at`;
   return jobs.map(jobView);
  })},
  review(actor,{submissionId,evaluationId,review,reason,total}){return scoped(actor,async tx=>{
   ensure(actor.role==='teacher','Solo docente',403);const visible=await tx`select id from mac_aula.evaluations where id=${evaluationId} and submission_id=${submissionId} and state in ('proposed','pending_correction','reviewed_proposal') for update`;ensure(visible.length===1,'Evaluación no disponible',404);
   const reviewHash=createHash('sha256').update(JSON.stringify([evaluationId,actor.id,review,reason])).digest('hex');
   const id=randomUUID();await tx`insert into mac_aula.evaluation_reviews(id,evaluation_id,reviewer_id,total,review,reason,review_hash) values(${id},${evaluationId},${actor.id},${total},${tx.json(review)},${reason},${reviewHash}) on conflict(evaluation_id,reviewer_id,review_hash) do nothing`;
   const [saved]=await tx`select id from mac_aula.evaluation_reviews where evaluation_id=${evaluationId} and reviewer_id=${actor.id} and review_hash=${reviewHash}`;
   await tx`update mac_aula.evaluations set state='reviewed_proposal',updated_at=now() where id=${evaluationId}`;return {id:saved.id};
  })},
 };
}
