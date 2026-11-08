
(function(){
"use strict";
let STORAGE=null,STEPS=["Inicio","Identificación","Actuación legal","Evidencias y cronología","Hechos verificados","Árbol de causas","Análisis causal","Medidas y seguimiento","Informe técnico"];
const refs={
ley:"LOPCYMAT (2005), arts. 40.14, 69, 73–76",
reg:"Reglamento Parcial de la LOPCYMAT (2007), arts. 83–85",
nt:"NT-04:2023, art. 19, nums. 1.1.1–1.1.3",
oit:"OIT (2019), Investigación de accidentes del trabajo a través del método del árbol de causas (referencia técnica, no obligación venezolana)"
};
const URLs={ley:"https://natlex.ilo.org/dyn/natlex2/natlex2/files/download/72376/LOPCYMAT.pdf",reg:"https://www.piensosst.com/wp-content/uploads/2025/03/regl_par_lopcymat.pdf",nt:"https://www.piensosst.com/wp-content/uploads/2024/12/GO-NT-04-2023.pdf",oit:"https://www.ilo.org/es/publications/investigacion-de-accidentes-del-trabajo-traves-del-metodo-del-arbol-de"};
if(window.cytoscape&&window.cytoscapeDagre){try{window.cytoscape.use(window.cytoscapeDagre)}catch(e){}}
const $=id=>document.getElementById(id);const E=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined&&txt!==null)x.textContent=txt;return x};
const esc=t=>String(t??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const ident=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-3);
const legalActs=[
 {key:"inpsasel",name:"Notificación al INPSASEL",hours:1,span:"60 minutos",article:83},
 {key:"committee",name:"Notificación al Comité de Seguridad y Salud Laboral (CSSL)",hours:12,span:"12 horas",article:83},
 {key:"union",name:"Notificación al sindicato",hours:12,span:"12 horas",article:83,union:true},
 {key:"formal",name:"Declaración formal ante el INPSASEL",hours:24,span:"24 horas",article:84},
 {key:"formalCommittee",name:"Declaración formal al CSSL",hours:24,span:"24 horas",article:84},
 {key:"formalUnion",name:"Declaración formal al sindicato",hours:24,span:"24 horas",article:84,union:true}
];
const initial=()=>({version:2,general:{code:"",company:"",place:"",date:"",time:"",description:"",worker:"",job:"",consequence:"",investigator:"",role:"",delegates:"",team:"",emergency:""},
legal:{...Object.fromEntries(legalActs.map(a=>[a.key,{at:"",proof:""}])),notes:""},
evidence:[],timeline:[],facts:[],diagram:{cytoscape:[],seq:1,final:""},analyses:{},actions:[],conclusion:"",limits:"",reviewDate:""});
let s=initial(),step=0,cy=null;
let storageKey=null,saveQueue=Promise.resolve(),pendingSaves=0,saveError=null,replacement=null;
const demoStorage=()=>STORAGE+":demo";
const recoveryStorage=()=>STORAGE+":recovery";
const activeStorage=()=>s.isDemo?demoStorage():STORAGE;
const toBase64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(""));
const fromBase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function writeEncrypted(target,key,snapshot){
 if(!target||!key)throw Error("Sesión de almacenamiento no disponible");
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(target)},key,new TextEncoder().encode(snapshot));
 localStorage.setItem(target,JSON.stringify({encrypted:1,iv:toBase64(iv),data:toBase64(new Uint8Array(encrypted))}));
}
async function readEncrypted(value,target){
 const envelope=JSON.parse(value);if(envelope.encrypted!==1)throw Error("Formato de guardado no reconocido");
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64(envelope.iv),additionalData:new TextEncoder().encode(target)},storageKey,fromBase64(envelope.data));
 return migrate(JSON.parse(new TextDecoder().decode(plain)));
}
function save(){
 if(cy)s.diagram.cytoscape=cy.elements().jsons();
 const snapshot=JSON.stringify(s),target=activeStorage(),key=storageKey;
 updateReviewStatus();
 pendingSaves++;$("saved").textContent="Guardando…";
 saveQueue=saveQueue.then(async()=>{
  await writeEncrypted(target,key,snapshot);
  saveError=null;
 }).catch(error=>{saveError=error;}).finally(()=>{pendingSaves--;refreshSaveStatus()});
 return saveQueue;
}
function refreshSaveStatus(){
 $("saved").textContent=saveError?"No se pudo guardar: exporta el expediente":pendingSaves?"Guardando…":"Guardado cifrado en este dispositivo";
}
window.addEventListener("beforeunload",event=>{if(pendingSaves||saveError||replacement){event.preventDefault();event.returnValue=""}});
function migrate(o){
if(!o||!o.general||!Array.isArray(o.facts))throw Error("Formato no compatible");
if(o.version===2){if(!o.legal||!o.diagram||!Array.isArray(o.evidence))throw Error("Archivo incompleto");return {...o,legal:{...initial().legal,...o.legal}}}
const d=initial(),g=o.general||{};
Object.assign(d.general,{date:g.date||"",time:g.time||"",place:g.location||"",description:g.description||"",worker:o.persons?.[0]?.name||"",job:o.persons?.[0]?.role||"",consequence:o.persons?.[0]?.consequence||"",investigator:o.investigator?.name||"",role:o.investigator?.role||""});
d.facts=o.facts.map((f,i)=>({id:"legacy-fact-"+i,text:typeof f==="string"?f:String(f?.text||""),evidenceId:"",status:"pendiente"}));
const oldNodes=o.diagram?.cytoscape||[],nodeIDs={};
for(const el of oldNodes.filter(x=>x.group==="nodes")){const i=Number(el.data?.originFactIndex);let f=Number.isInteger(i)&&i>=0?d.facts[i]:null;if(!f){f={id:"legacy-extra-"+ident(),text:String(el.data?.label||""),evidenceId:"",status:"pendiente"};d.facts.push(f)}nodeIDs[el.data.id]=f.id;d.diagram.cytoscape.push({group:"nodes",data:{id:f.id,label:f.text},position:el.position||{x:0,y:0}})}
for(const el of oldNodes.filter(x=>x.group==="edges")){const a=nodeIDs[el.data?.source],b=nodeIDs[el.data?.target];if(a&&b&&a!==b)d.diagram.cytoscape.push({group:"edges",data:{id:ident(),source:a,target:b}})}
return d
}
async function load(legacyScope){
 const v=localStorage.getItem(STORAGE);
 if(v){
  s=await readEncrypted(v,STORAGE);
  if(!s.isDemo)return true;
  const storedDemo=localStorage.getItem(demoStorage());
  if(storedDemo)s=await readEncrypted(storedDemo,demoStorage());
  return true;
 }
 const storedDemo=localStorage.getItem(demoStorage());
 if(storedDemo){s=await readEncrypted(storedDemo,demoStorage());return true}
 if(legacyScope){const oldKey="mac-ve-v2-member-"+legacyScope,old=localStorage.getItem(oldKey);if(old){s=migrate(JSON.parse(old));await save();if(saveError)throw saveError;localStorage.removeItem(oldKey);return true}}
 return false;
}
function pTitle(root,title,desc){root.append(E("h2","",title));root.append(E("p","lead",desc))}
function group(root,title){const d=E("section","group");d.append(E("h3","",title));root.append(d);return d}
function note(root,text,kind){root.append(E("div","note"+(kind?" "+kind:""),text))}
function btn(text,cb,cls="btn secondary"){const b=E("button",cls,text);b.type="button";b.onclick=cb;return b}
function field(root,label,value,onChange,type="text",options){const d=E("div","field"),l=E("label","",label);d.append(l);let x;
if(options){x=E("select");for(const [v,t] of options){const o=E("option","",t);o.value=v;x.append(o)}x.value=value??""}
else if(type==="textarea"){x=E("textarea");x.value=value??""}
else {x=E("input");x.type=type;x.value=value??""}
x.setAttribute("aria-label",label);x.oninput=()=>{onChange(x.value);save()};d.append(x);root.append(d);return x}
function grid(root,cls="two"){const d=E("div",cls);root.append(d);return d}
function sectionHead(root,title,onAdd){const r=E("div","section-head");r.append(E("h3","",title));r.append(btn("＋ Agregar",onAdd));root.append(r)}
function link(root,text,url){const a=E("a","",text);a.href=url;a.target="_blank";a.rel="noopener noreferrer";root.append(a);return a}
function localTimestamp(value){
 const m=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/.exec(String(value||""));
 if(!m)return null;
 const iso=m[1]+"T"+m[2]+":"+(m[3]||"00"), ms=Date.parse(iso+"Z");
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,19)===iso?ms:null;
}
function accidentTime(obj=s){return localTimestamp(obj.general.date+"T"+obj.general.time);}
function legalResult(act,obj=s){
 const record=obj.legal[act.key]||{}, start=accidentTime(obj), end=start===null?null:start+act.hours*3600000;
 const at=localTimestamp(record.at), proof=Boolean(String(record.proof||"").trim());
 const applicability=act.union?(obj.legal.union.applies||"por_confirmar"):"si";
 let timing;
 if(applicability==="no")timing="No aplica según lo registrado";
 else if(!record.at)timing="Sin fecha de realización";
 else if(at===null)timing="Fecha de realización inválida";
 else if(start===null)timing="Sin fecha y hora válidas del accidente";
 else if(at<start)timing="Fecha anterior al accidente";
 else timing=at<=end?"En plazo":"Fuera de plazo";
 const proofLabel=applicability==="no"?"No aplica":proof?"Constancia registrada":"Sin constancia";
 return {record,end,timing,proof,proofLabel,applicability};
}
function legalDeadline(end){
 if(end===null)return "Registra fecha y hora válidas del accidente";
 const [day,time]=new Date(end).toISOString().split("T");
 return day.split("-").reverse().join("/")+" · "+time.slice(0,5)+" h (Venezuela)";
}
const stageGuides=[
 null,
 ["Identifica el acontecimiento y las personas involucradas.","«A las 09:00 se registró una lesión de mano en la línea 2».","Registra fecha, hora, lugar y una descripción observable.",1],
 ["Documenta la notificación y la declaración por destinatario.","Una notificación puede tener constancia y estar fuera del plazo.","Revisa la fecha, hora y constancia de cada actuación aplicable.",3],
 ["Recopila fuentes y ordena los sucesos.","E03 es el video. Su hora de grabación permite ubicar el contacto.","Indica qué respalda cada fuente y deja claras las horas estimadas.",4],
 ["Redacta un hecho observable por registro y vincula su evidencia.","«A las 08:58 el resguardo estaba abierto», según E03.","Antes de marcar un hecho como verificado, comprueba el alcance de la fuente.",6],
 ["Marca el acontecimiento final y reconstruye sus antecedentes.","El movimiento del rodillo y la mano en la zona pueden formar una conjunción.","Comprueba qué tuvo que ocurrir y revisa los vínculos punteados.",9],
 ["Explica el papel de los hechos y el estado de las barreras.","Un permiso incompleto documenta una omisión de registro. El aislamiento requiere su propia evidencia.","Distingue hallazgos sustentados, hipótesis y diligencias pendientes.",5],
 ["Define medidas vinculadas a los hallazgos y cómo evaluar su eficacia.","Registrar la instalación de un resguardo y documentar su prueba funcional son verificaciones distintas.","Revisa responsable, plazo y criterio de eficacia para cada medida.",14],
 ["Revisa el informe antes de exportarlo.","Una rama abierta debe indicar qué dato falta y qué diligencia lo aclararía.","Comprueba que las conclusiones, los límites y el seguimiento estén identificados.",16]
];
function updateReviewStatus(){
 const target=$("caseReviewStatus");
 if(!target)return;
 if(!isWorkInProgress()){target.textContent="Expediente sin iniciar";return}
 const n=warnings().length;
 target.textContent=n?"Revisión: "+n+(n===1?" aviso pendiente":" avisos pendientes"):"Revisión automática: sin avisos. Requiere validación técnica.";
}
function headerNav(){
 const nav=$("steps");nav.innerHTML="";
 STEPS.forEach((name,i)=>{
  const b=btn(i===0?name:i+". "+name,()=>goto(i),"step"+(i===step?" current":""));
  if(i===step)b.setAttribute("aria-current","step");
  nav.append(b);
 });
 $("progressBar").style.width=Math.round(step/(STEPS.length-1)*100)+"%";
 $("stepLabel").textContent="Pantalla "+(step+1)+" de "+STEPS.length+" · "+STEPS[step];
 updateReviewStatus();
}
function goto(i,destination){
 if(cy){save();cy.destroy();cy=null}
 step=Math.min(STEPS.length-1,Math.max(0,i));
 if(step>0&&!s.isDemo){s.resumeStep=step;save()}
 render();
 const target=(destination?.id&&$(destination.id))||$("stage").querySelector?.("h2");
 if(target){target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:"start"});}
 if(destination?.element&&cy){
  const element=cy.$id(destination.element);
  if(element.length){element.select();cy.center(element);}
 }
}
function render(){
 headerNav();updateDemoControls();const root=$("stage");root.innerHTML="";
 const renders=[intro,identification,legal,evidences,facts,diagram,analysis,actions,report];renders[step](root);
 if(step>0){
  const [task,example,check,faq]=stageGuides[step], guide=E("aside","note stage-guide");
  guide.setAttribute("aria-label","Orientación para esta etapa");
  for(const [label,text] of [["Tu tarea",task],["Ejemplo",example],["Antes de avanzar",check]]){
   const p=E("p");p.append(E("strong","",label+". "),document.createTextNode(text));guide.append(p);
  }
  link(guide,"Consultar pregunta relacionada del FAQ","faq.html#p"+faq);
  root.insertBefore(guide,root.children[2]||null);
 }
 if(s.demoMode&&step>0)demoTip(root,step);
 $("back").disabled=step===0;$("next").disabled=step===STEPS.length-1;
 $("next").hidden=step===0;$("next").textContent=step===STEPS.length-2?"Ver informe →":"Siguiente →";
}
function intro(root){
 pTitle(root,"¿Cómo quieres trabajar en MAC?","Elige entre continuar tu expediente real y aprender con un caso ficticio.");
 const choices=grid(root);
 const work=group(choices,"Expediente real");
 work.append(E("p","",s.isDemo?"Abre el espacio de trabajo real. MAC lo conserva separado de la demostración.":isWorkInProgress()?"Retoma el expediente guardado en este navegador.":"Empieza por la identificación del acontecimiento."));
 const row=E("div","row");work.append(row);
 row.append(btn(s.isDemo?"Abrir expediente real":isWorkInProgress()?"Continuar mi expediente":"Iniciar investigación",()=>s.isDemo?discardDemo():goto(Number.isInteger(s.resumeStep)?s.resumeStep:1),"btn"));
 if(!s.isDemo&&isWorkInProgress())row.append(btn("Iniciar otra investigación",()=>startNewInvestigation()));
 const training=group(choices,"Práctica con un caso ficticio");
 training.append(E("p","","Recorre el caso de la banda con indicaciones por etapa o consulta directamente el informe de ejemplo."));
 const demoRow=E("div","row");training.append(demoRow);
 demoRow.append(btn("Recorrer demo guiada",()=>loadFullDemo(true)),btn("Ver informe de demostración",()=>s.isDemo?goto(8):loadFullDemo(false)),btn("Descargar ejemplo en Excel",()=>downloadWorkbook(demo(),"DEMO_AT_2026")));
 note(root,"Ruta de trabajo: identificación → actuación legal → evidencias y cronología → hechos → árbol → análisis → medidas → informe.");
const priv=group(root,"Tratamiento de datos y límites");priv.append(E("p","", "La información se guarda automáticamente solo en el almacenamiento local de este navegador. No hay cuenta, respaldo remoto ni recuperación entre dispositivos. Para conservarla, exporta un Excel y guárdalo en un lugar seguro. Evita usar datos personales o médicos sensibles en dispositivos compartidos. No se envían expedientes a servicios de IA."));priv.append(E("p","muted","La aplicación ayuda a documentar una investigación; no determina oficialmente el origen ocupacional ni certifica cumplimiento legal."));
const rr=group(root,"Referencias de trabajo");Object.keys(refs).forEach(k=>{const x=E("p");x.append(E("strong","",refs[k]+" · "));link(x,"Consultar fuente",URLs[k]);rr.append(x)})}

