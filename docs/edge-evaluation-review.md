# MAC Aula: candidato Edge para revisión

Fecha: 2026-11-01. Rama: `feat/mac-aula-edge-review`. No desplegado; SQL no aplicado; sin publicación de notas ni llamadas reales a Gemini.

## Arquitectura comprobada

`aula/` contiene el corrector existente, el caso simulado del mezclador, rúbrica 2.0.0 (20/15/35/20/10) y el adaptador Gemini. Su servidor Node es un laboratorio con identidades simuladas. No existe un lanzamiento OIDC/LTI operativo, registro Moodle ni envío AGS en este repositorio.

La inspección de solo lectura del proyecto Supabase conectado encontró `moodle-admin`, `moodle-evaluation-v2`, `gemini-h5p` y `gemini-exe`. El corrector general de Moodle usa REST de tareas y calificación manual; los otros dos servicios generan contenidos. Ninguno constituye la integración académica de MAC Aula. No se modificaron estos servicios, sus datos ni sus secretos. El sitio público movidasst.org permite identificar el curso, pero no comprobar versión instalada, configuración administrativa ni registros LTI. No se dispone del código/configuración privada de Moodle.

## Implementación

`supabase/functions/mac-aula-evaluate/index.ts` envuelve el motor de `aula/evaluation/`; no lo duplica. Deno comprueba sus tipos y ejecuta pruebas del límite HTTP. La función lee `GEMINI_API_KEY` mediante `Deno.env.get`, exclusivamente en servidor. El adaptador mantiene modelo/revisión fijos, salida estructurada y cálculo de puntos por servidor. Cambiar versión exige recalibrar.

El endpoint acepta POST JSON con `submissionId`, nunca expedientes arbitrarios, roles, cursos o notas del navegador. Admite acciones `evaluate`, `history` y `review`. Requiere una sesión académica opaca de 256 bits emitida por un futuro backend después de validar el lanzamiento LTI; guarda solo su hash. Un id_token Moodle, un JWT Supabase o una identidad declarada no sustituyen esa sesión. `verify_jwt=false` delega en esta autenticación explícita: no implica acceso anónimo. No hay emisor de sesiones de producción en este incremento; por eso no está listo para habilitarse.

El borrador SQL privado crea sesiones, entregas, evaluaciones, intentos, revisiones y presupuesto diario en `mac_aula`. RLS restringe propietario/docente y plataforma, deployment, curso y actividad. El worker no puede insertar sesiones o entregas y rechaza credenciales superuser, BYPASSRLS o propietarias de tablas. No usa service_role ni tablas profesionales. Un futuro backend confiable debe persistir la entrega inmutable y emitir la sesión después de validar Moodle.

Las solicitudes duplicadas comparten una evaluación por entrega/hash/versiones. Un intento durable precede a la llamada externa; lease y bloqueo transaccional impiden repetir trabajo. Un worker interrumpido deja la corrección pendiente, sin reintento automático. El presupuesto persistente reserva hasta diez evaluaciones diarias en todo el esquema, cada una con hasta cuatro intentos; los límites adicionales del adaptador siguen vigentes por instancia. No es una garantía financiera: mantener proyecto Google sin facturación y datos ficticios.

Sin clave, cuota, modelo disponible o conexión, se conservan reglas y feedback determinísticos, intento e historia; estado `pending_correction`, sin nota inventada. Los resultados válidos son propuestas; la revisión docente agrega versiones justificadas e idempotentes. Todas las respuestas mantienen `published=false`, `agsEligible=false` y ninguna nota definitiva. No existe llamada de escritura a Moodle. Un cero propuesto por una respuesta técnica válida se distingue de un fallo de servicio.

## Configuración de desarrollo futura

La clave que indicas ya almacenada permanece en Supabase Dashboard → proyecto correspondiente → Edge Functions → Secrets → `GEMINI_API_KEY`. No hace falta copiarla al chat, al navegador ni a GitHub. No se recuperó ni comprobó su valor. Los Secrets pertenecen al proyecto: confirmar el proyecto elegido antes de desplegar; el Node local no puede leerlos.

La función candidata necesita, en ese mismo entorno privado:

- `MAC_AULA_EDGE_ENABLED=1`, solo después de completar identidad y staging; ausente devuelve 503.
- `MAC_AULA_DATABASE_URL`: conexión SSL con login dedicado NO SUPERUSER/NOBYPASSRLS y miembro de `mac_aula_worker`; nunca la conexión administrativa predeterminada.
- `MAC_AULA_ALLOWED_ORIGIN`: origen académico exacto aprobado.
- `GEMINI_ENABLED=1`, `GEMINI_FREE_TIER_CONFIRMED=1`, `GEMINI_FICTITIOUS_ONLY=1`, modelo/revisión y límites descritos en `gemini-setup.md`.

`supabase/sql/mac-aula-evaluation-review.sql` es un borrador de revisión, no una migración aplicada. Probar grants, pool, transacciones, backup y restauración en staging antes de promoverlo. Las pruebas locales no comprueban el empaquetado/despliegue Supabase ni el pool remoto. No ejecutar este SQL en el proyecto de producción para completar una prueba.

## Falta para conectar Moodle

Obtener configuración real de herramienta externa: issuer, client ID, deployment ID, URL OIDC de autorización, JWKS, URLs de lanzamiento/retorno y origen aprobado; confirmar curso/contexto y recurso autorizados. Implementar validación de firma/claims/state/nonce con consumo atómico y backend de sesiones/entregas. No crear un plugin de cuestionarios ni reutilizar el corrector general. Faltan también staging autorizado, login restringido y prueba de extremo a extremo con Moodle. AGS, calibración técnica por especialistas, aprobación de publicación y alineación validada con el Sistema de Calidad Pedagógica siguen pendientes; no se recibió ese documento normativo completo.

## Evidencia local

`pnpm install --frozen-lockfile`, luego `node --test tests/*.test.cjs`: 59 aprobadas, cero fallidas, una prueba real Gemini omitida. Siete pruebas nuevas usan PostgreSQL embebido real (PGlite) para permisos/RLS, persistencia, deduplicación, revisiones, fallos, respuestas simuladas correctas/parciales/incorrectas, interrupción y presupuesto. No certifican concurrencia entre conexiones remotas.

`deno check --node-modules-dir=none --frozen --lock=supabase/deno.lock supabase/functions/mac-aula-evaluate/index.ts` aprobado; `deno test --node-modules-dir=none tests/edge-runtime.test.ts`: dos aprobadas. Navegador Aula y Profesional aprobados; PDF de 19 y 23 páginas verificados. La prueba real requiere opt-in y nunca se ejecutó usando el secreto remoto.
