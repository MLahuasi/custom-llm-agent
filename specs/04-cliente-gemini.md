# SPEC 04 — Cliente Gemini

> **Estado:** Aprobado
> **Depende de:** SPEC 03
> **Fecha:** 2026-11-26
> **Objetivo:** Implementar el adaptador Gemini compatible con el puerto común LLM para chat, streaming, historial, tools iterativas, métricas y errores normalizados.

## Alcance

**Incluye:**

- `GeminiClient` en `src/infrastructure/adapters/llm/gemini/` implementando `LlmClient`.
- Uso de `@google/genai` mediante `generateContent` y `generateContentStream`.
- Mapeo del historial neutral a `Content[]`.
- Function declarations y function responses para tools.
- Ejecución iterativa y paralela de tools mediante el contrato de SPEC 02.
- Streaming mediante `onChunk`.
- Uso normalizado y errores `AppError`.
- Pruebas unitarias sin red y documentación local.

**Fuera de alcance (para specs futuras):**

- Gemini multimodal, grounding, Vertex AI y configuración avanzada no necesaria.
- Embeddings Gemini.
- Clientes Groq u Ollama.
- RAG, persistencia y casos de uso.

## Plan de implementación

1. Crear la carpeta y barrel de `gemini`.
2. Implementar mappers de mensajes y tools.
3. Implementar `GeminiClient.ask` con `generateContent`.
4. Implementar `GeminiClient.stream` con `generateContentStream`.
5. Reconstruir contenidos y function calls entre iteraciones.
6. Normalizar tokens, respuestas vacías y errores del SDK.
7. Añadir pruebas unitarias con respuestas simuladas.
8. Actualizar documentación y barrels superiores.

## Criterios de aceptación

- [ ] `GeminiClient` implementa `LlmClient` sin filtrar tipos Gemini.
- [ ] Chat simple conserva prompt, historial y system prompt.
- [ ] Streaming entrega cada delta de texto y la respuesta final.
- [ ] Function calls se convierten al formato común de tools.
- [ ] Los resultados de tools continúan correctamente la conversación.
- [ ] Se aplican límites de tools e iteraciones.
- [ ] Se normalizan requests y tokens disponibles en `LlmResponse`.
- [ ] Los errores del proveedor se convierten en `AppError` seguro.
- [ ] Las pruebas no realizan llamadas de red.
- [ ] `npm run typecheck`, `npm test` y `npm run build` finalizan correctamente.

## Decisiones tomadas y descartadas

- **Sí:** SDK oficial `@google/genai`.
- **Sí:** `generateContentStream` para streaming.
- **Sí:** function calling manual alineado con el contrato común.
- **No:** depender de automatic function calling del SDK, porque ocultaría los límites comunes.
- **No:** incluir Vertex AI en esta spec.

## Riesgos

| Riesgo                                           | Mitigación                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Diferencias entre `Content` y mensajes neutrales | Mapper dedicado y pruebas de ida y vuelta del historial.               |
| Usage metadata ausente en algunos streams        | Usar valores seguros y marcar respuestas inválidas cuando falte texto. |

## Lo que **no** está incluido en este spec

- Groq y Ollama.
- Embeddings, Vertex AI y RAG.
- Funcionalidades multimodales no requeridas.

---

Plan de implementación

1. Crear carpeta y barrel de gemini.
2. Implementar mappers de mensajes y tools.
3. Implementar GeminiClient.ask.
4. Implementar GeminiClient.stream.
5. Reconstruir contenidos y function calls entre iteraciones.
6. Normalizar tokens, respuestas vacías y errores del SDK.
7. Añadir pruebas unitarias con respuestas simuladas.
8. Actualizar documentación y barrels superiores.
