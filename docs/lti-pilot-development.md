# Piloto LTI de MAC Aula — preparación de desarrollo

Rama `feat/mac-aula-lti-pilot`, 2026-11-01. Sin despliegue, SQL remoto, alumnos reales, consumo Gemini ni publicación AGS. MAC Profesional conserva sus archivos y servicios.

## CI reproducible

El job 125000388055 de la ejecución 41357422649 aprobó Node y Deno, pero falló al ejecutar `npm install --no-save`: npm intentó resolver `@electric-sql/pg-protocol@0.0.4` y obtuvo 404. El workflow mezclaba npm con un árbol previamente instalado por pnpm. No se añade una dependencia fantasma ni se omiten pruebas: PGlite, Playwright, PDF.js, canvas y JOSE quedan fijados en `package.json` y `pnpm-lock.yaml`. Hay una sola instalación `pnpm install --frozen-lockfile`; Playwright se ejecuta con `pnpm exec`, sin resolver otra versión mediante npx. Deno conserva su propio lockfile para postgres y JOSE. La instalación de Chromium incluye dependencias Linux y el mismo job ejecuta Node, Deno, ambos navegadores y PDF.

## Reintentos de corrección

La acción POST `retry` del evaluador recibe exactamente `action`, `submissionId`, `evaluationId`, `retryKey` (UUID de idempotencia). Solo un docente del ámbito puede solicitarla. El cliente debe conservar la misma clave cuando repita una solicitud cuyo resultado desconoce. El historial devuelve intentos, resultados anteriores, número de ejecuciones y próxima fecha admisible; estudiantes no reciben estos datos privados.

Reintentos posibles: red, timeout, servicio/5xx, ocupado, cuota, presupuesto diario e interrupción del worker. Espera normal de cinco minutos; cuota/presupuesto hasta el siguiente día UTC. Una interrupción detectada tras vencer el lease se registra primero y espera un minuto adicional. Máximo tres ejecuciones por evaluación, incluida la inicial. Una petición repetida con la misma clave no cobra otra reserva ni llama al modelo. Modelo, revisión, evaluador y snapshot deben coincidir; no se convierte un cambio de modelo en reintento.

Clave ausente, permisos rechazados, modelo retirado o cambiado y salida inválida requieren corregir configuración o revisión docente; no se repiten a ciegas. Una evaluación ya propuesta/revisada tampoco se vuelve a ejecutar. El circuito de cuota del adaptador puede abrirse de nuevo al cambiar de día UTC; los circuitos de credenciales/modelo siguen bloqueados hasta resolver configuración. No hay cron desplegado ni reintentos de fondo ocultos: el docente solicita una recuperación controlada, no vuelve a calificar manualmente todo el expediente.

La reserva, el lease y la deduplicación se transaccionan con un bloqueo global de capacidad antes del bloqueo de cada evaluación. Se conservan resultados por intento. Nunca se devuelve cero por un fallo técnico. Una respuesta tardía de un lease anterior no puede sobrescribir otra ejecución. No se garantiza ejecución exactamente una vez en Google ante pérdida de conexión: los reintentos son explícitos y limitados, y se reserva el consumo incierto sin reembolsarlo.

## Capacidad de hasta 50 estudiantes

| Variable privada del backend | Valor inicial | Máximo permitido |
|---|---:|---:|
| MAC_AULA_MAX_STUDENTS | 50 | 50 |
| MAC_AULA_DAILY_EVALUATIONS | 10 | 50 |
| MAC_AULA_DAILY_CALLS | 20 | 200 |
| MAC_AULA_DAILY_RESERVED_TOKENS | 400000 | 4000000 |
| MAC_AULA_MAX_CONCURRENT | 1 | 2 |
| MAC_AULA_MAX_RUNS | 3 | 3 |

