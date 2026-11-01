import {randomBytes} from 'node:crypto';
import {ensure,shape,RUBRIC} from '../shared/models.mjs';
import {hash} from './repository.mjs';
import {registrationData} from './config.mjs';
const secret=()=>randomBytes(32).toString('hex');
const opaque=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function cookie(request,name){const values=(request.headers.get('cookie')||'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(`${name}=`));return values.length===1?values[0].slice(name.length+1):null}
async function read(request,limit=65536){const reader=request.body?.getReader();ensure(reader,'Cuerpo requerido',400);let size=0,parts=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;ensure(size<=limit,'Solicitud excede límite',413);parts.push(value)}}finally{await reader.cancel().catch(()=>{})}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return new TextDecoder().decode(bytes)}
export function createAcademicHandler({config:c,repository,evaluationRepository,evaluateHandler,verifyLaunch,caseData,enabled=false,publicJwks={keys:[]}}){
 ensure(Array.isArray(publicJwks.keys)&&publicJwks.keys.every(k=>k.kty==='RSA'&&k.n&&k.e&&!['d','p','q','dp','dq','qi','oth','k'].some(field=>Object.hasOwn(k,field))),'JWKS debe ser exclusivamente público');
 const base=new URL(c.toolBaseUrl),sessionName='__Host-mac-aula',csrfName='__Host-mac-aula-csrf';
 return async request=>{
  const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
  const reply=(status,data)=>Response.json(data,{status,headers});
  const set=(name,value,seconds,sameSite='Lax',httpOnly=true)=>headers.append('Set-Cookie',`${name}=${value}; Path=/; Secure; ${httpOnly?'HttpOnly; ':''}SameSite=${sameSite}; Max-Age=${seconds}`);
  try{
   ensure(enabled,'Backend académico deshabilitado',503);const url=new URL(request.url);ensure(url.origin===base.origin&&url.pathname.startsWith(`${base.pathname}/`),'Origen o ruta no autorizados',403);
   const route=url.pathname.slice(base.pathname.length);
   if(route==='/registration'&&request.method==='GET')return reply(200,registrationData(c));
   if(route==='/jwks'&&request.method==='GET')return reply(200,publicJwks);
   if(route==='/login'&&['GET','POST'].includes(request.method)){
    const params=request.method==='GET'?url.searchParams:new URLSearchParams(await read(request,8192));
    if(request.method==='POST')ensure(request.headers.get('content-type')?.split(';')[0]==='application/x-www-form-urlencoded','Formulario requerido',415);
    ensure([...params.keys()].every(k=>['iss','login_hint','target_link_uri','lti_message_hint','client_id','lti_deployment_id'].includes(k))&&[...new Set(params.keys())].every(k=>params.getAll(k).length===1),'Parámetros duplicados/desconocidos',400);
    ensure(params.get('iss')===c.issuer&&(!params.has('client_id')||params.get('client_id')===c.clientId)&&params.get('target_link_uri')===c.targetUrl,'Registro o destino no válido',403);
    const hint=params.get('login_hint');ensure(hint&&hint.length<=2000,'login_hint requerido',400);ensure((params.get('lti_message_hint')||'').length<=2000,'Hint excesivo',400);
    const deployment=params.get('lti_deployment_id');ensure(!deployment||c.activities.some(a=>a.deployment===deployment),'Deployment no permitido',403);
    const state=secret(),nonce=secret(),binding=secret();await repository.start({stateHash:hash(state),nonceHash:hash(nonce),bindingHash:hash(binding),registration:c.id,deployment});
    set(`__Host-mac-lti-${hash(state).slice(0,16)}`,binding,300,'None');
    const destination=new URL(c.authorizationUrl);for(const [key,value]of Object.entries({scope:'openid',response_type:'id_token',response_mode:'form_post',prompt:'none',client_id:c.clientId,redirect_uri:c.launchUrl,state,nonce,login_hint:hint}))destination.searchParams.set(key,value);
    if(params.has('lti_message_hint'))destination.searchParams.set('lti_message_hint',params.get('lti_message_hint'));
    headers.set('Location',destination.href);return new Response(null,{status:303,headers});
   }
   if(route==='/launch'&&request.method==='POST'){
    ensure(request.headers.get('content-type')?.split(';')[0]==='application/x-www-form-urlencoded','Formulario requerido',415);
    ensure(request.headers.get('origin')===new URL(c.issuer).origin,'Origen Moodle requerido',403);
    const form=new URLSearchParams(await read(request));ensure([...form.keys()].length===2&&form.getAll('state').length===1&&form.getAll('id_token').length===1,'Respuesta OIDC inválida',400);
    const state=form.get('state');ensure(opaque(state),'State inválido',401);const stateHash=hash(state),attempt=await repository.attempt(stateHash);
    const binding=cookie(request,`__Host-mac-lti-${stateHash.slice(0,16)}`);ensure(attempt&&attempt.registration===c.id&&opaque(binding)&&hash(binding)===attempt.bindingHash,'Intento sin vínculo de navegador o vencido',401);
    const identity=await verifyLaunch(form.get('id_token'),attempt);ensure(opaque(identity.nonce)&&hash(identity.nonce)===attempt.nonceHash,'Nonce no válido',401);
    const token=secret(),csrf=secret();await repository.launch(attempt,identity,token,csrf);
    set(`__Host-mac-lti-${stateHash.slice(0,16)}`,'',0,'None');set(sessionName,token,3600);set(csrfName,csrf,3600,'Lax',false);headers.set('Location',c.targetUrl);return new Response(null,{status:303,headers});
   }
   const token=cookie(request,sessionName);ensure(opaque(token),'Sesión académica requerida',401);const actor=await evaluationRepository.authenticate(hash(token));ensure(actor,'Sesión vencida',401);
   if(!['GET','HEAD'].includes(request.method)){
    ensure(request.headers.get('origin')===base.origin,'Origen académico requerido',403);const csrf=request.headers.get('x-csrf-token');ensure(opaque(csrf)&&csrf===cookie(request,csrfName)&&await repository.csrf(actor,csrf),'CSRF inválido',403);
   }
   if(route==='/session'&&request.method==='GET')return reply(200,{actor:{id:actor.id,role:actor.role,scope:{platform:actor.platform,deployment:actor.deployment,course:actor.course,activity:actor.activity}},case:caseData,rubric:RUBRIC,automaticGrades:false});
   if(route==='/logout'&&request.method==='POST'){await repository.logout(actor);set(sessionName,'',0);set(csrfName,'',0,'Lax',false);return reply(200,{ok:true})}
   if(route==='/app'&&request.method==='GET'){headers.set('Content-Type','text/html; charset=utf-8');return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><title>MAC Aula · staging</title><h1>MAC Aula</h1><p>Sesión académica validada. Backend de investigación disponible en staging. La conexión de la interfaz académica completa se habilitará tras la prueba autorizada con Moodle.</p></html>',{headers})}
   if(route==='/draft'&&request.method==='GET')return reply(200,await repository.draft(actor));
   if(route==='/submissions'&&request.method==='GET')return reply(200,await repository.submissions(actor));
   if(route==='/evaluate'&&request.method==='POST'){
    // Cookie never reaches Gemini. Reuse the existing protected evaluator, including retry/history/review.
    return evaluateHandler(new Request('https://academic-evaluator.invalid/',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:await read(request,16384)}));
   }
   ensure(['PUT','POST'].includes(request.method),'Método no permitido',405);ensure(request.headers.get('content-type')?.split(';')[0]==='application/json','JSON requerido',415);let body;try{body=JSON.parse(await read(request,1048576))}catch(e){if(e.status)throw e;throw Object.assign(Error('JSON inválido'),{status:400})}
   if(route==='/draft'&&request.method==='PUT'){shape(body,['revision','document']);return reply(200,await repository.save(actor,body.revision,body.document))}
   if(route==='/submit'&&request.method==='POST'){shape(body,['revision']);ensure(Number.isSafeInteger(body.revision)&&body.revision>0,'Revisión inválida',422);return reply(201,await repository.submit(actor,body.revision))}
   return reply(404,{error:{code:'not_found'}});
  }catch(error){const status=[400,401,403,404,405,409,413,415,422,429,503].includes(error.status)?error.status:/^ERR_J(WT|WS|OSE|WKS)_/.test(error.code||'')?401:503;return reply(status,{error:{code:status===503?'not_enabled_or_unavailable':'academic_request_rejected',message:'No se pudo completar la operación académica. No se ha publicado ninguna calificación.'}})}
 };
}
