# Pruebas y estado de validación

## Comandos
Desde raíz del repositorio, Node 22 o compatible:

```sh
node --test tests/*.test.cjs
node tests/browser.cjs
node tests/pdf.cjs
```

Las dos últimas requieren Playwright, pdfjs-dist, @napi-rs/canvas y un navegador. Instalación de referencia existente en README: versiones 1.62.1 / 5.6.205 / 0.1.100; documentar versiones efectivas al usar herramientas ya instaladas. `MAC_BROWSER_CHANNEL=msedge` permite navegador Edge instalado. `test-artifacts/` está excluido del repositorio. No ejecutar `server/smoke-test.sql` ni migraciones contra producción sin autorización.

## Resultados de esta entrega
- Base d6b92ee: 11/11 regresiones existentes aprobadas con Node 24.22.1.
- Suite ampliada: 16/16 aprobadas (11 existentes + 5 nuevas de autenticación profesional con RPC simuladas).
- `tests/browser.cjs`: aprobado con Microsoft Edge headless. Comprueba sesión inventada, login simulado, guardado cifrado/recarga/logout, PDF/Excel, importación con grafo abierto y campo largo.
- `tests/pdf.cjs`: aprobado. Demo: 19 páginas; variante larga: 23 páginas. Texto dentro de límites y marcador final presente. Portada y anexo de demo inspeccionados visualmente: sin recortes visibles en ese caso; no equivale a probar grafos arbitrarios.
- Dependencias efectivas del runtime local: Playwright 1.62.1, pdfjs-dist 5.6.205, @napi-rs/canvas 0.1.100. Se usó NODE_PATH hacia dependencias instaladas del entorno; no se añadieron librerías al cliente ni al repositorio.
- El primer intento de Edge dentro del sandbox no pudo iniciar; la ejecución fuera del aislamiento pasó. No hubo fallo funcional observado en esa ejecución.
- `git -c core.whitespace=cr-at-eol diff --check`: aprobado; workflow conserva sus finales CRLF originales.
- Sin comprobación remota de SQL/RLS, registro Moodle, Moove ni lanzamientos reales. No hay integración LTI implementada que pueda certificarse.

## Matriz requerida antes del piloto
| Área | Escenario / resultado esperado |
|---|---|
| Profesional | Credenciales válidas/sesión inventada/revocación; crear, editar, borrar, demo; recarga cifrada y corrupción preservada. |
| Excel | Exportar/importar mientras árbol abierto, IDs/enums/ciclos inválidos, límites y fórmulas; conservar relaciones y medidas. |
| PDF | Caso corto/largo, árbol profundo/ancho, etiquetas extensas; verificar nodos/relaciones esperados, texto dentro de página y legibilidad visual, sin recortes. Las pruebas actuales de texto no certifican todos los píxeles del árbol. |
| OIDC/JWT | Firma alterada, algoritmo none/HS256, kid desconocido, rotación, issuer/aud/azp/deployment erróneos, expiración/nbf/iat, nonce/state inválidos y replay concurrente: denegar. |
| Navegador | Login CSRF: state/token válido desde otro navegador debe fallar; cookies bloqueadas en iframe no deben permitir bypass. Nueva ventana funciona. |
| Ámbitos | Alumno A/B, mismo curso/diferente actividad, cursos y deployments distintos, docente de otro curso: denegar acceso cruzado a lectura/escritura/exportación. UUID conocido no basta. |
| Datos | RLS y grants con roles reales, funciones/vistas, manipulación de owner/context/version, solucionario por REST/exportaciones/assets: denegar. Contexto de conexión no persiste entre usuarios. |
| Sesión | Acceso directo sin sesión, vencida/revocada, CSRF y Origin no autorizado: 401/403, sin contenido protegido ni caché. |
| Persistencia | Dos dispositivos recuperan borrador; edición concurrente produce conflicto y permite recuperar ambas versiones; reintento no duplica entrega. |
| Docente/AGS | Nota fuera de rango o sin revisión no sale; scopes faltantes/fallo de red quedan pendientes; confirmación válida genera envío y nota Moodle correcta. Versiones antiguas no sobrescriben nuevas. |
| Accesibilidad | 360/768/1366 px, zoom 200%, teclado y lector de pantalla, foco visible, errores anunciados, grafo alternativo textual. |
| Caso piloto | SST revisa fuentes/coherencia y alternativas; docente verifica carga, rúbrica y feedback; alumno no recibe solucionario. |

Pruebas de backend local/staging con datos ficticios, plataforma simulada y claves efímeras; nunca insertar claves de producción como fixtures. Comparar exportaciones antes/después de cada extracción de v2.js, conservando mismo expediente de prueba.
