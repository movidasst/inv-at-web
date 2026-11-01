// Contracts shared by the development API and browser. Authorization belongs to the server.
export class DomainError extends Error {
  constructor(message, status=422) { super(message); this.status=status; }
}
export const ensure=(ok,message,status=422)=>{if(!ok)throw new DomainError(message,status)};
export function shape(value, keys, label='objeto') {
  ensure(value && typeof value==='object' && !Array.isArray(value),`${label}: objeto requerido`);
  ensure(Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k)),`${label}: campos desconocidos o faltantes`);
}
export function text(value,label,max=4000,required=false) {
  ensure(typeof value==='string' && value.length<=max && (!required||value.trim().length>0),`${label}: texto inválido`);
}
const choice=(v,values,label)=>ensure(values.includes(v),`${label}: valor inválido`);
const id=(v)=>ensure(typeof v==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v),'Identificador inválido');
function collection(rows,label,validate) {
  ensure(Array.isArray(rows)&&rows.length<=250,`${label}: máximo 250 registros`);
  const ids=new Set();for(const row of rows){ensure(row&&typeof row==='object'&&!Array.isArray(row),`${label}: registro inválido`);id(row.id);ensure(!ids.has(row.id),`${label}: ID duplicado`);ids.add(row.id);validate(row)}return ids;
}
export function validateCase(c) {
  shape(c,['id','version','title','organization','process','incident','people','conditions','references','sources'],'caso');
  id(c.id);ensure(Number.isSafeInteger(c.version)&&c.version>0,'Versión de caso inválida');
  for(const k of ['title','organization','process','incident','people','conditions'])text(c[k],k,8000,true);
  ensure(Array.isArray(c.references)&&c.references.length<=20,'Referencias inválidas');c.references.forEach(r=>text(r,'referencia',1000,true));
  collection(c.sources,'fuentes',s=>{shape(s,['id','type','title','content']);choice(s.type,['documento','testimonio','fotografia','digital'],'tipo de fuente');text(s.title,'título',200,true);text(s.content,'contenido',8000,true)});
  ensure(c.sources.length>0,'Caso sin fuentes');return c;
}
export const blankDocument=()=>({schemaVersion:1,summary:'',obligations:'',evidence:[],timeline:[],facts:[],tree:{nodes:[],edges:[],final:''},measures:[],conclusion:'',limitations:''});
export function validateDocument(d,c) {
  shape(d,['schemaVersion','summary','obligations','evidence','timeline','facts','tree','measures','conclusion','limitations'],'expediente');
  ensure(d.schemaVersion===1,'Versión de expediente no compatible');
  for(const k of ['summary','obligations','conclusion','limitations'])text(d[k],k,8000);
  const sources=new Set(c.sources.map(s=>s.id));
  const evidence=collection(d.evidence,'evidencias',e=>{shape(e,['id','sourceId','classification','note']);ensure(sources.has(e.sourceId),'Fuente desconocida');choice(e.classification,['comprobado','inferencia','faltante'],'clasificación');text(e.note,'análisis de evidencia')});
  collection(d.timeline,'cronología',t=>{shape(t,['id','when','text','evidenceId']);text(t.when,'momento',100);text(t.text,'acontecimiento');ensure(evidence.has(t.evidenceId),'Cronología sin evidencia existente')});
  const facts=collection(d.facts,'hechos',f=>{shape(f,['id','text','evidenceId','status']);text(f.text,'hecho');ensure(evidence.has(f.evidenceId),'Hecho sin evidencia existente');choice(f.status,['pendiente','verificado','descartado'],'estado del hecho');if(f.status==='verificado')ensure(d.evidence.find(e=>e.id===f.evidenceId).classification==='comprobado'&&f.text.trim(),'Hecho verificado requiere evidencia clasificada como comprobada y texto')});
  shape(d.tree,['nodes','edges','final'],'árbol');
  ensure(Array.isArray(d.tree.nodes)&&d.tree.nodes.length<=250,'Nodos inválidos');
  const nodes=new Set();for(const n of d.tree.nodes){id(n);ensure(!nodes.has(n)&&facts.has(n),'Nodo duplicado o sin hecho');ensure(d.facts.find(f=>f.id===n).status==='verificado','Nodo requiere hecho verificado');nodes.add(n)}
  const adjacency=new Map();const pairs=new Set();
  collection(d.tree.edges,'relaciones',e=>{shape(e,['id','source','target','type','justification']);ensure(!nodes.has(e.id),'ID de relación coincide con nodo');ensure(nodes.has(e.source)&&nodes.has(e.target)&&e.source!==e.target,'Extremos de relación inválidos');choice(e.type,['cadena','conjuncion'],'relación');text(e.justification,'justificación');const pair=JSON.stringify([e.source,e.target]);ensure(!pairs.has(pair),'Relación duplicada');pairs.add(pair);if(!adjacency.has(e.source))adjacency.set(e.source,[]);adjacency.get(e.source).push(e.target)});
  const seen=new Set(),active=new Set();function visit(n){ensure(!active.has(n),'El árbol contiene un ciclo causal');if(seen.has(n))return;active.add(n);for(const t of adjacency.get(n)||[])visit(t);active.delete(n);seen.add(n)}for(const n of nodes)visit(n);
  text(d.tree.final,'hecho final',100);ensure(!d.tree.final||nodes.has(d.tree.final),'Hecho final inexistente');
  collection(d.measures,'medidas',m=>{shape(m,['id','factId','type','description','priority','owner','due','indicator','effectiveness']);ensure(facts.has(m.factId),'Medida sin hecho existente');choice(m.type,['inmediata','correctiva','preventiva'],'tipo de medida');choice(m.priority,['alta','media','baja'],'prioridad');for(const k of ['description','owner','due','indicator','effectiveness'])text(m[k],k,k==='due'?100:4000)});
  const recordIds=[...d.evidence,...d.timeline,...d.facts,...d.tree.edges,...d.measures].map(r=>r.id);
  ensure(new Set(recordIds).size===recordIds.length&&!recordIds.some(n=>['summary','obligations','conclusion','limitations'].includes(n)),'ID ambiguo entre registros o reservado para el informe');
  return d;
}
export function warnings(d) {
  const out=[];
  if(!d.summary.trim()||!d.obligations.trim())out.push('Redacta síntesis inicial y obligaciones de investigación.');
  if(!d.evidence.length||d.evidence.some(e=>!e.note.trim()))out.push('Analiza las fuentes y explica su clasificación.');
  if(!d.timeline.length||d.timeline.some(t=>!t.when.trim()||!t.text.trim()))out.push('Reconstruye una cronología con respaldo.');
  if(!d.facts.length)out.push('Registra hechos con sus evidencias.');
  if(!d.tree.final||!d.tree.edges.length)out.push('Construye el árbol y selecciona el hecho final.');
  if(d.tree.edges.some(e=>!e.justification.trim()))out.push('Justifica todas las relaciones causales.');
  for(const e of d.tree.edges.filter(e=>e.type==='conjuncion'))if(d.tree.edges.filter(x=>x.target===e.target&&x.type==='conjuncion').length<2)out.push('Completa los antecedentes de cada conjunción.');
  if(d.tree.final){const reached=new Set([d.tree.final]);for(let i=0;i<d.tree.nodes.length;i++)for(const e of d.tree.edges)if(reached.has(e.target))reached.add(e.source);if(d.tree.nodes.some(n=>!reached.has(n)))out.push('Revisa hechos sin conexión con el acontecimiento final.');}
  if(!d.measures.length||d.measures.some(m=>['description','owner','due','indicator','effectiveness'].some(k=>!m[k].trim())))out.push('Completa medidas, responsables, plazos, indicadores y criterios de eficacia.');
  if(!d.conclusion.trim()||!d.limitations.trim())out.push('Redacta conclusiones y límites del informe.');
  return [...new Set(out)];
}
export const RUBRIC=Object.freeze([
  {id:'evidence',label:'Identificación y clasificación de evidencias',max:20,description:'Contrasta fuentes, confiabilidad y diferencia entre comprobación e inferencia.'},
  {id:'facts',label:'Reconstrucción de hechos',max:15,description:'Cronología coherente, hechos objetivos, vacíos explícitos y trazabilidad.'},
  {id:'tree',label:'Construcción del Árbol de Causas',max:35,description:'Antecedentes necesarios, conjunciones y justificaciones sustentadas; admite alternativas defendibles.'},
  {id:'measures',label:'Medidas preventivas',max:20,description:'Vínculo causal, jerarquía de controles, responsables e indicadores de eficacia.'},
  {id:'report',label:'Informe y trazabilidad',max:10,description:'Claridad, integridad, referencias y límites explícitos.'}
]);
export function validateReview(review,document) {
  shape(review,['rubricVersion','criteria','feedback'],'evaluación');ensure(review.rubricVersion===1,'Versión de rúbrica inválida');text(review.feedback,'retroalimentación',8000,true);
  ensure(Array.isArray(review.criteria)&&review.criteria.length===5,'Se requieren cinco criterios');
  const refs=new Set(['summary','obligations','conclusion','limitations',...document.evidence.map(x=>x.id),...document.timeline.map(x=>x.id),...document.facts.map(x=>x.id),...document.tree.edges.map(x=>x.id),...document.measures.map(x=>x.id)]);
  const used=new Set();let total=0;
  for(const r of review.criteria){shape(r,['id','points','comment','references']);const spec=RUBRIC.find(s=>s.id===r.id);ensure(spec&&!used.has(r.id),'Criterio desconocido o duplicado');used.add(r.id);ensure(Number.isFinite(r.points)&&r.points>=0&&r.points<=spec.max&&Math.abs(Math.round(r.points*100)-r.points*100)<1e-8,'Puntos fuera de rango o precisión inválida');text(r.comment,'observación',4000,true);ensure(Array.isArray(r.references)&&r.references.length>0&&r.references.length<=20&&r.references.every(x=>refs.has(x)),'Referencias de revisión inválidas');total+=r.points;}
  return Math.round(total*100)/100;
}
export function validateInvestigation(v,c) {
  shape(v,['id','ownerId','scope','caseId','caseVersion','revision','document','updatedAt']);id(v.id);id(v.ownerId);
  shape(v.scope,['platform','deployment','course','activity']);Object.values(v.scope).forEach(id);
  ensure(v.caseId===c.id&&v.caseVersion===c.version,'Caso o versión incorrectos');ensure(Number.isSafeInteger(v.revision)&&v.revision>=0,'Revisión inválida');ensure(Number.isFinite(Date.parse(v.updatedAt)),'Fecha inválida');validateDocument(v.document,c);return v;
}
export function validateRevision(r,c){shape(r,['id','investigationId','number','createdAt','document']);id(r.id);id(r.investigationId);ensure(Number.isSafeInteger(r.number)&&r.number>0,'Número de revisión inválido');ensure(Number.isFinite(Date.parse(r.createdAt)),'Fecha de revisión inválida');validateDocument(r.document,c);return r;}
export function validateSubmission(s,c){shape(s,['id','investigationId','ownerId','scope','caseId','caseVersion','revision','document','updatedAt','submittedAt','attempt']);const {submittedAt,attempt,investigationId,...v}=s;id(investigationId);validateInvestigation(v,c);ensure(Number.isFinite(Date.parse(submittedAt))&&Number.isSafeInteger(attempt)&&attempt>0,'Entrega inválida');ensure(!warnings(s.document).length,'Entrega incompleta');return s;}
