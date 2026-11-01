Estado actualizado: ver [lti-pilot-development.md](lti-pilot-development.md). El diseño siguiente es histórico; ahora existe backend LTI de staging probado localmente, sin despliegue ni conexión real. AGS, envío de notas y registro productivo siguen deshabilitados. No ejecutar los pasos históricos de publicación de calificaciones durante este piloto.

# Configuración Moodle — guía de preparación

No registrar herramienta de producción todavía: esta rama no implementa LTI. No usar mac.movidasst.com como URL de lanzamiento profesional ni sustituir su login.

## Datos necesarios y cómo obtenerlos
| Parámetro | Procedencia / acción del administrador |
|---|---|
| Moodle/Moove reales | Administración del sitio: información de versión y tema instalado; confirmar 5.3/5.3.1 indicados por usuario. |
| issuer (Platform ID), client ID, deployment ID | Detalles de registro de la herramienta LTI 1.3 en Moodle, después de crear herramienta de prueba. Copiar exactamente; no deducir del dominio. |
| Authorization, JWKS y token endpoint de Moodle | Mismos detalles de registro/configuración LTI. No construir rutas supuestas. |
| context.id y resource_link.id | Lanzamiento firmado válido en sandbox; captura administrativa sanitizada y autorización explícita del mapeo de actividad. No usar IDs de URL del navegador como equivalentes. |
| AGS scopes y lineitem | Claim de lanzamiento validado y configuración de aceptación de calificaciones en Moodle. |
| Origen público Aula y backend | Acordar con administrador DNS/TLS/proxy/hosting; obtener URLs desplegadas de login, launch y JWKS públicos de staging. |
| Supabase staging académico | Crear/seleccionar proyecto aislado; administrador provee referencia, región y acceso de desarrollo. Ninguna credencial en chat, docs o repositorio. |
| Clave privada herramienta / kid | Generar y custodiar en secretos del backend; publicar solo clave pública JWKS. Planificar rotación y respaldo. |
| Logo, retención y permisos | Confirmar archivo horizontal del banner, política de conservación, quién administra casos y quién evalúa cada actividad. |

## Registro de prueba cuando el backend esté listo
1. En entorno Moodle de pruebas, abrir gestión de herramientas externas (según permisos/idioma, en Administración del sitio o Curso > Más > Herramientas externas LTI). Seleccionar configuración manual LTI 1.3.
2. Introducir nombre MAC Aula, URL de herramienta/launch, URL de inicio OIDC y JWKS públicos reales del backend de staging; redirect URI exacto. No usar consumer key/shared secret de LTI 1.1. No habilitar Deep Linking hasta implementarlo.
3. Guardar y copiar detalles de registro de Moodle al backend por canal de administración. Activar solo deployment previsto, curso y actividad autorizados; habilitar intercambio de calificaciones requerido. Minimizar nombre/correo compartidos; sub basta para identidad.
4. Crear «Laboratorio MAC Aula» en curso sandbox con lanzamiento en nueva ventana. Activar calificación máxima 100 y verificar lineitem/scope en lanzamiento firmado. Vincular el único caso piloto y su versión desde configuración de servidor.
5. Probar estudiante Moodle sin Directorio La Movida, docente del curso y usuario ajeno; validar que el rol docente no se extiende a otros cursos. Seguir matriz de pruebas.
6. Probar rúbrica, confirmación y nota visible en libro Moodle; simular fallo AGS y reintento. Guardar evidencia sin JWT ni secretos. Probar iframe aparte; nueva ventana es configuración inicial.

## Antes de producción
Completar pruebas de aislamiento, restauración, móvil, PDF y regresión Profesional. Revisar SQL/grants/RLS en staging, rollback y secretos; aprobación explícita del usuario para despliegue. Solo entonces configurar entorno productivo con registros distintos. Desactivar actividad o deployment para suspender lanzamientos, revocar sesiones académicas y detener outbox antes de revertir backend. Conservar datos y claves necesarios para restaurar; no borrar tablas como rollback. Publicar cambios profesionales y académicos de manera independiente.
