# MAC Profesional y MAC Aula

## Objetivo y alcance
Integrar MAC Aula con Moodle mediante LTI 1.3 sin perjudicar MAC Profesional ni exigir a estudiantes credenciales de La Movida. Fase 1 aprobada; fase 2 incorpora un laboratorio local independiente en `aula/`. **Existe un backend LTI de staging probado localmente; no está desplegado ni conectado a Moodle.** Véanse `docs/audit-phase1.md`, `docs/lti-architecture.md`, `docs/lti-setup-moodle.md`, `docs/testing.md` y `docs/phase2-implementation.md`.

## Arquitectura comprobada
- `index.html` y `v2.html` cargan `auth.js`, `v2.js`, `auth.css`, `v2.css`. GitHub Pages sirve el cliente; `CNAME` identifica mac.movidasst.com.
- `auth.js` usa RPC Supabase `mac_login`, `mac_resume`, `mac_logout`, token opaco en sessionStorage, vencimiento y revalidación cada minuto. No es Supabase Auth.
- `server/mac-security.sql` documenta sesiones, claves y límites de intentos en esquema `private`; no asumir que está aplicado en producción sin verificarlo con el administrador.
- `v2.js` es una IIFE que reúne estado, UI, editor Cytoscape, demo, Excel y PDF. AES-GCM guarda un expediente activo local por scope; clave en memoria entregada por servidor. No hay sincronización remota de expedientes.
- `script.js` y `style.css` son legado no referenciado por las dos entradas activas. No reutilizar sus rutas de IA ni sus inserciones HTML sin auditoría específica.

## Arquitectura propuesta
Entrada Aula independiente; backend OIDC/JWT, sesiones académicas y AGS; Postgres/Supabase para persistencia. Preferencia por proyecto de staging y posteriormente proyecto académico separado. Evaluar Edge Functions detrás de un origen académico con proxy propio para cookies y cabeceras; demostrar viabilidad antes de fijar hosting. GitHub Pages solo puede servir recursos públicos. No confiar en roles, usuario o curso enviados por el cliente.

## Preservar MAC Profesional
No sustituir `auth.js`, RPC actuales, claves, prefijos de almacenamiento, demo o formatos Excel/PDF. No enlazar identidades Aula con `integrantes`. No migrar expedientes locales a Aula automáticamente. Mantener nueva, edición, borrado, demo, árbol, evidencias, análisis, medidas y exportaciones. Actualmente nueva reemplaza el expediente activo tras confirmación; no afirmar que existe biblioteca profesional remota.

Extraer componentes de `v2.js` gradualmente con pruebas de equivalencia: esquema del expediente, validadores, Excel, informe, árbol. La API `MACApp.start` exige claves profesionales: **no usarla para simular acceso LTI**. El solucionario académico jamás va en assets, repositorio público ni respuesta al estudiante.

## Identidad y pedagogía
Colores: #007B85, #00205B, #70AD47, #FFB600, #F8FAFC. Mantener exactamente el logo oficial existente: https://raw.githubusercontent.com/movidasst/aplicaciones/main/logo-oficial-movida-sst-plus.png . Comprobar con administrador que corresponde al horizontal usado en el banner; no regenerarlo.

Cinco etapas Aula y cuatro módulos del curso: caso y obligaciones (M1), evidencias/cronología (M2), árbol y justificación (M3), prevención e informe (M4). Cada etapa explicita tarea, insumos, procesamiento, producto, evaluación y siguiente paso. Ejemplo resuelto separado del caso evaluado, práctica guiada y autonomía; recuperación activa y feedback explicativo. Mobile-first, teclado, foco, etiquetas, errores comprensibles y alternativa textual al gráfico.

## Seguridad y LTI obligatorios
Validar firma con JWKS de registro confiable, issuer, aud/azp, deployment, nonce, state, exp/iat/nbf, versión/tipo, contexto y actividad autorizada. State/nonce aleatorios de un uso y consumo atómico con TTL; vincular intento al navegador. Rechazar `none`, algoritmos no autorizados y URLs de claves recibidas del token. Sesiones académicas revocables; autorización en cada operación por usuario/curso/actividad. No autorizar por correo, cédula o nombre. No publicar claves privadas ni service_role. RLS y grants restrictivos; no usar user_metadata para permisos; no confundir un JWT Moodle con un token Supabase Auth. Auditoría sin tokens ni contenido sensible. Soluciones y evaluaciones separadas del borrador del estudiante.

AGS solo desde backend, OAuth2 con private_key_jwt, scopes mínimos, endpoint permitido y nota definitiva autorizada sobre una entrega inmutable. En piloto, las propuestas automáticas no se publican definitivamente sin el protocolo de validación. Publicación automática futura solo tras calibración satisfactoria y aprobación expresa del administrador. No calificar favorablemente por llenar campos. Deep Linking es posterior y requiere validación y respuesta firmada; no anunciarlo antes.

## Requisito central: evaluación automática por competencias
Sustituye la revisión manual de todas las investigaciones como modelo objetivo. Combinar reglas determinísticas, evaluación técnica IA, rúbrica de 100 puntos (20/15/35/20/10), feedback específico y revisión por excepciones. Referencia normativa del diseño: `docs/evaluation-architecture.md` y `docs/evaluation-costs-risks.md`; prevalecen sobre descripciones anteriores de evaluación exclusivamente manual.

Motor independiente en `aula/evaluation/`, ejecutado solo en backend. Rúbrica pública 2.0.0 con indicadores y descriptores; no comparar literalmente con un solo árbol ni penalizar alternativas defendibles. La integridad/completitud no da puntos. Validar nivel/indicador/referencias y calcular total en servidor. Conservar versiones, snapshot, proveedor/modelo, uso y justificaciones. Proyectar feedback público con whitelist; no exponer razones libres IA, solucionarios ni notas preliminares no publicadas.

