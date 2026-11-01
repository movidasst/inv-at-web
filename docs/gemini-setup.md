# Gemini opcional en MAC Aula — configuración y límites

Rama `feat/mac-aula-gemini`. Implementación para el backend local Node 22+, sin desplegar producción. MAC Profesional no se modifica. Gemini genera propuestas; no habilita publicación automática ni AGS.

## Modelo y disponibilidad comprobada
El 1 de noviembre de 2026 se verificaron las páginas oficiales de modelos, retirada, API y precios. Modelo inicial: **gemini-3.8-flash**, documentado como estable, con salida estructurada y nivel gratuito. Se evita 3.7 Flash porque Google documenta redirección automática a otra versión; también modelos preview/experimentales/retirados y alias latest. El catálogo revisado admite 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite y 3.1 Flash-Lite; cambiar modelo exige verificar contrato y recalibrar. No se recomienda el modelo por una precisión causal medida: aún no hay benchmark con especialistas.

No hay `GEMINI_API_KEY` configurada en esta sesión. La disponibilidad del modelo para **tu proyecto/clave** y una respuesta real no se pudieron comprobar. Se preparó un comando que consulta models.list con la clave del entorno, sin imprimirla:

```powershell
node --env-file=.env.aula aula/dev/gemini-models.mjs
```

Muestra únicamente los modelos estables revisados con generateContent y metadatos de versión/capacidad. No envía expedientes ni prueba calificación. El adaptador también verifica el modelo con models.get antes de generar. Si desaparece o Google devuelve otra versión, se detiene y deriva a revisión; nunca selecciona otro modelo automáticamente.

## Dónde configurar la clave hoy: backend Node
Desde la raíz del repositorio:

```powershell
Copy-Item aula/dev/.env.example .env.aula
```

Abrir **localmente** `.env.aula` en el editor y completar `GEMINI_API_KEY` con la clave. No pegarla en chat, issues, GitHub Secrets de frontend, HTML o JavaScript del navegador. `.env.aula` está excluido de git; el ejemplo versionado tiene la clave vacía. No se utiliza GOOGLE_API_KEY como respaldo implícito.

Activar en ese archivo solo después de confirmar proyecto Google sin facturación de pago y datos ficticios:

```dotenv
GEMINI_ENABLED=1
GEMINI_MODEL=gemini-3.8-flash
GEMINI_MODEL_VERSION=gemini-3.8-flash
GEMINI_FREE_TIER_CONFIRMED=1
GEMINI_FICTITIOUS_ONLY=1
MAC_AULA_DEV=1
```

Mantener la clave únicamente en la línea privada GEMINI_API_KEY del mismo archivo. Arrancar:

```powershell
node --env-file=.env.aula aula/dev/server.mjs
```

El servidor carga esas variables una sola vez y las mantiene fuera de sus respuestas HTTP. Sin clave o con GEMINI_ENABLED=0, Aula sigue con sus reglas. Una configuración incompleta/incorrecta deja Gemini desactivado; no impide abrir o guardar investigaciones. La fábrica de servidor usada por tests no consulta el entorno automáticamente: las pruebas normales no envían datos al tener una clave en el equipo.

`GEMINI_MODEL_VERSION` es el valor exacto esperado del campo modelVersion de una respuesta Google, no necesariamente el campo version numérico del catálogo. Si Google devuelve una revisión distinta, no cambiar esa variable a ciegas: comprobar compatibilidad con una prueba ficticia, registrar versión, comparar resultados y recalibrar. El identificador del proveedor incluye modelo/revisión; no se reutilizan evaluaciones de otro proveedor/modelo. El motor pasa a versión 1.1.0; las calibraciones anteriores no habilitan automáticamente el nuevo evaluador. Ningún alias puede garantizar pesos inmutables si el proveedor cambia internamente sin informarlo: mantener auditoría y control de deriva.

## Si se migra a Supabase académico
**Actualmente no existe una Edge Function Gemini desplegada.** No basta con guardar una clave en Supabase para que el servidor Node local pueda leerla.

En el **proyecto académico de staging**, abrir Supabase Dashboard → Edge Functions → Secrets. Crear secreto con nombre exacto `GEMINI_API_KEY` y pegar el valor únicamente en el campo Value de ese panel. Configurar allí las otras variables del evaluador cuando exista la función. El runtime Edge lee con `Deno.env.get('GEMINI_API_KEY')`; una futura función deberá pasar explícitamente esas variables a la configuración y reutilizar el adaptador tras probar compatibilidad Deno. El servidor local `aula/dev/server.mjs` no se despliega como Edge Function.

