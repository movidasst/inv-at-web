const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');

function harness({saved=null,reply=()=>({ok:false})}={}){
 const elements=new Map(),memory=new Map(),calls=[],starts=[],timers=[];
 if(saved)memory.set('movida-sst-mac-session',saved);
 let init,locked=0;
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:id==='appShell',textContent:'',disabled:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn},setAttribute(){},focus(){},reset(){}});return elements.get(id)};
 const sessionStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const document={getElementById:get,body:{classList:{remove(){},add(){}}},addEventListener(name,fn){if(name==='DOMContentLoaded')init=fn}};
 const window={MACApp:{start:async data=>starts.push(data),flush:async()=>{},lock:async()=>{locked++}}};
 const sandbox={document,window,sessionStorage,crypto:webcrypto,TextEncoder,Date,AbortSignal,
  setTimeout:fn=>{timers.push(fn);return timers.length},setInterval:fn=>{timers.push(fn);return timers.length},clearTimeout(){},clearInterval(){},
  fetch:async(url,options)=>{const call={name:url.split('/').pop(),body:JSON.parse(options.body)};calls.push(call);const data=await reply(call);return {ok:true,json:async()=>data}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../auth.js'),'utf8'),sandbox);
 return {init:()=>init(),get,memory,calls,starts,timers,locked:()=>locked};
}
const valid=()=>({ok:true,token:'a'.repeat(64),scope:'b'.repeat(64),key:'c'.repeat(64),name:'Persona ficticia',expires_at:new Date(Date.now()+3600000).toISOString()});

test('professional rejects fabricated persisted session and clears token',async()=>{
 const h=harness({saved:JSON.stringify({token:'f'.repeat(64),scope:'b'.repeat(64)})});await h.init();
 assert.equal(h.calls[0].name,'mac_resume');assert.equal(h.starts.length,0);assert.equal(h.get('appShell').hidden,true);assert.equal(h.memory.size,0);
});
test('professional fails closed when session validation network is unavailable',async()=>{
 const h=harness({saved:JSON.stringify({token:'a'.repeat(64)}),reply:()=>{throw Error('offline')}});await h.init();
 assert.equal(h.starts.length,0);assert.equal(h.memory.size,0);assert.equal(h.get('appShell').hidden,true);
});
test('professional login retains only bearer, then logout requests revocation and locks',async()=>{
 const h=harness({reply:call=>call.name==='mac_login'?valid():{ok:true}});await h.init();
 h.get('memberId').value='999000111';h.get('memberPassword').value='TEST-ONLY';await h.get('memberLogin').handlers.submit({preventDefault(){}});
 assert.equal(h.starts.length,1);assert.equal(h.get('appShell').hidden,false);
 assert.deepEqual(JSON.parse(h.memory.get('movida-sst-mac-session')),{token:'a'.repeat(64)});
 assert.equal(h.get('memberPassword').value,'');
 await h.get('logoutBtn').handlers.click();assert.equal(h.locked(),1);assert.equal(h.memory.size,0);assert.equal(h.get('appShell').hidden,true);
 assert.equal(h.calls.at(-1).name,'mac_logout');assert.equal(h.calls.at(-1).body.p_token,'a'.repeat(64));
});
test('professional refuses expired server session before starting editor',async()=>{
 const h=harness({saved:JSON.stringify({token:'a'.repeat(64)}),reply:()=>({...valid(),expires_at:new Date(Date.now()-10000).toISOString()})});await h.init();
 assert.equal(h.starts.length,0);assert.equal(h.memory.size,0);assert.equal(h.get('appShell').hidden,true);
});
test('professional locks on periodic server revocation',async()=>{
 const h=harness({saved:JSON.stringify({token:'a'.repeat(64)}),reply:call=>call.name==='mac_resume'&&h.calls.length===1?valid():{ok:false}});await h.init();
 assert.equal(h.starts.length,1);await h.timers[1]();assert.equal(h.locked(),1);assert.equal(h.memory.size,0);assert.equal(h.get('appShell').hidden,true);
});
