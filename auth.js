(() => {
"use strict";
const $=id=>document.getElementById(id);
const URL="https://lfdmbkzghnwvsapxypvt.supabase.co/rest/v1/rpc/";
const APIKEY="sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1";
const SESSION="movida-sst-mac-session";
let token=null,expiryTimer=null,checkTimer=null,closing=false;
let gameScope=null,gameFrame=null,gameRequest=null;
const gameProgressKey=key=>/^expediente-mac-[a-z0-9-]{1,64}$/i.test(key);
const message=text=>{$("loginMessage").textContent=text};
async function rpc(name,body){
 const response=await fetch(URL+name,{method:"POST",headers:{apikey:APIKEY,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("No fue posible validar la sesión con el servidor.");
 return response.json();
}
function gameStorageKey(){return "mac-member-game:"+gameScope}
function readGameProgress(){
 try{return JSON.parse(localStorage.getItem(gameStorageKey())||"{}")||{}}catch{return {}}
}
async function showGameTab(focus=false){
 if($("appShell").hidden)return;
 const show=location.hash==="#juego-mac";
 $("macGamePanel").hidden=!show;$("macWorkspace").hidden=show;
 if(!show)return;
 if(focus)$("macGameTitle").focus();
 if(gameFrame||gameRequest)return;
 const activeToken=token;
 const request=rpc("mac_game",{p_token:activeToken});
 gameRequest=request;$("macGameStatus").textContent="Cargando el juego…";$("macGameRetry").hidden=true;
 try{
  const html=await request;
  if(activeToken!==token||$("appShell").hidden)return;
  if(typeof html!=="string"||!html.includes("__MAC_GAME_PROGRESS__"))throw Error("Juego no disponible");
  const progress=JSON.stringify(readGameProgress()).replace(/</g,"\\u003c");
  const frame=document.createElement("iframe");
  frame.className="game-frame";
  frame.title="Expediente MAC, juego de investigación de accidentes";
  frame.setAttribute("sandbox","allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox");
  frame.referrerPolicy="no-referrer";
  frame.srcdoc=html.replace("__MAC_GAME_PROGRESS__",()=>progress);
  gameFrame=frame;$("macGameMount").replaceChildren(frame);$("macGameStatus").textContent="";
 }catch{
  if(activeToken!==token||$("appShell").hidden)return;
  $("macGameStatus").textContent="No se pudo cargar el juego. Comprueba tu conexión y vuelve a intentar.";
  $("macGameRetry").hidden=false;
 }finally{if(gameRequest===request)gameRequest=null}
}
function clearGame(){
 gameScope=null;gameRequest=null;gameFrame=null;$("macGameMount").replaceChildren();
 $("macGamePanel").hidden=true;$("macWorkspace").hidden=false;
}
async function legacyScope(cedula){
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("MAC:member:"+cedula));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
async function openApp(data,legacy){
 if(!data?.ok||!/^[a-f0-9]{64}$/.test(data.scope||"")||!/^[a-f0-9]{64}$/.test(data.key||"")||Date.parse(data.expires_at)<=Date.now())throw Error("Sesión no válida.");
 await window.MACApp.start({scope:data.scope,key:data.key,legacyScope:legacy});
 $("loginGate").hidden=true;$("appShell").hidden=false;$("appShell").setAttribute("aria-hidden","false");
 $("memberName").textContent=data.name||"integrante";document.body.classList.remove("auth-locked");
 gameScope=data.scope;void showGameTab();
 clearTimeout(expiryTimer);clearInterval(checkTimer);
 expiryTimer=setTimeout(()=>closeSession(true),Math.max(0,Date.parse(data.expires_at)-Date.now()));
 checkTimer=setInterval(async()=>{try{const checkedToken=token;const valid=await rpc("mac_resume",{p_token:checkedToken});if(token===checkedToken&&!valid?.ok)await closeSession(true)}catch{/* La caducidad local sigue activa durante fallos transitorios de red. */}},60000);
}
async function closeSession(expired=false){
 if(closing)return;closing=true;
 let saveFailed=false;
 try{await window.MACApp.flush()}catch{saveFailed=true;if(!expired){$("saved").textContent="El guardado falló. Exporta el expediente antes de cerrar.";closing=false;return}}
 clearTimeout(expiryTimer);clearInterval(checkTimer);
 const previous=token;token=null;sessionStorage.removeItem(SESSION);
 $("appShell").hidden=true;$("appShell").setAttribute("aria-hidden","true");$("loginGate").hidden=false;document.body.classList.add("auth-locked");
 clearGame();
 await window.MACApp.lock();
 if(previous)try{await rpc("mac_logout",{p_token:previous})}catch{}
 message(saveFailed?"La sesión terminó con un error de guardado. Ingresa nuevamente y revisa el último avance conservado.":expired?"Tu sesión terminó. Ingresa nuevamente para continuar.":"Sesión cerrada.");
 closing=false;$("memberId").focus();
}
async function submitLogin(event){
 event.preventDefault();
 const cedula=$("memberId").value.replace(/\D/g,""),codigo=$("memberPassword").value.trim(),submit=$("loginSubmit");
 if(!cedula||!codigo||cedula.length>20||codigo.length>80){message("Ingresa tu cédula y código de integrante.");return}
 submit.disabled=true;message("Verificando credenciales…");
 try{
  const data=await rpc("mac_login",{p_cedula:cedula,p_codigo:codigo});
  if(!data?.ok){message(data?.blocked?"Demasiados intentos. Espera 15 minutos antes de volver a ingresar.":"No pudimos validar las credenciales.");return}
  token=data.token;
  // Only the bearer token persists. Neither the encryption key nor identity is stored in the session.
  sessionStorage.setItem(SESSION,JSON.stringify({token}));
  await openApp(data,await legacyScope(cedula));
  $("memberLogin").reset();message("");
 }catch{message("No se pudo abrir el expediente. Comprueba tu conexión. Si el guardado está dañado, conserva sus datos y solicita asistencia.");}
 finally{$("memberPassword").value="";submit.disabled=false}
}
async function init(){
 window.addEventListener("hashchange",()=>{void showGameTab(true)});
 $("macGameRetry").addEventListener("click",()=>{void showGameTab()});
 window.addEventListener("message",event=>{
  if(!gameFrame||event.source!==gameFrame.contentWindow||event.origin!=="null"||!gameScope||$("appShell").hidden)return;
  const {type,key,value}=event.data||{};
  if(type!=="mac-game-progress"||typeof key!=="string"||!gameProgressKey(key)||typeof value!=="string"||value.length>100000)return;
  try{const progress=readGameProgress();progress[key]=value;localStorage.setItem(gameStorageKey(),JSON.stringify(progress))}catch{}
 });

 $("memberLogin").addEventListener("submit",submitLogin);
 $("togglePassword").addEventListener("click",()=>{const input=$("memberPassword"),show=input.type==="password";input.type=show?"text":"password";$("togglePassword").textContent=show?"Ocultar":"Mostrar";$("togglePassword").setAttribute("aria-pressed",String(show))});
 $("logoutBtn").addEventListener("click",()=>closeSession());
 let saved;try{saved=JSON.parse(sessionStorage.getItem(SESSION)||"null")}catch{}
 if(/^[a-f0-9]{64}$/.test(saved?.token||"")){
  try{token=saved.token;const data=await rpc("mac_resume",{p_token:token});if(data?.ok){await openApp(data);return}}catch{}
 }
 token=null;sessionStorage.removeItem(SESSION);$("memberId").focus();
}
document.addEventListener("DOMContentLoaded",init);
})();
