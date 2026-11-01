import {ensure} from '../shared/models.mjs';
export function registrationConfig(value){
 const c=structuredClone(value);const validUrl=s=>{const u=new URL(s);ensure(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search&&!/^localhost$|^\d|:|\.local$/.test(u.hostname),'URL LTI no autorizada');return u};
 const issuer=validUrl(c.issuer),base=validUrl(c.toolBaseUrl);ensure(!base.pathname.endsWith('/'),'Base sin slash final');
 for(const k of ['authorizationUrl','jwksUrl'])ensure(validUrl(c[k]).origin===issuer.origin,'Los endpoints deben pertenecer al Moodle registrado');
 for(const k of ['id','clientId'])ensure(typeof c[k]==='string'&&c[k].length>0&&c[k].length<=200,'Registro incompleto');
 ensure(Array.isArray(c.activities)&&c.activities.length>0&&c.activities.length<=100,'Actividades autorizadas requeridas');
 const seen=new Set();for(const a of c.activities){for(const k of ['deployment','course','resource'])ensure(typeof a[k]==='string'&&a[k].length>0&&a[k].length<=200,'Ámbito incompleto');const key=JSON.stringify([a.deployment,a.course,a.resource]);ensure(!seen.has(key),'Actividad duplicada');seen.add(key);ensure(a.fictitious===true,'Solo actividades ficticias');}
 c.loginUrl=`${c.toolBaseUrl}/login`;c.launchUrl=`${c.toolBaseUrl}/launch`;c.targetUrl=`${c.toolBaseUrl}/app`;c.jwksPublicUrl=`${c.toolBaseUrl}/jwks`;
 return Object.freeze(c);
}
export function registrationData(c){return {name:'MAC Aula — piloto de staging',version:'LTI-1p3',login_initiation_url:c.loginUrl,redirect_uris:[c.launchUrl],target_link_uri:c.targetUrl,jwks_uri:c.jwksPublicUrl,launch_container:'new_window',deep_linking:false,automatic_grades:false,requested_ags_scopes:[]}}
