# Fase 2 — experiencia académica implementada

Rama de desarrollo `feat/mac-aula-phase2`, basada en la fase 1 aprobada. Esta entrega implementa el laboratorio local; no configura ni despliega Supabase o Moodle. Ver `aula/README.md` para abrirlo y probarlo.

**Ampliación posterior:** rama `feat/mac-aula-evaluation`, con motor de evaluación determinístico, contrato de IA sin proveedor conectado, rúbrica de indicadores 2.0.0, orientación formativa, feedback y bandeja por excepciones. `evaluation-architecture.md` y `evaluation-costs-risks.md` sustituyen la revisión manual como objetivo final; los resultados de esta página describen la base de fase 2. Los nuevos tests se documentan en `testing.md`. El almacén local se amplía de versión 1 a 2 conservando expedientes y devoluciones; se añade historial de evaluaciones. No hay migración Supabase.

## Implementado
1. Estructura `aula/` independiente de las entradas y módulos profesionales. Cliente sin credenciales La Movida, sin analytics, sin service_role y sin acceso al almacenamiento profesional.
2. Contratos estrictos para casos/versiones/fuentes, expedientes, evidencias, cronología, hechos, árboles/relaciones/justificaciones, medidas, revisiones, entregas y rúbrica. Rechazan campos desconocidos, tamaños/enum inválidos, IDs duplicados, referencias rotas y ciclos. Un hecho del árbol requiere evidencia clasificada como comprobada y estado verificado; la calificación de calidad sigue siendo docente.
3. Caso simulado del mezclador MX-04 con ocho fuentes: orden, eventos, dos declaraciones, ficha de imagen posterior, procedimiento, mantenimiento y atención inicial. Información discrepante y vacíos; no una lista de respuestas. Sin solucionario ni árbol resuelto. Ficha textual de fotografía, no recurso fotográfico completo.
4. Cinco etapas guiadas: caso, evidencias/hechos, árbol, prevención, informe. Cada etapa indica tarea, insumos, proceso, producto, evaluación y próximo paso. Ejemplo separado y pregunta de recuperación con explicación. Navegación responsiva, foco y etiquetas; diagrama con zoom, desplazamiento y lista causal textual completa.
5. Guardado explícito en servidor local, recuperación, historial de revisiones, conflicto optimista, descarga de borrador JSON y entrega inmutable/idempotente por revisión. No se afirma guardado remoto en nube. No se borra almacenamiento ilegible para recomenzar.
6. Panel docente de su ámbito: expedientes, snapshots, árbol, rúbrica 20/15/35/20/10, observaciones y referencias. Puntaje calculado solo sobre revisión completa; borrador docente oculto, publicación explícita al estudiante, sin envío Moodle. Reevaluación mediante nuevo intento conserva devoluciones previas.
7. API de desarrollo con autorización por actor/plataforma/deployment/curso/actividad, sesión opaca en memoria, expiración/logout, CSRF y Origin/Host; recursos estáticos limitados. Las personas simuladas se seleccionan libremente solo en loopback y con habilitación explícita. Esto no sustituye LTI ni constituye autenticación productiva.
8. Adaptador al contrato MAC v2 reutiliza semántica de hechos/evidencias/medidas y formato Cytoscape; test de compatibilidad ejecuta el validador profesional existente. No se ha extraído ni compartido todavía el renderizador profesional de PDF/Excel o su editor visual: hacerlo ahora habría alterado el monolito y el acceso profesional. El editor SVG académico es independiente. Esta separación se conserva hasta contar con pruebas de equivalencia suficientes para extraer más componentes.

## Persistencia y contrato del entorno
Un solo proceso Node, archivo `.aula-dev/store.json` en claro y excluido de git, cola de escrituras y reemplazo de archivo. No emplear datos reales ni exponer servidor. Los snapshots y respuestas se clonan para impedir modificación por referencia desde la aplicación. Se conservan autor/ámbito/fecha/objeto en auditoría local; no tokens ni texto del expediente. El proceso no implementa retención ni capacidad de múltiples escritores: estos aspectos corresponden al backend académico real.

