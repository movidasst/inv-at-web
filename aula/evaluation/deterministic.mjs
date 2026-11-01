import {validateCase,validateDocument} from '../shared/models.mjs';

export const RULESET_VERSION='1.0.0';
export const MODULE_CRITERIA=Object.freeze({1:['report'],2:['evidence','facts'],3:['tree'],4:['measures','report'],final:['evidence','facts','tree','measures','report']});
export function inspect(document,caseData,{module='final'}={}) {
 if(!Object.hasOwn(MODULE_CRITERIA,module))throw Error('Módulo no autorizado');
 const issues=[],strengths=[];
 const add=(code,criterion,refs,message,action,severity='essential')=>issues.push({code,criterion,refs,message,action,severity});
 try{validateCase(caseData);validateDocument(document,caseData)}catch{
  add('invalid_structure','report',[],'El expediente contiene una estructura o referencia no válida.','Corrige las referencias, tipos y estructura antes de solicitar evaluación.','fatal');
  return {version:RULESET_VERSION,module,valid:false,issues,strengths,score:null};
 }
 const d=document,has=id=>MODULE_CRITERIA[module].includes(id),full=module==='final';
 if(full||String(module)==='1'){
  if(!d.summary.trim())add('missing_summary','report',['summary'],'Falta la descripción inicial.','Describe lo observado sin atribuir causas supuestas.');
  if(!d.obligations.trim())add('missing_obligations','report',['obligations'],'Falta el fundamento de las actuaciones de investigación.','Indica las obligaciones aplicables y su fundamento en el curso.');
 }
 if(has('evidence')){
  if(!d.evidence.length)add('missing_evidence','evidence',[],'No hay análisis de fuentes.','Selecciona y contrasta las fuentes del caso.');
  for(const e of d.evidence){
   if(!e.note.trim())add('unanalysed_source','evidence',[e.id,e.sourceId],'La fuente no tiene análisis ni límites explicados.','Explica qué permite comprobar y qué no permite concluir.');
   else strengths.push({code:'source_trace',criterion:'evidence',refs:[e.id,e.sourceId],message:'El registro conserva un vínculo trazable a una fuente; falta valorar la calidad de su análisis.'});
   if(!d.facts.some(f=>f.evidenceId===e.id)&&!d.timeline.some(t=>t.evidenceId===e.id))add('unused_evidence','evidence',[e.id],'La evidencia no se usa en hechos ni cronología.','Explica su pertinencia o relaciónala con un registro sustentado.','review');
  }
 }
 if(has('facts')){
  if(!d.timeline.length)add('missing_timeline','facts',[],'Falta reconstrucción temporal.','Incorpora acontecimientos y referencias sin inventar precisión.');
  for(const t of d.timeline)if(!t.when.trim()||!t.text.trim())add('partial_timeline','facts',[t.id],'El acontecimiento no tiene momento o descripción.','Completa lo conocido e indica cuándo la hora sea incierta.');
  if(!d.facts.length)add('missing_facts','facts',[],'No hay hechos registrados.','Redacta observaciones con fuente y estado de verificación.');
 }
 if(has('tree')){
  if(!d.tree.nodes.length||!d.tree.edges.length||!d.tree.final)add('missing_tree','tree',[],'Falta un árbol con relaciones y acontecimiento final.','Construye relaciones sobre hechos verificados y marca el final.');
  for(const e of d.tree.edges){
   if(!e.justification.trim())add('unjustified_edge','tree',[e.id,e.source,e.target],'La relación causal carece de justificación.','Explica por qué el antecedente fue necesario y cita la evidencia de ambos hechos.');
   if(e.type==='conjuncion'&&d.tree.edges.filter(x=>x.target===e.target&&x.type==='conjuncion').length<2)add('partial_conjunction','tree',[e.id,e.target],'La conjunción tiene un único antecedente declarado.','Revisa si existen antecedentes conjuntamente necesarios; no agregues nodos solo para cumplir una cantidad.');
   if(e.justification.trim())strengths.push({code:'edge_trace',criterion:'tree',refs:[e.id],message:'La conexión tiene una justificación registrada; su validez técnica aún debe evaluarse.'});
  }
  if(d.tree.final){const reached=new Set([d.tree.final]);for(let i=0;i<d.tree.nodes.length;i++)for(const e of d.tree.edges)if(reached.has(e.target))reached.add(e.source);for(const n of d.tree.nodes)if(!reached.has(n))add('disconnected_fact','tree',[n],'El hecho no tiene camino causal hacia el final.','Justifica si es un hallazgo separado o establece conexiones sustentadas.','review');}
 }
 if(has('measures')){
  if(!d.measures.length)add('missing_measures','measures',[],'No se han definido controles.','Propón medidas relacionadas con factores investigados.');
  for(const m of d.measures){
   for(const key of ['description','owner','due','indicator','effectiveness'])if(!m[key].trim())add(`measure_${key}`,'measures',[m.id,m.factId],`La medida tiene pendiente el componente ${key}.`,'Completa control, responsable, plazo, indicador y criterio de eficacia.');
   if(!d.tree.nodes.includes(m.factId))add('measure_outside_tree','measures',[m.id,m.factId],'La medida está vinculada a un hecho no incorporado al árbol.','Comprueba la pertinencia del factor y explica la relación con el análisis causal.','review');
  }
 }
 if(full||String(module)==='4')for(const [key,label]of [['conclusion','conclusiones'],['limitations','limitaciones']])if(!d[key].trim())add(`missing_${key}`,'report',[key],`Faltan ${label} explícitas.`,'Redacta hallazgos sustentados, recomendaciones y lo que sigue sin comprobarse.');
 // A lexical alarm is a review trigger, never a diagnosis or automatic penalty.
 if(has('tree'))for(const f of d.facts)if(/\b(culpa|negligencia|imprudencia|descuido)\b/iu.test(f.text))add('possible_blame','tree',[f.id],'El enunciado contiene una atribución personal que necesita contraste.','Diferencia observación de juicio; el detector léxico no determina si tu conclusión es válida.','review');
 if(/ignore (previous|all)|ignora (las |todas |los )?(instrucciones|reglas)|system prompt|dame (100|cien) puntos/iu.test(JSON.stringify(d)))add('instruction_like_text','report',[],'Hay texto parecido a una instrucción al evaluador.','El texto se tratará como datos y se remitirá a revisión; no altera criterios ni puntuaciones.','review');
 return {version:RULESET_VERSION,module,valid:!issues.some(i=>['fatal','essential'].includes(i.severity)),issues,strengths,score:null};
}