Las reservas son durables y globales, incluidas las recuperaciones. Cada ejecución reserva conservadoramente cuatro intentos y 80000 tokens del presupuesto del motor; no se liberan por timeout o fallo. El adaptador también tiene límites propios de peticiones/tokens por instancia y límites de tamaño/salida. El menor límite decide. Con los valores iniciales caben como máximo cinco ejecuciones diarias, no diez: veinte llamadas reservadas/cuatro y 400000/80000. Cincuenta estudiantes pueden guardar y entregar; la corrección se distribuye entre días. Un expediente correcto suele requerir dos verificaciones, pero no se presupone que todos los transportes tengan éxito.

Permitir 50 ejecuciones en un día exigiría aprobar cuotas gratuitas verificadas para ese modelo/proyecto y ajustar expresamente los límites globales y los del adaptador. No se han aumentado automáticamente ni habilitado pagos. Los contadores son reservas de aplicación, no una certificación de facturación ni una medición exacta anticipada de tokens del proveedor. No se puede garantizar coste cero usando una clave de un proyecto ya facturado: el piloto debe usar proyecto Google sin facturación, confirmación `GEMINI_FREE_TIER_CONFIRMED=1` y expedientes ficticios. Al agotar presupuesto, se mantiene pendiente y revisión docente disponible.

## Backend LTI implementado y probado localmente

`aula/lti/` implementa registro configurado en servidor, inicio OIDC, validación JWT mediante JOSE 6.1.3, sesiones, CSRF y persistencia. `mac-aula-academic` es el entrypoint Edge de staging; comparte `aula/evaluation/` y `aula/edge/`, sin otro corrector ni servicios Moodle generales.

Rutas bajo `toolBaseUrl`:

| Ruta | Comportamiento |
|---|---|
| GET/POST /login | Registro/target exactos, state/nonce aleatorios, vínculo mediante cookie Secure/HttpOnly/SameSite=None y TTL 5 minutos; redirección OIDC form_post |
| POST /launch | RS256/kid/JWKS del Moodle registrado, issuer/aud/azp/sub/tiempos/nonce, versión/tipo LTI, deployment/context/resource y roles exactos; consumo atómico de state y sesión de 60 minutos |
| GET /registration, /jwks | Parámetros públicos de registro y únicamente claves públicas |
| GET /session | Identidad académica mínima, ámbito, caso ficticio y rúbrica; nunca clave ni token de sesión |
| GET/PUT /draft | Borrador propio, validación compartida, revisiones durables y conflicto 409 |
| POST /submit | Entrega completa, snapshot inmutable y deduplicación por investigación/revisión |
| GET /submissions | Entregas propias o ámbito docente |
| POST /evaluate | Fachada con cookie/CSRF al corrector existente; incluye history/review/retry |
| POST /logout | Revocación persistente y eliminación de cookies |
| GET /app | Confirmación mínima de sesión de staging; todavía no conecta el editor completo de cinco etapas a esta API |

Sesión en cookie `__Host-mac-aula`, HttpOnly/Secure/SameSite=Lax. Escrituras exigen Origin exacto y token CSRF ligado por hash a la sesión. Nueva ventana es el único contenedor preparado; iframe y cookies de terceros no se habilitan. Al relanzar se revocan sesiones anteriores del mismo actor/ámbito para actualizar rol; no hay reconciliación NRPS de cambios que Moodle no haya comunicado. TTL máximo una hora.

JWKS solo se obtiene del endpoint administrativo registrado en el mismo origen que Moodle, con timeout, tamaño máximo, caché y enfriamiento de recarga; se rechazan URLs/claves de cabecera, algoritmos alternativos, kid duplicado, roles ambiguos y actividades no autorizadas. Identidades se mapean por registro/deployment/sub sin correo, nombre ni Directorio. La capacidad limita estudiantes únicos; un docente no consume cupo. El rol `mac_aula_launch_worker` puede emitir sesiones y persistir entregas; el worker evaluador solo no puede. Ambos son restringidos y sin BYPASSRLS, con RLS y cero grants de navegador.

## Separación de staging y preparación automática

No se creó ni usó un proyecto remoto. Ambos entrypoints se niegan a operar salvo `MAC_AULA_ENVIRONMENT=staging`, referencia académica explícita y coincidencia entre `SUPABASE_URL`, referencia y host/usuario de conexión SSL. La referencia del Directorio está bloqueada explícitamente. Credenciales administrativas también son rechazadas por los repositorios. No hay fallback hacia conexiones del entorno profesional. Plantilla: `supabase/functions/.env.example`; ambas banderas de habilitación están a cero.