Los endpoints aceptan documentos de investigación, revisión esperada y rúbrica; los campos de propietario/curso/rol nunca se toman del guardado del cliente. El servidor los deriva de la sesión de prueba. La elección libre de personas es exclusivamente una herramienta de desarrollo y deberá desaparecer al conectar Moodle. Validar autorización bajo estas identidades no acredita seguridad de identidad externa.

## Pruebas ejecutadas
Resultados locales: 27/27 pruebas unitarias/API aprobadas (11 nuevas de Aula y 16 de regresión profesional). Recorrido Aula en Edge headless aprobado, sin errores JavaScript y sin desbordamiento horizontal de página a 360/768/1366 px. Se comprobó también zoom del árbol, edición, entrega y devolución docente. Capturas inspeccionadas; corregida una barra que tapaba contenido durante desplazamiento.

Las regresiones profesionales de navegador también pasaron, y PDF comprobó 19 páginas en demo y 23 en la variante larga. Herramientas: Node 24.22.1, Playwright 1.62.1, pdfjs-dist 5.6.205 y @napi-rs/canvas 0.1.100. El primer intento dentro del sandbox recibió denegaciones locales de red/renombrado; las pruebas completas fuera de ese aislamiento pasaron. No se degradó el guardado para eludir esa restricción.

Matriz automatizada incorporada:
- Modelos: fuentes, versiones, referencias, ciclos, enums, IDs, overposting y tamaños.
- Guardado: reapertura del archivo, conflicto de dos guardados de misma revisión, historial y copias defensivas.
- Entregas: productos mínimos, idempotencia y preservación ante posteriores cambios.
- Ámbitos: estudiante A/B, otro curso, otra actividad, otro deployment; lectura, escritura, revisiones, entrega y evaluación ajenas denegadas.
- Revisión: puntos no finitos/fuera de rango, observaciones/referencias faltantes, borrador oculto, publicación y conservación de devolución.
- HTTP: acceso sin sesión, sesión vencida/logout, CSRF/Origin, inyección de rol/propietario, servidor deshabilitado y archivos privados no servidos.
- Reutilización: adaptador compatible con validador profesional sin cambios.
- Navegador: completar las cinco etapas, grafo/zoom, guardar/recargar, entregar, evaluar, ocultar borrador docente, publicar, vista alumno B, texto XSS y anchos 360/768/1366.

Las pruebas usan textos genéricos de estructura que no constituyen solución del caso. Capturas y almacenamiento de prueba quedan excluidos de git. No se ha aplicado ninguna migración ni validado RLS real.

## Pendiente
- LTI/OIDC/JWT/JWKS, sesiones productivas, registro de actividad, revocación/roles reales, AGS y Deep Linking.
- Supabase académico de staging, esquema/RLS/grants, adjuntos privados, concurrencia multisesión real, conservación/restauración y administración de casos.
- Solucionario privado y validación técnica/pedagógica del caso por especialistas.
- PDF y Excel académicos completos, exportación gráfica sin recorte, importación y mayor extracción del monolito profesional.
- Fotos simuladas definitivas, referencias normativas del curso verificadas y confirmación del logo horizontal.
- Auditoría de accesibilidad con lector real, navegación táctil en dispositivos físicos y pruebas de navegadores con cookies restringidas. Las comprobaciones de ancho/foco no equivalen a certificación WCAG.

## Cambios y reversión
Código nuevo en `aula/`, tests nuevos de dominio/API/navegador, documentación y reglas para excluir el almacén. CI amplía cobertura para Aula. Ningún cambio en `auth.js`, `v2.js`, `index.html`, `v2.html`, CSS profesional, SQL o credenciales. Revertir este incremento retira únicamente esos módulos; antes de retirarlos, exportar el archivo simulado si se desea conservar trabajo de desarrollo. No requiere rollback de base de datos.

No publicar servidor de desarrollo ni cliente Aula mediante Pages. La rama de desarrollo no se fusiona ni se despliega como parte de esta tarea.
