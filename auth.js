(() => {
"use strict";
const $=id=>document.getElementById(id);
const URL="https://lfdmbkzghnwvsapxypvt.supabase.co/rest/v1/rpc/";
const APIKEY="sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1";
const SESSION="movida-sst-mac-session";
let token=null,expiryTimer=null,checkTimer=null,closing=false;
const message=text=>{$("loginMessage").textContent=text};
async function rpc(name,body){
 const response=await fetch(URL+name,{method:"POST",headers:{apikey:APIKEY,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("No fue posible validar la sesión con el servidor.");
 return response.json();
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
 clearTimeout(expiryTimer);clearInterval(checkTimer);
 expiryTimer=setTimeout(()=>closeSession(true),Math.max(0,Date.parse(data.expires_at)-Date.now()));
 checkTimer=setInterval(async()=>{try{const valid=await rpc("mac_resume",{p_token:token});if(!valid?.ok)await closeSession(true)}catch{await closeSession(true)}},60000);
}
async function closeSession(expired=false){
 if(closing)return;closing=true;clearTimeout(expiryTimer);clearInterval(checkTimer);
 let saveFailed=false;
 try{await window.MACApp.flush()}catch{saveFailed=true;if(!expired){message("El guardado falló. Exporta el expediente antes de cerrar.");closing=false;return}}
 const previous=token;token=null;sessionStorage.removeItem(SESSION);
 $("appShell").hidden=true;$("appShell").setAttribute("aria-hidden","true");$("loginGate").hidden=false;document.body.classList.add("auth-locked");
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
