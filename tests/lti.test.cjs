const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {complete}=require('./helpers/academic-fixtures.cjs');
function tagged(db){const sql=async(strings,...params)=>{let text=strings[0];for(let i=0;i<params.length;i++)text+=`$${i+1}`+strings[i+1];return (await db.query(text,params)).rows};sql.json=v=>JSON.stringify(v);sql.begin=fn=>db.transaction(tx=>fn(tagged(tx)));return sql;}
let keyPromise;async function fixtures(t,{maxStudents=50}={}){
 const [jose,{registrationConfig},{createLaunchVerifier,CLAIM},{createAcademicRepository,hash},{createAcademicHandler},{createPostgresRepository},{createEvaluationHandler},{CASE},{blankDocument}]=await Promise.all([import('jose'),import('../aula/lti/config.mjs'),import('../aula/lti/verify.mjs'),import('../aula/lti/repository.mjs'),import('../aula/lti/handler.mjs'),import('../aula/edge/postgres-repository.mjs'),import('../aula/edge/handler.mjs'),import('../aula/cases/mezclador.mjs'),import('../aula/shared/models.mjs')]);
 keyPromise??=jose.generateKeyPair('RS256');const keys=await keyPromise,jwk=await jose.exportJWK(keys.publicKey);jwk.kid='moodle-test-key';jwk.use='sig';jwk.alg='RS256';
 const c=registrationConfig({id:'moodle-staging',issuer:'https://moodle.example.invalid',clientId:'client-1',authorizationUrl:'https://moodle.example.invalid/authorize',jwksUrl:'https://moodle.example.invalid/keys',toolBaseUrl:'https://aula.example.invalid/functions/v1/mac-aula-academic',activities:[{deployment:'deployment',course:'course',resource:'activity',fictitious:true}]});
 const db=new PGlite();t.after(()=>db.close());await db.exec('create role anon nologin;create role authenticated nologin;');for(const filename of ['mac-aula-evaluation-review.sql','mac-aula-lti-review.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/sql',filename),'utf8'));await db.exec('set role mac_aula_launch_worker;');
 const sql=tagged(db),repository=createAcademicRepository(sql,{caseData:CASE,maxStudents}),evaluationRepository=createPostgresRepository(sql);let fetches=0;
 const verifyLaunch=createLaunchVerifier(c,{...jose,fetchImpl:async(url,options)=>{fetches++;assert.equal(url,c.jwksUrl);assert.equal(options.redirect,'error');return Response.json({keys:[jwk]})}});
 const handler=createAcademicHandler({config:c,repository,evaluationRepository,verifyLaunch,caseData:CASE,enabled:true,evaluateHandler:createEvaluationHandler({repository:evaluationRepository,caseData:CASE,enabled:true})});
 async function login(extra={}){const url=new URL(c.loginUrl);for(const [k,v]of Object.entries({iss:c.issuer,client_id:c.clientId,target_link_uri:c.targetUrl,login_hint:'synthetic-user',...extra}))url.searchParams.set(k,v);const response=await handler(new Request(url));const location=response.headers.get('location');return {response,state:location?new URL(location).searchParams.get('state'):null,nonce:location?new URL(location).searchParams.get('nonce'):null,cookie:response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),location}}
 async function token(login,overrides={},header={}){const now=Math.floor(Date.now()/1000);return new jose.SignJWT({iss:c.issuer,aud:c.clientId,sub:'student-1',iat:now,exp:now+300,nonce:login.nonce,[`${CLAIM}version`]:'1.3.0',[`${CLAIM}message_type`]:'LtiResourceLinkRequest',[`${CLAIM}target_link_uri`]:c.targetUrl,[`${CLAIM}deployment_id`]:'deployment',[`${CLAIM}context`]:{id:'course'},[`${CLAIM}resource_link`]:{id:'activity'},[`${CLAIM}roles`]:['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],...overrides}).setProtectedHeader({alg:'RS256',kid:jwk.kid,...header}).sign(keys.privateKey)}
 function launch(login,id_token,extra={}){return handler(new Request(c.launchUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:c.issuer,Cookie:login.cookie,...extra},body:new URLSearchParams({state:login.state,id_token})}))}
 async function session(overrides={}){const l=await login(),r=await launch(l,await token(l,overrides));assert.equal(r.status,303);const cookie=r.headers.getSetCookie().filter(x=>!x.includes('Max-Age=0')).map(x=>x.split(';')[0]).join('; ');const csrf=/__Host-mac-aula-csrf=([a-f0-9]+)/.exec(cookie)[1];return {cookie,csrf,response:r}}
 function call(s,route,method='GET',body,headers={}){return handler(new Request(c.toolBaseUrl+route,{method,headers:{Cookie:s.cookie,Origin:new URL(c.toolBaseUrl).origin,'x-csrf-token':s.csrf,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}))}
 return {db,c,repository,evaluationRepository,handler,login,token,launch,session,call,hash,CLAIM,blankDocument,fetches:()=>fetches};
}

test('LTI signed launch creates scoped session, saves revisions and submits immutable idempotent snapshots',async t=>{
 const f=await fixtures(t),s=await f.session();assert.ok(s.response.headers.getSetCookie().some(c=>c.includes('HttpOnly')&&c.includes('Secure')&&c.includes('SameSite=Lax')));
 const session=await(await f.call(s,'/session')).json();assert.equal(session.actor.role,'student');assert.equal(session.automaticGrades,false);assert.equal(session.actor.scope.course,'course');assert.equal(JSON.stringify(session).includes('token_hash'),false);
 assert.equal((await f.call(s,'/draft','PUT',{revision:0,document:f.blankDocument()},{'x-csrf-token':'a'.repeat(64)})).status,403);
 assert.equal((await f.call(s,'/draft','PUT',{revision:0,document:f.blankDocument()},{Origin:'https://evil.invalid'})).status,403);
 const draft=await(await f.call(s,'/draft')).json();assert.equal(draft.revision,0);
 assert.equal((await f.call(s,'/draft','PUT',{revision:0,document:f.blankDocument(),role:'teacher'})).status,422);
 const document=complete(f.blankDocument),saved=await(await f.call(s,'/draft','PUT',{revision:0,document})).json();assert.equal(saved.revision,1);
 assert.equal((await f.call(s,'/draft','PUT',{revision:0,document})).status,409);
 const submitted=await(await f.call(s,'/submit','POST',{revision:1})).json(),again=await(await f.call(s,'/submit','POST',{revision:1})).json();assert.ok(submitted.id);assert.equal(submitted.id,again.id);
 document.summary='Nueva versión ficticia';assert.equal((await f.call(s,'/draft','PUT',{revision:1,document})).status,200);
 const evaluation=await f.call(s,'/evaluate','POST',{submissionId:submitted.id});assert.equal(evaluation.status,202);const e=await evaluation.json();assert.equal(e.evaluation.score,null);assert.equal(e.evaluation.published,false);
 await f.db.exec('reset role;');const [stored]=(await f.db.query('select document from mac_aula.submissions')).rows;assert.notEqual(stored.document.summary,document.summary);assert.equal((await f.db.query('select count(*)::int as n from mac_aula.investigation_revisions')).rows[0].n,2);await f.db.exec('set role mac_aula_launch_worker;');
 const other=await f.session({sub:'student-2'});assert.equal((await(await f.call(other,'/submissions')).json()).length,0);assert.equal((await f.call(other,'/evaluate','POST',{submissionId:submitted.id})).status,404);
 assert.equal((await f.call(s,'/logout','POST',{})).status,200);assert.equal((await f.call(s,'/session')).status,401);assert.equal(f.fetches(),1);
});

test('LTI rejects browser/state/nonce replay, expiry, untrusted origins and concurrent launch reuse',async t=>{
 const f=await fixtures(t),l=await f.login(),jwt=await f.token(l);assert.equal(l.response.status,303);assert.ok(l.response.headers.get('set-cookie').includes('SameSite=None'));
 assert.equal((await f.launch(l,jwt,{Cookie:''})).status,401);assert.equal((await f.launch(l,jwt,{Origin:'https://evil.invalid'})).status,403);
 const wrong=await f.token(l,{nonce:'b'.repeat(64)});assert.equal((await f.launch(l,wrong)).status,401);
 const replies=await Promise.all([f.launch(l,jwt),f.launch(l,jwt)]);assert.deepEqual(replies.map(r=>r.status).sort(),[303,401]);assert.equal((await f.launch(l,jwt)).status,401);
 const expired=await f.login();await f.db.exec('reset role;');await f.db.query("update mac_aula.launch_attempts set expires_at=now()-interval '1 minute' where state_hash=$1",[f.hash(expired.state)]);await f.db.exec('set role mac_aula_launch_worker;');assert.equal((await f.launch(expired,await f.token(expired))).status,401);
 assert.equal((await f.login({target_link_uri:'https://evil.invalid'})).response.status,403);assert.equal((await f.login({iss:'https://unknown.invalid'})).response.status,403);
 const redirect=new URL(l.location);assert.equal(redirect.searchParams.get('response_mode'),'form_post');assert.equal(redirect.searchParams.get('prompt'),'none');assert.equal(redirect.searchParams.get('redirect_uri'),f.c.launchUrl);
});

test('LTI validates signature, issuer, aud/azp, times, claims, roles and fixed JWKS without following token URLs',async t=>{
 const f=await fixtures(t);const C=f.CLAIM;
 const cases=[{iss:'https://other.invalid'},{aud:'other-client'},{aud:['client-1','other']},{azp:'other'},{exp:1},{iat:Math.floor(Date.now()/1000)+1000},{sub:''},{[`${C}version`]:'1.1.0'},{[`${C}message_type`]:'LtiDeepLinkingRequest'},{[`${C}target_link_uri`]:'https://evil.invalid'},{[`${C}deployment_id`]:'other'},{[`${C}context`]:{id:'other'}},{[`${C}resource_link`]:{id:'other'}},{[`${C}roles`]:['Instructor']},{[`${C}roles`]:['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor','http://purl.imsglobal.org/vocab/lis/v2/membership#Learner']}];
 for(const claims of cases){const l=await f.login(),response=await f.launch(l,await f.token(l,claims));assert.ok([401,403].includes(response.status),JSON.stringify(claims))}
 for(const header of [{jku:'https://evil.invalid/keys'},{x5u:'https://evil.invalid/cert'},{kid:'unknown'}]){const l=await f.login();assert.ok([401,503].includes((await f.launch(l,await f.token(l,{},header))).status))}
 const l=await f.login(),jwt=await f.token(l);const parts=jwt.split('.');parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);assert.equal((await f.launch(l,parts.join('.'))).status,401);
 const valid=await f.launch(l,await f.token(l,{aud:['client-1','other'],azp:'client-1'}));assert.equal(valid.status,303);assert.equal(f.fetches(),1);
});

test('LTI enrolment cap, role refresh, session revocation and browser DB isolation are enforced by Postgres',async t=>{
 const f=await fixtures(t,{maxStudents:1}),first=await f.session(),again=await f.session();assert.equal((await f.call(first,'/session')).status,401);assert.equal((await f.call(again,'/session')).status,200);
 const second=await f.login();assert.equal((await f.launch(second,await f.token(second,{sub:'student-2'}))).status,403);
 const teacher=await f.session({[`${f.CLAIM}roles`]:['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor']});assert.equal((await f.call(again,'/session')).status,401);assert.equal((await(await f.call(teacher,'/session')).json()).actor.role,'teacher');assert.equal((await f.call(teacher,'/draft')).status,403);
 await f.db.exec('reset role;set role anon;');for(const table of ['sessions','identities','launch_attempts','submissions','investigations'])await assert.rejects(f.db.query(`select * from mac_aula.${table}`));
});

test('Staging policy rejects professional project, mismatched database and unsafe capacity configuration',async()=>{
 const {isolatedStaging,pilotPolicy}=await import('../aula/edge/policy.mjs');const ref='abcdefghijklmnopqrst';const env={MAC_AULA_ENVIRONMENT:'staging',MAC_AULA_STAGING_PROJECT_REF:ref,SUPABASE_URL:`https://${ref}.supabase.co`,MAC_AULA_DATABASE_URL:`postgresql://academic:placeholder@db.${ref}.supabase.co/postgres?sslmode=require`};assert.equal(isolatedStaging(env),true);assert.equal(isolatedStaging({...env,MAC_AULA_STAGING_PROJECT_REF:'lfdmbkzghnwvsapxypvt',SUPABASE_URL:'https://lfdmbkzghnwvsapxypvt.supabase.co'}),false);assert.equal(isolatedStaging({...env,MAC_AULA_DATABASE_URL:'postgresql://localhost/postgres'}),false);assert.equal(isolatedStaging({...env,MAC_AULA_ENVIRONMENT:'production'}),false);assert.equal(pilotPolicy({}).maxStudents,50);assert.throws(()=>pilotPolicy({MAC_AULA_DAILY_EVALUATIONS:'51'}));assert.throws(()=>pilotPolicy({MAC_AULA_DAILY_CALLS:'NaN'}));
});
