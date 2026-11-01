# ADR-002 — Evaluación automática por competencias

Esta actualización sustituye la revisión manual obligatoria de cada expediente como modelo objetivo. MAC Aula combina reglas determinísticas, valoración técnica asistida por IA, rúbrica y supervisión por excepciones. No modifica MAC Profesional. Estado actual: motor y adaptadores simulados probados localmente; ningún proveedor conectado, calibración real ni publicación automática habilitada.

**Incremento Gemini:** existe ahora un adaptador oficial REST opcional de servidor, desactivado por defecto. Ver `gemini-setup.md` para clave privada, flags de habilitación, modelo/versiones, límites y pruebas. No hay clave configurada en la sesión de desarrollo, por lo que no se ejecutó prueba real. Se mantiene la rúbrica 2.0.0 y el evaluador avanza a 1.1.0: las propuestas parciales conservan puntos por criterio valorable, total null si falta alguno y lista de criterios pendientes. Sin IA no se presume que las reglas pueden valorar calidad causal. Las descripciones de “sin proveedor” que siguen corresponden al estado previo a este incremento.

## Flujo y estados
Entrega inmutable → validación de integridad → comprobaciones determinísticas → dos verificaciones técnicas estructuradas → decisión por política/calibración → propuesta o bandeja de excepciones → validación/publicación definitiva autorizada → futura outbox AGS.

| Estado | Condición | Consecuencia actual |
|---|---|---|
| Evaluación automática validada | Productos íntegros, dos salidas válidas y concordantes, sin alertas, calibración vigente del mismo modelo/rúbrica y fuera de muestra aleatoria. | Propuesta piloto; no publicación ni envío AGS. Solo se prueba con adaptadores artificiales. |
| Requiere revisión docente | Alertas técnicas, incertidumbre, falta de calibración, discrepancia, muestra QA o reclamación. También IA no configurada, sin autorización de privacidad, timeout o límite. | Bandeja por excepción; un fallo del servicio no se convierte en cero puntos. |
| Evaluación incompleta o no válida | Faltan entregables esenciales, estructura inválida, entrada excesiva o salida de evaluador no validable. | Corregir estructura o resolver ejecución; no asignar desempeño deficiente por un fallo técnico. |

En el laboratorio, todo expediente completo queda pendiente de revisión porque **no hay IA conectada**. Las comprobaciones formales no resuelven por sí solas el razonamiento técnico. No hay promesa de reducir el trabajo docente antes de validar el evaluador real.

## Componentes
- `aula/shared/evaluation-rubric.mjs`: rúbrica 2.0.0 pública, 5 criterios/100 puntos, 19 indicadores ponderados y cuatro descriptores por indicador. No contiene soluciones de casos.
- `aula/evaluation/deterministic.mjs`: reglas 1.0.0, integridad/trazabilidad, conexiones sin justificar, conjunciones incompletas, hechos desconectados, uso de evidencias, componentes preventivos y límites. Devuelve hallazgos referidos a IDs y acciones; nunca puntos.
- `contract.mjs`: entrada/salida versionadas, instrucciones confiables separadas de datos no confiables, whitelist de campos, refs reales y validación exhaustiva. La nota se calcula en backend desde niveles e indicadores; no se acepta un total o confianza enviado por el modelo/cliente.
- `engine.mjs`: orquestación, límites, dos verificaciones, decisión, propuestas y proyección pública de feedback. No importa SDK ni realiza fetch a un proveedor. `evaluate` permite inyectar adaptadores de pruebas; la API de desarrollo no permite configurarlos desde el navegador.
- `calibration.mjs`: métricas offline de concordancia y sesgo, sin autorizar automáticamente publicación.
- Store/API de desarrollo: evaluaciones ligadas a snapshot, historial, idempotencia por entrega/rúbrica/evaluador, reclamación y acceso por ámbito. Evaluación se solicita automáticamente al entregar; repetir no genera registros o costes duplicados.

