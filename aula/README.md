# MAC Aula — laboratorio de desarrollo (fase 2)

Aplicación independiente de MAC Profesional. **Solo para pruebas locales con datos simulados.** No implementa LTI ni autenticación real y no debe desplegarse como herramienta pública. Las personas seleccionables sirven para probar roles, no para dar acceso a estudiantes reales.

Actualización: evaluación automática por competencias es el objetivo central. `evaluation/` implementa reglas, contrato IA, estados, límites, métricas y adaptador Gemini opcional del servidor. Está desactivado por defecto; configuración de GEMINI_API_KEY en `docs/gemini-setup.md`, sin secretos en navegador. Sin IA continúa la orientación determinística; el estudiante puede consultar cada módulo y reclamar. La bandeja docente muestra excepciones y criterios pendientes. Rúbrica 2.0.0 y políticas en `docs/evaluation-architecture.md`. Las puntuaciones definitivas automáticas y el envío a Moodle permanecen deshabilitados.

## Ejecutar
Requiere Node.js 22 o posterior, sin paquetes adicionales para el servidor:

```powershell
$env:MAC_AULA_DEV='1'
node aula/dev/server.mjs
```

En macOS/Linux: `MAC_AULA_DEV=1 node aula/dev/server.mjs`. Ejecutar desde la raíz del repositorio. El servidor imprime una URL con puerto aleatorio y escucha únicamente en `127.0.0.1`. Abrir esa URL exacta; no usar localhost ni exponerla mediante túnel/proxy. Sin la variable explícita el servidor se niega a arrancar. Detener con Ctrl+C.

Las sesiones simuladas: estudiante A/B, docente del mismo ámbito, docente de otro curso, estudiante de otra actividad/deployment. No se pide cédula, contraseña, código de integrante ni registro en el Directorio. La selección libre de personas se retirará al implementar el acceso LTI; **no es una medida de seguridad para producción**.

## Guardado y revisión
El estudiante guarda explícitamente; se conserva el avance en `.aula-dev/store.json` (excluido de git). Puede cerrar/reabrir el servidor y recuperar el expediente tras seleccionar de nuevo la misma persona. Cada guardado aumenta la revisión; otro navegador con revisión antigua recibe conflicto, manteniendo su borrador en pantalla para descargarlo o recuperar la versión del servidor. No hay sincronización en nube.

La entrega exige productos mínimos e integridad, no calidad causal. Se conserva como snapshot; seguir editando no cambia entregas anteriores. Repetir entrega de la misma revisión es idempotente. Hoy el docente resuelve excepciones y aplica la rúbrica sobre el snapshot; cada criterio exige puntos válidos, observación y referencias a IDs. La devolución en borrador es invisible al estudiante. Publicarla es explícito y no envía notas a Moodle; un ajuste posterior exige motivo y conserva la versión anterior. Un nuevo intento permite reevaluar una investigación corregida.

El estudiante puede descargar JSON de borrador, revisiones y entregas. El adaptador genera un contrato MAC v2 JSON para desarrollar la futura reutilización de Excel/informe. **Ese JSON no es un Excel importable ni un PDF.** No se inicia `MACApp` ni se modifica su autenticación o guardado. PDF/Excel Aula quedan pendientes.

## Estructura
- `shared/models.mjs`: contratos estrictos, validadores y rúbrica compartidos navegador/servidor.
- `shared/mac-adapter.mjs`: mapeo hacia el esquema profesional v2, probado con el validador profesional sin cambios.
- `cases/mezclador.mjs`: caso versionado y fuentes simuladas sin resolución. Fotografía representada como ficha textual, no imagen real.
- `dev/store.mjs`: autorización por actor/ámbito, revisión optimista, historial, entregas inmutables, revisión docente y auditoría local.
- `dev/server.mjs`: API local de desarrollo, sesiones opacas en memoria, CSRF, Host/Origin exactos y lista explícita de recursos estáticos.
- `public/`: cinco etapas, editor causal con zoom/desplazamiento/lista accesible, informe HTML y panel docente.

## Límites deliberados del entorno
El archivo JSON está en claro y puede leerlo el usuario del equipo: exclusivamente datos ficticios. Se usa una cola de escritura y reemplazo de archivo, no una base transaccional multiusuario de producción ni bloqueo entre procesos; no iniciar dos servidores sobre el mismo archivo. Las sesiones desaparecen al reiniciar. La cookie HTTP local no usa Secure; el entorno real requerirá HTTPS y la política de la arquitectura LTI. La auditoría es local, sin garantía contra manipulación del dueño del equipo.

La API valida ámbito/propietario por sesión simulada, pero cualquiera con acceso al servidor local puede seleccionar otra persona de prueba. Los tests comprueban autorización entre sesiones bajo ese contrato; no prueban identidad LTI, RLS o aislamiento de una plataforma real.

No existe solucionario en esta entrega, ni siquiera incrustado en pruebas. Las fuentes públicas y las pruebas estructurales no contienen el árbol de referencia ni una resolución evaluada del mezclador. El futuro solucionario se almacenará fuera de este repositorio público y se entregará solo mediante endpoint docente autorizado. Tampoco existe todavía administración de banco de casos, adjuntos, NRPS o AGS.

Logo: se reutiliza exactamente la URL existente en MAC Profesional; confirmar con Academia si es el horizontal del banner antes del piloto. No se ha rediseñado ni generado otro logo.

## Verificar
```sh
node --test tests/*.test.cjs
node tests/aula-browser.cjs
node tests/browser.cjs
node tests/pdf.cjs
```

Las pruebas de navegador/PDF requieren las dependencias ya documentadas en README raíz. `MAC_BROWSER_CHANNEL=msedge` permite Edge instalado. Evidencia en `test-artifacts/`. El servidor está preparado para pruebas Linux/Windows; no se han probado todos los navegadores o tecnologías asistivas. Más detalles en `docs/phase2-implementation.md`.
