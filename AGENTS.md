# MAC Profesional y MAC Aula

## Objetivo y alcance
Integrar MAC Aula con Moodle mediante LTI 1.3 sin perjudicar MAC Profesional ni exigir a estudiantes credenciales de La Movida. Primera entrega: auditoría, arquitectura y pruebas de base. **LTI todavía no está implementado.** Véanse `docs/audit-phase1.md`, `docs/lti-architecture.md`, `docs/lti-setup-moodle.md` y `docs/testing.md`.

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

AGS solo desde backend, OAuth2 con private_key_jwt, scopes mínimos, endpoint permitido y nota confirmada por docente sobre una entrega inmutable. No calificar favorablemente por llenar campos. Deep Linking es posterior y requiere validación y respuesta firmada; no anunciarlo antes.

## Pruebas y despliegue
`node --test tests/*.test.cjs`; pruebas navegador y PDF según `docs/testing.md`. Verificar también SQL únicamente en entorno autorizado de pruebas. Requerir aislamiento entre estudiantes, cursos, actividades y docentes; replay, expiración, revocación, SSRF, CSRF, XSS, concurrencia, móvil y árbol completo legible en PDF.

Trabajar en rama independiente. No cambiar producción, ejecutar SQL remoto, publicar Pages, desplegar funciones ni fusionar sin pruebas y aprobación explícita del usuario. No modificar ni eliminar tablas profesionales. Migraciones académicas aditivas, reversibles cuando sea posible, con respaldo y prueba de rollback. No borrar datos para solucionar un error.

## Decisiones y pendientes
Arquitectura propuesta, no sistema operativo: ver ADR dentro de `docs/lti-architecture.md`. Obtener registro real Moodle (issuer/client ID/deployment/endpoints), actividad/curso autorizados, staging Supabase y origen backend. Confirmar versiones reales Moodle/Moove y logo con administrador. Definir conservación, límites y responsables. Verificar seguridad desplegada profesional sin revelar credenciales. Registrar resultados reales y limitaciones en `docs/testing.md`; no inventar pruebas de extremo a extremo.