## Contratos y rúbrica
Entrada del adaptador: `contractVersion`, `rubricVersion`, `instructions`, `rubric`, `untrustedData` (solo caso/fuentes públicas y documento) y comprobaciones. No se envían identidad, curso, correo, sesión, credenciales ni solucionario. El registro del backend mantiene por separado submission ID/revisión, hash SHA-256 del documento+caso, versiones de caso/rúbrica/reglas/evaluador/contrato/política, fecha, proveedor/modelo, intentos, tokens y justificaciones.

Adaptador futuro: objeto de servidor `{id, modelVersion, evaluate(input, {signal,maxOutputTokens,pass})}`. Responde `{result,usage:{inputTokens,outputTokens},providerId,modelVersion}`. Ningún endpoint del cliente acepta este objeto, nombre de proveedor, clave, política o nota.

`result`: versiones exactas, cinco criterios, todos sus indicadores y alertas. Cada indicador: ID permitido, nivel 0/1/2/3 o `unassessable`, referencias existentes y razón obligatoria. Campos extra, IDs/niveles inventados, duplicados, referencias inexistentes o salidas mayores de 64 KB se rechazan. Niveles: insuficiente 0%, inicial 40%, competente 75%, destacado 100% de la ponderación; se califican indicadores demostrados, no presencia de campos. Un indicador no valorable deja la propuesta incompleta, no produce un cero automático.

Los cinco máximos son 20/15/35/20/10. Árbol: hechos verificables (6), necesidad causal (8), conjunciones (6), respaldo (6), factores sistémicos sin culpa infundada (5), alternativas e incertidumbre (4). Se aceptan topologías diferentes; no existe comparación literal con un único árbol modelo. El verificador estructural no afirma que una arista justificada en texto sea técnicamente correcta. Alarmas léxicas de posible culpa o instrucciones se remiten a revisión sin restar puntos y pueden dar falsos positivos.

La rúbrica manual 1 se conserva para compatibilidad con devoluciones existentes; las evaluaciones automáticas usan explícitamente la versión 2.0.0 con el mismo reparto de máximos. La interfaz muestra los indicadores nuevos. Una extracción futura unificará formularios de revisión por indicador; actualmente el docente ajusta los cinco criterios con explicación y referencias.

## Feedback y protección de información reservada
El estudiante recibe hechos de integridad positivos, debilidades, conexiones que justificar, evidencias sin utilizar, medidas incompletas y acciones concretas con IDs. Los hallazgos positivos dicen «hay trazabilidad/justificación registrada», no «la relación es correcta». Cuando haya dos salidas IA válidas, el backend genera feedback de competencias usando descriptores públicos y referencias validadas. No muestra la prosa libre del proveedor, prompts, soluciones ni puntuaciones preliminares no publicadas. Las razones técnicas detalladas se reservan al docente.

El solucionario del mezclador sigue sin existir en el repositorio ni en assets o fixtures. Una futura referencia privada requiere almacenamiento y acceso docente independientes; no debe enviarse al proveedor ni mezclarse con el JSON del alumno por defecto. Si se necesita usar información reservada, requerirá una decisión específica de privacidad, evaluación de fugas y autorización. La proyección pública actual reduce fugas, pero no es garantía universal frente a inferencias o futuros cambios.

Los textos estudiantiles son datos no confiables. Se serializan como datos estructurados separados de instrucciones de servidor; el adaptador no obtiene herramientas, ejecución, navegación ni secretos. Las salidas se consideran no confiables y se validan antes de puntuar. Detectores de frases son solo alarmas; no demuestran inmunidad a prompt injection. Pruebas adversariales, revisión de backend y aislamiento del proveedor son obligatorios antes de pilotar.

## Bandeja y correcciones
Bandeja docente filtra pendientes, estados A/B/C, reclamaciones y control de calidad. Una evaluación publicada ajustada exige motivo; se conserva el registro anterior con previousReviewId, revisor, snapshot y vínculo al assessment. Las reclamaciones reabren revisión y no cambian notas por sí solas. Los estudiantes ven únicamente evaluaciones manuales publicadas de su propia entrega. El proveedor no puede publicar ni elegir destinatarios.

