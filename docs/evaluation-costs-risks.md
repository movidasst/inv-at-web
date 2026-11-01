# IA: comparación, costes y riesgos pendientes

No se ha elegido proveedor, instalado SDK ni realizado llamadas externas. No se requieren claves para ejecutar este incremento. Las pruebas usan funciones simuladas en memoria. No hay cargos de IA.

## Comparación previa a elegir proveedor
Crear una matriz de candidatos con precio vigente por token/solicitud, coste de dos verificaciones y reintentos, latencia p50/p95, soporte real de estructura estricta, calidad por indicador sobre dataset retenido, concordancia con especialistas, tasa de excepciones, alternativas válidas admitidas, límites de concurrencia, región, retención, uso para entrenamiento, acuerdos de tratamiento, subencargados, borrado y exportación. Incluir opción autogestionada cuando sea viable; tampoco implica privacidad o coste cero por sí sola. Sin benchmark y garantías contractuales no hay recomendación ni selección técnica aprobada.

Los precios no se inventan ni se fijan en estos documentos. Antes de conectar un candidato, verificar documentación y tarifas actuales y aprobar presupuesto y privacidad. No activar una API de pago por instalar un paquete o introducir una clave.

## Modelo de coste
Para N entregas, p verificaciones y factor r de reintentos: llamadas esperadas = N × p × r. Coste de tokens = suma(input_tokens × tarifa_entrada + output_tokens × tarifa_salida), aplicando las unidades de la tarifa real. Añadir infraestructura, almacenamiento, observabilidad, especialistas, apelaciones y auditoría. Estimar con la distribución observada de longitudes y reentregas, no solo un expediente corto.

Con dos verificaciones y sin reintentos, 50/100/200 entregas implican 100/200/400 llamadas; con el máximo piloto de dos intentos por verificación, los topes serían 200/400/800. Es aritmética de diseño, no presupuesto monetario ni predicción de calidad/latencia. Por ahora las llamadas externas efectivas son cero.

Límites de ingeniería implementados por evaluación: máximo 4 llamadas, 2 intentos por verificación, 150000 caracteres de entrada, 8000 tokens máximos de salida por llamada, 80000 tokens reservados totales y timeout inicial de 1500 ms (ajustable en servidor hasta 30 s). Solo errores explícitamente transitorios se reintentan; timeout no se reintenta automáticamente para evitar cargos simultáneos si el proveedor ignora cancelación. La reserva caracteres/2 + salida es una estimación conservadora de control, no un tokenizador ni facturación real; sustituirla por contabilidad del adaptador antes de uso pagado. Se conserva uso reportado y se rechazan incoherencias.

La idempotencia de solicitudes sobre la misma entrega/versiones evita reevaluaciones duplicadas en el proceso local. Todavía faltan reservas monetarias transaccionales por curso, límites diarios, cola durable y recuperación después de caídas. Un AbortSignal no garantiza que un tercero deje de procesar/cobrar. No afirmar un techo financiero hasta implementar reservas y conciliar consumo real.

## Privacidad y amenazas
- Datos iniciales simulados; prohibidos accidentes reales/identificadores en desarrollo. Conectar proveedor requiere autorización explícita de tratamiento y revisión de privacidad, retención, región y entrenamiento.
- Solo servidor; claves en gestor de secretos, nunca navegador, logs o git. El contrato omite identidad y solucionario; minimizar también datos personales que puedan introducirse libremente en textos, antes de cualquier envío externo.
- Prompt injection: datos separados, sin herramientas ni ejecución, validación estricta de salida, alarmas y revisión. No asumir que un prompt elimina ataques; probar paráfrasis, instrucciones multilingües y solicitudes de exfiltración.
- Alucinaciones/falsa certeza: no usar confianza del modelo como probabilidad; referencias deben existir, pero eso no demuestra que sostengan una conclusión. Comparar con especialistas y revisar discrepancias.
- Fuga de respuestas: feedback público construido con descriptores/IDs; razones libres solo docentes. Pruebas de acceso y exportación deben garantizar separación del futuro solucionario privado.
- Sesgo, anclaje y modelo cambiante: versionar proveedor/modelo/prompt/rúbrica; invalidar calibración al cambiar; medir errores por estratos y soluciones alternativas, con derecho a reclamación.
- Disponibilidad: timeout, error de servicio o presupuesto agotado produce pendiente/fallo técnico, nunca un cero. Mantener snapshot y posibilidad de reevaluar con versión nueva.
- Supervisión: tasas de derivación y QA reales pueden reducir o aumentar carga docente. No prometer capacidad para 200 casos hasta probar colas, latencia, costes y calidad con un proveedor real autorizado.

## Puertas de habilitación
1. Contrato, reglas y simuladores locales verificados (este incremento).
2. Dataset privado y protocolo de especialistas aprobados; comparar proveedores sin datos personales reales.
3. Autorización expresa de proveedor, tratamiento y coste; credenciales únicamente backend.
4. Staging, métricas, revisión de seguridad y calibración retenida.
5. Piloto con propuestas sin publicación automática definitiva.
6. Solo tras aprobación administrativa y validación adicional: política de publicación automática limitada y suspendible, auditorías y posterior AGS.