No guardar la clave en tablas públicas, parámetros LTI, configuración del navegador ni en el proyecto profesional. No se modifica ningún secreto ni recurso remoto en esta tarea. Antes de crear/desplegar una función, autorizar ese incremento y comprobar permisos, RLS y sesiones académicas.

## Cuota, coste y privacidad
La aplicación no administra ni activa facturación Google. **La API de generación no ofrece aquí un interruptor que garantice “solo gratis” para una clave de un proyecto ya facturado.** GEMINI_FREE_TIER_CONFIRMED es una confirmación administrativa, no una verificación remota de billing. Utilizar un proyecto sin facturación de pago; si hay duda, dejar GEMINI_ENABLED=0. No se cambian settings de Google ni se contratan servicios.

Google documenta que el contenido del nivel gratuito puede utilizarse para mejorar productos. Por eso esta integración está habilitable únicamente para expedientes ficticios, con aceptación explícita de tratamiento. No enviar accidentes reales, información médica, identidades o solucionarios. La bandera fictitious-only es una declaración del operador: no es un detector automático de datos personales en texto libre.

Límites iniciales: 20 intentos de generación/día, 400000 tokens reservados/día, una llamada simultánea, 150000 bytes de petición, salida máxima de 8000 tokens y timeout de adaptador 25 s. El motor conserva máximo 4 intentos/2 verificaciones y timeout 30 s. Lecturas de catálogo no generan contenido; el listado manual tiene máximo cinco páginas. Las reservas se realizan antes de enviar y no se liberan por un fallo, para evitar subestimar consumo incierto. Se contabilizan tokens de respuesta y de pensamiento.

Los contadores diarios son por instancia/proceso y se reinician al reiniciar Node; no son un presupuesto financiero distribuido o persistente. Antes de producción se requiere una reserva durable por proyecto/curso, control de concurrencia entre workers y conciliación de cuota. Los límites locales no garantizan ausencia de cargos en un proyecto facturado. No hay tokens en URLs, logs o mensajes de error; solo cabecera x-goog-api-key al host oficial HTTPS, sin redirecciones, herramientas, búsqueda ni ejecución de código.

## Fallos y continuidad
Cuota 429, autorización 401/403 o modelo 404 abren circuito hasta reiniciar el backend tras resolver el problema; no se reintentan como si fuesen bajo desempeño. Un cambio de modelVersion también bloquea el adaptador. Conexiones/5xx tienen como máximo los reintentos acotados del motor, sin cambiar modelo. Respuestas bloqueadas, truncadas, sin uso consistente o JSON/refs inválidos no generan una nota. Nunca se asigna cero por el fallo de un servicio.

Las reglas determinísticas conservan feedback e integridad. Sin IA disponible, los cinco criterios técnicos necesitan valoración humana porque las reglas no demuestran competencia semántica. Si dos verificaciones válidas dejan solo algunos criterios no valorables, se conservan propuestas parciales y reviewCriteria identifica los pendientes; el total queda null cuando falta algún criterio. La calibración piloto y autorización final siguen siendo requisitos globales, aunque existan propuestas numéricas. La nota definitiva no se envía aún a Moodle.

## Pruebas
```powershell
node --test tests/*.test.cjs
```

Gemini se prueba con fetch simulado: éxito, secreto fuera de URLs/respuestas, modelos, versión, JSON, cuota, conexión, 5xx, bloqueos, consumo y enlace al store. La prueba real se omite normalmente y en CI.

Solo para habilitar la prueba real opcional con datos ficticios, añadir `GEMINI_LIVE_TEST=1` al entorno privado y ejecutar:

```powershell
node --env-file=.env.aula --test tests/gemini-live.test.cjs
```

Requiere clave, confirmación de nivel gratuito y datos ficticios. Consulta modelos y realiza una generación de prueba sobre un expediente ficticio incompleto; no publica calificaciones ni incluye candidatos privados. Una prueba aprobada comprueba transporte/contrato, no precisión técnica ni calibración. Si falla por versión/cuota, mantener evaluación determinística y corregir configuración; no habilitar pago para hacer pasar el test.

## Fuentes oficiales verificadas
- [Modelos y estabilidad](https://ai.google.dev/gemini-api/docs/models), [retiradas](https://ai.google.dev/gemini-api/docs/deprecations), [3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).
- [Catálogo de la API](https://ai.google.dev/api/models), [generación](https://ai.google.dev/api/generate-content), [salida estructurada](https://ai.google.dev/gemini-api/docs/structured-output).
- [Precios y condiciones de tratamiento](https://ai.google.dev/gemini-api/docs/pricing), [claves](https://ai.google.dev/gemini-api/docs/api-key).
- [Secretos de Supabase Edge Functions](https://supabase.com/docs/guides/functions/secrets).