## Evaluación formativa
Endpoint de servidor sobre revisión guardada para módulos 1–4; no se acepta documento/nota libre desde el cliente. M1 comprueba síntesis y obligaciones; M2 fuentes/hechos; M3 estructura y justificación del árbol; M4 medidas, informe y límites. Devuelve orientación determinística por el momento, con `grade:null`, marcada como formativa. Nunca se agrega al total final ni se envía a Moodle. Adaptación técnica por IA de actividades formativas es posterior.

## Calibración y autorización futura
Dataset privado, versionado, con varias investigaciones y alternativas válidas, casos parciales e incorrectos, distintos niveles de desempeño y redacciones. Al menos dos especialistas independientes y adjudicación de desacuerdos; preservar separación entre conjunto de desarrollo y validación retenida. Los fixtures de software NO son ese dataset ni acreditan calidad técnica de una investigación.

Se prepararon tres candidatos privados en `.aula-dev/calibration-candidates.json` del entorno local: consistente/prudente, parcial y técnicamente cuestionable. No están versionados, no se sirven por HTTP y no se incluyen en archivos de distribución. Son borradores que deben valorar especialistas; no tienen puntuaciones humanas y no constituyen una solución acreditada ni una calibración satisfactoria. No sobrescribirlos al continuar la revisión.

Medir por criterio y total: MAE, RMSE, sesgo firmado, porcentaje dentro de tolerancia y errores favorables/desfavorables cerca del aprobado; acuerdo entre especialistas (kappa ponderada o ICC según diseño), discrepancias por redacción/idioma/nivel y tasa de derivación docente, resolución de reclamaciones, alternativas penalizadas y fallos de servicio. El módulo implementa MAE/RMSE/sesgo/cobertura/estratos/alternativas; kappa/ICC, intervalos y métricas de clasificación requieren dataset y análisis posteriores.

Fijar tolerancias y tamaño de validación mediante resultados observados y consecuencias pedagógicas, no porcentajes de confianza autorreportados por un LLM. Dos respuestas concordantes pueden compartir un error: la doble verificación no sustituye calibración externa. Comparar alternativas sin imponer un único árbol. Establecer frecuencia de muestreo aleatorio, supervisión de deriva y condiciones de suspensión.

El motor admite un artefacto de calibración confiable de servidor con versiones/proveedor/modelo, digest del dataset, aprobador, vigencia, cobertura de alternativas/doble valoración, errores observados, tolerancia de concordancia y tasa QA. Su existencia no autoriza publicar: en el código actual todas las propuestas conservan published=false, finalGrade=null y agsEligible=false. El artefacto de tests es explícitamente ficticio.

Para habilitar futura publicación automática: resultados satisfactorios en conjunto retenido, aprobación expresa del administrador y una política nueva de servidor con alcance curso/actividad/caso/versiones, umbrales documentados, fecha, muestreo, reversión y suspensión. Implementar y probar esa política en un incremento separado; nunca habilitarla desde parámetros del alumno o una respuesta IA. Durante piloto pueden validarse lotes de propuestas con auditoría según protocolo aprobado; la UI actual valida excepciones una por una, no existe aún una acción masiva de publicación.

## AGS, escala y operaciones futuras
Solo una nota definitiva autorizada genera una outbox transaccional única por entrega + versión de evaluación/publicación + lineitem. No mandar propuestas; serializar correcciones, reintentos y deduplicación para que una versión vieja no pise otra. Incorporar todas las versiones y snapshot en auditoría. El presente incremento no crea outbox, token OAuth ni envío a Moodle.

Para 50–200 investigaciones: pasar del archivo de desarrollo a cola durable de backend, workers con concurrencia limitada, locks/idempotencia, presupuesto por curso y alumno, revisión de sesiones/ámbito al publicar y panel de progreso. El motor está separado de la UI; la persistencia actual es un único proceso local y no es una solución distribuida. Antes de externalizar datos se requieren garantías y autorización según `evaluation-costs-risks.md`.