function demoTip(root,stage){
const t=[
"",
"Módulo 1. Comprueba que los datos iniciales describan el evento sin atribuir culpas. Identidades y entidad son ficticias.",
"Módulo 1. Compara las notificaciones iniciales y las declaraciones formales simuladas por destinatario. Ninguna constancia tiene validez legal.",
"Módulo 2. Lee E01–E11. Fíjate en que E07–E08 son testimonios pendientes y E09 (foto posterior) no prueba el estado previo.",
"Módulo 2. Compara hechos verificados con H11 y H12, que permanecen pendientes. No deben utilizarse como hechos definitivos.",
"Módulo 3. Revisa las conjunciones: banda energizada + resguardo abierto → posibilidad de contacto. El diagrama contiene hallazgos adicionales aún sin conexión causal verificada.",
"Módulo 3. Observa que H08 se presenta como POSIBLE causa raíz, no como conclusión comprobada. E11 obliga a profundizar en la gestión del aislamiento.",
"Módulo 4. Examina las cuatro medidas, sus responsables y cómo verificar la eficacia; una acción ejecutada no es necesariamente eficaz.",
"Módulo 4. El informe reúne el expediente y advierte sobre información pendiente. También puedes descargarlo en PDF y exportar toda la investigación a Excel."
];
const n=E("aside","note");const r=E("div","row between");r.append(E("strong","", "🎓 DEMOSTRACIÓN GUIADA · ETAPA "+stage));r.append(btn("Salir de guía",()=>{s.demoMode=false;save();render()},"btn secondary"));n.append(r);const p=E("p","",t[stage]||"");n.append(p);
root.insertBefore(n,root.firstChild.nextSibling);
}

