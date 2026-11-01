import {ensure} from '../shared/models.mjs';
const integer=(env,name,fallback,max)=>{const value=env[name]===undefined?fallback:Number(env[name]);ensure(Number.isSafeInteger(value)&&value>0&&value<=max,`Configuración inválida: ${name}`);return value};
export function pilotPolicy(env={}){
 return Object.freeze({dailyLimit:integer(env,'MAC_AULA_DAILY_EVALUATIONS',10,50),dailyCalls:integer(env,'MAC_AULA_DAILY_CALLS',20,200),dailyTokens:integer(env,'MAC_AULA_DAILY_RESERVED_TOKENS',400000,4000000),maxConcurrent:integer(env,'MAC_AULA_MAX_CONCURRENT',1,2),maxRuns:integer(env,'MAC_AULA_MAX_RUNS',3,3),maxStudents:integer(env,'MAC_AULA_MAX_STUDENTS',50,50)});
}
// Never infer staging from a branch or from a key. Both references must be explicitly academic.
export function isolatedStaging(env={}){
 try{const ref=env.MAC_AULA_STAGING_PROJECT_REF;const host=new URL(env.SUPABASE_URL).hostname;
  if(env.MAC_AULA_ENVIRONMENT!=='staging'||!/^[-a-z0-9]{20}$/.test(ref||'')||ref==='lfdmbkzghnwvsapxypvt'||host!==`${ref}.supabase.co`)return false;
  const db=new URL(env.MAC_AULA_DATABASE_URL);return db.protocol==='postgresql:'&&db.searchParams.get('sslmode')==='require'&&(db.hostname===`db.${ref}.supabase.co`||(db.hostname.endsWith('.pooler.supabase.com')&&db.username.endsWith(`.${ref}`)));
 }catch{return false}
}
export const retryable=new Set(['network_failure','timeout','service_failure','upstream_unavailable','busy','quota_exhausted','daily_limit','worker_interrupted']);
