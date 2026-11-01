# Experiencia académica y primer caso

Experiencia implementada en laboratorio local y ampliada con evaluación por competencias. Curso: Investigación de Accidentes de Trabajo: metodología, causalidad y prevención. Un expediente integrador progresivo por actividad; navegación conserva avances sin convertir completar pantallas en evidencia de competencia.

El modelo objetivo es evaluación automática con supervisión por excepciones, según `evaluation-architecture.md`. El estudiante recibe feedback referido a elementos de su expediente, orientación formativa por módulo y posibilidad de reclamar o corregir en nuevo intento. La bandeja docente prioriza dudas, inconsistencias, errores técnicos y control de calidad. En el estado actual, la IA no está conectada: las reglas devuelven orientación sin puntuación y los expedientes completos requieren revisión. No confundir esa limitación temporal con el diseño definitivo.

Los indicadores y descriptores de la rúbrica 2.0.0 están en `aula/shared/evaluation-rubric.mjs`; cada resultado conserva versiones y evidencias examinadas. El docente puede ajustar la evaluación con explicación y referencias; modificar una devolución publicada exige justificación y conserva la versión anterior. No se revelan solucionarios ni puntuaciones preliminares en feedback automático.

| Etapa / módulo | Tarea e insumos | Procesamiento y producto | Evaluación / siguiente paso |
|---|---|---|---|
| 1. Conocer el caso / M1 | Leer organización, proceso, accidente, trabajadores ficticios y referencias. | Separar descripción de hipótesis; entregar síntesis y obligaciones de investigación justificadas. | Docente revisa precisión y fundamentos; después se abre clasificación de evidencia. |
| 2. Evidencias / M2 | Consultar testimonios, documentos, fotos simuladas y registros de equipos. | Clasificar comprobado/inferencia/faltante, contrastar fuentes y construir cronología con referencias. | Advertencias de integridad + valoración de calidad; pasar a hechos verificables. |
| 3. Árbol / M3 | Usar hechos y fuentes del propio expediente. | Conectar antecedentes y efectos, justificar cada enlace y conjunción, indicar incertidumbre; entregar grafo y equivalente textual. | Ciclos/referencias verificables automáticamente; lógica y suficiencia por docente; continuar a prevención. |
| 4. Medidas / M4 | Revisar factores y barreras identificados. | Distinguir corrección inmediata y prevención, priorizar controles, responsable/plazo/indicador/criterio de eficacia. | Docente valora adecuación y transferencia; pasar a informe. |
| 5. Informe / M4 | Integrar expediente, evidencias, cronología, árbol, análisis y medidas. | Revisar límites, trazabilidad y recomendaciones; exportar y entregar snapshot. | Revisión docente con rúbrica y feedback; revisar devolución o nuevo intento autorizado. |

En cada etapa: explicación breve, pregunta de recuperación con feedback explicativo, ejemplo trabajado distinto del evaluado, práctica guiada y tarea autónoma. Ayudas graduadas no revelan solución. Mostrar «guardado en servidor» solo tras confirmación, versión y conflicto recuperable. No perder borrador por vencimiento de sesión; diseño de recuperación debe considerar dispositivo compartido antes de decidir caché local.

Interfaz con tarjetas, indicador de avance, foco al cambiar etapa, estado de guardado anunciado, errores junto al campo y navegación por teclado. Grafo con zoom/pan explícitos, reset, controles táctiles y alternativa de lista de conexiones editable. Verificar 360/768/1366 px y zoom 200%; no depender del color para estados.

## Rúbrica propuesta
| Criterio | Máximo | Evidencia de competencia |
|---|---:|---|
| Identificación/clasificación de evidencias | 20 | Fuente, confiabilidad, contraste y separación entre comprobación e inferencia. |
| Reconstrucción de hechos | 15 | Cronología coherente, hechos objetivos y vacíos explícitos con trazabilidad. |
| Árbol de Causas | 35 | Lógica de antecedentes necesarios, conjunciones correctas, justificaciones y ausencia de atribución de culpa sin sustento. |
| Medidas preventivas | 20 | Vínculo con factores, jerarquía de controles y seguimiento evaluable. |
| Informe y trazabilidad | 10 | Integridad, claridad, limitaciones, referencias y diagrama legible. |

Niveles por criterio: insuficiente (0%, sin sustento o conclusión incompatible), inicial (40%, evidencia parcial con fallas relevantes), competente (75%, análisis sustentado con omisiones menores), destacado (100%, análisis preciso, completo y límites explícitos). Exigir observación y referencia a elementos revisados. Permitir alternativas causales justificadas. No adjudicar puntos automáticamente por conteo de nodos o campos llenos.

Panel docente: usuarios que hayan lanzado/asignados en su contexto, casos/versiones, estado/último avance, snapshot de entrega, árbol y lista causal, rúbrica, comentarios, publicación de feedback y acción explícita de confirmar envío a Moodle. Separar «evaluado», «confirmado» y «enviado». Administración de casos no se concede automáticamente a todo instructor; permiso adicional. Estudiante solo ve devolución publicada propia.

## Caso integral inicial propuesto
Identificador conceptual: atrapamiento durante limpieza de mezclador en planta alimentaria simulada. Crear organización/proceso, orden de limpieza, registro de energía, fotografías expresamente simuladas, dos declaraciones con discrepancias y cronología incompleta. Entregar al alumno paquete de fuentes sin hechos ya resueltos ni árbol terminado. No reutilizar resolución de la banda transportadora pública de MAC.

Paquete docente privado: cronología de referencia, hechos sustentados/inciertos, árbol con alternativas defendibles, medidas posibles y rúbrica aplicada de ejemplo. No versionar el solucionario en este repositorio público. Antes de ampliar biblioteca, especialista SST valida consistencia técnica, docente prueba tiempo/carga y accesibilidad, y pruebas de API confirman que ni estudiante ni exportaciones pueden obtener solución. Esta fase entrega el diseño del caso, no los materiales completos ni fotografías.
