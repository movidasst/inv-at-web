import {ensure} from '../shared/models.mjs';
export const CLAIM='https://purl.imsglobal.org/spec/lti/claim/';
const rolePrefix='http://purl.imsglobal.org/vocab/lis/v2/membership#';
export function createLaunchVerifier(c,{jwtVerify,decodeProtectedHeader,createLocalJWKSet,fetchImpl=fetch}){
 let cached=null,expires=0,lastFetch=0,inFlight=null;
 async function load(kid){
  if(cached&&Date.now()<expires&&cached.keys.some(k=>k.kid===kid))return cached;
  ensure(Date.now()-lastFetch>60000,'JWKS temporalmente no disponible',503);lastFetch=Date.now();
  const response=await fetchImpl(c.jwksUrl,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}});ensure(response.ok,'JWKS no disponible',503);
  const reader=response.body.getReader();let length=0,chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;ensure(length<=32768,'JWKS excede límite',503);chunks.push(...value)}}finally{await reader.cancel().catch(()=>{})}
  const data=JSON.parse(new TextDecoder().decode(new Uint8Array(chunks)));ensure(Array.isArray(data.keys)&&data.keys.length>0&&data.keys.length<=10,'JWKS inválido',503);
  ensure(data.keys.every(k=>k.kty==='RSA'&&typeof k.n==='string'&&typeof k.e==='string'&&typeof k.kid==='string'&&!k.d&&!k.p&&!k.q&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig')),'Clave no autorizada',503);
  ensure(new Set(data.keys.map(k=>k.kid)).size===data.keys.length,'kid duplicado',503);cached=data;expires=Date.now()+900000;return data;
 }
 async function keys(kid){if(inFlight)return inFlight;inFlight=load(kid);try{return await inFlight}finally{inFlight=null}}
 return async(token,attempt)=>{
  ensure(typeof token==='string'&&token.length<=32768,'JWT inválido',401);const h=decodeProtectedHeader(token);
  ensure(h.alg==='RS256'&&typeof h.kid==='string'&&!h.jku&&!h.x5u&&!h.jwk&&!h.crit,'Cabecera JWT no autorizada',401);
  const {payload:p}=await jwtVerify(token,createLocalJWKSet(await keys(h.kid)),{algorithms:['RS256'],issuer:c.issuer,audience:c.clientId,clockTolerance:30,maxTokenAge:300,requiredClaims:['iss','aud','sub','iat','exp','nonce']});
  ensure(typeof p.sub==='string'&&p.sub.length>0&&p.sub.length<=255&&Number.isInteger(p.exp)&&Number.isInteger(p.iat)&&p.exp>p.iat&&p.exp-p.iat<=600,'Identidad/tiempos inválidos',401);
  ensure((!Array.isArray(p.aud)||p.aud.length===1||p.azp===c.clientId)&&(!p.azp||p.azp===c.clientId),'azp inválido',401);
  ensure(p[`${CLAIM}version`]==='1.3.0'&&p[`${CLAIM}message_type`]==='LtiResourceLinkRequest','Mensaje LTI no autorizado',401);
  ensure(p[`${CLAIM}target_link_uri`]===c.targetUrl,'Destino inválido',401);
  const deployment=p[`${CLAIM}deployment_id`],course=p[`${CLAIM}context`]?.id,resource=p[`${CLAIM}resource_link`]?.id;
  ensure(c.activities.some(a=>a.deployment===deployment&&a.course===course&&a.resource===resource)&&(!attempt.deployment||attempt.deployment===deployment),'Actividad no autorizada',403);
  const roles=p[`${CLAIM}roles`];ensure(Array.isArray(roles)&&roles.length>0&&roles.length<=20&&roles.every(r=>typeof r==='string'),'Roles inválidos',403);
  // A mixed learner/instructor launch cannot acquire teacher privilege.
  const teacher=roles.includes(`${rolePrefix}Instructor`),student=roles.includes(`${rolePrefix}Learner`);
  ensure(teacher!==student&&roles.every(r=>r===`${rolePrefix}Instructor`||r===`${rolePrefix}Learner`),'Rol no autorizado o ambiguo',403);
  return {sub:p.sub,nonce:p.nonce,role:teacher?'teacher':'student',platform:c.id,deployment,course,activity:resource};
 };
}
