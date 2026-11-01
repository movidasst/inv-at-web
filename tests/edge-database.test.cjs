const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');

// Adapter executes the repository's parameterized SQL against real embedded Postgres.
function tagged(db){const sql=async(strings,...params)=>{let text=strings[0];for(let i=0;i<params.length;i++)text+=`$${i+1}`+strings[i+1];return (await db.query(text,params)).rows};sql.json=v=>JSON.stringify(v);sql.begin=fn=>db.transaction(tx=>fn(tagged(tx)));return sql;}
const hash=t=>createHash('sha256').update(t).digest('hex');
function complete(blank){const d=blank();d.summary='Síntesis ficticia para probar persistencia, no solución del caso.';d.obligations='Obligaciones de prueba.';d.evidence=[{id:'E1',sourceId:'S01',classification:'comprobado',note:'Fuente de prueba.'}];d.timeline=[{id:'T1',when:'Momento por contrastar',text:'Evento ficticio.',evidenceId:'E1'}];d.facts=[{id:'H1',text:'Observación A.',evidenceId:'E1',status:'verificado'},{id:'H2',text:'Observación B.',evidenceId:'E1',status:'verificado'}];d.tree={nodes:['H1','H2'],edges:[{id:'R1',source:'H1',target:'H2',type:'cadena',justification:'Argumento ficticio de estructura.'}],final:'H2'};d.measures=[{id:'M1',factId:'H1',type:'preventiva',description:'Control simulado.',priority:'alta',owner:'Rol ficticio',due:'Plazo',indicator:'Indicador',effectiveness:'Criterio'}];d.conclusion='Conclusión de prueba.';d.limitations='No es una referencia técnica ni un expediente real.';return d}
async function fixture(t,options={}){
 const [{createPostgresRepository},{createEvaluationHandler},{CASE},{blankDocument,RUBRIC},{academicSnapshotHash}]=await Promise.all([import('../aula/edge/postgres-repository.mjs'),import('../aula/edge/handler.mjs'),import('../aula/cases/mezclador.mjs'),import('../aula/shared/models.mjs'),import('../aula/edge/snapshot.mjs')]);
 const db=new PGlite();t.after(()=>db.close());await db.exec('create role anon nologin;create role authenticated nologin;');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/sql/mac-aula-evaluation-review.sql'),'utf8'));
 const a=randomUUID(),b=randomUUID(),teacher=randomUUID(),otherTeacher=randomUUID(),id=randomUUID(),document=complete(blankDocument);
 for(const [token,actor,role,course]of [['a'.repeat(64),a,'student','course'],['b'.repeat(64),b,'student','course'],['c'.repeat(64),teacher,'teacher','course'],['d'.repeat(64),otherTeacher,'teacher','other-course']])await db.query("insert into mac_aula.sessions values($1,$2,$3,'platform','deployment',$4,'activity',now()+interval '1 hour',null)",[hash(token),actor,role,course]);
 await db.query("insert into mac_aula.submissions(id,owner_id,platform_id,deployment_id,course_id,activity_id,case_id,case_version,rubric_version,revision,fictitious,snapshot_hash,document) values($1,$2,'platform','deployment','course','activity',$3,$4,'2.0.0',1,true,$5,$6)",[id,a,CASE.id,CASE.version,academicSnapshotHash(document,CASE),JSON.stringify(document)]);
 await db.exec('set role mac_aula_worker;');const sql=tagged(db),repository=createPostgresRepository(sql,options),logs=[];
 const handler=createEvaluationHandler({repository,caseData:CASE,enabled:true,allowedOrigin:'https://aula.example.invalid',evaluationOptions:options.evaluationOptions||{},logger:e=>logs.push(e)});
 const call=(token,body,extra={})=>handler(new Request('https://edge.example.invalid/functions/v1/mac-aula-evaluate',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...extra},body:JSON.stringify(body)}));
 return {db,repository,handler,call,id,a,b,teacher,document,CASE,RUBRIC,logs};
}
test('Edge/Postgres authenticate and RLS isolate owners, course and browser database roles',async t=>{
 const f=await fixture(t);assert.equal((await f.call('f'.repeat(64),{submissionId:f.id})).status,401);
 assert.equal((await f.call('b'.repeat(64),{submissionId:f.id})).status,404);assert.equal((await f.call('d'.repeat(64),{submissionId:f.id})).status,404);
 assert.equal((await f.call('a'.repeat(64),{submissionId:f.id,role:'teacher',score:100})).status,422);
 assert.equal((await f.call('a'.repeat(64),{submissionId:f.id},{Origin:'https://evil.invalid'})).status,403);
 assert.equal((await f.db.query("select count(*)::int as n from mac_aula.submissions")).rows[0].n,0,'SET LOCAL context must not leak between requests');
 await f.db.exec('reset role;set role anon;');await assert.rejects(f.db.query('select * from mac_aula.submissions'));await f.db.exec('reset role;');
 const {createPostgresRepository}=await import('../aula/edge/postgres-repository.mjs');await assert.rejects(createPostgresRepository(tagged(f.db)).authenticate(hash('a'.repeat(64))),e=>e.status===503,'Superuser credentials must be refused');
});
test('Edge failure preserves a durable attempt and stays pending without invented grades',async t=>{
 const f=await fixture(t),response=await f.call('a'.repeat(64),{submissionId:f.id}),result=await response.json();assert.equal(response.status,202);assert.equal(result.status,'pending_correction');assert.equal(result.evaluation.score,null);assert.equal(result.evaluation.published,false);assert.ok(!JSON.stringify(result).includes('token_hash'));
 const actor=await f.repository.authenticate(hash('a'.repeat(64)));const history=await f.repository.history(actor,f.id);assert.equal(history.length,1);
 await f.db.exec('reset role;');const attempts=(await f.db.query('select outcome,error_code from mac_aula.evaluation_attempts')).rows;assert.equal(attempts.length,1);assert.equal(attempts[0].outcome,'pending_correction');assert.equal(attempts[0].error_code,'ai_not_configured');
 assert.ok(f.logs.every(e=>!Object.hasOwn(e,'error')&&!Object.hasOwn(e,'token')&&!Object.hasOwn(e,'document')));
});
test('Edge concurrent requests deduplicate evaluation and do not replay Gemini work',async t=>{
 const f=await fixture(t);const results=await Promise.all([f.call('a'.repeat(64),{submissionId:f.id}),f.call('a'.repeat(64),{submissionId:f.id})]);assert.ok(results.every(r=>[200,202].includes(r.status)));
 await f.call('a'.repeat(64),{submissionId:f.id});await f.db.exec('reset role;');assert.equal((await f.db.query('select count(*)::int as n from mac_aula.evaluations')).rows[0].n,1);assert.equal((await f.db.query('select count(*)::int as n from mac_aula.evaluation_attempts')).rows[0].n,1);assert.equal((await f.db.query('select used from mac_aula.evaluation_daily_budget')).rows[0].used,1);
});
test('Edge docente reviews append history, deduplicate identical corrections and never publish',async t=>{
 const f=await fixture(t);const result=await(await f.call('a'.repeat(64),{submissionId:f.id})).json();const review={rubricVersion:1,criteria:f.RUBRIC.map(c=>({id:c.id,points:c.max*.75,comment:'Observación docente ficticia.',references:['summary']})),feedback:'Feedback de prueba con acciones para mejorar.'};
 const body={action:'review',submissionId:f.id,evaluationId:result.evaluation.id,review,reason:'Revisión solicitada durante el piloto.'};assert.equal((await f.call('a'.repeat(64),body)).status,403);
 const first=await(await f.call('c'.repeat(64),body)).json(),again=await(await f.call('c'.repeat(64),body)).json();assert.equal(first.reviewId,again.reviewId);assert.equal(first.total,75);assert.equal(first.published,false);
 review.criteria[0].points=10;body.reason='Ajuste justificado tras revisar una fuente.';assert.equal((await f.call('c'.repeat(64),body)).status,200);
 const teacherHistory=await(await f.call('c'.repeat(64),{action:'history',submissionId:f.id})).json();assert.equal(teacherHistory.evaluations[0].reviews.length,2);
 const studentHistory=await(await f.call('a'.repeat(64),{action:'history',submissionId:f.id})).json();assert.equal(studentHistory.evaluations[0].reviews,undefined);
});
test('Edge refuses altered snapshots, unmatched rubric, real-data flag, revoked sessions and unsupported methods',async t=>{
 const f=await fixture(t);assert.equal((await f.handler(new Request('https://edge.invalid/',{method:'GET'}))).status,405);
 await f.db.exec('reset role;');await f.db.query("update mac_aula.submissions set rubric_version='other' where id=$1",[f.id]);await f.db.exec('set role mac_aula_worker;');assert.equal((await f.call('a'.repeat(64),{submissionId:f.id})).status,409);
 await f.db.exec('reset role;');await f.db.query("update mac_aula.submissions set rubric_version='2.0.0',fictitious=false where id=$1",[f.id]);await f.db.exec('set role mac_aula_worker;');assert.equal((await f.call('a'.repeat(64),{submissionId:f.id})).status,403);
 await f.db.exec('reset role;');await f.db.query('update mac_aula.sessions set revoked_at=now() where token_hash=$1',[hash('a'.repeat(64))]);await f.db.exec('set role mac_aula_worker;');assert.equal((await f.call('a'.repeat(64),{submissionId:f.id})).status,401);
});
test('Edge correct/partial/incorrect synthetic model responses keep proposals distinct from service failures',async t=>{
 const {EVALUATION_RUBRIC}=await import('../aula/shared/evaluation-rubric.mjs');
 for(const level of [3,'partial',0]){
  const result={contractVersion:'1.0.0',rubricVersion:'2.0.0',criteria:EVALUATION_RUBRIC.map(c=>({id:c.id,indicators:c.indicators.map(i=>({id:i.id,level:level==='partial'?(c.id==='tree'?'unassessable':2):level,refs:['summary'],reason:'Valoración ficticia para verificar el contrato, no calibración.'}))})),flags:[]};
  let calls=0;const provider={id:'test-only',modelVersion:'synthetic-1',evaluate:async()=>{calls++;return {result,usage:{inputTokens:10,outputTokens:100},providerId:'test-only',modelVersion:'synthetic-1'}}};
  const f=await fixture(t,{evaluationOptions:{provider,privacyApproved:true}}),response=await f.call('a'.repeat(64),{submissionId:f.id});assert.equal(response.status,200);const student=await response.json();assert.equal(student.status,'proposed');assert.equal(student.evaluation.score,null);assert.equal(calls,2);assert.equal(student.evaluation.analysis,undefined);
  const history=await(await f.call('c'.repeat(64),{action:'history',submissionId:f.id})).json(),row=history.evaluations[0];assert.equal(row.proposal.total,level===3?100:level===0?0:null);assert.equal(row.analysis.length,2);if(level==='partial'){assert.deepEqual(row.reviewCriteria,['tree']);assert.equal(row.proposal.criteria.find(c=>c.id==='evidence').points,15)}
 }
});
test('Edge persistent daily budget and interrupted lease leave work pending without duplicate model calls',async t=>{
 const f=await fixture(t,{dailyLimit:1}),actor=await f.repository.authenticate(hash('a'.repeat(64)));
 const submission=await f.repository.submission(actor,f.id);const first=await f.repository.claim(actor,{submissionId:f.id,snapshotHash:submission.snapshotHash,evaluatorVersion:'interruption-test',providerIdentity:'test',requestId:randomUUID()});assert.equal(first.acquired,true);
 await f.db.exec('reset role;');await f.db.query("update mac_aula.evaluations set lease_until=now()-interval '1 minute' where id=$1",[first.job.id]);await f.db.exec('set role mac_aula_worker;');
 const interrupted=await f.repository.claim(actor,{submissionId:f.id,snapshotHash:submission.snapshotHash,evaluatorVersion:'interruption-test',providerIdentity:'test',requestId:randomUUID()});assert.equal(interrupted.acquired,false);assert.equal(interrupted.job.state,'pending_correction');
 const limited=await f.call('a'.repeat(64),{submissionId:f.id});assert.equal(limited.status,202);const limitedBody=await limited.json();assert.equal(limitedBody.error.code,'correction_pending');
 await f.db.exec('reset role;');const attempts=(await f.db.query('select error_code from mac_aula.evaluation_attempts')).rows;assert.ok(attempts.some(a=>a.error_code==='worker_interrupted'));assert.ok(attempts.some(a=>a.error_code==='daily_limit'));
});

