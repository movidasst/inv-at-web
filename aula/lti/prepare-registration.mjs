// Offline preparation. Never deploys, connects to Moodle, or prints private keys.
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {ensure} from '../shared/models.mjs';
const {values}=parseArgs({options:{'base-url':{type:'string'},output:{type:'string'}}});
const base=new URL(values['base-url']);ensure(base.protocol==='https:'&&!base.search&&!base.hash&&!base.username&&!base.password&&!base.href.endsWith('/'),'Base HTTPS sin slash final requerida');
const directory=resolve(values.output||'.aula-dev/lti-registration');await mkdir(directory,{recursive:true});
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const kid=randomUUID(),jwk={...publicKey.export({format:'jwk'}),kid,use:'sig',alg:'RS256'},toolBaseUrl=base.href;
await writeFile(resolve(directory,'tool-private.pem'),privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600,flag:'wx'});
await writeFile(resolve(directory,'tool-public-jwks.json'),JSON.stringify({keys:[jwk]},null,2)+'\n',{flag:'wx'});
await writeFile(resolve(directory,'moodle-tool-registration.json'),JSON.stringify({name:'MAC Aula staging',version:'LTI-1p3',login_initiation_url:`${toolBaseUrl}/login`,redirect_uris:[`${toolBaseUrl}/launch`],target_link_uri:`${toolBaseUrl}/app`,jwks_uri:`${toolBaseUrl}/jwks`,deep_linking:false,automatic_grades:false,requested_ags_scopes:[],launch_container:'new_window'},null,2)+'\n',{flag:'wx'});
console.log('Registro y claves preparados localmente. La clave privada no se muestra. No se ha desplegado ni enviado nada.');
