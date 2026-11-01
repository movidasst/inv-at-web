# MAC — investigación de accidentes

Sitio estático publicado mediante GitHub Pages en https://mac.movidasst.com.

## Validación

```sh
node --test tests/regression.test.cjs
npm install --no-save playwright@1.62.1 pdfjs-dist@5.6.205 @napi-rs/canvas@0.1.100
npx playwright install --with-deps chromium
node tests/browser.cjs
node tests/pdf.cjs
```

El navegador de prueba usa una respuesta simulada del servidor, nunca credenciales reales. Las pruebas descargan Excel/PDF, comprueban la importación con el gráfico abierto, las sesiones inventadas, el guardado cifrado y el cierre de sesión. La prueba PDF verifica el texto dentro de página y renderiza portada/anexo. Los archivos de prueba se guardan en `test-artifacts/` y no se publican.

## Despliegue de seguridad (orden obligatorio)

1. Revisar y aplicar `server/mac-security.sql` en el proyecto Supabase `lfdmbkzghnwvsapxypvt`. Es una migración de una sola aplicación. Crea únicamente tablas privadas de MAC y funciones de sesión. Conserva los argumentos y columnas de `acceso_integrante`, y añade un límite compartido de cinco intentos fallidos por cédula cada 15 minutos.
2. Ejecutar `server/smoke-test.sql`. Valida internamente credenciales existentes sin devolverlas y revierte las sesiones/contadores de prueba. No cambia integrantes.
3. Publicar el cliente únicamente cuando ambos pasos hayan pasado. El nuevo `auth.js` requiere `mac_login`, `mac_resume` y `mac_logout`; no hay acceso de respaldo mediante una sesión local.

La sesión del servidor dura 60 minutos y se revoca al cerrar; el navegador revalida al recargar y cada minuto. Una actualización de código de integrante invalida su sesión. El token opaco se conserva en `sessionStorage`; la clave AES-GCM permanece en memoria y se obtiene del servidor únicamente tras validar la sesión. Los expedientes permanecen locales, cifrados; no se envían al servidor. El Excel exportado contiene el expediente en claro y debe custodiarse.

Los avances de la versión anterior se migran después de ingresar con credenciales válidas. Se elimina la copia anterior solo tras guardar correctamente la copia cifrada. Los datos dañados o un error de descifrado detienen la apertura sin reemplazar el expediente por la demo. Las copias antiguas que no hayan sido migradas siguen teniendo la protección de la versión anterior.

La aplicación sigue siendo una herramienta estática: el código y las funciones de edición son públicos. El control de sesión protege la entrega de la clave y el acceso a expedientes cifrados; no convierte el JavaScript descargado en software privado.

## Recuperación

Conservar el commit anterior y una copia de la definición original de `acceso_integrante` antes de aplicar la migración. Si falla la verificación del servidor, no publicar el cliente. Si hay que revertir el cliente después de haber migrado expedientes, conservar la versión nueva disponible para exportarlos: el cliente anterior no puede leer el guardado cifrado v3. No borrar tablas de claves ni datos locales para resolver problemas de acceso.
