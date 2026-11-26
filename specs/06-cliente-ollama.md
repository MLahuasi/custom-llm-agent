# SPEC 06 — Cliente Ollama

> **Estado:** Draft
> **Depende de:** SPEC 05
> **Fecha:** 2026-11-26
> **Objetivo:** Implementar el adaptador Ollama compatible con el puerto común LLM para servidores locales o cloud, chat, streaming, historial, tools, métricas y errores normalizados.

## Alcance

**Incluye:**

- `OllamaClient` en `src/infrastructure/adapters/llm/ollama/` implementando `LlmClient`.
- Configuración por constructor de host, modelo y opciones de generación.
- Chat no streaming y streaming mediante `ollama.chat`.
- Mapeo del historial neutral, system prompt y tools.
- Reconstrucción de mensajes assistant y tool entre iteraciones.
- Ejecución iterativa y límites según el contrato común.
- Uso normalizado, errores `AppError` y pruebas unitarias sin red.
- Documentación del uso local y actualización de documentación raíz.

**Fuera de alcance (para specs futuras):**

- Embeddings de Ollama.
- Gestión, descarga o actualización de modelos.
- Cliente OpenAI-compatible de Ollama.
- RAG, persistencia, casos de uso y CLI.

## Plan de implementación

1. Crear la carpeta y barrel de `ollama`.
2. Implementar mappers de mensajes y tools.
3. Implementar chat no streaming con `ollama.chat`.
4. Implementar streaming y acumulación de contenido y tool calls.
5. Continuar la conversación con mensajes tool compatibles con Ollama.
6. Normalizar tokens, configuración, límites y errores.
7. Añadir pruebas unitarias con cliente/fetch simulado.
8. Actualizar documentación local y barrels superiores.

## Criterios de aceptación

- [ ] `OllamaClient` implementa `LlmClient`.
- [ ] El host y el modelo se inyectan por constructor.
- [ ] El cliente funciona con un servidor local simulado sin red externa.
- [ ] Chat simple, historial y system prompt se mapean correctamente.
- [ ] Streaming entrega deltas y respuesta final.
- [ ] Las tool calls se reconstruyen y sus resultados continúan el historial.
- [ ] Se aplican límites de tools e iteraciones.
- [ ] Se normalizan `prompt_eval_count` y `eval_count` cuando están disponibles.
- [ ] Los errores de conexión y respuesta se convierten en `AppError` seguro.
- [ ] Las pruebas no requieren un servidor Ollama real.
- [ ] `npm run typecheck`, `npm test` y `npm run build` finalizan correctamente.

## Decisiones tomadas y descartadas

- **Sí:** cliente oficial `ollama` con host inyectable.
- **Sí:** soporte para servidores locales mediante `OLLAMA_BASE_URL` en la composición futura.
- **Sí:** tools manuales para compartir límites con los demás adaptadores.
- **No:** descargar o administrar modelos desde el adaptador.
- **No:** asumir que Ollama remoto está disponible en las pruebas.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El servidor local no está iniciado | Usar mocks en pruebas y documentar el requisito de ejecución. |
| Modelos distintos soportan tools de forma diferente | Propagar errores normalizados y probar con respuestas compatibles. |
| Contadores de tokens ausentes | Mantener cero como valor seguro cuando el servidor no los informe. |

## Lo que **no** está incluido en este spec

- Embeddings de Ollama.
- Gestión de modelos, RAG y persistencia.
- Casos de uso y CLI.
