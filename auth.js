(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  // Misma función y clave pública que los simuladores de la Academia. Nunca incluir service_role.
  const SUPABASE_URL = 'https://lfdmbkzghnwvsapxypvt.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  const ACCESS_SESSION_KEY = 'movida-sst-mac-session';
  const ACCESS_ATTEMPTS_KEY = 'movida-sst-mac-attempts';
  const ACCESS_DURATION = 20 * 60 * 1000;
  const BLOCK_DURATION = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 5;
  let expiryTimer = null;
  const read = (storage,key,fallback) => { try { return JSON.parse(storage.getItem(key) || "null") || fallback; } catch { return fallback; } };
  const write = (storage,key,data) => { try { storage.setItem(key,JSON.stringify(data)); } catch {} };
  const message=(text,type="error")=>{const el=$("loginMessage");el.textContent=text;el.classList.toggle("success",type==="success")};
  function attempts(){
    const current=read(localStorage,ACCESS_ATTEMPTS_KEY,{count:0,blockedUntil:0});
    if(current.blockedUntil && current.blockedUntil <= Date.now()){
      localStorage.removeItem(ACCESS_ATTEMPTS_KEY);
      return {count:0,blockedUntil:0};
    }
    return current;
  }
  function blocked(until){const n=Math.max(1,Math.ceil((until-Date.now())/60000));return "Demasiados intentos. Vuelve a intentarlo en "+n+" minuto"+(n===1?"":"s")+"."}
  function fail(){
    const old=attempts(), count=(old.count||0)+1;
    if(count>=MAX_ATTEMPTS){const until=Date.now()+BLOCK_DURATION;write(localStorage,ACCESS_ATTEMPTS_KEY,{count:0,blockedUntil:until});return blocked(until)}
    write(localStorage,ACCESS_ATTEMPTS_KEY,{count,blockedUntil:0});
    return "No pudimos validar las credenciales. Te quedan "+(MAX_ATTEMPTS-count)+" intentos.";
  }
  async function scopeFor(cedula){
    if(!window.crypto?.subtle)throw Error("Secure origin required for member-specific storage");
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("MAC:member:"+cedula));
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  }
  function openApp(data,persist=true){
    if(!data || !/^[a-f0-9]{64}$/.test(data.scope) || data.expiresAt<=Date.now()) return;
    const name=data.name||"integrante";
    const previouslyOpen=$("appShell").hidden===false;
    $("loginGate").hidden=true;
    $("appShell").hidden=false;
    $("appShell").setAttribute("aria-hidden","false");
    $("memberName").textContent=name;
    document.body.classList.remove("auth-locked");
    if(persist) write(sessionStorage,ACCESS_SESSION_KEY,{name,scope:data.scope,expiresAt:data.expiresAt});
    if(!previouslyOpen)window.MACApp.start({scope:data.scope});
    clearTimeout(expiryTimer);
    expiryTimer=setTimeout(()=>closeSession(true),Math.max(0,data.expiresAt-Date.now()));
  }
  function closeSession(expired=false){
    clearTimeout(expiryTimer);
    sessionStorage.removeItem(ACCESS_SESSION_KEY);
    if(expired)sessionStorage.setItem("movida-sst-mac-expired","1");
    // Recarga: la UI, los datos y la aplicación no se inicializan sin una sesión activa.
    window.location.reload();
  }
  async function submitLogin(ev){
    ev.preventDefault();
    const cedulaInput=$("memberId"),pass=$("memberPassword"),submit=$("loginSubmit");
    const cedula=cedulaInput.value.replace(/\D/g,"");
    const codigo=pass.value.trim();
    const limit=attempts();
    if(limit.blockedUntil>Date.now()){message(blocked(limit.blockedUntil));return}
    if(!cedula||!codigo){message("Ingresa tu cédula sin puntos y tu código único de integrante.");(!cedula?cedulaInput:pass).focus();return}
    if(cedula.length>20 || codigo.length>80){message("Revisa los datos ingresados.");return}
    submit.disabled=true;
    submit.querySelector("span").textContent="Verificando credenciales…";
    message("");
    try{
      const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/acceso_integrante",{
        method:"POST",
        headers:{"apikey":PUBLISHABLE_KEY,"Authorization":"Bearer "+PUBLISHABLE_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({p_cedula:cedula,p_codigo:codigo}),
        cache:"no-store",
      });
      if(!response.ok)throw new Error("Error de autenticación "+response.status);
      const payload=await response.json(), member=Array.isArray(payload)?payload[0]:payload;
      if(!member){pass.value="";pass.focus();message(fail());return}
      const scope=await scopeFor(cedula);
      const name=[member.nombres,member.apellidos].filter(Boolean).join(" ").trim() || "integrante";
      localStorage.removeItem(ACCESS_ATTEMPTS_KEY);
      $("memberLogin").reset();
      openApp({scope,name,expiresAt:Date.now()+ACCESS_DURATION});
    }catch(error){
      console.error("Error de acceso MAC",error);
      message("No fue posible validar el acceso. Comprueba tu conexión e inténtalo nuevamente.");
    }finally{submit.disabled=false;submit.querySelector("span").textContent="Ingresar a MAC"}
  }
  function init(){
    $("memberLogin").addEventListener("submit",submitLogin);
    $("togglePassword").addEventListener("click",()=>{
      const el=$("memberPassword"),show=el.type==="password";
      el.type=show?"text":"password";
      $("togglePassword").textContent=show?"Ocultar":"Mostrar";
      $("togglePassword").setAttribute("aria-pressed",String(show));
    });
    $("logoutBtn").addEventListener("click",()=>closeSession());
    const data=read(sessionStorage,ACCESS_SESSION_KEY,null);
    if(data?.expiresAt>Date.now()&&/^[a-f0-9]{64}$/.test(data.scope)){openApp(data,false);return}
    sessionStorage.removeItem(ACCESS_SESSION_KEY);
    const expired=sessionStorage.getItem("movida-sst-mac-expired")==="1";
    sessionStorage.removeItem("movida-sst-mac-expired");
    const limit=attempts();
    if(expired)message("Tu sesión de 20 minutos terminó. Ingresa nuevamente para continuar.");
    else if(limit.blockedUntil>Date.now())message(blocked(limit.blockedUntil));
    $("memberId").focus();
  }
  document.addEventListener("DOMContentLoaded",init);
})();