SQL de revisión en `supabase/sql/`: evaluación primero, LTI después, únicamente sobre base académica vacía aislada. No ejecutar sobre una instalación anterior ni producción: antes de un despliegue autorizado se generarán migraciones, backup y verificación del pool/RLS en staging real. PGlite ejecuta el SQL local con roles restringidos; no reemplaza pruebas de múltiples conexiones de Supabase.

El comando offline `node aula/lti/prepare-registration.mjs --base-url https://HOST_STAGING/RUTA_ACADEMICA` genera parámetros de Moodle, JWKS público y clave privada en `.aula-dev/lti-registration/`, excluido de Git; falla si ya existen archivos para evitar rotar claves por accidente. No imprime privados ni conecta servicios. La clave privada no se usa para enviar notas: AGS y Deep Linking siguen sin implementarse. No se generó un registro inventando un host real; cuando se autorice staging, Codex puede ejecutar la preparación y configurar los datos sin pedir que el usuario haga trabajo técnico manual.

El hosting/proxy HTTPS debe conservar form_post, cookies y cabeceras con el origen público configurado; comprobarlo en staging antes de registrar la herramienta. No se presupone que el dominio por defecto de Edge sirva HTML y cookies como necesita la aplicación. La UI completa sigue siendo el laboratorio Node probado; conectar su capa de datos y probar entrada real desde Moodle es un incremento pendiente explícito.

## Datos que faltan de Moodle

1. URL real del entorno de pruebas y versión instalada; acceso administrativo delegado para el registro, sin contraseñas en chat.
2. Platform ID/issuer exacto, client ID y deployment ID del registro LTI 1.3.
3. URL exacta de autorización OIDC y de JWKS de Moodle. Token endpoint se puede registrar para AGS futuro, sin solicitar scopes ni escribir notas ahora.
4. Context ID del curso y resource_link.id de la actividad, obtenidos de un lanzamiento firmado o registro administrativo fiable; IDs de URL no son equivalentes. Autorizar esa pareja explícitamente en `activities`.
5. Roles emitidos para estudiante y docente y elección de nueva ventana. Desactivar intercambio de nombres/correos y calificaciones automáticas.

Preparado para introducir en Moodle: URL de inicio OIDC `/login`, URI de retorno `/launch`, URL de herramienta `/app` y JWKS `/jwks`, todos bajo el origen/ruta académicos de staging aprobados. `registration.example.json` es una plantilla, no un registro operativo. No es necesario copiar una clave Gemini a Moodle. El secreto existente en el proyecto profesional no se lee ni se comparte: un proyecto de staging separado requerirá su propio Secret privado autorizado.

## Evidencia y límites

Pruebas locales: 67 Node aprobadas, una real Gemini omitida; tres Deno aprobadas y tipos de ambos entrypoints comprobados. Incluyen JWT RS256 reales de pruebas, claims/roles, vínculo navegador, state/nonce/replay, consumo concurrente, expiración, revocación, cupo, RLS, guardado, conflicto, snapshot, duplicados, reintentos y presupuesto. Navegadores Aula/Profesional y PDF de 19/23 páginas se ejecutan en CI con lockfiles. No hay validación del Moodle real, prueba Gemini real, calibración pedagógica ni despliegue remoto. La lista completa del Sistema de Calidad Pedagógica y la calibración con especialistas siguen siendo requisitos antes de publicar notas.

Fuentes: [LTI 1.3](https://www.imsglobal.org/spec/lti/v1p3/), [seguridad OIDC](https://www.imsglobal.org/spec/security/v1p0/), [Moodle 5.3 herramientas externas](https://docs.moodle.org/503/en/External_tool_settings), [JOSE](https://github.com/panva/jose), [Secrets Supabase](https://supabase.com/docs/guides/functions/secrets). Changelog Supabase revisado el 2026-11-01; sin cambios de plataforma aplicados.