test('Edge controlled teacher retry is delayed, deduplicated, version-bound and preserves all results',async t=>{
 const {EVALUATION_RUBRIC}=await import('../aula/shared/evaluation-rubric.mjs');let fail=true,calls=0;
 const result={contractVersion:'1.0.0',rubricVersion:'2.0.0',criteria:EVALUATION_RUBRIC.map(c=>({id:c.id,indicators:c.indicators.map(i=>({id:i.id,level:2,refs:['summary'],reason:'Prueba de recuperación ficticia.'}))})),flags:[]};
 const provider={id:'retry-test',modelVersion:'fixed-1',evaluate:async()=>{calls++;if(fail)throw Object.assign(Error('network'),{code:'network_failure',transient:true});return {result,usage:{inputTokens:10,outputTokens:100},providerId:'retry-test',modelVersion:'fixed-1'}}};
 const f=await fixture(t,{evaluationOptions:{provider,privacyApproved:true,identity:'retry-test-fixed-1'}});
 const first=await(await f.call('a'.repeat(64),{submissionId:f.id})).json();assert.equal(first.status,'pending_correction');
 const body={action:'retry',submissionId:f.id,evaluationId:first.evaluation.id,retryKey:randomUUID()};
 assert.equal((await f.call('a'.repeat(64),body)).status,403);assert.equal((await f.call('d'.repeat(64),body)).status,404);assert.equal((await f.call('c'.repeat(64),body)).status,429);
 await f.db.exec('reset role;');await f.db.query("update mac_aula.evaluations set next_retry_at=now()-interval '1 minute' where id=$1",[body.evaluationId]);await f.db.exec('set role mac_aula_worker;');fail=false;
 const replies=await Promise.all([f.call('c'.repeat(64),body),f.call('c'.repeat(64),body)]);assert.ok(replies.every(r=>[200,202].includes(r.status)));assert.equal(calls,4,'2 failed transport attempts followed by 2 successful verification passes');
 assert.equal((await f.call('c'.repeat(64),body)).status,200);assert.equal(calls,4);
 const history=await(await f.call('c'.repeat(64),{action:'history',submissionId:f.id})).json();const job=history.evaluations[0];assert.equal(job.attempts.length,2);assert.equal(job.runs,2);assert.equal(job.attempts[0].result.proposal,null);assert.equal(job.attempts[1].result.proposal.total,75);assert.equal(job.published,false);
 const actor=await f.repository.authenticate(hash('c'.repeat(64))),s=await f.repository.submission(actor,f.id);
 await assert.rejects(f.repository.claim(actor,{submissionId:f.id,snapshotHash:s.snapshotHash,evaluatorVersion:'different-version',providerIdentity:'retry-test-fixed-1',requestId:randomUUID(),retry:{evaluationId:body.evaluationId,key:randomUUID()}}),e=>e.status===409);
});

