
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
const initial=()=>({version:2,general:{code:"",company:"",place:"",date:"",time:"",description:"",worker:"",job:"",consequence:"",investigator:"",role:"",delegates:"",team:"",emergency:""},
legal:{inpsasel:{at:"",proof:""},committee:{at:"",proof:""},union:{at:"",proof:""},formal:{at:"",proof:""},notes:""},
evidence:[],timeline:[],facts:[],diagram:{cytoscape:[],seq:1,final:""},analyses:{},actions:[],conclusion:"",limits:"",reviewDate:""});
let s=initial(),step=0,cy=null;
function save(){try{if(cy)s.diagram.cytoscape=cy.elements().jsons();localStorage.setItem(STORAGE,JSON.stringify(s));$("saved").textContent="Guardado en este dispositivo";}catch(e){$("saved").textContent="No se pudo guardar: exporta el expediente";}}
function migrate(o){
if(!o||!o.general||!Array.isArray(o.facts))throw Error("Formato no compatible");
if(o.version===2){if(!o.legal||!o.diagram||!Array.isArray(o.evidence))throw Error("Archivo incompleto");return o}
const d=initial(),g=o.general||{};
Object.assign(d.general,{date:g.date||"",time:g.time||"",place:g.location||"",description:g.description||"",worker:o.persons?.[0]?.name||"",job:o.persons?.[0]?.role||"",consequence:o.persons?.[0]?.consequence||"",investigator:o.investigator?.name||"",role:o.investigator?.role||""});
d.facts=o.facts.map((f,i)=>({id:"legacy-fact-"+i,text:typeof f==="string"?f:String(f?.text||""),evidenceId:"",status:"pendiente"}));
const oldNodes=o.diagram?.cytoscape||[],nodeIDs={};
for(const el of oldNodes.filter(x=>x.group==="nodes")){const i=Number(el.data?.originFactIndex);let f=Number.isInteger(i)&&i>=0?d.facts[i]:null;if(!f){f={id:"legacy-extra-"+ident(),text:String(el.data?.label||""),evidenceId:"",status:"pendiente"};d.facts.push(f)}nodeIDs[el.data.id]=f.id;d.diagram.cytoscape.push({group:"nodes",data:{id:f.id,label:f.text},position:el.position||{x:0,y:0}})}
for(const el of oldNodes.filter(x=>x.group==="edges")){const a=nodeIDs[el.data?.source],b=nodeIDs[el.data?.target];if(a&&b&&a!==b)d.diagram.cytoscape.push({group:"edges",data:{id:ident(),source:a,target:b}})}
return d
}
function load(){try{const v=STORAGE&&localStorage.getItem(STORAGE);if(v)s=migrate(JSON.parse(v))}catch(e){s=initial()}}
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
function due(hours){const g=s.general;if(!g.date||!g.time)return "Registra fecha y hora del accidente";const [y,m,day]=g.date.split("-").map(Number),[hh,mm]=g.time.split(":").map(Number);const d=new Date(Date.UTC(y,m-1,day,hh,mm)+Math.round(hours*3600000));if(Number.isNaN(d.getTime()))return "Fecha u hora inválidas";const pad=x=>String(x).padStart(2,"0");return pad(d.getUTCDate())+"/"+pad(d.getUTCMonth()+1)+"/"+d.getUTCFullYear()+" · "+pad(d.getUTCHours())+":"+pad(d.getUTCMinutes())+" h (Venezuela)"}
function headerNav(){const nav=$("steps");nav.innerHTML="";STEPS.forEach((name,i)=>{const b=btn((i===step?"● ":"")+i+". "+name,()=>goto(i),"step"+(i===step?" current":""));nav.append(b)});$("progressBar").style.width=Math.round(step/(STEPS.length-1)*100)+"%";$("stepLabel").textContent="Etapa "+(step+1)+" de "+STEPS.length}
function goto(i){if(cy){save();cy.destroy();cy=null}step=Math.min(STEPS.length-1,Math.max(0,i));render();window.scrollTo({top:0,behavior:"smooth"})}
function render(){headerNav();updateDemoControls();const root=$("stage");root.innerHTML="";const renders=[intro,identification,legal,evidences,facts,diagram,analysis,actions,report];renders[step](root);if(s.demoMode&&step>0)demoTip(root,step);$("back").disabled=step===0;$("next").disabled=step===STEPS.length-1;$("next").textContent=step===STEPS.length-2?"Ver informe →":"Siguiente →"}
function intro(root){pTitle(root,"Investigación de Accidentes de Trabajo","Aplicación profesional y educativa · Academia Movida de SST · LOPCYMAT, Reglamento Parcial y NT-04:2023");
note(root,"Ruta práctica: identificación → actuaciones legales → evidencias → hechos → árbol de causas → causas inmediatas, básicas y raíz → medidas → informe. Los formularios creados aquí son instrumentos técnicos de apoyo y no sustituyen los oficiales del INPSASEL.");
const gg=grid(root,"three");[["1 · Marco legal","Art. 69 y arts. 73–76 de LOPCYMAT; arts. 83–85 del Reglamento."],["2 · Investigación técnica","NT-04:2023, art. 19: recopilación objetiva y análisis de causas inmediatas y básicas."],["3 · Método y prevención","Árbol de causas OIT y profundización técnica en causas raíz y controles."]].forEach(x=>{const c=E("div","item");c.append(E("h3","",x[0]));c.append(E("p","",x[1]));gg.append(c)});
const g=group(root,"Investigación de prueba y demostración guiada");
g.append(E("p","", "Incluye un expediente ficticio completo, con evidencias, cronología, árbol, análisis de causas y medidas. No contiene datos reales ni comprobantes oficiales."));
const row=E("div","row");
row.append(btn("Ver investigación completa e informe",()=>loadFullDemo(false),"btn"));
row.append(btn("Recorrer demostración guiada",()=>loadFullDemo(true)));
row.append(btn("Descargar caso de prueba en Excel",()=>downloadWorkbook(demo(),"DEMO_AT_2026")));
row.append(btn("Comenzar investigación real",()=>startNewInvestigation()));
if(s.isDemo)row.append(btn("Borrar demostración actual",()=>discardDemo(),"btn danger"));
g.append(row);
const priv=group(root,"Tratamiento de datos y límites");priv.append(E("p","", "La información se guarda automáticamente solo en el almacenamiento local de este navegador. No hay cuenta, respaldo remoto ni recuperación entre dispositivos. Para conservarla, exporta un Excel y guárdalo en un lugar seguro. Evita usar datos personales o médicos sensibles en dispositivos compartidos. No se envían expedientes a servicios de IA."));priv.append(E("p","muted","La aplicación ayuda a documentar una investigación; no determina oficialmente el origen ocupacional ni certifica cumplimiento legal."));
const rr=group(root,"Referencias de trabajo");Object.keys(refs).forEach(k=>{const x=E("p");x.append(E("strong","",refs[k]+" · "));link(x,"Consultar fuente",URLs[k]);rr.append(x)})}