function identification(root){pTitle(root,"1. Identificación del acontecimiento","Primero registra qué ocurrió. No incluyas causas supuestas en la descripción inicial. Fundamento: LOPCYMAT art. 69 y art. 40.14.");
const g=group(root,"Identificación de la entidad y del evento");g.id="review-general";const r=grid(g);
[["Código interno","code"],["Empresa / entidad","company"],["Lugar / área","place"],["Fecha del accidente","date","date"],["Hora del accidente (Venezuela)","time","time"]].forEach(a=>field(r,a[0],s.general[a[1]],v=>s.general[a[1]]=v,a[2]||"text"));
field(g,"Descripción inicial: ¿qué ocurrió, dónde y con quién?",s.general.description,v=>s.general.description=v,"textarea");
const g2=group(root,"Personas y equipo investigador");const r2=grid(g2);
[["Persona accidentada (identificación mínima)","worker"],["Puesto / actividad","job"],["Consecuencia conocida","consequence"],["Investigador responsable","investigator"],["Cargo o función","role"],["Delegados de prevención participantes","delegates"],["Integrantes del equipo de investigación","team"]].forEach(a=>field(r2,a[0],s.general[a[1]],v=>s.general[a[1]]=v));
field(g2,"Atención inmediata y control de otros peligros",s.general.emergency,v=>s.general.emergency=v,"textarea");
note(root,"Primero se brinda atención, se controla la exposición a nuevos peligros y se preserva la información posible. La calificación oficial del origen corresponde al INPSASEL (LOPCYMAT art. 76).");}
function legal(root){
 pTitle(root,"2. Actuación legal y constancias","Registra por separado la notificación inicial y la declaración formal de cada destinatario. Las horas se interpretan como hora de Venezuela.");
 note(root,"Atiende a las personas y controla los peligros de inmediato. Gestiona las comunicaciones sin esperar el informe técnico.");
 const indicators=[];
 const applicability=group(root,"Aplicabilidad sindical");applicability.id="review-union";
 field(applicability,"¿Existe sindicato en la entidad?",s.legal.union.applies||"por_confirmar",v=>{s.legal.union.applies=v;indicators.forEach(update=>update())},"select",[["por_confirmar","Por verificar"],["si","Sí"],["no","No (dejar constancia)"]]);
 for(const [article,title] of [[83,"Notificación inicial"],[84,"Declaración formal"]]){
  const g=group(root,title);
  for(const act of legalActs.filter(a=>a.article===article)){
   const c=E("div","item");c.id="review-legal-"+act.key;g.append(c);c.append(E("h4","",act.name+" · "+act.span));
   c.append(E("p","muted","Reglamento Parcial, art. "+article+(article===84?" · LOPCYMAT, art. 73":"")));
   c.append(E("p","muted","Fecha/hora límite de referencia: "+legalDeadline(legalResult(act).end)));
   const status=E("p","status");status.setAttribute("role","status");c.append(status);
   const update=()=>{const r=legalResult(act);status.textContent=r.timing+" · "+r.proofLabel+(r.applicability==="por_confirmar"?" · Aplicabilidad sindical por verificar":"");};
   indicators.push(update);update();
   const entry=s.legal[act.key]||(s.legal[act.key]={at:"",proof:""}), row=grid(c);
   field(row,"Fecha y hora de realización",entry.at,v=>{entry.at=v;update()},"datetime-local");
   field(row,"N.º de comprobante / medio / evidencia",entry.proof,v=>{entry.proof=v;update()});
  }
 }
 const g=group(root,"Observaciones y constancias adicionales");
 field(g,"Observaciones, dificultades o justificación de aplicabilidad",s.legal.notes,v=>s.legal.notes=v,"textarea");
 note(g,"El estado de plazo compara las horas registradas. La constancia se muestra por separado. MAC documenta lo ingresado y la gestión de las comunicaciones se realiza por los canales oficiales.","warn");
 const r=E("div","row");link(r,"LOPCYMAT arts. 73–76",URLs.ley);link(r,"Reglamento Parcial arts. 83–85",URLs.reg);g.append(r);
}
function listEdit(root,arr,heading,columns,blank){sectionHead(root,heading,()=>{arr.push(Object.assign({id:ident()},blank));save();render()});if(!arr.length){note(root,"Todavía no hay registros. Agrega uno y consigna la fuente y el momento en que se obtuvo.");return}arr.forEach((item,i)=>{const card=E("div","item");const hd=E("div","row between");hd.append(E("strong","",heading+" · "+(i+1)));hd.append(btn("Eliminar",()=>{if(confirm("¿Eliminar este registro?")){removeRecord(arr,i);save();render()}},"btn danger"));card.append(hd);const gg=grid(card);columns.forEach(c=>field(gg,c[0],item[c[1]],v=>item[c[1]]=v,c[2]||"text",c[3]));root.append(card)})}
function removeRecord(arr,index){
 const removed=arr[index];arr.splice(index,1);
 if(arr===s.evidence)for(const f of s.facts.filter(f=>f.evidenceId===removed.id)){f.evidenceId="";f.status="pendiente";if(s.analyses[f.id])s.analyses[f.id].certainty="pendiente"}
}
function evidences(root){pTitle(root,"3. Evidencias y reconstrucción cronológica","NT-04:2023, artículo 19, numeral 1.1.1: recopilar información objetiva, indagar individualmente testigos y analizar aspectos técnicos y organizacionales.");
note(root,"Una declaración es una fuente, no automáticamente un hecho demostrado. Documenta quién informó, cuándo y cómo se contrastó. No uses juicios de valor.");
const g=group(root,"Registro de evidencias (instrumento F06)");g.id="review-evidence";listEdit(g,s.evidence,"Evidencia",[["Tipo","type","select",[["documento","Documento"],["testimonio","Testimonio"],["fisica","Observación física"],["fotografia","Fotografía/croquis"],["digital","Registro digital"],["otra","Otra"]]],["Fuente / identificación","source"],["Fecha de obtención","date","date"],["Descripción objetiva","description","textarea"],["Estado de verificación","status","select",[["pendiente","Pendiente de contrastar"],["verificada","Verificada"],["contradictoria","Contradictoria"]]]],{type:"documento",source:"",date:"",description:"",status:"pendiente"});
const c=group(root,"Cronología (instrumento F07)");c.id="review-timeline";listEdit(c,s.timeline,"Acontecimiento",[["Fecha / hora aproximada","when"],["Descripción comprobable","text","textarea"],["Fuente de respaldo / observaciones","source"]],{when:"",text:"",source:""});
note(root,"Para construir el árbol, redacta hechos breves verificables y consigna la evidencia que los respalda. Las hipótesis permanecen fuera del árbol mientras no estén comprobadas.");}
function facts(root){pTitle(root,"4. Hechos comprobados","OIT (2019), método del árbol de causas: cada hecho es objetivo, preciso y verificable. La fuente permite rastrear por qué fue incorporado.");
sectionHead(root,"Listado de hechos (instrumento F08)",()=>{s.facts.push({id:ident(),text:"",evidenceId:"",status:"pendiente"});save();render()});
if(!s.facts.length)note(root,"Agrega los hechos uno a uno. Por ejemplo: «La banda transportadora estaba en movimiento al momento del contacto»; evita «El trabajador fue imprudente».");
s.facts.forEach((f,i)=>{const c=E("div","item");c.id="review-fact-"+f.id;const hd=E("div","row between");hd.append(E("strong","", f.id));hd.append(btn("Eliminar",()=>{if(confirm("¿Eliminar el hecho y su nodo en el árbol?")){s.facts.splice(i,1);if(s.diagram.final===f.id)s.diagram.final="";s.diagram.cytoscape=s.diagram.cytoscape.filter(x=>!(x.group==="nodes"&&x.data.id===f.id)&&!(x.group==="edges"&&(x.data.source===f.id||x.data.target===f.id)));delete s.analyses[f.id];s.actions=s.actions.filter(a=>a.factId!==f.id);save();render()}},"btn danger"));c.append(hd);field(c,"Enunciado objetivo del hecho",f.text,v=>{f.text=v;const n=s.diagram.cytoscape.find(x=>x.group==="nodes"&&x.data.id===f.id);if(n)n.data.label=v},"textarea");const row=grid(c);field(row,"Evidencia de respaldo",f.evidenceId,v=>f.evidenceId=v,"select",[["","Sin fuente asociada"]].concat(s.evidence.map((ev,j)=>[ev.id,ev.id+" · "+(ev.source||ev.type)])));field(row,"Estado del hecho",f.status,v=>f.status=v,"select",[["pendiente","Por verificar"],["verificado","Verificado"],["descartado","Descartado"]]);root.append(c)});
note(root,"Solo los hechos verificados deben incorporarse como hechos causales definitivos. La aplicación permite diagramas de trabajo preliminares, pero advertirá sobre elementos incompletos.","warn");}
function factSupported(f){
 return Boolean(f?.status==="verificado"&&String(f.text||"").trim()&&s.evidence.some(e=>e.id===f.evidenceId&&e.status==="verificada"));
}
function graphIntegrity(entries=graphData()){
 const supported=new Set(s.facts.filter(factSupported).map(f=>f.id));
 const nodeIds=new Set(entries.filter(e=>e.group==="nodes").map(e=>e.data.id));
 const edges=entries.filter(e=>e.group==="edges");
 const endpoints=e=>nodeIds.has(e.data.source)&&nodeIds.has(e.data.target)&&supported.has(e.data.source)&&supported.has(e.data.target);
 const conjunctions=new Map();
 for(const e of edges.filter(e=>e.data.relacion==="conjuncion")){
  if(!conjunctions.has(e.data.target))conjunctions.set(e.data.target,[]);
  conjunctions.get(e.data.target).push(e);
 }
 const incomplete=new Set([...conjunctions].filter(([,group])=>new Set(group.map(e=>e.data.source)).size<2||group.some(e=>!endpoints(e))).map(([id])=>id));
 const usable=edges.filter(e=>endpoints(e)&&!(e.data.relacion==="conjuncion"&&incomplete.has(e.data.target)));
 return {supported,nodeIds,incomplete,usable};
}
function graphData(){return Array.isArray(s.diagram.cytoscape)?s.diagram.cytoscape:[]}
function diagram(root){pTitle(root,"5. Árbol de causas","Construye relaciones entre hechos comprobados. Selecciona primero la causa (antecedente) y después el efecto (consecuente). Método técnico OIT, no formulario oficial.");
note(root,"Los nodos iniciales del árbol NO son automáticamente causas raíz. Su interpretación se realiza en la etapa siguiente con evidencias y justificación. No confundas una secuencia temporal con una relación causal.");
const relationOptions=[["cadena","Cadena causal"],["conjuncion","Conjunción: antecedente necesario junto con otros"]];
const panel=group(root,"Crear y revisar vínculos");
panel.append(E("p","muted","Incorpora los hechos comprobados con los botones «Hechos para incorporar». Luego elige qué hecho hizo posible el otro. Usa el mismo tipo de relación si prefieres conectar los nodos en el lienzo."));
const fields=grid(panel,"three");
const antecedent=field(fields,"Antecedente (causa)","",()=>{},"select",[]);
const consequence=field(fields,"Consecuente (efecto)","",()=>{},"select",[]);
let nextRelation="cadena";
field(fields,"Relación al conectar",nextRelation,v=>nextRelation=v,"select",relationOptions);
const controls=E("div","row graph-link-controls");
const add=btn("Agregar vínculo",()=>addLink(antecedent.value,consequence.value),"btn");
const info=E("span","muted");info.setAttribute("role","status");
controls.append(add,info);panel.append(controls);
panel.append(E("h3","","Vínculos del árbol"));
const links=E("ul","graph-links");links.tabIndex=-1;const emptyLinks=E("p","muted","Todavía no hay vínculos.");panel.append(emptyLinks,links);
const tools=E("div","row");tools.append(btn("Organizar árbol",()=>{if(cy){cy.layout({name:window.cytoscapeDagre?"dagre":"breadthfirst",rankDir:"LR",animate:false}).run();save()}}));tools.append(btn("Marcar hecho final",()=>{if(!cy)return;const n=cy.nodes(":selected").first();if(!n.length){alert("Selecciona el nodo del acontecimiento final.");return}s.diagram.final=n.id();save();refreshGraph()}));tools.append(btn("Eliminar selección",()=>{if(!cy)return;const v=cy.$(":selected");if(v.length&&confirm("¿Eliminar estos elementos del diagrama?")){if(v.some(el=>el.id()===s.diagram.final))s.diagram.final="";cy.remove(v);save();refreshGraph()}},"btn danger"));root.append(tools);
const wrap=E("div","grid-diagram");const left=E("div","facts-panel");left.append(E("h3","", "Hechos para incorporar"));const factButtons=new Map();
s.facts.filter(factSupported).forEach(f=>{const b=btn("＋ "+f.text,()=>{if(cy&&cy.$id(f.id).empty()){cy.add({group:"nodes",data:{id:f.id,label:f.text}});cy.layout({name:window.cytoscapeDagre?"dagre":"grid",rankDir:"LR",animate:false}).run();save();refreshGraph()}},"factbtn");factButtons.set(f.id,b);left.append(b)});if(!s.facts.some(factSupported))left.append(E("p","muted","Primero verifica hechos con una evidencia verificada."));wrap.append(left);const pane=E("div","canvas-wrap"), canvas=E("div","canvas");canvas.id="graph";canvas.setAttribute("aria-label","Lienzo del Árbol de Causas");pane.append(canvas);wrap.append(pane);root.append(wrap);
const t=E("p","muted","Los nodos en rojo y los vínculos punteados están por revisar. Sugerencia: marca el acontecimiento final, trabaja retrospectivamente e incorpora antecedentes necesarios. Para representar una conjunción, conecta todos los antecedentes relevantes con el mismo consecuente y explícalo en el análisis.");root.append(t);
if(typeof window.cytoscape!=="function"){add.disabled=true;note(root,"No se pudo cargar la biblioteca del diagrama. Comprueba la conexión a internet.", "error");return}
const nodes=graphData().filter(x=>x.group==="nodes");
cy=cytoscape({container:canvas,elements:graphData(),style:graphStyle(),layout:{name:"preset"},wheelSensitivity:.16,minZoom:.2,maxZoom:2});
if(nodes.length&&!nodes.some(x=>x.position&&Number.isFinite(x.position.x))){cy.layout({name:"grid"}).run()}
let selected=null;
cy.on("tap","node",ev=>{
 const n=ev.target;
 if(selected&&!selected.removed()&&selected.id()!==n.id()){
  const from=selected.id();
  selected.removeClass("selected-cause");selected=null;
  addLink(from,n.id());
 }else{
  selected=n;n.addClass("selected-cause");n.select();
  info.textContent="Causa seleccionada. Ahora toca el efecto correspondiente.";
 }
});
cy.on("tap",ev=>{if(ev.target===cy&&selected){selected.removeClass("selected-cause");selected=null;info.textContent="Selección cancelada."}});
cy.on("dragfree remove data",()=>save());
refreshGraph();
function addLink(from,to){
 if(!from||!to){info.textContent="Selecciona el antecedente y el consecuente.";return}
 if(from===to){info.textContent="El antecedente y el consecuente deben ser hechos distintos.";return}
 const {supported}=graphIntegrity(cy.elements().jsons());
 if(!supported.has(from)||!supported.has(to)||cy.$id(from).empty()||cy.$id(to).empty()){
  info.textContent="Selecciona dos hechos comprobados que estén incorporados en el árbol.";return;
 }
 if(cy.edges().some(e=>e.data("source")===from&&e.data("target")===to)){
  info.textContent="Ese vínculo ya existe.";return;
 }
 if(hasPath(to,from)){info.textContent="Ese vínculo cerraría un ciclo causal.";return}
 cy.add({group:"edges",data:{id:ident(),source:from,target:to,relacion:nextRelation,relacionTexto:nextRelation==="conjuncion"?"conjunción":""}});
 save();refreshGraph();
 info.textContent="Vínculo guardado.";
}
function refreshLinks(integrity,validIds){
 const available=cy.nodes().filter(n=>integrity.supported.has(n.id()));
 for(const [select,placeholder] of [[antecedent,"Elige la causa"],[consequence,"Elige el efecto"]]){
  const previous=select.value;
  select.replaceChildren(new Option(placeholder,""));
  available.forEach(n=>select.add(new Option(n.data("label"),n.id())));
  select.value=available.some(n=>n.id()===previous)?previous:"";
  select.disabled=available.length<2;
 }
 add.disabled=available.length<2;
 for(const [id,button] of factButtons)button.disabled=cy.$id(id).nonempty();
 const edges=cy.edges();
 emptyLinks.hidden=edges.length>0;
 links.replaceChildren();
 edges.forEach(edge=>{
  const path=edge.source().data("label")+" → "+edge.target().data("label");
  const conjunction=edge.data("relacion")==="conjuncion";
  const status=validIds.has(edge.id())?"En el árbol":conjunction&&integrity.incomplete.has(edge.data("target"))?"Conjunción por revisar":"Vínculo por revisar";
  const item=E("li","item");
  const remove=btn("Quitar vínculo",()=>{
   if(!confirm("¿Quitar este vínculo del árbol?"))return;
   const next=item.nextElementSibling||item.previousElementSibling;
   cy.remove(edge);save();refreshGraph();
   info.textContent="Vínculo eliminado.";
   const nextButton=next&&Array.from(links.children).find(row=>row.dataset.edgeId===next.dataset.edgeId)?.querySelector("button");
   (nextButton|| (add.disabled?links: add)).focus();
  },"btn danger");
  remove.setAttribute("aria-label","Quitar vínculo: "+path);
  item.dataset.edgeId=edge.id();
  item.append(E("div","item-title",path),E("p","muted",(conjunction?"Conjunción":"Cadena causal")+" · "+status),remove);
  links.append(item);
 });
}
function hasPath(from,to){const seen=new Set(),q=[from];while(q.length){const x=q.shift();if(x===to)return true;if(seen.has(x))continue;seen.add(x);cy.edges().filter(e=>e.data("source")===x).forEach(e=>q.push(e.data("target")))}return false}
function refreshGraph(){
 if(!cy)return;
 const integrity=graphIntegrity(cy.elements().jsons());
 const validIds=new Set(integrity.usable.map(e=>e.data.id));
 cy.nodes().forEach(n=>{
  const valid=integrity.supported.has(n.id());
  n.style({"label":valid?n.data("label"):"Por revisar · "+n.data("label"),"border-color":valid?(n.id()===s.diagram.final?"#ffb600":"#007b85"):"#b42318","background-color":valid?"#e4f2f3":"#fff0ed"});
 });
 cy.edges().forEach(edge=>{
  const valid=validIds.has(edge.id()), color=valid?"#007b85":"#b42318";
  const pending=edge.data("relacion")==="conjuncion"&&integrity.incomplete.has(edge.data("target"))?"Conjunción por revisar":"Vínculo por revisar";
  edge.style({"label":valid?(edge.data("relacionTexto")||""):pending,"line-style":valid?"solid":"dashed","line-color":color,"target-arrow-color":color});
 });
 refreshLinks(integrity,validIds);
 cy.fit(undefined,55);
}
}
function graphStyle(){return [{selector:"node",style:{"label":"data(label)","background-color":"#e4f2f3","border-color":"#007b85","border-width":2,"shape":"round-rectangle","width":"label","height":"label","padding":"13px","font-size":"13px","text-wrap":"wrap","text-max-width":"190px","color":"#00205b","text-valign":"center","text-halign":"center"}},{selector:"edge",style:{"width":2,"line-color":"#007b85","target-arrow-color":"#007b85","target-arrow-shape":"triangle","curve-style":"bezier","arrow-scale":1.15,"label":"data(relacionTexto)","font-size":"10px","text-rotation":"autorotate","text-background-color":"#ffffff","text-background-opacity":1}},{selector:".selected-cause",style:{"border-width":4,"border-color":"#ffb600"}}]}
function analysis(root){pTitle(root,"6. Análisis causal y barreras","NT-04:2023, artículo 19, numeral 1.1.2: determinar causas inmediatas y básicas. El análisis de causas raíz es una profundización técnica complementaria.");
note(root,"Una causa raíz no se obtiene contando flechas ni eligiendo el primer nodo. Debes explicar y sustentar por qué una deficiencia permitió el accidente. Puede haber varias causas raíz y factores aún no determinados.");
const nodes=graphData().filter(n=>n.group==="nodes").map(n=>n.data.id);if(!nodes.length){note(root,"Primero incorpora los hechos comprobados y construye el árbol.");return}
s.facts.filter(f=>nodes.includes(f.id)).forEach((f,i)=>{const a=s.analyses[f.id]||(s.analyses[f.id]={classification:"sin_clasificar",why:"",barrier:"",certainty:"pendiente"});const g=group(root,"Hecho · "+f.text);const r=grid(g);field(r,"Clasificación técnica",a.classification,v=>a.classification=v,"select",[["sin_clasificar","Sin clasificar"],["inmediata","Causa inmediata"],["basica","Causa básica"],["raiz","Posible causa raíz"],["contribuyente","Factor contribuyente"],["no_causal","No causal / contexto"]]);field(r,"Estado de sustento",a.certainty,v=>a.certainty=v,"select",[["pendiente","Pendiente de comprobar"],["sustentado","Sustentado en evidencias"],["hipotesis","Hipótesis de trabajo"]]);field(g,"Justificación: ¿por qué está relacionado causalmente y con qué evidencia?",a.why,v=>a.why=v,"textarea");field(g,"Barreras o controles ausentes, fallidos o insuficientes",a.barrier,v=>a.barrier=v,"textarea")});
const g=group(root,"Conclusiones y límites");field(g,"Conclusiones causales fundamentadas",s.conclusion,v=>s.conclusion=v,"textarea");field(g,"Información faltante, incertidumbre y limitaciones",s.limits,v=>s.limits=v,"textarea");note(g,"Distingue los hallazgos verificados de las posibles causas raíz no confirmadas. No atribuyas responsabilidades personales sin la evidencia y el procedimiento correspondiente.");}
function actions(root){pTitle(root,"7. Medidas preventivas y verificación","NT-04:2023, artículo 19, numeral 1.1.3: identificar puntos críticos y definir modificaciones de las condiciones de trabajo.");
note(root,"Las medidas se vinculan a hallazgos, no únicamente a las supuestas «causas raíz». Define responsable, plazo y prueba de eficacia. La capacitación por sí sola rara vez resuelve una deficiencia técnica.");
sectionHead(root,"Plan de medidas (F10 y F12)",()=>{s.actions.push({id:ident(),factId:"",type:"correctiva",description:"",owner:"",due:"",verification:"",status:"pendiente",result:""});save();render()});
const factOptions=[["","Selecciona un hecho causal"]].concat(s.facts.filter(f=>s.analyses[f.id]&&s.analyses[f.id].classification!=="no_causal").map(f=>[f.id,f.text.slice(0,100)]));
s.actions.forEach((a,i)=>{const g=group(root,"Acción "+(i+1));g.id="review-action-"+a.id;const hd=E("div","row");hd.append(btn("Eliminar acción",()=>{if(confirm("¿Eliminar esta medida?")){s.actions.splice(i,1);save();render()}},"btn danger"));g.append(hd);const r=grid(g);field(r,"Hallazgo que controla",a.factId,v=>a.factId=v,"select",factOptions);field(r,"Tipo de medida",a.type,v=>a.type=v,"select",[["inmediata","Control inmediato"],["correctiva","Correctiva"],["preventiva","Preventiva"]]);field(g,"Acción técnica específica (qué se modificará)",a.description,v=>a.description=v,"textarea");const t=grid(g);field(t,"Responsable",a.owner,v=>a.owner=v);field(t,"Plazo comprometido",a.due,v=>a.due=v,"date");field(g,"Cómo se verificará su eficacia (prueba/indicador/criterio)",a.verification,v=>a.verification=v,"textarea");const u=grid(g);field(u,"Estado",a.status,v=>a.status=v,"select",[["pendiente","Pendiente"],["en_curso","En ejecución"],["ejecutada","Ejecutada (sin verificación)"],["eficaz","Eficacia comprobada"],["ineficaz","Medida ineficaz"]]);field(u,"Resultado de la verificación",a.result,v=>a.result=v,"textarea")});
note(root,"Distingue «ejecutada» de «eficacia comprobada». Un control instalado no demuestra, por sí solo, que previene una recurrencia.");}
function reviewIssues(){
 const items=[];
 const add=(text,stage,id,element)=>items.push({text,stage,id,element});
 if(!s.general.date||!s.general.time||!s.general.description)add("Faltan fecha, hora o descripción inicial.",1,"review-general");
 for(const act of legalActs){
  const r=legalResult(act), id="review-legal-"+act.key;
  if(r.applicability==="no")continue;
  if(r.timing!=="En plazo")add(act.name+": "+r.timing+".",2,id);
  if(!r.proof)add(act.name+": sin constancia.",2,id);
 }
 if((s.legal.union.applies||"por_confirmar")==="por_confirmar")add("Aplicabilidad sindical por verificar.",2,"review-union");
 if(!s.evidence.length)add("No hay evidencias registradas.",3,"review-evidence");
 if(!s.timeline.length)add("No hay cronología.",3,"review-timeline");
 if(!s.facts.some(factSupported))add("No hay hechos verificados con evidencia de respaldo.",4);
 const facts=new Map(s.facts.map(f=>[f.id,f])),entries=graphData(),integrity=graphIntegrity(entries),ids=integrity.nodeIds;
 const edges=entries.filter(e=>e.group==="edges");
 for(const f of s.facts){
  if(f.status==="verificado"&&!factSupported(f))add("Hecho sin evidencia verificada: "+f.text.slice(0,75),4,"review-fact-"+f.id);
  if(f.evidenceId&&!s.evidence.some(e=>e.id===f.evidenceId))add("Referencia de evidencia inexistente: "+f.id,4,"review-fact-"+f.id);
 }
 if(!edges.length)add("El árbol no tiene relaciones causales.",5,"graph");
 if(!s.diagram.final)add("No se marcó un acontecimiento final.",5,"graph");
 else if(!ids.has(s.diagram.final))add("El acontecimiento final no existe en el árbol. Selecciónalo nuevamente.",5,"graph");
 for(const id of ids)if(!factSupported(facts.get(id)))add("Nodo sin hecho verificado con evidencia: "+id,5,"graph",id);
 for(const e of edges)if(!ids.has(e.data.source)||!ids.has(e.data.target))add("Relación con nodo inexistente: "+e.data.id,5,"graph",e.data.id);
 for(const id of integrity.incomplete)add("Conjunción incompleta o sin sustento suficiente: "+id,5,"graph",id);
 if(edges.length&&!integrity.usable.length)add("No hay vínculos con sustento suficiente para exportar.",5,"graph");
 if(!Object.values(s.analyses).some(x=>x.classification==="inmediata"))add("No se ha clasificado ninguna causa inmediata.",6);
 if(!Object.values(s.analyses).some(x=>x.classification==="basica"))add("No se ha clasificado ninguna causa básica.",6);
 if(!s.actions.length)add("No se han definido medidas.",7);
 for(const a of s.actions){
  const id="review-action-"+a.id;
  if(!a.factId||!facts.has(a.factId)||!a.description||!a.owner||!a.due||!a.verification)add("Medida incompleta: "+a.id,7,id);
  if(a.status==="eficaz"&&!a.result)add("Medida declarada eficaz sin resultado documentado: "+a.id,7,id);
 }
 return items;
}
function warnings(){return reviewIssues().map(issue=>issue.text)}
function captureDiagram(){
 const entries=graphData(),integrity=graphIntegrity(entries);
 const allNodes=entries.filter(e=>e.group==="nodes"&&integrity.supported.has(e.data.id));
 if(!integrity.supported.has(s.diagram.final)||!integrity.nodeIds.has(s.diagram.final))return "";
 try{
  const edges=integrity.usable;
  const finalId=s.diagram.final;
  const included=new Set([finalId]), queue=[finalId];
  while(queue.length){const target=queue.shift();for(const e of edges.filter(x=>x.data.target===target)){if(!included.has(e.data.source)){included.add(e.data.source);queue.push(e.data.source)}}}
  // Only verified ancestors of the explicitly selected final event belong to the report tree.
  const selected=allNodes.filter(n=>included.has(n.data.id));
  const links=edges.filter(e=>included.has(e.data.source)&&included.has(e.data.target));
  if(!links.length)return "";
  const depth=new Map([[finalId,0]]);
  for(let i=0;i<selected.length;i++){let changed=false;for(const e of links){const t=depth.get(e.data.target);if(t!==undefined&&(!depth.has(e.data.source)||depth.get(e.data.source)<t+1)){depth.set(e.data.source,t+1);changed=true}}if(!changed)break}
  for(const n of selected)if(!depth.has(n.data.id))depth.set(n.data.id,1);
  const maxDepth=Math.min(8,Math.max(0,...depth.values()));
  const layers=Array.from({length:maxDepth+1},()=>[]);
  selected.forEach(n=>layers[Math.max(0,maxDepth-Math.min(maxDepth,depth.get(n.data.id)||0))].push(n));
  layers.forEach(a=>a.sort((a,b)=>(a.position?.y||0)-(b.position?.y||0)));
  const cardW=288, gapX=126, margin=70, top=154, bottom=108;
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
  if(!ctx)return "";
  const font='18px Arial', lineHeight=25, innerWidth=cardW-34;
  ctx.font=font;
  const wrapText=(v)=>{
   const words=String(v||"Sin descripción").split(/\s+/), lines=[];let current="";
   for(const word of words){const next=current?current+" "+word:word;if(ctx.measureText(next).width>innerWidth&&current){lines.push(current);current=word}else current=next}
   if(current)lines.push(current);return lines;
  };
  const boxes=new Map();
  for(const n of selected){const fact=s.facts.find(f=>f.id===n.data.id);const lines=wrapText(fact?.text||n.data.label);boxes.set(n.data.id,{id:n.data.id,lines,height:Math.max(112,77+lines.length*lineHeight)})}
  const layerRequired=layers.map(layer=>layer.reduce((v,n)=>v+boxes.get(n.data.id).height,0)+Math.max(0,layer.length-1)*34);
  const W=Math.max(900,margin*2+layers.length*cardW+(layers.length-1)*gapX);
  const H=Math.max(685,Math.max(0,...layerRequired)+top+bottom+40);
  canvas.width=W*2;canvas.height=H*2;ctx.scale(2,2);
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#00205b";ctx.fillRect(0,0,W,110);
  ctx.fillStyle="#00aaa8";ctx.fillRect(0,104,W,6);
  ctx.fillStyle="#ffffff";ctx.font="bold 30px Arial";ctx.textAlign="left";ctx.fillText("ÁRBOL DE CAUSAS",margin,51);
  ctx.font="17px Arial";ctx.fillStyle="#d4eff1";ctx.fillText("Hechos comprobados · relaciones causales documentadas · antecedente → consecuencia",margin,83);
  const positions=new Map();
  for(let col=0;col<layers.length;col++){
   const layer=layers[col], needed=layerRequired[col], start=top+Math.max(0,(H-top-bottom-needed)/2), x=margin+col*(cardW+gapX);
   let y=start;
   for(const n of layer){const b=boxes.get(n.data.id);positions.set(n.data.id,{x,y,w:cardW,h:b.height});y+=b.height+34}
  }
  const roundRect=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r)};
  // Dibujar relaciones primero para que nunca crucen el texto de los nodos.
  for(const e of links){
   const a=positions.get(e.data.source),b=positions.get(e.data.target);if(!a||!b)continue;
   const sx=a.x+a.w,sy=a.y+a.h/2, tx=b.x-10,ty=b.y+b.h/2, delta=Math.max(35,(tx-sx)*.52);
   ctx.beginPath();ctx.moveTo(sx,sy);ctx.bezierCurveTo(sx+delta,sy,tx-delta,ty,tx,ty);
   ctx.strokeStyle="#00888f";ctx.lineWidth=3.2;ctx.stroke();
   ctx.beginPath();ctx.moveTo(tx+9,ty);ctx.lineTo(tx-3,ty-8);ctx.lineTo(tx-3,ty+8);ctx.closePath();ctx.fillStyle="#00888f";ctx.fill();
  }
  for(const n of selected){
   const b=boxes.get(n.data.id),p=positions.get(n.data.id),isFinal=n.data.id===finalId;
   ctx.shadowColor="rgba(0,32,91,0.14)";ctx.shadowBlur=15;ctx.shadowOffsetY=5;
   roundRect(p.x,p.y,p.w,p.h,15);ctx.fillStyle=isFinal?"#fff5d7":"#f4fbfb";ctx.fill();ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.shadowOffsetY=0;
   ctx.strokeStyle=isFinal?"#f0ad00":"#007b85";ctx.lineWidth=isFinal?3:2;ctx.stroke();
   ctx.fillStyle=isFinal?"#805800":"#007b85";ctx.font="bold 15px Arial";ctx.textAlign="left";
   ctx.fillText(isFinal?n.data.id+" · HECHO FINAL":n.data.id+" · HECHO VERIFICADO",p.x+17,p.y+28);
   ctx.fillStyle="#00205b";ctx.font=font;
   b.lines.forEach((line,i)=>ctx.fillText(line,p.x+17,p.y+58+i*lineHeight));
  }
  const conjunctions=new Set(links.filter(e=>e.data.relacion==="conjuncion").map(e=>e.data.target));
  if(conjunctions.size){for(const id of conjunctions){const b=positions.get(id);if(!b)continue;ctx.fillStyle="#006b76";ctx.font="bold 14px Arial";ctx.textAlign="right";ctx.fillText("CONJUNCIÓN",b.x-16,b.y-11)}}
  ctx.fillStyle="#e6f1f5";ctx.fillRect(0,H-78,W,78);
  ctx.textAlign="left";ctx.font="16px Arial";ctx.fillStyle="#26435e";
  ctx.fillText("Lectura: de izquierda a derecha · Las flechas representan relaciones, no solo secuencias temporales.",margin,H-47);
  const excluded=allNodes.length-selected.length;
  ctx.font="14px Arial";ctx.fillStyle="#526e80";
  ctx.fillText("MAC · Academia Movida de SST"+(excluded?" · "+excluded+" hecho(s) sin conexión causal comprobada se documentan por separado.":""),margin,H-23);
  return canvas.toDataURL("image/png");
 }catch(e){console.error("No se pudo generar el árbol:",e);return ""}
}
function renderReportHtml(options={}){
 const forPdf=Boolean(options.forPdf), image=captureDiagram(), w=warnings();
 const value=x=>esc(String(x??"").trim()||"No consta");
 const field=(label,text)=>'<div class="report-field"><span class="report-field-label">'+esc(label)+'</span><span class="report-field-value">'+value(text)+'</span></div>';
 const details=(fields)=>'<div class="report-fields">'+fields.map(x=>field(x[0],x[1])).join("")+'</div>';
 const card=(title,body,subtitle="")=>'<div class="report-card"><div class="report-card-heading"><strong>'+esc(title)+'</strong>'+(subtitle?'<span>'+esc(subtitle)+'</span>':"")+'</div>'+body+'</div>';
 const para=(label,text)=>'<p class="report-paragraph"><strong>'+esc(label)+':</strong> '+value(text)+'</p>';
 const section=(n,title,content)=>'<section class="report-section"><h2><span class="report-section-number">'+n+'</span>'+esc(title)+'</h2>'+content+'</section>';
 const evidence=s.evidence.map((e,i)=>card(e.id+" · "+(e.source||"Evidencia"),details([["Tipo",e.type],["Fecha",e.date],["Estado",e.status]])+para("Descripción y alcance",e.description))).join("")||'<p>No se han registrado evidencias.</p>';
 const chronology=s.timeline.map((t,i)=>card(t.id+" · "+(t.when||"Momento sin consignar"),para("Acontecimiento",t.text)+para("Respaldo",t.source))).join("")||'<p>No consta cronología.</p>';
 const facts=s.facts.map((f,i)=>card(f.id+(f.id===s.diagram.final?" · ACONTECIMIENTO FINAL":""),para("Hecho",f.text)+details([ ["Estado",f.status==="verificado"&&!factSupported(f)?"Por revisar · sustento insuficiente":f.status],["Evidencia asociada",(s.evidence.find(e=>e.id===f.evidenceId)||{}).source||"No vinculada"]]))).join("")||'<p>No constan hechos.</p>';
 const classes={inmediata:"Causa inmediata",basica:"Causa básica",raiz:"Posible causa raíz",contribuyente:"Factor contribuyente",no_causal:"No causal / contexto",sin_clasificar:"Sin clasificar"};
 const analyses=s.facts.filter(f=>s.analyses[f.id]).map(f=>{const a=s.analyses[f.id];return card(f.id+" · "+(classes[a.classification]||"Sin clasificar"),para("Hecho analizado",f.text)+details([["Sustento",a.certainty==="sustentado"&&!factSupported(f)?"Por revisar · sustento insuficiente":a.certainty]])+para("Justificación y evidencia",a.why)+para("Barrera o control evaluado",a.barrier));}).join("")||'<p>No constan valoraciones causales.</p>';
 const measures=s.actions.map((a,i)=>card(a.id+" · "+(a.type||"Medida"),para("Acción propuesta",a.description)+details([["Responsable",a.owner],["Plazo",a.due],["Estado",a.status]])+para("Hallazgo vinculado",(s.facts.find(f=>f.id===a.factId)||{}).text)+para("Verificación de eficacia",a.verification)+para("Resultado documentado",a.result))).join("")||'<p>No se han definido medidas.</p>';
 const legalInfo=legalActs.map(act=>{
  const r=legalResult(act);
  return card(act.name,details([["Fecha / hora",r.record.at],["Constancia",r.record.proof],["Fecha / hora límite",legalDeadline(r.end)],["Estado del plazo",r.timing],["Registro de constancia",r.proofLabel],["Aplica",r.applicability]]));
 }).join("");
 const treeBlock=forPdf?(image?'<div class="report-tree-note"><strong>Árbol de causas: ver anexo gráfico al final del PDF.</strong><p>La lámina horizontal presenta los antecedentes verificados conectados al acontecimiento final. Los demás hechos permanecen identificados en el expediente.</p></div>':'<p>No hay un árbol exportable: verifica el acontecimiento final, sus antecedentes y los vínculos que los conectan.</p>'):
 '<figure class="report-diagram"><figcaption>Árbol de causas · representación de relaciones comprobadas</figcaption>'+(image?'<img src="'+image+'" alt="Árbol causal estructurado, hechos verificados y flechas hacia el acontecimiento final">':'<p>No hay un árbol exportable: registra y conecta hechos verificados.</p>')+'<p class="report-caption">Se muestran las conexiones con sustento suficiente. Los hechos aislados o pendientes de verificación no se convierten automáticamente en causas.</p></figure>';
 return '<article class="printreport">'+
 '<header class="report-cover"><div class="report-brand">ACADEMIA MOVIDA DE SST <span>MAC · INVESTIGACIÓN TÉCNICA</span></div><div class="report-cover-body"><span class="report-eyebrow">INFORME TÉCNICO DE INVESTIGACIÓN</span><h1>Accidente de trabajo</h1><p class="report-subtitle">Método del Árbol de Causas · Evidencias, causalidad, barreras y prevención</p>'+
 details([["Código de expediente",s.general.code],["Entidad",s.general.company],["Fecha del evento",s.general.date],["Lugar",s.general.place]])+
 '</div><div class="report-cover-foot">La Movida de SST · De la Reacción a la Prevención · www.movidasst.com</div></header>'+
 (s.isDemo?'<div class="report-demo-watermark"><strong>CASO FICTICIO · DEMOSTRACIÓN ACADÉMICA</strong><p>Este documento es material didáctico. No corresponde a un accidente real, no contiene comunicaciones oficiales y no acredita cumplimiento normativo.</p></div>':"")+
 section("01","Identificación y descripción del evento",details([["Fecha",s.general.date],["Hora",s.general.time],["Centro / lugar",s.general.place],["Trabajador",s.general.worker],["Cargo",s.general.job],["Consecuencia",s.general.consequence],["Investigador",s.general.investigator],["Rol",s.general.role],["Delegados",s.general.delegates],["Equipo investigador",s.general.team]])+para("Descripción inicial",s.general.description)+para("Actuaciones iniciales",s.general.emergency))+
 section("02","Notificaciones y actuaciones legales",'<div class="report-card-stack">'+legalInfo+'</div>'+para("Observaciones",s.legal.notes)+'<p class="report-caption">Revisar obligaciones y plazos conforme a la LOPCYMAT y su Reglamento Parcial. Los registros de MAC no constituyen notificaciones oficiales.</p>')+
 section("03","Evidencias y reconstrucción cronológica",'<h3>3.1 Inventario y valoración de evidencias</h3><div class="report-card-stack">'+evidence+'</div><h3>3.2 Secuencia temporal documentada</h3><div class="report-card-stack">'+chronology+'</div>')+
 section("04","Hechos y árbol de causas",'<h3>4.1 Hechos contrastados y su trazabilidad</h3><div class="report-card-stack">'+facts+'</div><h3>4.2 Representación del árbol causal</h3>'+treeBlock+'<h3>4.3 Interpretación causal y barreras</h3><div class="report-card-stack">'+analyses+'</div>'+para("Conclusiones causales fundamentadas",s.conclusion)+para("Información pendiente y límites",s.limits))+
 section("05","Medidas preventivas y verificación",'<div class="report-card-stack">'+measures+'</div><p class="report-caption">La ejecución de una acción no equivale a eficacia comprobada. Registrar evidencias de verificación y seguimiento.</p>')+
 section("06","Integridad técnica, referencias y revisión",'<h3>Comprobaciones del expediente</h3>'+(w.length?'<ul class="report-checks">'+w.map(v=>'<li>'+esc(v)+'</li>').join("")+'</ul>':'<p>La comprobación automática no detecta campos esenciales pendientes. Se requiere validación técnica profesional.</p>')+
 '<h3>Referencias de consulta</h3><ul class="report-references">'+[refs.ley,refs.reg,refs.nt,refs.oit].map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+details([["Fecha de revisión",s.reviewDate],["Responsable",s.general.investigator]])+'<p class="report-caption">Instrumento técnico de apoyo, no formulario oficial. La calificación del origen ocupacional corresponde al órgano competente conforme a la LOPCYMAT.</p>')+
 '<div class="report-end">MAC · Método del Árbol de Causas · Academia Movida de SST</div></article>';
}
function report(root){pTitle(root,s.isDemo?"Informe de demostración · Caso ficticio":"8. Informe técnico de investigación",s.isDemo?"La investigación de prueba ya está cargada y el informe se genera automáticamente aquí. Puedes recorrer las etapas, exportar a Excel o PDF, o volver al expediente real.":"Revisa integridad, genera el expediente y expórtalo. Los hallazgos son responsabilidad profesional de quien investiga, no conclusiones automáticas.");
if(s.isDemo){note(root,"Expediente DEMO-AT-2026-001: 11 evidencias, 7 acontecimientos cronológicos, 12 hechos, árbol causal, análisis fundamentado y cuatro medidas. Algunas hipótesis permanecen abiertas deliberadamente; es un ejercicio docente, no un accidente real.");const shortcuts=E("div","row");shortcuts.append(btn("Revisar datos generales",()=>goto(1)));shortcuts.append(btn("Explorar evidencias",()=>goto(3)));shortcuts.append(btn("Ver árbol de causas",()=>goto(5)));shortcuts.append(btn("Ver plan de medidas",()=>goto(7)));shortcuts.append(btn("Volver al expediente real",()=>discardDemo(),"btn danger"));root.append(shortcuts)}
const issues=reviewIssues();
if(issues.length){
 const g=group(root,"Aspectos pendientes ("+issues.length+")"),list=E("ul","review-links");
 g.append(E("p","muted","Selecciona un aviso para ir al punto que requiere revisión."),list);
 for(const issue of issues){
  const li=E("li");
  li.append(btn(issue.text+" · Ir a "+STEPS[issue.stage],()=>goto(issue.stage,issue),"review-link"));
  list.append(li);
 }
}else note(root,"La revisión automática no encontró datos esenciales faltantes. Verifica de todos modos el fundamento y la calidad técnica.");
const bar=E("div","row");bar.append(btn("Actualizar vista previa",()=>preview()));bar.append(btn("Descargar PDF",()=>downloadPDF(),"btn"));bar.append(btn("Imprimir",()=>window.print()));root.append(bar);
const prev=E("div","item");prev.id="reportPreview";prev.style.marginTop="15px";root.append(prev);preview();
function preview(){prev.innerHTML=renderReportHtml()}
function downloadPDF(){
 if(typeof window.html2pdf!=="function"){alert("La biblioteca PDF no está disponible. Comprueba tu conexión.");return}
 const btnPDF=Array.from(document.querySelectorAll("#stage button")).find(b=>b.textContent==="Descargar PDF");
 const filename="MAC_Informe_"+String(s.general.code||"investigacion").replace(/[^a-zA-Z0-9_-]/g,"_")+".pdf";
 const dummy=document.createElement("div");dummy.style.cssText="position:absolute;left:0;top:0;width:4px;height:4px;z-index:-1";dummy.textContent=" ";document.body.append(dummy);
 if(btnPDF){btnPDF.disabled=true;btnPDF.textContent="Generando PDF…"}
 window.html2pdf().set({margin:0,image:{type:"jpeg",quality:.8},html2canvas:{scale:1},jsPDF:{unit:"mm",format:"a4",orientation:"portrait",compress:true}})
 .from(dummy).toPdf().get("pdf").then(pdf=>{
  const html=document.createElement("div");html.innerHTML=renderReportHtml({forPdf:true});
  const article=html.querySelector(".printreport");
  const L=15,R=195,B=277,W=R-L;
  let y=18;
  const norm=v=>String(v??"").replace(/[\u2013\u2014]/g,"-").replace(/\u2192/g,"->").replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\s+/g," ").replace(/[^\x20-\xFF]/g,"").trim();
  const value=v=>norm(v)||"No consta";
  const ink=()=>pdf.setTextColor(30,50,73);
  const nextPage=()=>{pdf.addPage("a4","portrait");y=18;pdf.setTextColor(0,32,91);pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.text("MAC / CONTINUACIÓN DEL INFORME",L,y);y+=10};
  const need=h=>{if(y+h>B)nextPage()};
  const wrap=(v,w,size=9.3)=>{pdf.setFont("helvetica","normal");pdf.setFontSize(size);return pdf.splitTextToSize(value(v),w)};
  const drawText=(v,x=L,w=W,size=9.3,lh=4.7)=>{
   for(const line of wrap(v,w,size)){need(lh+1);ink();pdf.setFont("helvetica","normal");pdf.setFontSize(size);pdf.text(line,x,y);y+=lh}
  };
  const heading=(number,title)=>{
   need(23);y+=3;pdf.setFillColor(0,123,133);pdf.roundedRect(L,y-4,12,11,2,2,"F");
   pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.text(number,L+6,y+3.5,{align:"center"});
   pdf.setTextColor(0,32,91);pdf.setFont("helvetica","bold");pdf.setFontSize(12);
   const lines=pdf.splitTextToSize(norm(title),W-21);
   for(const line of lines){pdf.text(line,L+18,y+3);y+=5.5}
   pdf.setDrawColor(183,216,219);pdf.line(L,y+3,R,y+3);y+=11;
  };
  const subtitle=t=>{need(14);y+=4;pdf.setTextColor(0,123,133);pdf.setFont("helvetica","bold");pdf.setFontSize(10.3);pdf.text(norm(t),L,y);y+=9};
  const paragraph=(label,body)=>{
   need(11);pdf.setTextColor(0,32,91);pdf.setFont("helvetica","bold");pdf.setFontSize(9.3);pdf.text(norm(label).replace(/:$/,"")+":",L,y);y+=5;
   drawText(body,L+2,W-4,9.2,4.6);y+=5;
  };
  const gridFields=elements=>{
   const pairs=[...elements],gap=4,colW=(W-gap)/2;
   for(let i=0;i<pairs.length;i+=2){
    const row=pairs.slice(i,i+2).map(el=>({label:el.querySelector(".report-field-label")?.textContent||"",val:el.querySelector(".report-field-value")?.textContent||""}));
    const specs=row.map(z=>({...z,lines:wrap(z.val,colW-8,8.9)}));
    const h=Math.max(15,...specs.map(z=>9+z.lines.length*4.5));
    if(h>B-28){for(const z of row)paragraph(z.label,z.val);continue}
    need(h+2);
    specs.forEach((z,k)=>{
     const x=L+k*(colW+gap);pdf.setFillColor(241,248,249);pdf.rect(x,y,colW,h,"F");
     pdf.setFillColor(0,123,133);pdf.rect(x,y,1.4,h,"F");
     pdf.setTextColor(80,105,119);pdf.setFont("helvetica","bold");pdf.setFontSize(7.2);pdf.text(norm(z.label).toUpperCase(),x+4,y+4.4);
     ink();pdf.setFont("helvetica","normal");pdf.setFontSize(8.9);z.lines.forEach((line,j)=>pdf.text(line,x+4,y+9.5+j*4.5));
    });
    y+=h+2.5;
   }
   y+=3;
  };
  const record=el=>{
   const title=el.querySelector(".report-card-heading strong")?.textContent||"Registro";
   const fields=[...el.querySelectorAll(".report-field")];
   const paras=[...el.querySelectorAll(".report-paragraph")];
   const titleLines=wrap(title,W-10,10);
   let est=9+titleLines.length*5.2;
   fields.forEach(f=>est+=7+wrap(f.querySelector(".report-field-value")?.textContent,W-7,9.1).length*4.4);
   paras.forEach(p=>est+=10+wrap(p.textContent,W-7,9.1).length*4.4);
   if(est<240)need(est+1);else need(20);
   pdf.setFillColor(231,245,246);pdf.roundedRect(L,y-4,W,5+titleLines.length*5,1.2,1.2,"F");
   pdf.setFillColor(0,123,133);pdf.rect(L,y-4,1.8,5+titleLines.length*5,"F");
   pdf.setTextColor(0,32,91);pdf.setFont("helvetica","bold");pdf.setFontSize(10);
   titleLines.forEach(line=>{need(6);pdf.text(line,L+4,y);y+=5});y+=5;
   for(const element of el.children){
    if(element.matches(".report-fields"))for(const f of element.querySelectorAll(".report-field")){const label=f.querySelector(".report-field-label")?.textContent||"Dato";const val=f.querySelector(".report-field-value")?.textContent||"";paragraph(label,val)}
    if(element.matches(".report-paragraph")){const label=element.querySelector("strong")?.textContent||"Detalle";paragraph(label,element.textContent.slice(label.length))}
   }
   pdf.setDrawColor(211,226,231);pdf.line(L,y,R,y);y+=6;
  };
  function visit(el){
   if(!el||el.nodeType!==1)return;
   if(el.matches(".report-card")){record(el);return}
   if(el.matches(".report-fields")){gridFields(el.querySelectorAll(".report-field"));return}
   if(el.matches("h3")){subtitle(el.textContent);return}
   if(el.matches(".report-paragraph")){const k=el.querySelector("strong")?.textContent||"Detalle";paragraph(k,el.textContent.slice(k.length));return}
   if(el.matches(".report-tree-note")){paragraph("Árbol de causas",el.textContent);return}
   if(el.matches(".report-caption")){drawText(el.textContent,L,W,8.3,4.2);y+=6;return}
   if(el.matches("li")){paragraph("Punto de revisión",el.textContent);return}
   if(el.matches("p")){drawText(el.textContent);y+=5;return}
   if(el.matches(".report-field,.report-card-heading"))return;
   for(const child of el.children)visit(child);
  }
  // Portada vectorial, sin imágenes de páginas ni desplazamientos horizontales.
  pdf.setFillColor(0,32,91);pdf.rect(0,0,210,30,"F");
  pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(14);pdf.text("ACADEMIA MOVIDA DE SST",L,17);
  pdf.setFontSize(8);pdf.text("MAC / ÁRBOL DE CAUSAS",R,17,{align:"right"});
  y=45;pdf.setTextColor(0,123,133);pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.text("INFORME TÉCNICO DE INVESTIGACIÓN",L,y);
  y+=12;pdf.setTextColor(0,32,91);pdf.setFont("helvetica","bold");pdf.setFontSize(22);pdf.text("Accidente de trabajo",L,y);y+=10;
  drawText("Método del Árbol de Causas. Evidencias, causalidad, barreras y prevención",L,W,10,5);y+=6;
  const coverFields=article.querySelectorAll(".report-cover .report-field");gridFields(coverFields);
  if(s.isDemo){need(25);pdf.setFillColor(255,247,224);pdf.roundedRect(L,y,W,20,2,2,"F");pdf.setTextColor(83,64,22);pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.text("CASO FICTICIO / DEMOSTRACIÓN ACADÉMICA",L+4,y+7);pdf.setFont("helvetica","normal");pdf.setFontSize(8.5);pdf.text("Material didáctico sin validez oficial ni correspondencia con un accidente real.",L+4,y+14);y+=27}
  for(const section of article.querySelectorAll(":scope > .report-section")){
   heading(section.querySelector(".report-section-number")?.textContent||"",section.querySelector("h2")?.textContent.replace(/^\s*\d{2}\s*/,"")||"Sección");
   for(const child of section.children){if(child.tagName==="H2")continue;visit(child)}
  }
  const tree=captureDiagram();
  if(tree){
   pdf.addPage("a4","landscape");
   const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();
   pdf.setFillColor(0,32,91);pdf.rect(0,0,pw,30,"F");pdf.setTextColor(255,255,255);
   pdf.setFont("helvetica","bold");pdf.setFontSize(17);pdf.text("ANEXO GRÁFICO / ÁRBOL DE CAUSAS",14,17);
   pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.text(value(s.general.code||"Investigación"),pw-14,17,{align:"right"});
   const props=pdf.getImageProperties(tree),scale=Math.min((pw-26)/props.width,(ph-47)/props.height);
   const iw=props.width*scale,ih=props.height*scale;
   pdf.addImage(tree,"PNG",(pw-iw)/2,33+(ph-47-ih)/2,iw,ih,undefined,"FAST");
  }
  const n=pdf.getNumberOfPages();
  for(let i=1;i<=n;i++){pdf.setPage(i);const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();
   pdf.setTextColor(96,114,127);pdf.setFont("helvetica","normal");pdf.setFontSize(8);
   pdf.text("MAC · Academia Movida de SST · "+(s.isDemo?"CASO FICTICIO · ":"")+value(s.general.code||"Sin código"),12,ph-8);
   pdf.text(i+" / "+n,pw-12,ph-8,{align:"right"});
  }
  pdf.save(filename);
 }).catch(e=>{console.error("Error generando PDF",e);alert("No se pudo generar el PDF; vuelve a intentarlo.");})
 .finally(()=>{dummy.remove();if(btnPDF){btnPDF.disabled=false;btnPDF.textContent="Descargar PDF"}});
}
}
function demo(){
const d=initial();
d.demoMode=true;
d.isDemo=true;
d.general={code:"DEMO-AT-2026-001",company:"Industrias Ejemplo C.A. (SIMULACIÓN)",place:"Planta simulada · Línea transportadora 2",date:"2026-10-20",time:"09:00",
description:"Caso ficticio. Durante una intervención de mantenimiento de una banda transportadora, la mano de un técnico entró en la zona de atrapamiento del rodillo de retorno mientras la banda permanecía en movimiento. El evento ocasionó una lesión en la mano.",
worker:"Trabajador A (identidad ficticia)",job:"Técnico de mantenimiento mecánico",consequence:"Lesión traumática de mano, caracterización clínica simulada",investigator:"Equipo docente de la Academia (ficticio)",role:"Servicio de Seguridad y Salud en el Trabajo",delegates:"Delegada de prevención (personaje ficticio)",team:"Servicio SST, mantenimiento y delegada de prevención",
emergency:"09:01: parada de emergencia activada. 09:05: primeros auxilios y derivación. Equipo inmovilizado para preservar evidencias. Actuaciones simuladas."};
d.legal={inpsasel:{at:"2026-10-20T09:22",proof:"SIM-INA-001 · CONSTANCIA FICTICIA, NO VÁLIDA"},committee:{at:"2026-10-20T11:15",proof:"SIM-CSSL-001 · Comunicación ficticia al Comité de Seguridad y Salud Laboral"},union:{at:"2026-10-20T11:20",proof:"SIM-SIN-001 · Comunicación ficticia al sindicato",applies:"si"},formal:{at:"2026-10-21T08:10",proof:"SIM-DECL-001 · Declaración de práctica, sin validez oficial"},
formalCommittee:{at:"2026-10-21T08:15",proof:"SIM-DECL-CSSL · Declaración ficticia al CSSL"},
formalUnion:{at:"2026-10-21T08:20",proof:"SIM-DECL-SIN · Declaración ficticia al sindicato"},
notes:"Todas las horas y constancias son ficticias para ejercicios. La aplicación NO notifica a INPSASEL ni sustituye formularios oficiales."};
d.evidence=[
{id:"E01",type:"documento",source:"Orden de trabajo OT-135 (simulada)",date:"2026-10-20",description:"Orden de mantenimiento correctivo de transportador L2 emitida a las 08:10.",status:"verificada"},
{id:"E02",type:"digital",source:"Registro PLC L2 (simulado)",date:"2026-10-20",description:"Registro indica accionamiento de motor entre 08:45 y 09:01.",status:"verificada"},
{id:"E03",type:"digital",source:"Video del área (simulado)",date:"2026-10-20",description:"A las 08:58 se observa el resguardo abierto; a las 09:00, contacto de la mano con el rodillo durante movimiento.",status:"verificada"},
{id:"E04",type:"documento",source:"Parte de primeros auxilios (simulado)",date:"2026-10-20",description:"Registra lesión de mano y primera atención a las 09:05; no incluye datos clínicos reales.",status:"verificada"},
{id:"E05",type:"documento",source:"Procedimiento SST-PMT-07 Rev. 04 (simulado)",date:"2026-10-20",description:"Exige aislamiento de energías y verificación antes de intervenir zonas móviles.",status:"verificada"},
{id:"E06",type:"documento",source:"Autorización AT-223 (simulada)",date:"2026-10-20",description:"Autorización firmada a las 08:50; casilla de verificación de aislamiento sin completar.",status:"verificada"},
{id:"E07",type:"testimonio",source:"Declaración de supervisor (simulada)",date:"2026-10-20",description:"Indica que entendía que la banda estaba detenida; no describe una comprobación propia.",status:"pendiente"},
{id:"E08",type:"testimonio",source:"Declaración del trabajador (simulada)",date:"2026-10-20",description:"Señala que recibió instrucciones de retirar material acumulado; debe contrastarse.",status:"pendiente"},
{id:"E09",type:"fotografia",source:"Registro fotográfico posterior (simulado)",date:"2026-10-20",description:"Muestra resguardo abierto después del accidente; por sí solo no demuestra cuándo se abrió.",status:"verificada"},
{id:"E10",type:"digital",source:"Registro de paro de emergencia (simulado)",date:"2026-10-20",description:"PLC registra activación del paro a las 09:01.",status:"verificada"},
{id:"E11",type:"documento",source:"Auditoría interna AUD-0915 (simulada)",date:"2026-09-15",description:"En una muestra previa detectó listas de verificación de aislamiento incompletas para trabajos en transportadores; no consta evidencia de cierre en la copia examinada.",status:"verificada"}
];
d.timeline=[
{id:"T01",when:"20/10/2026 08:10",text:"Se emite orden de mantenimiento correctivo del equipo L2.",source:"E01 · documento"},
{id:"T02",when:"20/10/2026 08:45",text:"El registro PLC inicia intervalo con motor energizado.",source:"E02 · PLC"},
{id:"T03",when:"20/10/2026 08:50",text:"Se firma autorización AT-223 con casilla de verificación de aislamiento sin completar.",source:"E06 · autorización"},
{id:"T04",when:"20/10/2026 08:58",text:"El video muestra resguardo abierto.",source:"E03 · video"},
{id:"T05",when:"20/10/2026 09:00",text:"Video muestra contacto de mano con rodillo en movimiento; se produce lesión.",source:"E03 y E04"},
{id:"T06",when:"20/10/2026 09:01",text:"Se acciona parada de emergencia; termina intervalo de motor energizado.",source:"E10 y E02"},
{id:"T07",when:"20/10/2026 09:05",text:"Se registra atención inicial.",source:"E04"}
];
const input=[
["H01","Existía una orden de mantenimiento para el transportador L2.","E01","verificado"],
["H02","El motor del transportador L2 permaneció energizado durante la intervención.","E02","verificado"],
["H03","El resguardo del rodillo estaba abierto antes del contacto.","E03","verificado"],
["H04","La mano del técnico contactó el rodillo mientras se movía.","E03","verificado"],
["H05","El contacto ocasionó el atrapamiento y la lesión de mano.","E04","verificado"],
["H06","La autorización aprobada tenía la casilla de aislamiento sin completar.","E06","verificado"],
["H07","El procedimiento exigía aislamiento y verificación antes de intervenir.","E05","verificado"],
["H08","Una auditoría previa identificó verificaciones de aislamiento incompletas.","E11","verificado"],
["H09","La copia de la auditoría examinada no contiene constancia de cierre.","E11","verificado"],
["H10","Se accionó la parada de emergencia a las 09:01.","E10","verificado"],
["H11","El supervisor suponía que la banda estaba detenida.","E07","pendiente"],
["H12","No se ejecutó ningún aislamiento de energía.","E07","pendiente"]
];
d.facts=input.map(([id,text,evidenceId,status])=>({id,text,evidenceId,status}));
const positions={H08:[90,95],H09:[90,210],H07:[90,340],H06:[330,140],H01:[330,330],H02:[555,110],H03:[555,255],H04:[790,180],H05:[1030,180],H10:[790,390]};
d.diagram.cytoscape=Object.entries(positions).map(([id,[x,y]])=>({group:"nodes",data:{id,label:d.facts.find(f=>f.id===id).text},position:{x,y}}));
const conns=[["H02","H04","conjuncion"],["H03","H04","conjuncion"],["H04","H05","cadena"]];
conns.forEach(([source,target,relacion],i)=>d.diagram.cytoscape.push({group:"edges",data:{id:"R0"+(i+1),source,target,relacion,relacionTexto:relacion==="conjuncion"?"conjunción":""}}));
d.diagram.final="H05";
d.analyses={
H02:{classification:"inmediata",certainty:"sustentado",why:"E02 muestra energía del motor mientras se realizaba intervención; se vincula con H04. Corroborar su consistencia temporal con E03.",barrier:"Aislamiento de energía no confirmado con observación directa."},
H03:{classification:"inmediata",certainty:"sustentado",why:"El video E03 muestra el resguardo abierto antes del contacto.",barrier:"Resguardo abierto mientras existía movimiento."},
H04:{classification:"inmediata",certainty:"sustentado",why:"E03 documenta la exposición de la mano al punto de atrapamiento.",barrier:"Separación física ineficaz durante la tarea."},
H05:{classification:"no_causal",certainty:"sustentado",why:"Es el evento final / consecuencia que se busca explicar.",barrier:"La parada de emergencia actuó después del contacto."},
H06:{classification:"basica",certainty:"sustentado",why:"E06 acredita una verificación documental incompleta. No demuestra por sí misma que el aislamiento físico no se ejecutara.",barrier:"Control administrativo no comprobó el aislamiento."},
H07:{classification:"no_causal",certainty:"sustentado",why:"E05 documenta lo establecido en el procedimiento; su existencia no demuestra cumplimiento.",barrier:"Procedimiento preventivo establecido, eficacia de aplicación por revisar."},
H08:{classification:"raiz",certainty:"hipotesis",why:"La auditoría E11 respalda antecedentes de verificaciones incompletas; se debe investigar el sistema de cierre, supervisión y autorizaciones antes de confirmar una causa raíz.",barrier:"Seguimiento de no conformidades y verificación de aislamiento potencialmente insuficientes."},
H09:{classification:"contribuyente",certainty:"pendiente",why:"No disponer de constancia en una copia NO equivale a demostrar que jamás se cerró la acción.",barrier:"Solicitar trazabilidad completa del plan de acciones."},
H10:{classification:"no_causal",certainty:"sustentado",why:"Respuesta posterior al accidente, relevante para mitigación.",barrier:"Barrera de parada de emergencia actuó, pero no evitó el contacto."}
};
d.conclusion="En este CASO SIMULADO, el contacto de la mano con un rodillo en movimiento se relacionó con la accesibilidad de la zona de atrapamiento y la presencia de energía durante la intervención (E02–E04). La autorización de trabajo presentaba una verificación incompleta de aislamiento (E06). Se investigan posibles deficiencias sistémicas de autorización y seguimiento (E11); NO se consideran causas raíz demostradas hasta validar esos antecedentes.";
d.limits="Pendiente contrastar E07 y E08; verificar cómo se ejecutó el aislamiento real, condiciones de interbloqueo, evidencia de puesta en cero y estado de cierre de observaciones de la auditoría anterior. El caso no constituye un expediente real ni un diagnóstico de origen ocupacional.";
d.actions=[
{id:"A01",factId:"H02",type:"inmediata",description:"Mantener equipo L2 fuera de servicio hasta efectuar aislamiento, verificación de cero energía y autorización segura para reingreso.",owner:"Jefatura de mantenimiento (simulada)",due:"2026-10-20",verification:"Acta y registro de medición de cero energía antes de la puesta en marcha.",status:"ejecutada",result:"Actuación inicial simulada; eficacia aún sin comprobar."},
{id:"A02",factId:"H03",type:"correctiva",description:"Evaluar resguardo con enclavamiento o control técnico equivalente que impida operación con acceso al punto de atrapamiento.",owner:"Ingeniería y mantenimiento",due:"2026-11-05",verification:"Prueba documentada: sistema impide movimiento ante apertura del resguardo; verificar funcionalidad y resistencia a fallas.",status:"en_curso",result:"Prueba no realizada en el caso simulado."},
{id:"A03",factId:"H06",type:"preventiva",description:"Modificar sistema de autorizaciones para impedir aprobación si falta verificación registrada del aislamiento y responsable del control.",owner:"Servicio de SST y operaciones",due:"2026-11-01",verification:"Revisar muestra de 10 permisos de mantenimiento; criterio: 100% con verificación completa y demostrable.",status:"pendiente",result:"Pendiente."},
{id:"A04",factId:"H08",type:"preventiva",description:"Auditar otros transportadores y sistema de cierre de hallazgos de aislamiento; verificar si existe causa sistémica repetida.",owner:"Auditoría interna y Servicio SST",due:"2026-11-10",verification:"Informe de auditoría por equipo, seguimiento de hallazgos y verificación de acciones de cierre.",status:"pendiente",result:"Investigación ampliada pendiente."}
];
d.reviewDate="2026-10-20";
return d;
}
/* INTERCAMBIO EXCEL: libro de varias hojas editable y reimportable. Excel es la fuente de intercambio, localStorage solo autoguardado. */
const EXCEL_TAG="MAC-VE",EXCEL_VERSION="2";
const bookSections=[
{sheet:"GENERAL",kind:"kv",entries:[["Código interno","code"],["Empresa / entidad","company"],["Lugar / área","place"],["Fecha del accidente","date"],["Hora del accidente (Venezuela)","time"],["Descripción inicial","description"],["Trabajador/a","worker"],["Puesto","job"],["Consecuencia","consequence"],["Investigador","investigator"],["Cargo investigador","role"],["Delegados de prevención","delegates"],["Equipo investigador","team"],["Atención y control inmediato","emergency"]]},
{sheet:"ACTUACIONES",kind:"legal"},
{sheet:"EVIDENCIAS",kind:"collection",key:"evidence",cols:[["ID","id"],["Tipo","type"],["Fuente","source"],["Fecha","date"],["Descripción objetiva","description"],["Verificación","status"]]},
{sheet:"CRONOLOGIA",kind:"collection",key:"timeline",cols:[["ID","id"],["Fecha / hora","when"],["Acontecimiento","text"],["Respaldo","source"]]},
{sheet:"HECHOS",kind:"collection",key:"facts",cols:[["ID","id"],["Hecho","text"],["ID de evidencia","evidenceId"],["Estado","status"]]},
{sheet:"NODOS_ARBOL",kind:"nodes"},
{sheet:"RELACIONES",kind:"edges"},
{sheet:"ANALISIS",kind:"analysis"},
{sheet:"MEDIDAS",kind:"collection",key:"actions",cols:[["ID","id"],["ID de hecho","factId"],["Tipo","type"],["Medida","description"],["Responsable","owner"],["Plazo","due"],["Cómo verificar eficacia","verification"],["Estado","status"],["Resultado verificación","result"]]},
{sheet:"CONCLUSIONES",kind:"final"}];
const excelText=value=>{if(value===null||value===undefined)return"";let v=String(value);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return v};
function excelAvailable(){if(window.XLSX&&window.XLSX.utils&&window.XLSX.writeFile)return true;alert("No se pudo cargar el componente Excel. Revisa tu conexión a internet y vuelve a abrir la página.");return false}
function buildWorkbook(obj=s){
if(!window.XLSX)throw Error("XLSX no disponible");
const X=window.XLSX,book=X.utils.book_new();
function add(name,rows){const sheet=X.utils.aoa_to_sheet(rows.map(row=>row.map(excelText)));const maximum=rows.reduce((m,r)=>Math.max(m,r.length),1);sheet["!cols"]=Array.from({length:maximum},(_,i)=>({wch:i===0?29:i===1?46:Math.min(42,Math.max(22,rows.slice(0,25).reduce((l,row)=>Math.max(l,String(row[i]??"").length),10)))}));if(rows.length>1&&maximum>1)sheet["!autofilter"]={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:maximum-1}})};X.utils.book_append_sheet(book,sheet,name)}
add("LEEME",[["Identificador",EXCEL_TAG],["Versión",EXCEL_VERSION],["Producto","MAC · Método del Árbol de Causas — Academia Movida de SST · Investigación de Accidentes de Trabajo"],["Objeto","Libro editable que conserva el expediente completo, incluido el árbol y los identificadores de hechos."],["Uso","Puedes editar y reimportar este libro desde mac.movidasst.com."],["Precaución","Conserva las hojas, encabezados y los ID para no romper vínculos entre evidencias, hechos, causas y medidas."],["Aviso","No es declaración oficial ante INPSASEL."],["Normas","LOPCYMAT · Reglamento Parcial · NT-04:2023, artículo 19"],["Confidencialidad","Protege la identidad y la información laboral/sanitaria de las personas involucradas."],["CSSL","Comité de Seguridad y Salud Laboral (CSSL), LOPCYMAT art. 46"],["Generación",new Date().toISOString()]]);
for(const spec of bookSections){
if(spec.kind==="kv"){add(spec.sheet,[["Campo","Valor"],...spec.entries.map(([label,key])=>[label,obj.general[key]??""])])}
else if(spec.kind==="legal"){add(spec.sheet,[["Código","Actuación","Fecha y hora","Constancia","Aplica"],...legalActs.map(act=>{
 const r=legalResult(act,obj);return [act.key,act.name,r.record.at||"",r.record.proof||"",r.applicability];
}),["notes","Observaciones",obj.legal.notes||"","",""]])}
else if(spec.kind==="collection"){add(spec.sheet,[spec.cols.map(c=>c[0]),...(obj[spec.key]||[]).map(x=>spec.cols.map(c=>x[c[1]]??""))])}
else if(spec.kind==="nodes"){add(spec.sheet,[["ID de nodo / hecho","Texto del nodo","Posición X","Posición Y","Suceso final"],...(obj.diagram.cytoscape||[]).filter(x=>x.group==="nodes").map(n=>[n.data.id,n.data.label??"",n.position?.x??0,n.position?.y??0,n.data.id===obj.diagram.final?"SI":"NO"])])}
else if(spec.kind==="edges"){add(spec.sheet,[["ID de relación","ID causa","ID efecto","Tipo de relación"],...(obj.diagram.cytoscape||[]).filter(x=>x.group==="edges").map(e=>[e.data.id||ident(),e.data.source,e.data.target,e.data.relacion||"cadena"])])}
else if(spec.kind==="analysis"){add(spec.sheet,[["ID de hecho","Clasificación","Estado de sustento","Justificación con evidencia","Barreras / controles"],...Object.keys(obj.analyses||{}).map(id=>[id,obj.analyses[id].classification||"",obj.analyses[id].certainty||"",obj.analyses[id].why||"",obj.analyses[id].barrier||""])])}
else if(spec.kind==="final"){add(spec.sheet,[["Campo","Contenido"],["Conclusiones",obj.conclusion||""],["Limitaciones / información faltante",obj.limits||""],["Fecha de revisión",obj.reviewDate||""]])}}
return book}
function downloadWorkbook(obj=s,name){if(!excelAvailable())return;try{if(cy)save();const safe=String(name||obj.general.code||"expediente").replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,45);window.XLSX.writeFile(buildWorkbook(obj),"MAC_Investigacion_"+safe+".xlsx",{compression:true})}catch(e){console.error(e);alert("No se pudo generar el archivo Excel: "+e.message)}}
function workbookToState(book){
const X=window.XLSX;
function rows(name){const sheet=book.Sheets[name];if(!sheet)throw Error("Falta la hoja obligatoria «"+name+"»");const v=X.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false,blankrows:false});if(v.length>2501)throw Error("La hoja "+name+" supera el máximo de 2500 registros.");return v.map(row=>row.map(cell=>{let t=String(cell??"").trim();return /^'[=+\-@\t\r]/.test(t)?t.slice(1):t}))}
const info=rows("LEEME");if(info[0]?.[1]!==EXCEL_TAG||info[1]?.[1]!==EXCEL_VERSION)throw Error("Este Excel no es un expediente MAC compatible. Descarga primero una plantilla desde MAC.");
const obj=initial();
const gen=rows("GENERAL");const dict=Object.fromEntries(gen.slice(1).map(row=>[row[0],row[1]??""]));for(const sp of bookSections.filter(x=>x.kind==="kv"))for(const [label,key]of sp.entries)obj.general[key]=dict[label]??"";
const leg=rows("ACTUACIONES");for(const row of leg.slice(1)){const key=row[0];if(legalActs.some(act=>act.key===key)){obj.legal[key]={at:row[2]||"",proof:row[3]||""};if(key==="union")obj.legal.union.applies=row[4]||"por_confirmar"}else if(key==="notes")obj.legal.notes=row[2]||""}
for(const spec of bookSections.filter(x=>x.kind==="collection")){const rr=rows(spec.sheet);const head=rr[0]||[];if(spec.cols.some((c,i)=>head[i]!==c[0]))throw Error("Los encabezados de "+spec.sheet+" fueron modificados. Mantén sus nombres y orden.");obj[spec.key]=rr.slice(1).filter(row=>row.some(x=>x!=="")).map((row,i)=>{const rec={};spec.cols.forEach((c,j)=>rec[c[1]]=row[j]||"");if(!rec.id)rec.id=ident();return rec})}
const nodeRows=rows("NODOS_ARBOL").slice(1),edgeRows=rows("RELACIONES").slice(1);
const nodeIds=new Set(),factIds=new Set(obj.facts.map(x=>x.id));
if(factIds.size!==obj.facts.length)throw Error("Hay ID duplicados en HECHOS.");
obj.diagram.cytoscape=nodeRows.filter(row=>row.some(x=>x)).map((row,i)=>{const id=row[0];if(!id||nodeIds.has(id)||!factIds.has(id))throw Error("Nodo del árbol sin ID único que corresponda a un hecho: fila "+(i+2));nodeIds.add(id);if(String(row[4]||"").toUpperCase()==="SI"){if(obj.diagram.final)throw Error("Solo puede haber un suceso final.");obj.diagram.final=id}return {group:"nodes",data:{id,label:obj.facts.find(f=>f.id===id).text},position:{x:Number(row[2])||0,y:Number(row[3])||0}}});
const relIds=new Set();for(const [i,row] of edgeRows.entries()){if(!row.some(x=>x))continue;const id=row[0]||ident(),from=row[1],to=row[2],relacion=row[3]||"cadena";if(relIds.has(id)||nodeIds.has(id)||!nodeIds.has(from)||!nodeIds.has(to)||from===to)throw Error("Relación inválida en RELACIONES, fila "+(i+2));relIds.add(id);obj.diagram.cytoscape.push({group:"edges",data:{id,source:from,target:to,relacion,relacionTexto:relacion==="conjuncion"?"conjunción":""}})}
const adjacent=new Map();obj.diagram.cytoscape.filter(x=>x.group==="edges").forEach(e=>{if(!adjacent.has(e.data.source))adjacent.set(e.data.source,[]);adjacent.get(e.data.source).push(e.data.target)});const seen=new Set(),stack=new Set();function visit(n){if(stack.has(n))throw Error("El árbol contiene un ciclo causal; revisa RELACIONES.");if(seen.has(n))return;stack.add(n);for(const m of adjacent.get(n)||[])visit(m);stack.delete(n);seen.add(n)}for(const n of nodeIds)visit(n);
for(const row of rows("ANALISIS").slice(1)){if(!row[0])continue;if(!factIds.has(row[0]))throw Error("ANALISIS contiene un ID de hecho desconocido: "+row[0]);obj.analyses[row[0]]={classification:row[1]||"sin_clasificar",certainty:row[2]||"pendiente",why:row[3]||"",barrier:row[4]||""}}
const endings=Object.fromEntries(rows("CONCLUSIONES").slice(1).map(row=>[row[0],row[1]||""]));obj.conclusion=endings["Conclusiones"]||"";obj.limits=endings["Limitaciones / información faltante"]||"";obj.reviewDate=endings["Fecha de revisión"]||"";
const evidenceIds=new Set(obj.evidence.map(x=>x.id));for(const f of obj.facts){if(f.evidenceId&&!evidenceIds.has(f.evidenceId))throw Error("HECHOS contiene un ID de evidencia no encontrado: "+f.evidenceId)}
for(const a of obj.actions){if(a.factId&&!factIds.has(a.factId))throw Error("MEDIDAS contiene un ID de hecho no encontrado: "+a.factId)}
const allIds=obj.evidence.map(x=>x.id),unique=new Set(allIds);if(unique.size!==allIds.length)throw Error("Hay ID duplicados en EVIDENCIAS.");
validateImportedState(obj);
obj.isDemo=/^DEMO-AT-2026-001$/.test(obj.general.code);
obj.demoMode=false;
return obj}
function validateImportedState(obj){
 const choices={evidence:{type:["documento","testimonio","fisica","fotografia","digital","otra"],status:["pendiente","verificada","contradictoria"]},facts:{status:["pendiente","verificado","descartado"]},actions:{type:["inmediata","correctiva","preventiva"],status:["pendiente","en_curso","ejecutada","eficaz","ineficaz"]}};
 for(const name of ["evidence","timeline","facts","actions"]){const ids=new Set();for(const row of obj[name]){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(row.id)||ids.has(row.id))throw Error("ID inválido o duplicado en "+name);ids.add(row.id);for(const [key,values]of Object.entries(choices[name]||{}))if(!values.includes(row[key]))throw Error("Valor inválido en "+name+": "+key)}}
 for(const e of obj.diagram.cytoscape.filter(e=>e.group==="edges"))if(!["cadena","conjuncion"].includes(e.data.relacion))throw Error("Tipo de relación no válido");
 for(const a of Object.values(obj.analyses)){if(!["sin_clasificar","inmediata","basica","raiz","contribuyente","no_causal"].includes(a.classification)||!["pendiente","sustentado","hipotesis"].includes(a.certainty))throw Error("Clasificación o sustento no válido en ANALISIS")}
 if(obj.legal.union.applies&&!['si','no','por_confirmar'].includes(obj.legal.union.applies))throw Error("Aplicabilidad sindical inválida");
}
async function importWorkbook(input){
 if(!excelAvailable())return;
 const file=input?.files?.[0];if(!file)return;
 try{
  if(file.size>8*1024*1024)throw Error("El archivo supera los 8 MB permitidos.");
  const book=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false}), obj=workbookToState(book);
  const message=obj.isDemo?"Se abrirá el Excel en el espacio separado de demostración. ¿Continuar?":"Se importará «"+(obj.general.code||"Sin código")+"». Si hay un expediente real con datos, quedará como última copia recuperable en este navegador. ¿Continuar?";
  if(confirm(message))await replaceSafely(obj,obj.isDemo?8:1);
 }catch(e){alert("No se pudo importar el Excel: "+e.message)}finally{input.value=""}
}
function showInvestigation(next,target){
 if(cy){cy.destroy();cy=null}
 s=next;
 goto(target);
}
function replaceSafely(next,target){
 if(replacement)return replacement;
 const shell=$("appShell");
 shell.inert=true;
 replacement=(async()=>{
  await save();
  if(saveError)throw Error("El guardado actual falló. Exporta el expediente antes de continuar.");
  if(!next.isDemo){
   const previous=localStorage.getItem(STORAGE);
   if(previous){
    const active=await readEncrypted(previous,STORAGE);
    if(!active.isDemo&&isWorkInProgress(active))localStorage.setItem(recoveryStorage(),previous);
   }
  }
  await writeEncrypted(next.isDemo?demoStorage():STORAGE,storageKey,JSON.stringify(next));
  showInvestigation(next,target);refreshSaveStatus();
 })().finally(()=>{shell.inert=false;replacement=null});
 return replacement;
}
async function restoreInvestigation(){
 try{
  const value=localStorage.getItem(recoveryStorage());
  if(!value)return;
  if(!confirm("¿Recuperar la última copia del expediente real? Si el expediente real activo tiene datos, se conservará como la nueva copia recuperable."))return;
  const recovered=await readEncrypted(value,STORAGE);
  if(recovered.isDemo)throw Error("La copia corresponde a una demostración.");
  await replaceSafely(recovered,1);
 }catch(e){alert("No se pudo recuperar el expediente: "+e.message)}
}