Estados: automática validada (propuesta piloto), requiere revisión, incompleta/no válida. Timeout, presupuesto o error IA jamás equivalen a cero. Alarmas léxicas no prueban culpa ni ataque. La confianza declarada por un modelo no es probabilidad calibrada. Exigir dataset privado valorado por especialistas, alternativas, concordancia por criterio, sesgo, umbrales observados, muestreo aleatorio y auditoría. Cambiar modelo/prompt/rúbrica exige recalibrar.

El usuario autorizó Gemini como proveedor opcional del backend para pruebas ficticias con su clave. Configuración e instrucciones exactas en `docs/gemini-setup.md`. Usar exclusivamente GEMINI_API_KEY del entorno privado, GEMINI_ENABLED y confirmaciones de proyecto gratuito/datos ficticios; nunca pedir la clave en chat. No activar facturación, servicios pagados ni producción. Modelo inicial estable revisado: gemini-3.8-flash; otros IDs requieren revisión de estabilidad/contrato y recalibración. No hay cambio automático de modelo y se rechazan revisiones de respuesta distintas de la configurada. La prueba real es opt-in; sin clave se omite. Los tests corrientes no invocan Google.

Gemini es opcional; cuota, conexión y fallos nunca producen un cero ni impiden el trabajo sin IA. Conservar propuestas parciales e identificar criterios no valorables, sin convertir completitud en calidad. La clave y el proveedor no se sirven por HTTP; no incluir .env.aula ni candidatos privados en git. La calibración real sigue pendiente. Todas las propuestas del motor conservan finalGrade=null, published=false y agsEligible=false. Preparar cola durable/AGS y política de publicación futura en incrementos separados.

La bandeja docente admite reclamaciones y ajustes justificados; conservar historia de versiones y permisos por ámbito. Evaluación formativa de M1–M4 es orientación, nunca nota final. Fixtures de software genéricos no son solucionarios ni investigaciones acreditadas por especialistas; no afirmar fiabilidad por pasar esos tests.

## Pruebas y despliegue
`node --test tests/*.test.cjs`; pruebas navegador y PDF según `docs/testing.md`. Verificar también SQL únicamente en entorno autorizado de pruebas. Requerir aislamiento entre estudiantes, cursos, actividades y docentes; replay, expiración, revocación, SSRF, CSRF, XSS, concurrencia, móvil y árbol completo legible en PDF.

Trabajar en rama independiente. No cambiar producción, ejecutar SQL remoto, publicar Pages, desplegar funciones ni fusionar sin pruebas y aprobación explícita del usuario. No modificar ni eliminar tablas profesionales. Migraciones académicas aditivas, reversibles cuando sea posible, con respaldo y prueba de rollback. No borrar datos para solucionar un error.

## Decisiones y pendientes
El laboratorio de fase 2 usa Node 22+, solo loopback, `MAC_AULA_DEV=1`, personas simuladas seleccionables y archivo `.aula-dev/store.json` excluido de git. No es autenticación ni almacenamiento de producción. No desplegar `aula/dev/server.mjs`, servir directorios arbitrarios ni introducir solucionarios en fixtures. Ver `aula/README.md` para arranque y pruebas. El adaptador MAC v2 se prueba con el validador profesional; PDF/Excel Aula y extracción de su renderizador están pendientes.

Arquitectura propuesta, no sistema operativo: ver ADR dentro de `docs/lti-architecture.md`. Obtener registro real Moodle (issuer/client ID/deployment/endpoints), actividad/curso autorizados, staging Supabase y origen backend. Confirmar versiones reales Moodle/Moove y logo con administrador. Definir conservación, límites y responsables. Verificar seguridad desplegada profesional sin revelar credenciales. Registrar resultados reales y limitaciones en `docs/testing.md`; no inventar pruebas de extremo a extremo.

## Candidato Edge en revisión
Consultar docs/edge-evaluation-review.md. Reutilizar aula/evaluation mediante aula/edge; no modificar moodle-admin ni moodle-evaluation-v2. No desplegar ni aplicar supabase/sql/mac-aula-evaluation-review.sql sin autorización. El endpoint exige sesiones académicas verificadas: no crear un bypass con identidades simuladas o JWT Moodle sin validar. Mantener MAC_AULA_EDGE_ENABLED desactivado hasta completar lanzamiento LTI, staging, entregas inmutables y permisos. Pruebas: pnpm install --frozen-lockfile antes de node --test; Deno check/test y regresiones de navegador/PDF. Los tests PostgreSQL usan PGlite; no conectan producción. Los Secrets remotos no se recuperan ni imprimen. Revisiones docentes también son propuestas, sin publicación automática ni AGS.

## Piloto LTI y reintentos
Estado vigente: docs/lti-pilot-development.md. Backend de lanzamiento en aula/lti y función mac-aula-academic; mantener habilitación a cero, publicar notas desactivado y sin AGS. Solo staging académico aislado: nunca Directorio/MAC Profesional. Configuración explícita, login restringido, RLS, sesiones opacas/cookie y CSRF. Reintentos docentes con clave de idempotencia, espera, máximo tres ejecuciones, reserva global y modelo fijo. Cupo máximo 50 estudiantes no significa 50 correcciones gratuitas al día. Todas las herramientas se instalan exclusivamente con pnpm install --frozen-lockfile; no mezclar npm install ni npx. Deno usa supabase/deno.lock. No afirmar conexión de la UI completa ni prueba con Moodle real hasta ejecutarlas.