function demoTip(root,stage){
const t=[
"",
"Módulo 1. Comprueba que los datos iniciales describan el evento sin atribuir culpas. Identidades y entidad son ficticias.",
"Módulo 1. Revisa las cuatro comunicaciones simuladas al INPSASEL, al CSSL y al sindicato, además de la declaración formal. Ninguna constancia tiene validez legal.",
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
const g=group(root,"Identificación de la entidad y del evento");const r=grid(g);
[["Código interno","code"],["Empresa / entidad","company"],["Lugar / área","place"],["Fecha del accidente","date","date"],["Hora del accidente (Venezuela)","time","time"]].forEach(a=>field(r,a[0],s.general[a[1]],v=>s.general[a[1]]=v,a[2]||"text"));
field(g,"Descripción inicial: ¿qué ocurrió, dónde y con quién?",s.general.description,v=>s.general.description=v,"textarea");
const g2=group(root,"Personas y equipo investigador");const r2=grid(g2);
[["Persona accidentada (identificación mínima)","worker"],["Puesto / actividad","job"],["Consecuencia conocida","consequence"],["Investigador responsable","investigator"],["Cargo o función","role"],["Delegados de prevención participantes","delegates"],["Integrantes del equipo de investigación","team"]].forEach(a=>field(r2,a[0],s.general[a[1]],v=>s.general[a[1]]=v));
field(g2,"Atención inmediata y control de otros peligros",s.general.emergency,v=>s.general.emergency=v,"textarea");
note(root,"Primero se brinda atención, se controla la exposición a nuevos peligros y se preserva la información posible. La calificación oficial del origen corresponde al INPSASEL (LOPCYMAT art. 76).");}
function legal(root){pTitle(root,"2. Actuación legal y constancias","Registra si se efectuaron las comunicaciones y conserva sus constancias. La aplicación calcula los plazos máximos desde la fecha y hora que ingresaste, sin verificar que se haya notificado.");
note(root,"No aguardes a completar la investigación para notificar o declarar. La atención y el control de peligros deben realizarse de inmediato. Las notificaciones y la investigación se gestionan oportunamente y según corresponda.");
const defs=[["inpsasel","Notificación al INPSASEL","60 minutos","Reglamento Parcial, art. 83",1],["committee","Notificación al Comité de Seguridad y Salud Laboral (CSSL)","12 horas","Reglamento Parcial, art. 83",12],["union","Notificación al sindicato","12 horas","Reglamento Parcial, art. 83",12],["formal","Declaración formal ante INPSASEL","24 horas","LOPCYMAT, art. 73 y Reglamento Parcial, art. 84",24]];
defs.forEach(([key,name,span,ref,hours])=>{const c=group(root,name+" · "+span);c.append(E("p","muted",ref));c.append(E("p","status","Fecha/hora límite de referencia: "+due(hours)));const row=grid(c);if(key==="union"){field(c,"¿Existe sindicato en la entidad?",s.legal.union.applies||"por_confirmar",v=>s.legal.union.applies=v,"select",[["por_confirmar","Por verificar"],["si","Sí"],["no","No (dejar constancia)"]])}field(row,"Fecha y hora de realización",s.legal[key].at,v=>s.legal[key].at=v,"datetime-local");field(row,"N.º de comprobante / medio / evidencia",s.legal[key].proof,v=>s.legal[key].proof=v)});
const g=group(root,"Verificación del expediente de notificaciones");field(g,"Observaciones, dificultades o constancias adicionales",s.legal.notes,v=>s.legal.notes=v,"textarea");note(g,"Los campos sin constancia no prueban cumplimiento. Esta herramienta no envía notificaciones a INPSASEL, al Comité de Seguridad y Salud Laboral (CSSL) ni al sindicato.", "warn");const r=E("div","row");link(r,"LOPCYMAT arts. 73–76",URLs.ley);link(r,"Reglamento Parcial arts. 83–85",URLs.reg);g.append(r);}
function listEdit(root,arr,heading,columns,blank){sectionHead(root,heading,()=>{arr.push(Object.assign({id:ident()},blank));save();render()});if(!arr.length){note(root,"Todavía no hay registros. Agrega uno y consigna la fuente y el momento en que se obtuvo.");return}arr.forEach((item,i)=>{const card=E("div","item");const hd=E("div","row between");hd.append(E("strong","",heading+" · "+(i+1)));hd.append(btn("Eliminar",()=>{if(confirm("¿Eliminar este registro?")){arr.splice(i,1);save();render()}},"btn danger"));card.append(hd);const gg=grid(card);columns.forEach(c=>field(gg,c[0],item[c[1]],v=>item[c[1]]=v,c[2]||"text",c[3]));root.append(card)})}
function evidences(root){pTitle(root,"3. Evidencias y reconstrucción cronológica","NT-04:2023, artículo 19, numeral 1.1.1: recopilar información objetiva, indagar individualmente testigos y analizar aspectos técnicos y organizacionales.");
note(root,"Una declaración es una fuente, no automáticamente un hecho demostrado. Documenta quién informó, cuándo y cómo se contrastó. No uses juicios de valor.");
const g=group(root,"Registro de evidencias (instrumento F06)");listEdit(g,s.evidence,"Evidencia",[["Tipo","type","select",[["documento","Documento"],["testimonio","Testimonio"],["fisica","Observación física"],["fotografia","Fotografía/croquis"],["digital","Registro digital"],["otra","Otra"]]],["Fuente / identificación","source"],["Fecha de obtención","date","date"],["Descripción objetiva","description","textarea"],["Estado de verificación","status","select",[["pendiente","Pendiente de contrastar"],["verificada","Verificada"],["contradictoria","Contradictoria"]]]],{type:"documento",source:"",date:"",description:"",status:"pendiente"});
const c=group(root,"Cronología (instrumento F07)");listEdit(c,s.timeline,"Acontecimiento",[["Fecha / hora aproximada","when"],["Descripción comprobable","text","textarea"],["Fuente de respaldo / observaciones","source"]],{when:"",text:"",source:""});
note(root,"Para construir el árbol, redacta hechos breves verificables y consigna la evidencia que los respalda. Las hipótesis permanecen fuera del árbol mientras no estén comprobadas.");}
function facts(root){pTitle(root,"4. Hechos comprobados","OIT (2019), método del árbol de causas: cada hecho es objetivo, preciso y verificable. La fuente permite rastrear por qué fue incorporado.");
sectionHead(root,"Listado de hechos (instrumento F08)",()=>{s.facts.push({id:ident(),text:"",evidenceId:"",status:"pendiente"});save();render()});
if(!s.facts.length)note(root,"Agrega los hechos uno a uno. Por ejemplo: «La banda transportadora estaba en movimiento al momento del contacto»; evita «El trabajador fue imprudente».");
s.facts.forEach((f,i)=>{const c=E("div","item");const hd=E("div","row between");hd.append(E("strong","", "H"+(i+1)));hd.append(btn("Eliminar",()=>{if(confirm("¿Eliminar el hecho y su nodo en el árbol?")){s.facts.splice(i,1);s.diagram.cytoscape=s.diagram.cytoscape.filter(x=>!(x.group==="nodes"&&x.data.id===f.id)&&!(x.group==="edges"&&(x.data.source===f.id||x.data.target===f.id)));delete s.analyses[f.id];s.actions=s.actions.filter(a=>a.factId!==f.id);save();render()}},"btn danger"));c.append(hd);field(c,"Enunciado objetivo del hecho",f.text,v=>{f.text=v;const n=s.diagram.cytoscape.find(x=>x.group==="nodes"&&x.data.id===f.id);if(n)n.data.label=v},"textarea");const row=grid(c);field(row,"Evidencia de respaldo",f.evidenceId,v=>f.evidenceId=v,"select",[["","Sin fuente asociada"]].concat(s.evidence.map((ev,j)=>[ev.id,"E"+(j+1)+" · "+(ev.source||ev.type)])));field(row,"Estado del hecho",f.status,v=>f.status=v,"select",[["pendiente","Por verificar"],["verificado","Verificado"],["descartado","Descartado"]]);root.append(c)});
note(root,"Solo los hechos verificados deben incorporarse como hechos causales definitivos. La aplicación permite diagramas de trabajo preliminares, pero advertirá sobre elementos incompletos.","warn");}
function graphData(){return Array.isArray(s.diagram.cytoscape)?s.diagram.cytoscape:[]}
function diagram(root){pTitle(root,"5. Árbol de causas","Construye relaciones entre hechos comprobados. Selecciona primero la causa (antecedente) y después el efecto (consecuente). Método técnico OIT, no formulario oficial.");
note(root,"Los nodos iniciales del árbol NO son automáticamente causas raíz. Su interpretación se realiza en la etapa siguiente con evidencias y justificación. No confundas una secuencia temporal con una relación causal.");
const tools=E("div","row");let nextRelation="cadena";field(tools,"Relación al conectar",nextRelation,v=>nextRelation=v,"select",[["cadena","Cadena causal"],["conjuncion","Conjunción: antecedente necesario junto con otros"]]);const info=E("span","muted","Selecciona dos nodos para conectarlos: causa → efecto.");tools.append(btn("Organizar árbol",()=>{if(cy){cy.layout({name:window.cytoscapeDagre?"dagre":"breadthfirst",rankDir:"LR",animate:false}).run();save()}}));tools.append(btn("Marcar hecho final",()=>{if(!cy)return;const n=cy.nodes(":selected").first();if(!n.length){alert("Selecciona el nodo del acontecimiento final.");return}s.diagram.final=n.id();save();refreshGraph()}));tools.append(btn("Eliminar selección",()=>{if(!cy)return;const v=cy.$(":selected");if(v.length&&confirm("¿Eliminar estos elementos del diagrama?")){cy.remove(v);save();refreshGraph()}},"btn danger"));root.append(tools);
const wrap=E("div","grid-diagram");const left=E("div","facts-panel");left.append(E("h3","", "Hechos para incorporar"));const curr=graphData().filter(n=>n.group==="nodes").map(n=>n.data.id);
s.facts.filter(f=>f.status==="verificado"&&f.text.trim()).forEach(f=>{const b=btn("＋ "+f.text,()=>{if(cy&&cy.$id(f.id).empty()){cy.add({group:"nodes",data:{id:f.id,label:f.text}});cy.layout({name:window.cytoscapeDagre?"dagre":"grid",rankDir:"LR",animate:false}).run();save();refreshGraph()}},"factbtn");b.disabled=curr.includes(f.id);left.append(b)});if(!s.facts.some(f=>f.status==="verificado"))left.append(E("p","muted","Primero verifica hechos en la etapa anterior."));wrap.append(left);const pane=E("div","canvas-wrap"), canvas=E("div","canvas");canvas.id="graph";pane.append(canvas);wrap.append(pane);root.append(wrap);
const t=E("p","muted","Sugerencia: marca el acontecimiento final, trabaja retrospectivamente e incorpora antecedentes necesarios. Para representar una conjunción, conecta todos los antecedentes relevantes con el mismo consecuente y explícalo en el análisis.");root.append(t);
if(typeof window.cytoscape!=="function"){note(root,"No se pudo cargar la biblioteca del diagrama. Comprueba la conexión a internet.", "error");return}
let nodes=graphData().filter(x=>x.group==="nodes"),edges=graphData().filter(x=>x.group==="edges");
cy=cytoscape({container:canvas,elements:graphData(),style:graphStyle(),layout:{name:"preset"},wheelSensitivity:.16,minZoom:.2,maxZoom:2});
if(nodes.length&&!nodes.some(x=>x.position&&Number.isFinite(x.position.x))){cy.layout({name:"grid"}).run()}
let selected=null;cy.on("tap","node",ev=>{const n=ev.target;if(selected&&selected.id()!==n.id()){const from=selected.id(),to=n.id();selected.removeClass("selected-cause");selected=null;if(cy.edges().some(e=>e.data("source")===from&&e.data("target")===to)){info.textContent="Esa relación ya existe";return}if(hasPath(to,from)){info.textContent="No se permite crear un ciclo causal";return}cy.add({group:"edges",data:{id:ident(),source:from,target:to,relacion:nextRelation,relacionTexto:nextRelation==="conjuncion"?"conjunción":""}});info.textContent="Conexión guardada: causa → efecto";save();refreshGraph()}else{selected=n;n.addClass("selected-cause");info.textContent="Causa seleccionada. Ahora toca el efecto correspondiente.";n.select()}});
cy.on("tap",ev=>{if(ev.target===cy&&selected){selected.removeClass("selected-cause");selected=null;info.textContent="Selección cancelada."}});
cy.on("dragfree remove data",()=>save());
refreshGraph();
function hasPath(from,to){const seen=new Set(),q=[from];while(q.length){const x=q.shift();if(x===to)return true;if(seen.has(x))continue;seen.add(x);cy.edges().filter(e=>e.data("source")===x).forEach(e=>q.push(e.data("target")))}return false}
function refreshGraph(){if(cy){cy.style().selector("node").style({"border-width":2}).update();cy.nodes().forEach(n=>n.style("border-color",n.id()===s.diagram.final?"#ffb600":"#007b85"));cy.fit(undefined,55)}}
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
s.actions.forEach((a,i)=>{const g=group(root,"Acción "+(i+1));const hd=E("div","row");hd.append(btn("Eliminar acción",()=>{if(confirm("¿Eliminar esta medida?")){s.actions.splice(i,1);save();render()}},"btn danger"));g.append(hd);const r=grid(g);field(r,"Hallazgo que controla",a.factId,v=>a.factId=v,"select",factOptions);field(r,"Tipo de medida",a.type,v=>a.type=v,"select",[["inmediata","Control inmediato"],["correctiva","Correctiva"],["preventiva","Preventiva"]]);field(g,"Acción técnica específica (qué se modificará)",a.description,v=>a.description=v,"textarea");const t=grid(g);field(t,"Responsable",a.owner,v=>a.owner=v);field(t,"Plazo comprometido",a.due,v=>a.due=v,"date");field(g,"Cómo se verificará su eficacia (prueba/indicador/criterio)",a.verification,v=>a.verification=v,"textarea");const u=grid(g);field(u,"Estado",a.status,v=>a.status=v,"select",[["pendiente","Pendiente"],["en_curso","En ejecución"],["ejecutada","Ejecutada (sin verificación)"],["eficaz","Eficacia comprobada"],["ineficaz","Medida ineficaz"]]);field(u,"Resultado de la verificación",a.result,v=>a.result=v,"textarea")});
note(root,"Distingue «ejecutada» de «eficacia comprobada». Un control instalado no demuestra, por sí solo, que previene una recurrencia.");}
function warnings(){const w=[];if(!s.general.date||!s.general.time||!s.general.description)w.push("Faltan fecha, hora o descripción inicial.");for(const k of ["inpsasel","committee","union","formal"])if((k!=="union"||s.legal.union.applies!=="no")&&(!s.legal[k].at||!s.legal[k].proof))w.push("Sin constancia completa de "+({"inpsasel":"notificación a INPSASEL","committee":"notificación al Comité","union":"notificación al sindicato","formal":"declaración formal"}[k])+".");if(!s.evidence.length)w.push("No hay evidencias registradas.");if(!s.timeline.length)w.push("No hay cronología.");if(!s.facts.some(f=>f.status==="verificado"))w.push("No hay hechos verificados.");for(const f of s.facts.filter(f=>f.status==="verificado")){const ev=s.evidence.find(e=>e.id===f.evidenceId);if(!ev||ev.status!=="verificada")w.push("Hecho sin evidencia verificada: "+f.text.slice(0,75));}if(!graphData().some(e=>e.group==="edges"))w.push("El árbol no tiene relaciones causales.");if(!s.diagram.final)w.push("No se marcó un acontecimiento final.");if(!Object.values(s.analyses).some(x=>x.classification==="inmediata"))w.push("No se ha clasificado ninguna causa inmediata.");if(!Object.values(s.analyses).some(x=>x.classification==="basica"))w.push("No se ha clasificado ninguna causa básica.");if(!s.actions.length)w.push("No se han definido medidas.");return w}
function captureDiagram(){if(typeof window.cytoscape!=="function"||!graphData().some(e=>e.group==="nodes"))return "";let tmp;try{const holder=E("div");holder.style.cssText="position:fixed;left:-10000px;top:0;width:950px;height:600px;background:white";document.body.append(holder);tmp=cytoscape({container:holder,elements:graphData(),style:graphStyle(),layout:{name:"preset"}});tmp.fit(undefined,40);const p=tmp.png({full:true,scale:1.5,bg:"#ffffff"});tmp.destroy();holder.remove();return p}catch(e){if(tmp)tmp.destroy();return ""}}
function renderReportHtml(){const rows=(arr,keys)=>arr.length?"<table><thead><tr>"+keys.map(k=>"<th>"+esc(k[0])+"</th>").join("")+"</tr></thead><tbody>"+arr.map(o=>"<tr>"+keys.map(k=>"<td>"+esc(o[k[1]]||"—")+"</td>").join("")+"</tr>").join("")+"</tbody></table>":"<p>No registrado.</p>";
const evidenceRows=s.evidence.map((e,i)=>({...e,index:"E"+(i+1)}));const factsRows=s.facts.map((f,i)=>({...f,index:"H"+(i+1),evidence:(s.evidence.find(e=>e.id===f.evidenceId)||{}).source||"No asociada"}));const causeRows=s.facts.filter(f=>s.analyses[f.id]).map(f=>({fact:f.text,classification:({inmediata:"Inmediata",basica:"Básica",raiz:"Posible raíz",contribuyente:"Contribuyente",no_causal:"No causal",sin_clasificar:"Sin clasificar"})[s.analyses[f.id].classification],certainty:s.analyses[f.id].certainty,why:s.analyses[f.id].why,barrier:s.analyses[f.id].barrier}));const acts=s.actions.map(a=>({...a,fact:(s.facts.find(f=>f.id===a.factId)||{}).text||"Sin vincular"}));
const image=captureDiagram();const w=warnings();let html='<article class="printreport">'+(s.isDemo?'<div class="report-demo-watermark">DEMOSTRACIÓN ACADÉMICA · CASO FICTICIO · SIN VALIDEZ OFICIAL<br>Expediente de práctica con hechos simulados y algunas hipótesis deliberadamente pendientes de verificar.</div>':'')+'<div class="report-h"><h1>Informe técnico de investigación de accidente de trabajo</h1><p>Academia Movida de SST · www.movidasst.com · Instrumento técnico de apoyo, no formulario oficial</p><p><strong>Referencia:</strong> '+esc(s.general.code||"Sin código")+' · <strong>Entidad:</strong> '+esc(s.general.company||"No indicada")+'</p></div>';
html+='<section class="report-section"><h2>1. Identificación del evento</h2>'+rows([{fecha:s.general.date,hora:s.general.time,lugar:s.general.place,trabajador:s.general.worker,puesto:s.general.job,lesion:s.general.consequence}], [["Fecha","fecha"],["Hora","hora"],["Lugar","lugar"],["Persona","trabajador"],["Puesto","puesto"],["Consecuencia","lesion"]])+'<p><strong>Descripción inicial:</strong> '+esc(s.general.description)+'</p><p><strong>Investigador:</strong> '+esc(s.general.investigator)+' · '+esc(s.general.role)+' · <strong>Delegados:</strong> '+esc(s.general.delegates)+' · <strong>Equipo investigador:</strong> '+esc(s.general.team)+'</p><p><strong>Actuaciones iniciales:</strong> '+esc(s.general.emergency)+'</p></section>';
const legalRows=[["INPSASEL · 60 min","inpsasel"],["Comité de Seguridad y Salud Laboral (CSSL) · 12 h","committee"],["Sindicato · 12 h","union"],["Declaración formal · 24 h","formal"]].map(x=>({act:x[0],when:x[1]==="union"&&s.legal.union.applies==="no"?"No aplica, según declaración":s.legal[x[1]].at,proof:s.legal[x[1]].proof}));
html+='<section class="report-section"><h2>2. Notificación y declaración</h2>'+rows(legalRows,[["Actuación","act"],["Fecha/hora","when"],["Constancia","proof"]])+'<p>'+esc(s.legal.notes)+'</p><p><small>LOPCYMAT art. 73; Reglamento Parcial arts. 83 y 84. Estos registros no sustituyen las actuaciones formales ante los destinatarios legales.</small></p></section>';
html+='<section><h2>3. Evidencias y reconstrucción</h2>'+rows(evidenceRows,[["Código","index"],["Tipo","type"],["Fecha","date"],["Fuente","source"],["Descripción","description"],["Estado","status"]])+'<h3>Cronología</h3>'+rows(s.timeline,[["Cuándo","when"],["Acontecimiento","text"],["Respaldo","source"]])+'</section>';
html+='<section><h2>4. Hechos y análisis causal</h2>'+rows(factsRows,[["Código","index"],["Hecho","text"],["Fuente","evidence"],["Estado","status"]])+'<h3>Árbol de causas</h3>'+(image?'<img alt="Diagrama de causas" src="'+image+'">':'<p>Sin diagrama disponible.</p>')+rows(causeRows,[["Hecho","fact"],["Clasificación","classification"],["Estado","certainty"],["Justificación","why"],["Barreras","barrier"]])+'<p><strong>Conclusiones:</strong> '+esc(s.conclusion)+'</p><p><strong>Limitaciones:</strong> '+esc(s.limits)+'</p></section>';
html+='<section><h2>5. Medidas y seguimiento</h2>'+rows(acts,[["Hallazgo","fact"],["Tipo","type"],["Medida","description"],["Responsable","owner"],["Plazo","due"],["Verificación","verification"],["Estado","status"],["Resultado","result"]])+'</section>';
html+='<section><h2>6. Revisión de integridad del expediente</h2>'+(w.length?'<ul>'+w.map(v=>'<li>'+esc(v)+'</li>').join("")+'</ul>':'<p>No se detectaron campos esenciales pendientes en la revisión automática. La calidad técnica debe validarla el investigador.</p>')+'<p>Referencias: '+esc(refs.ley)+'; '+esc(refs.reg)+'; '+esc(refs.nt)+'; '+esc(refs.oit)+'.</p><p><strong>Revisado el:</strong> '+esc(s.reviewDate||"Pendiente")+' · <strong>Responsable:</strong> '+esc(s.general.investigator||"No indicado")+'</p><p>El origen ocupacional se califica por INPSASEL conforme al art. 76 de la LOPCYMAT. Este informe no sustituye actuaciones administrativas oficiales.</p></section></article>';return html}
function report(root){pTitle(root,s.isDemo?"Informe de demostración · Caso ficticio":"8. Informe técnico de investigación",s.isDemo?"La investigación de prueba ya está cargada y el informe se genera automáticamente aquí. Puedes recorrer las etapas, exportar a Excel o PDF, o borrar el ejemplo para empezar.":"Revisa integridad, genera el expediente y expórtalo. Los hallazgos son responsabilidad profesional de quien investiga, no conclusiones automáticas.");
if(s.isDemo){note(root,"Expediente DEMO-AT-2026-001: 11 evidencias, 7 acontecimientos cronológicos, 12 hechos, árbol causal, análisis fundamentado y cuatro medidas. Algunas hipótesis permanecen abiertas deliberadamente; es un ejercicio docente, no un accidente real.");const shortcuts=E("div","row");shortcuts.append(btn("Revisar datos generales",()=>goto(1)));shortcuts.append(btn("Explorar evidencias",()=>goto(3)));shortcuts.append(btn("Ver árbol de causas",()=>goto(5)));shortcuts.append(btn("Ver plan de medidas",()=>goto(7)));shortcuts.append(btn("Borrar demo y comenzar",()=>discardDemo(),"btn danger"));root.append(shortcuts)}
const w=warnings();if(w.length){const g=group(root,"Aspectos pendientes ("+w.length+")");w.forEach(x=>g.append(E("p","muted","• "+x)))}else note(root,"La revisión automática no encontró datos esenciales faltantes. Verifica de todos modos el fundamento y la calidad técnica.");
const bar=E("div","row");bar.append(btn("Actualizar vista previa",()=>preview()));bar.append(btn("Descargar PDF",()=>downloadPDF(),"btn"));bar.append(btn("Imprimir",()=>window.print()));root.append(bar);
const prev=E("div","item");prev.id="reportPreview";prev.style.marginTop="15px";root.append(prev);preview();
function preview(){prev.innerHTML=renderReportHtml()}
function downloadPDF(){if(typeof window.html2pdf!=="function"){alert("No se cargó la biblioteca de PDF. Usa Imprimir → Guardar como PDF.");return}preview();window.html2pdf().set({margin:[10,10,12,10],filename:"investigacion_accidente_"+(s.general.code||"mac")+".pdf",image:{type:"jpeg",quality:.97},html2canvas:{scale:1.7,useCORS:true},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},pagebreak:{mode:["css","legacy"],avoid:["tr",".report-section"]}}).from(prev).save()}
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
add("LEEME",[["Identificador",EXCEL_TAG],["Versión",EXCEL_VERSION],["Producto","Academia Movida de SST · Investigación de Accidentes de Trabajo"],["Objeto","Libro editable que conserva el expediente completo, incluido el árbol y los identificadores de hechos."],["Uso","Puedes editar y reimportar este libro desde mac.movidasst.com."],["Precaución","Conserva las hojas, encabezados y los ID para no romper vínculos entre evidencias, hechos, causas y medidas."],["Aviso","No es declaración oficial ante INPSASEL."],["Normas","LOPCYMAT · Reglamento Parcial · NT-04:2023, artículo 19"],["Confidencialidad","Protege la identidad y la información laboral/sanitaria de las personas involucradas."],["CSSL","Comité de Seguridad y Salud Laboral (CSSL), LOPCYMAT art. 46"],["Generación",new Date().toISOString()]]);
for(const spec of bookSections){
if(spec.kind==="kv"){add(spec.sheet,[["Campo","Valor"],...spec.entries.map(([label,key])=>[label,obj.general[key]??""])])}
else if(spec.kind==="legal"){add(spec.sheet,[["Código","Actuación","Fecha y hora","Constancia","Aplica"],["inpsasel","Notificación a INPSASEL",obj.legal.inpsasel?.at||"",obj.legal.inpsasel?.proof||"","si"],["committee","Notificación al Comité de Seguridad y Salud Laboral (CSSL)",obj.legal.committee?.at||"",obj.legal.committee?.proof||"","si"],["union","Notificación al sindicato",obj.legal.union?.at||"",obj.legal.union?.proof||"",obj.legal.union?.applies||"por_confirmar"],["formal","Declaración formal ante INPSASEL",obj.legal.formal?.at||"",obj.legal.formal?.proof||"","si"],["notes","Observaciones",obj.legal.notes||"","",""]])}
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
const leg=rows("ACTUACIONES");for(const row of leg.slice(1)){const key=row[0];if(["inpsasel","committee","union","formal"].includes(key)){obj.legal[key]={at:row[2]||"",proof:row[3]||""};if(key==="union")obj.legal.union.applies=row[4]||"por_confirmar"}else if(key==="notes")obj.legal.notes=row[2]||""}
for(const spec of bookSections.filter(x=>x.kind==="collection")){const rr=rows(spec.sheet);const head=rr[0]||[];if(spec.cols.some((c,i)=>head[i]!==c[0]))throw Error("Los encabezados de "+spec.sheet+" fueron modificados. Mantén sus nombres y orden.");obj[spec.key]=rr.slice(1).filter(row=>row.some(x=>x!=="")).map((row,i)=>{const rec={};spec.cols.forEach((c,j)=>rec[c[1]]=row[j]||"");if(!rec.id)rec.id=ident();return rec})}
const nodeRows=rows("NODOS_ARBOL").slice(1),edgeRows=rows("RELACIONES").slice(1);
const nodeIds=new Set(),factIds=new Set(obj.facts.map(x=>x.id));
if(factIds.size!==obj.facts.length)throw Error("Hay ID duplicados en HECHOS.");
obj.diagram.cytoscape=nodeRows.filter(row=>row.some(x=>x)).map((row,i)=>{const id=row[0];if(!id||nodeIds.has(id)||!factIds.has(id))throw Error("Nodo del árbol sin ID único que corresponda a un hecho: fila "+(i+2));nodeIds.add(id);if(String(row[4]||"").toUpperCase()==="SI"){if(obj.diagram.final)throw Error("Solo puede haber un suceso final.");obj.diagram.final=id}return {group:"nodes",data:{id,label:row[1]||obj.facts.find(f=>f.id===id).text},position:{x:Number(row[2])||0,y:Number(row[3])||0}}});
const relIds=new Set();for(const [i,row] of edgeRows.entries()){if(!row.some(x=>x))continue;const id=row[0]||ident(),from=row[1],to=row[2],relacion=row[3]||"cadena";if(relIds.has(id)||!nodeIds.has(from)||!nodeIds.has(to)||from===to)throw Error("Relación inválida en RELACIONES, fila "+(i+2));relIds.add(id);obj.diagram.cytoscape.push({group:"edges",data:{id,source:from,target:to,relacion,relacionTexto:relacion==="conjuncion"?"conjunción":""}})}
const adjacent=new Map();obj.diagram.cytoscape.filter(x=>x.group==="edges").forEach(e=>{if(!adjacent.has(e.data.source))adjacent.set(e.data.source,[]);adjacent.get(e.data.source).push(e.data.target)});const seen=new Set(),stack=new Set();function visit(n){if(stack.has(n))throw Error("El árbol contiene un ciclo causal; revisa RELACIONES.");if(seen.has(n))return;stack.add(n);for(const m of adjacent.get(n)||[])visit(m);stack.delete(n);seen.add(n)}for(const n of nodeIds)visit(n);
for(const row of rows("ANALISIS").slice(1)){if(!row[0])continue;if(!factIds.has(row[0]))throw Error("ANALISIS contiene un ID de hecho desconocido: "+row[0]);obj.analyses[row[0]]={classification:row[1]||"sin_clasificar",certainty:row[2]||"pendiente",why:row[3]||"",barrier:row[4]||""}}
const endings=Object.fromEntries(rows("CONCLUSIONES").slice(1).map(row=>[row[0],row[1]||""]));obj.conclusion=endings["Conclusiones"]||"";obj.limits=endings["Limitaciones / información faltante"]||"";obj.reviewDate=endings["Fecha de revisión"]||"";
const evidenceIds=new Set(obj.evidence.map(x=>x.id));for(const f of obj.facts){if(f.evidenceId&&!evidenceIds.has(f.evidenceId))throw Error("HECHOS contiene un ID de evidencia no encontrado: "+f.evidenceId)}
for(const a of obj.actions){if(a.factId&&!factIds.has(a.factId))throw Error("MEDIDAS contiene un ID de hecho no encontrado: "+a.factId)}
const allIds=obj.evidence.map(x=>x.id),unique=new Set(allIds);if(unique.size!==allIds.length)throw Error("Hay ID duplicados en EVIDENCIAS.");
obj.isDemo=/^DEMO-AT-2026-001$/.test(obj.general.code);
obj.demoMode=false;
return obj}
function importWorkbook(input){if(!excelAvailable())return;const file=input?.files?.[0];if(!file)return;if(file.size>8*1024*1024){alert("El archivo supera los 8 MB permitidos.");input.value="";return}
file.arrayBuffer().then(buf=>{const book=window.XLSX.read(buf,{type:"array",cellDates:false});const obj=workbookToState(book);if(confirm("Se importará el expediente «"+(obj.general.code||"Sin código")+"» y sustituirá la investigación actual. ¿Continuar?")){s=obj;save();goto(obj.isDemo?8:1);alert("Investigación Excel importada con sus evidencias, árbol de causas, medidas y conclusiones.")}}).catch(e=>{console.error(e);alert("No se pudo importar el Excel: "+e.message)}).finally(()=>input.value="")}


function switchInvestigation(next,target=8){
  if(cy){cy.destroy();cy=null}
  s=next;
  save();
  goto(target);
}
function isWorkInProgress(){
  return Boolean(s.general.code||s.general.date||s.general.description||s.evidence.length||s.facts.length||s.actions.length);
}
function loadFullDemo(guided=false){
  const message = s.isDemo
    ? "¿Reiniciar la demostración con los datos ficticios originales? Se perderán los cambios realizados en la demo."
    : "¿Cargar el caso de demostración? Reemplazará la investigación actual de este navegador. Exporta primero a Excel si deseas conservarla.";
  if(isWorkInProgress()&&!confirm(message))return;
  const d=demo();
  d.isDemo=true;
  d.demoMode=guided;
  switchInvestigation(d,guided?1:8);
}
function discardDemo(){
  if(!s.isDemo)return;
  if(!confirm("¿Borrar TODOS los datos de la demostración y empezar una investigación vacía? Si deseas conservar el ejemplo, exporta antes su Excel."))return;
  switchInvestigation(initial(),1);
}
function startNewInvestigation(){
  const message=s.isDemo
    ? "¿Borrar la demostración y comenzar una investigación REAL completamente vacía?"
    : "¿Iniciar una investigación vacía? Los datos actuales de este navegador serán reemplazados. Exporta antes tu expediente a Excel si lo necesitas.";
  if(!confirm(message))return;
  switchInvestigation(initial(),1);
}
function updateDemoControls(){
  const active=Boolean(s.isDemo);
  const label=$("demoLoadedLabel"),summary=$("demoSummary");
  if(label)label.textContent=active?"MODO DEMOSTRACIÓN · EXPEDIENTE FICTICIO":"Demostración completa disponible";
  if(summary)summary.textContent=active
    ?"Caso DEMO-AT-2026-001 cargado: "+s.evidence.length+" evidencias, "+s.facts.length+" hechos, "+s.diagram.cytoscape.filter(x=>x.group==="nodes").length+" nodos, "+s.actions.length+" medidas. Consulta el informe o explora las 8 etapas. Puedes borrar el ejemplo cuando quieras."
    :"Carga el caso ficticio con datos, evidencias, árbol de causas, medidas e informe ya elaborado. Después podrás borrarlo y utilizar MAC normalmente.";
  const reportBtn=$("openDemoReportBtn"),clearBtn=$("clearDemoBtn"),loadBtn=$("loadDemoBtn");
  if(reportBtn)reportBtn.hidden=!active;
  if(clearBtn)clearBtn.hidden=!active;
  if(loadBtn)loadBtn.textContent=active?"Reiniciar demostración":"Cargar demo completa";
  const bar=$("demoBanner");
  if(bar)bar.classList.toggle("demo-active",active);
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
}

// Iniciar únicamente después de la validación de credenciales del registro de integrantes.
let appInitialized = false;
window.MACApp = {
  start({scope} = {}) {
    if(appInitialized) return;
    if(typeof scope !== "string" || !/^[a-f0-9]{64}$/.test(scope)) return;
    STORAGE = "mac-ve-v2-member-" + scope;
    s = initial();
    const hasSavedCase = Boolean(localStorage.getItem(STORAGE));
    load();
    if(!hasSavedCase){
      s=demo();
      s.demoMode=false;
      s.isDemo=true;
    }
    step=s.isDemo?8:0;
    bindHeader();
    render();
    save();
    appInitialized = true;
  }
};
})();