function isWorkInProgress(state=s){
  const meaningful=v=>typeof v==="string"?Boolean(v.trim()):Array.isArray(v)?v.some(meaningful):v&&typeof v==="object"?Object.values(v).some(meaningful):false;return meaningful(state.general)||meaningful(state.legal)||meaningful(state.evidence)||meaningful(state.timeline)||meaningful(state.facts)||meaningful(state.actions)||meaningful(state.analyses)||meaningful(state.conclusion)||meaningful(state.limits)||meaningful(state.reviewDate);
}
async function loadFullDemo(guided=false){
 if(s.isDemo&&!confirm("¿Reiniciar el caso ficticio? Se sustituirán únicamente los cambios de la demostración."))return;
 const d=demo();d.isDemo=true;d.demoMode=guided;
 try{await replaceSafely(d,guided?1:8)}catch(e){alert(e.message)}
}
async function discardDemo(){
 if(!s.isDemo||replacement)return;
 try{
  await save();if(saveError)throw saveError;
  const value=localStorage.getItem(STORAGE), real=value?await readEncrypted(value,STORAGE):initial();
  if(!value||real.isDemo){await replaceSafely(initial(),1);return}
  showInvestigation(real,Number.isInteger(real.resumeStep)?real.resumeStep:1);refreshSaveStatus();
 }catch{alert("No se pudo abrir el expediente real. Conserva el guardado y solicita asistencia.")}
}
async function startNewInvestigation(){
 if(!confirm("¿Iniciar un expediente real vacío? Si hay un expediente real con datos, quedará como última copia recuperable en este navegador."))return;
 try{await replaceSafely(initial(),1)}catch(e){alert(e.message)}
}
function updateDemoControls(){
  const active=Boolean(s.isDemo);
  const label=$("demoLoadedLabel"),summary=$("demoSummary");
  if(label)label.textContent=active?"MODO DEMOSTRACIÓN · EXPEDIENTE FICTICIO":"Demostración completa disponible";
  if(summary)summary.textContent=active
    ?"Caso DEMO-AT-2026-001 cargado: "+s.evidence.length+" evidencias, "+s.facts.length+" hechos, "+s.diagram.cytoscape.filter(x=>x.group==="nodes").length+" nodos, "+s.actions.length+" medidas. Consulta el informe o explora las 8 etapas. Puedes volver al expediente real desde aquí."
    :"Carga el caso ficticio con datos, evidencias, árbol de causas, medidas e informe ya elaborado. La demostración se guarda por separado del expediente real.";
  const reportBtn=$("openDemoReportBtn"),clearBtn=$("clearDemoBtn"),loadBtn=$("loadDemoBtn");
  if(reportBtn)reportBtn.hidden=!active;
  if(clearBtn){clearBtn.hidden=!active;clearBtn.textContent="Volver al expediente real";}
  const recovery=$("restoreCaseBtn");
  if(recovery){try{recovery.hidden=!localStorage.getItem(recoveryStorage())}catch{recovery.hidden=true}}
  if(loadBtn)loadBtn.textContent=active?"Reiniciar demostración":"Cargar demo completa";
  const bar=$("demoBanner");
  if(bar){bar.hidden=step===0;bar.classList.toggle("demo-active",active);}
}

