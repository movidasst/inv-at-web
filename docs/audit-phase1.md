# Auditoría de fase 1 — 1 de noviembre de 2026

Base: `movidasst/inv-at-web`, rama `main`, commit `d6b92ee2613112d489b9117c3e07405f2f66aebf`. Copia local limpia al comenzar. Rama de trabajo: `feat/mac-aula-phase1`. Auditoría del código y configuración versionados; no acredita configuración desplegada de Supabase, Moodle, Moove, DNS o Pages.

## Inventario y diagnóstico
| Archivos | Función y observaciones |
|---|---|
| index.html, v2.html | Entradas estáticas con login profesional; mismo JS/CSS, metadatos y versiones de CSS distintos. No hay routing de Aula. |
| auth.js, auth.css | Login cédula/código por RPC; token en sessionStorage; clave AES en memoria; revalidación cada 60 s, vencimiento a 60 min indicado por backend. Cierre intenta revocación. |
| v2.js | Nueve pantallas, un estado activo: identificación, legal, evidencias/cronología, hechos, árbol, análisis, medidas, informe y portada de inicio. Demo al entrar si no hay datos. |
| v2.css | Colores institucionales, breakpoints, scroll de etapas y panel gráfico; no demuestra por sí solo accesibilidad o funcionamiento táctil. |
| server/mac-security.sql | Tablas privadas mac_members/mac_sessions/mac_login_attempts; hash de token, clave por integrante, RLS, grants, función privada SECURITY DEFINER con search_path vacío y wrappers públicos invoker. Cambia también acceso_integrante: no ejecutar para Aula. |
| server/acceso-integrante-before.sql | Definición anterior de acceso profesional, útil como referencia de recuperación; no aplicar como rollback automático. |
| server/smoke-test.sql | Prueba SQL con rollback; accede internamente a integrantes reales. No ejecutada en esta fase. |
| tests/*.cjs | 11 regresiones unitarias de integridad/cifrado; navegador con RPC simuladas; PDF verifica texto y renderiza primera/última página. No prueba backend real. |
| .github/workflows/test-mac-report.yml | CI Node 22, navegador y PDF, artefactos 7 días. No hay flujo de despliegue versionado. |
| script.js, style.css | Implementación anterior, no cargada por entradas actuales. Contiene almacenamiento sin cifrado, interpolaciones HTML y llamada Gemini con clave vacía. No es la ruta profesional actual. |
| assets/*, CNAME, .gitignore, README.md | Capturas demo/sociales, dominio, exclusiones y operación. Logo se carga desde otro repositorio. No hay backend LTI, package.json, lockfile ni configuración Supabase CLI. |

Dependencias del cliente fijadas en URLs CDN: Cytoscape 3.33.1, dagre 0.8.5, cytoscape-dagre 2.5.0, html2pdf.js 0.10.1, SheetJS 0.20.3. No hay SRI en esas etiquetas. Analytics es un script externo de www.movidasst.com; revisar antes de incorporar Aula, pues cualquier script en el origen de la aplicación puede acceder al contenido visible.

## Funcionalidades y reutilización
El expediente contiene general, legal, evidence, timeline, facts, diagram, analyses, actions, conclusion, limits y reviewDate. IDs enlazan evidencia → hecho → nodo/análisis/medida. Editor Cytoscape evita ciclos al conectar y exporta posiciones. Excel multihoja conserva relaciones y valida IDs, enums, referencias y ciclos; archivo limitado a 8 MB y hojas a 2500 registros. Exportación protege prefijos de fórmulas.

Guardado AES-GCM con IV aleatorio y additionalData ligado al scope. Cola serializa guardados y conserva copia corrupta. Hay migración local v2 → v3 tras acceso válido. Es un expediente activo por scope en cada navegador, no un gestor remoto de múltiples expedientes. Nueva/borrar demo reemplazan el estado con confirmación.

Informe escapa datos; PDF se compone con jsPDF desde html2pdf y pagina texto, con anexo apaisado ajustado a página. El árbol del informe incluye solo ancestros verificados del hecho final explícito, y deja fuera hechos desconectados. No equiparar «todos los nodos editados» con «árbol causal incluido». Grandes grafos, textos sin espacios y profundidad superior a ocho niveles necesitan pruebas específicas antes de reutilizar el renderizador en Aula.

Reutilizar tras extracción comprobada: modelo de investigación, validadores, enlace hechos/evidencias, editor, exportadores y estilos. Crear nuevos: contenido pedagógico por etapa, banco versionado de casos, almacenamiento remoto con versiones, entregas, sesiones LTI, roles por contexto, panel docente, rúbrica, AGS, auditoría y conservación. El caso demo público puede ser ejemplo resuelto; el caso evaluado debe ser diferente para evitar exponer su solución.

## Riesgos y límites
- Contratos profesionales dependen de SQL remoto cuyo despliegue no se verificó. Pruebas con mocks no confirman RLS ni revocación real.
- `openApp` compara Date.parse sin verificar finitud: fecha inválida no se rechaza explícitamente; investigar con prueba antes de corregir profesional en un cambio independiente.
- Código monolítico y API start ligada al cifrado profesional: añadir un flag aula ahí aumenta el riesgo de mezclar accesos.
- CDN/analytics y claves AES entregadas al cliente implican confianza en scripts del origen; el cifrado local no protege ante XSS o cliente comprometido.
- Logout con fallo de red no garantiza revocación inmediata en servidor; sesión conserva su TTL. No trasladar ese comportamiento sin analizarlo.
- Logo del repositorio externo encontrado; coincidencia con banner Moodle no confirmada. Moodle 5.3 y Moove 5.3.1 son datos aportados, no versiones inspeccionadas del LMS.
- Falta lockfile para herramientas de prueba; no cambiar dependencias de producción dentro de esta fase documental.

## Primer conjunto seguro
Solo añadir AGENTS.md, arquitectura, operación, matriz de pruebas y pruebas de auth.js con servidor simulado. Actualizar CI para ejecutar todas las pruebas unitarias. No modificar entradas, almacenamiento, SQL, estilos o librerías profesionales; no abrir una ruta académica pública operativa. La fase siguiente empieza con contratos de datos y caso simulado público sin solucionario, en staging, seguida de la extracción incremental del editor.
