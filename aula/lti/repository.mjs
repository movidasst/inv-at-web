import {randomUUID,createHash} from 'node:crypto';
import {ensure,blankDocument,validateDocument,warnings} from '../shared/models.mjs';
import {academicSnapshotHash} from '../edge/snapshot.mjs';
import {RUBRIC_VERSION} from '../shared/evaluation-rubric.mjs';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function createAcademicRepository(sql,{caseData,maxStudents=50}){
 ensure(Number.isSafeInteger(maxStudents)&&maxStudents>0&&maxStudents<=50,'Capacidad de piloto inválida');
 let verified;
 async function verify(){if(!verified)verified=(async()=>{const [r]=await sql`select r.rolsuper,r.rolbypassrls,pg_has_role(current_user,'mac_aula_launch_worker','MEMBER') as worker,exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mac_aula' and c.relowner=r.oid) as owns from pg_roles r where r.rolname=current_user`;ensure(r&&!r.rolsuper&&!r.rolbypassrls&&r.worker&&!r.owns,'Login académico restringido requerido',503)})();return verified}
 async function scoped(actor,fn){await verify();return sql.begin(async tx=>{
  await tx`select set_config('mac_aula.actor',${actor.id},true),set_config('mac_aula.role',${actor.role},true),set_config('mac_aula.platform',${actor.platform},true),set_config('mac_aula.deployment',${actor.deployment},true),set_config('mac_aula.course',${actor.course},true),set_config('mac_aula.activity',${actor.activity},true)`;
  ensure((await tx`select token_hash from mac_aula.sessions where token_hash=${actor.tokenHash} and expires_at>now() and revoked_at is null`).length===1,'Sesión vencida',401);return fn(tx);
 })}
 return {
  async start(attempt){await verify();return sql.begin(async tx=>{
   const rows=await tx`insert into mac_aula.launch_daily_budget(day,used) values((now() at time zone 'UTC')::date,1) on conflict(day) do update set used=mac_aula.launch_daily_budget.used+1 where mac_aula.launch_daily_budget.used<1000 returning used`;ensure(rows.length,'Límite de lanzamientos',429);
   await tx`insert into mac_aula.launch_attempts(state_hash,binding_hash,nonce_hash,registration_id,deployment_id,expires_at) values(${attempt.stateHash},${attempt.bindingHash},${attempt.nonceHash},${attempt.registration},${attempt.deployment||null},now()+interval '5 minutes')`;
  })},
  async attempt(stateHash){await verify();const [r]=await sql`select * from mac_aula.launch_attempts where state_hash=${stateHash} and consumed_at is null and expires_at>now()`;return r?{stateHash:r.state_hash,bindingHash:r.binding_hash,nonceHash:r.nonce_hash,registration:r.registration_id,deployment:r.deployment_id}:null},
  async launch(attempt,identity,token,csrf){await verify();return sql.begin(async tx=>{
   const rows=await tx`update mac_aula.launch_attempts set consumed_at=now() where state_hash=${attempt.stateHash} and binding_hash=${attempt.bindingHash} and nonce_hash=${hash(identity.nonce)} and registration_id=${identity.platform} and consumed_at is null and expires_at>now() returning state_hash`;ensure(rows.length===1,'Intento vencido o repetido',401);
   // One global lock also serializes first-time enrolment capacity across workers.
   await tx`select id from mac_aula.evaluation_capacity where id=1 for update`;
   const [actor]=await tx`insert into mac_aula.identities(id,platform_id,deployment_id,subject) values(${randomUUID()},${identity.platform},${identity.deployment},${identity.sub}) on conflict(platform_id,deployment_id,subject) do update set subject=excluded.subject returning id`;
   if(identity.role==='student'){
    const existing=await tx`select actor_id from mac_aula.enrollments where actor_id=${actor.id} and platform_id=${identity.platform} and deployment_id=${identity.deployment} and course_id=${identity.course} and activity_id=${identity.activity}`;
    if(!existing.length){const [count]=await tx`select count(distinct actor_id)::int as n from mac_aula.enrollments where actor_id<>${actor.id}`;ensure(count.n<maxStudents,'Piloto completo',403);await tx`insert into mac_aula.enrollments values(${actor.id},${identity.platform},${identity.deployment},${identity.course},${identity.activity})`;}
   }
   await tx`update mac_aula.sessions set revoked_at=now() where actor_id=${actor.id} and platform_id=${identity.platform} and deployment_id=${identity.deployment} and course_id=${identity.course} and activity_id=${identity.activity} and revoked_at is null`;
   await tx`insert into mac_aula.sessions(token_hash,actor_id,role,platform_id,deployment_id,course_id,activity_id,expires_at,csrf_hash) values(${hash(token)},${actor.id},${identity.role},${identity.platform},${identity.deployment},${identity.course},${identity.activity},now()+interval '60 minutes',${hash(csrf)})`;
   return actor.id;
  })},
  async csrf(actor,value){return scoped(actor,async tx=>(await tx`select token_hash from mac_aula.sessions where token_hash=${actor.tokenHash} and csrf_hash=${hash(value)}`).length===1)},
  logout(actor){return scoped(actor,tx=>tx`update mac_aula.sessions set revoked_at=now() where token_hash=${actor.tokenHash}`)},
  draft(actor){return scoped(actor,async tx=>{ensure(actor.role==='student','Solo estudiante',403);await tx`insert into mac_aula.investigations(id,owner_id,platform_id,deployment_id,course_id,activity_id,document) values(${randomUUID()},${actor.id},${actor.platform},${actor.deployment},${actor.course},${actor.activity},${tx.json(blankDocument())}) on conflict(owner_id,platform_id,deployment_id,course_id,activity_id) do nothing`;return (await tx`select id,revision,document,updated_at from mac_aula.investigations`)[0]})},
  save(actor,revision,document){validateDocument(document,caseData);return scoped(actor,async tx=>{
   ensure(actor.role==='student'&&Number.isSafeInteger(revision)&&revision>=0,'Revisión inválida',422);
   const rows=await tx`update mac_aula.investigations set document=${tx.json(document)},revision=revision+1,updated_at=now() where revision=${revision} returning id,revision,document,updated_at`;ensure(rows.length===1,'El expediente cambió; recargar antes de guardar',409);
   const d=rows[0];await tx`insert into mac_aula.investigation_revisions(investigation_id,revision,document) values(${d.id},${d.revision},${tx.json(d.document)})`;return d;
  })},
  submit(actor,revision){return scoped(actor,async tx=>{
   ensure(actor.role==='student','Solo estudiante',403);const [d]=await tx`select * from mac_aula.investigations for update`;ensure(d&&d.revision===revision,'Revisión cambió',409);validateDocument(d.document,caseData);ensure(!warnings(d.document).length,'Entrega incompleta',422);
   const id=randomUUID();await tx`insert into mac_aula.submissions(id,owner_id,platform_id,deployment_id,course_id,activity_id,case_id,case_version,rubric_version,revision,fictitious,snapshot_hash,document,investigation_id) values(${id},${actor.id},${actor.platform},${actor.deployment},${actor.course},${actor.activity},${caseData.id},${caseData.version},${RUBRIC_VERSION},${revision},true,${academicSnapshotHash(d.document,caseData)},${tx.json(d.document)},${d.id}) on conflict(investigation_id,revision) do nothing`;
   return (await tx`select id,revision,submitted_at from mac_aula.submissions where investigation_id=${d.id} and revision=${revision}`)[0];
  })},
  submissions(actor){return scoped(actor,tx=>tx`select id,revision,submitted_at from mac_aula.submissions order by submitted_at desc`)},
 };
}