function bindHeader(){
$("new").onclick=()=>startNewInvestigation();
$("export").onclick=()=>downloadWorkbook();
$("import").onchange=ev=>importWorkbook(ev.target);
$("back").onclick=()=>goto(step-1);
$("next").onclick=()=>goto(step+1);
$("loadDemoBtn").onclick=()=>loadFullDemo(false);
$("openDemoReportBtn").onclick=()=>goto(8);
$("clearDemoBtn").onclick=()=>discardDemo();
const recovery=$("restoreCaseBtn");if(recovery)recovery.onclick=()=>restoreInvestigation();
}

// Iniciar únicamente después de la validación de credenciales del registro de integrantes.
let appInitialized = false;
window.MACApp = {
  async start({scope,key,legacyScope} = {}) {
    if(appInitialized) return;
    if(!/^[a-f0-9]{64}$/.test(scope||"")||!/^[a-f0-9]{64}$/.test(key||""))throw Error("Sesión de almacenamiento inválida");
    storageKey=await crypto.subtle.importKey("raw",Uint8Array.from(key.match(/../g),h=>parseInt(h,16)),"AES-GCM",false,["encrypt","decrypt"]);
    STORAGE = "mac-ve-v3-member-" + scope;
    s = initial();
    const hasSavedCase=await load(legacyScope);
    if(!hasSavedCase){s=demo();s.demoMode=false;s.isDemo=true}
    step=0;
    bindHeader();render();await save();if(saveError)throw saveError;
    appInitialized = true;
  },
  async flush(){if(replacement)await replacement.catch(()=>{});await saveQueue;if(saveError)throw saveError;},
  async lock(){await saveQueue;if(cy){cy.destroy();cy=null}s=initial();storageKey=null;appInitialized=false;$("stage").replaceChildren();}
};
})();
