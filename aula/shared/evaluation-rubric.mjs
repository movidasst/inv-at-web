// Public criteria, never a case answer key. Weights are points, not completion awards.
export const RUBRIC_VERSION = '2.0.0';
export const LEVELS = [
  {id:0,name:'Insuficiente',factor:0},
  {id:1,name:'Inicial',factor:0.4},
  {id:2,name:'Competente',factor:0.75},
  {id:3,name:'Destacado',factor:1}
];
const criterion=(id,label,max,rows)=>({id,label,max,indicators:rows.map(([id,weight,observable])=>({id,weight,observable,descriptors:[
  `No demuestra ${observable.toLowerCase()} o presenta conclusiones incompatibles con las fuentes.`,
  `Demuestra parcialmente ${observable.toLowerCase()}; persisten vacíos o inferencias sin suficiente contraste.`,
  `Demuestra ${observable.toLowerCase()} con respaldo identificable; reconoce límites y presenta omisiones menores.`,
  `Demuestra ${observable.toLowerCase()} de forma precisa, contrastada y completa; justifica alternativas e incertidumbres pertinentes.`
]}))});
export const EVALUATION_RUBRIC=[
 criterion('evidence','Identificación y análisis de evidencias',20,[['sources',8,'Identificación y uso trazable de fuentes'],['contrast',8,'Contraste de fiabilidad y discrepancias entre fuentes'],['uncertainty',4,'Distinción entre comprobación, inferencia y datos faltantes']]),
 criterion('facts','Reconstrucción de hechos',15,[['chronology',6,'Reconstrucción temporal sustentada sin falsa precisión'],['objective',5,'Enunciación objetiva de hechos y separación de interpretaciones'],['gaps',4,'Reconocimiento de vacíos y solicitudes de información pertinentes']]),
 criterion('tree','Árbol de Causas y razonamiento causal',35,[['factual',6,'Uso de hechos verificables en los nodos'],['necessity',8,'Justificación de antecedentes necesarios y ausencia de saltos lógicos'],['conjunction',6,'Distinción de cadenas y conjunciones necesarias'],['support',6,'Respaldo de las relaciones en evidencias contrastadas'],['systems',5,'Análisis de factores técnicos, organizacionales y de gestión sin culpa infundada'],['alternatives',4,'Reconocimiento de alternativas causales defendibles e incertidumbre']]),
 criterion('measures','Medidas preventivas y seguimiento',20,[['causal',7,'Correspondencia entre medidas y factores identificados'],['hierarchy',6,'Priorización técnica de controles y diferencia entre corrección y prevención'],['delivery',4,'Definición de responsables y plazos viables'],['efficacy',3,'Indicadores y criterios que permiten comprobar eficacia']]),
 criterion('report','Informe técnico y trazabilidad',10,[['trace',4,'Trazabilidad entre fuentes, hechos, relaciones y medidas'],['clarity',3,'Comunicación coherente de hallazgos y recomendaciones'],['limits',3,'Reconocimiento de limitaciones sin presentar hipótesis como conclusiones']])
];
function freeze(v){Object.freeze(v);for(const x of Object.values(v))if(x&&typeof x==='object'&&!Object.isFrozen(x))freeze(x);return v}
freeze(LEVELS);freeze(EVALUATION_RUBRIC);
export const STATE_LABELS=Object.freeze({automatic_validated:'Evaluación automática validada (propuesta piloto)',review_required:'Requiere revisión docente',incomplete_invalid:'Evaluación incompleta o no válida'});
export const REASON_LABELS=Object.freeze({
 ai_not_configured:'Evaluador IA pendiente de configuración.',external_processing_not_authorized:'El tratamiento externo de datos aún no está autorizado.',
 essential_or_structural_errors:'Hay productos esenciales o referencias que necesitan corrección.',input_limit:'La entrada supera el límite permitido para esta evaluación.',
 calibration_required:'La fiabilidad del evaluador todavía debe validarse con especialistas.',concordance_not_validated:'Las verificaciones no tienen concordancia validada.',
 model_flags:'El análisis técnico contiene alertas para revisión.',unassessable_indicator:'Algún indicador no pudo valorarse de forma fiable.',quality_sample:'Caso seleccionado para control de calidad.',
 timeout:'La evaluación no terminó dentro del tiempo disponible.',budget:'Se alcanzó el límite de recursos de evaluación.',service_failure:'El servicio de evaluación no pudo completar la operación.',
 unsafe_or_invalid_evaluator_output:'La respuesta del evaluador no pudo validarse de forma segura.',student_appeal:'El estudiante solicitó una revisión.',
 formative_only:'Orientación formativa, sin nota definitiva.',possible_blame:'Revisar una posible atribución personal sin suficiente sustento.',instruction_like_text:'Revisar texto parecido a una instrucción al evaluador.',
 disconnected_fact:'Revisar hechos separados del acontecimiento final.',unused_evidence:'Revisar evidencias que no se han utilizado en la reconstrucción.',measure_outside_tree:'Revisar la relación entre una medida y el árbol.'
});