test('Edge retry ceiling, nontransient failures, global capacity and durable token reservation fail closed',async t=>{
 const f=await fixture(t,{dailyTokens:80000,dailyCalls:4}),actor=await f.repository.authenticate(hash('c'.repeat(64))),s=await f.repository.submission(actor,f.id);
 const args={submissionId:f.id,snapshotHash:s.snapshotHash,evaluatorVersion:'capacity',providerIdentity:'fixed',requestId:randomUUID()};
 const first=await f.repository.claim(actor,args);assert.equal(first.acquired,true);
 const otherId=randomUUID();await f.db.exec('reset role;');await f.db.query('insert into mac_aula.submissions(id,owner_id,platform_id,deployment_id,course_id,activity_id,case_id,case_version,rubric_version,revision,fictitious,snapshot_hash,document) select $1,$2,platform_id,deployment_id,course_id,activity_id,case_id,case_version,rubric_version,revision,fictitious,snapshot_hash,document from mac_aula.submissions where id=$3',[otherId,f.b,f.id]);await f.db.exec('set role mac_aula_worker;');
 const other=await f.repository.authenticate(hash('b'.repeat(64)));await assert.rejects(f.repository.claim(other,{...args,submissionId:otherId}),e=>e.status===429,'Capacity must include jobs hidden by other students RLS');
 await assert.rejects(f.repository.claim(actor,{...args,evaluatorVersion:'second'}),e=>e.status===429);
 await f.repository.finish(actor,{jobId:first.job.id,leaseId:first.leaseId,state:'pending_correction',record:null,errorCode:'network_failure'});
 await f.db.exec('reset role;');await f.db.query("update mac_aula.evaluations set next_retry_at=now()-interval '1 minute' where id=$1",[first.job.id]);await f.db.exec('set role mac_aula_worker;');
 const retry={evaluationId:first.job.id,key:randomUUID()};const limited=await f.repository.claim(actor,{...args,retry});assert.equal(limited.acquired,false);assert.equal(limited.job.state,'pending_correction');
 await f.db.exec('reset role;');const [budget]=(await f.db.query('select * from mac_aula.evaluation_daily_budget')).rows;assert.equal(budget.used,1);assert.equal(budget.reserved_calls,4);assert.equal(budget.reserved_tokens,80000);
 await f.db.query("update mac_aula.evaluations set error_code='model_unavailable',next_retry_at=now()-interval '1 minute' where id=$1",[first.job.id]);await f.db.exec('set role mac_aula_worker;');await assert.rejects(f.repository.claim(actor,{...args,retry:{...retry,key:randomUUID()}}),e=>e.status===409);
 await f.db.exec('reset role;');await f.db.query("update mac_aula.evaluations set error_code='network_failure',runs=3 where id=$1",[first.job.id]);await f.db.exec('set role mac_aula_worker;');await assert.rejects(f.repository.claim(actor,{...args,retry:{...retry,key:randomUUID()}}),e=>e.status===409);
});
