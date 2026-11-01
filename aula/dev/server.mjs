// Development simulator only: deliberately no production login or LTI endpoints.
import http from 'node:http';
import {geminiConfiguration} from '../evaluation/gemini.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {openStore,PERSONAS} from './store.mjs';
import {CASE} from '../cases/mezclador.mjs';
import {DomainError,ensure,shape,RUBRIC} from '../shared/models.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const assets=new Map([['/','public/index.html'],['/app.mjs','public/app.mjs'],['/aula.css','public/aula.css'],['/shared/models.mjs','shared/models.mjs'],['/shared/mac-adapter.mjs','shared/mac-adapter.mjs'],['/shared/evaluation-rubric.mjs','shared/evaluation-rubric.mjs']]);
export async function createDevelopmentServer({file,enabled=false,sessionTtlMs=3600000,evaluationOptions={}}={}) {
 ensure(enabled===true,'Servidor deshabilitado: habilitar explícitamente solo para desarrollo',503);ensure(typeof file==='string','Falta archivo de desarrollo');
 const store=await openStore(file,evaluationOptions),sessions=new Map();
 const hash=v=>createHash('sha256').update(v).digest('hex');
 const server=http.createServer(async(req,res)=>{
  const origin=`http://127.0.0.1:${server.address().port}`;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://raw.githubusercontent.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
  const send=(status,body,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(body))};
  try{
   ensure(req.headers.host===new URL(origin).host,'Host no autorizado',403);
   const url=new URL(req.url,origin),path=url.pathname;
   if(['POST','PUT','DELETE'].includes(req.method))ensure(req.headers.origin===origin,'Origen no autorizado',403);
   async function body(){ensure(req.headers['content-type']?.split(';')[0]==='application/json','JSON requerido',415);let bytes=0,parts=[];for await(const chunk of req){bytes+=chunk.length;ensure(bytes<=1024*1024,'Máximo 1 MB',413);parts.push(chunk)}try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw new DomainError('JSON inválido',400)}}
   if(req.method==='GET'&&assets.has(path)){
    const file=assets.get(path),content=await readFile(resolve(root,file));res.writeHead(200,{...headers,'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(content);return;
   }
   if(path==='/api/dev/personas'&&req.method==='GET'){send(200,Object.entries(PERSONAS).map(([key,p])=>({key,name:p.name})));return}
   if(path==='/api/dev/session'&&req.method==='POST'){
    const b=await body();shape(b,['persona']);ensure(Object.hasOwn(PERSONAS,b.persona),'Persona simulada desconocida',403);
    const old=/mac-aula-dev=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1];if(old)sessions.delete(hash(old));
    for(const [key,s] of sessions)if(s.expires<=Date.now())sessions.delete(key);
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');sessions.set(hash(token),{actor:structuredClone(PERSONAS[b.persona]),csrf,expires:Date.now()+sessionTtlMs});
    send(200,{development:true},{'Set-Cookie':`mac-aula-dev=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs/1000)}`});return;
   }
   const token=/mac-aula-dev=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1],session=token&&sessions.get(hash(token));
   ensure(session&&session.expires>Date.now(),'Abre una sesión simulada de desarrollo. LTI aún no está disponible.',401);
   if(['POST','PUT','DELETE'].includes(req.method))ensure(req.headers['x-csrf-token']===session.csrf,'CSRF inválido',403);
   const actor=session.actor;
   if(path==='/api/session'&&req.method==='GET'){send(200,{development:true,actor,csrf:session.csrf,expiresAt:new Date(session.expires).toISOString(),case:CASE,rubric:RUBRIC});return}
   if(path==='/api/logout'&&req.method==='POST'){sessions.delete(hash(token));send(200,{ok:true},{'Set-Cookie':'mac-aula-dev=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return}
   if(path==='/api/investigations'&&req.method==='GET'){send(200,await store.list(actor));return}
   if(path==='/api/investigations'&&req.method==='POST'){shape(await body(),[]);send(201,await store.create(actor));return}
   const match=/^\/api\/investigations\/([a-zA-Z0-9_-]+)(?:\/(revisions|submit|formative))?$/.exec(path);
   if(match){const [,id,action]=match;
    if(!action&&req.method==='GET'){send(200,await store.read(actor,id));return}
    if(!action&&req.method==='PUT'){send(200,await store.save(actor,id,await body()));return}
    if(action==='revisions'&&req.method==='GET'){send(200,await store.revisions(actor,id));return}
    if(action==='submit'&&req.method==='POST'){const s=await store.submit(actor,id,await body());await store.assess(actor,s.id,{});send(201,s);return}
    if(action==='formative'&&req.method==='POST'){send(200,await store.formative(actor,id,await body()));return}
   }
   if(path==='/api/submissions'&&req.method==='GET'){send(200,await store.submissions(actor));return}
   if(path==='/api/exceptions'&&req.method==='GET'){send(200,await store.exceptions(actor));return}
   const assessment=/^\/api\/submissions\/([a-zA-Z0-9_-]+)\/(assess|appeal)$/.exec(path);
   if(assessment&&req.method==='POST'){send(200,assessment[2]==='assess'?await store.assess(actor,assessment[1],await body()):await store.appeal(actor,assessment[1],await body()));return}
   const review=/^\/api\/submissions\/([a-zA-Z0-9_-]+)\/review$/.exec(path);
   if(review&&req.method==='PUT'){send(200,await store.review(actor,review[1],await body()));return}
   if(path==='/api/audit'&&req.method==='GET'){send(200,await store.audit(actor));return}
   send(404,{error:'Recurso no disponible'});
  }catch(error){send(error.status||500,{error:error.status?error.message:'No se pudo guardar o procesar la operación. Conserva el borrador e inténtalo de nuevo.'})}
 });
 return {server,store,listen:()=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`))),close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const app=await createDevelopmentServer({file:resolve('.aula-dev/store.json'),enabled:process.env.MAC_AULA_DEV==='1',evaluationOptions:geminiConfiguration(process.env)});const url=await app.listen();console.log(`MAC Aula — SOLO DESARROLLO, datos ficticios: ${url}\nSesiones simuladas seleccionables; no es autenticación. No publicar este servidor.`);
}
