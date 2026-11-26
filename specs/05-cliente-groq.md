# SPEC 05 — Cliente Groq

> **Estado:** Draft
> **Depende de:** SPEC 04
> **Fecha:** 2026-11-26
> **Objetivo:** Implementar el adaptador Groq compatible con el puerto común LLM para chat, streaming, historial, tools iterativas, métricas y errores normalizados.

## Alcance

**Incluye:**

- `GroqClient` en `src/infrastructure/adapters/llm/groq/` implementando `LlmClient`.
- Uso de `groq-sdk` mediante Chat Completions.
- Mapeo del historial y tools al formato compatible con Groq.
- Reconstrucción de tool calls fragmentadas durante streaming.
- Ejecución iterativa, límites y errores de tools según SPEC 02.
- Uso normalizado y pruebas unitarias sin red.
- Actualización de documentación local y raíz.

**Fuera de alcance (para specs futuras):**

- Cliente Ollama.
- Audio, embeddings y funcionalidades Groq no necesarias para chat.
- RAG, persistencia, casos de uso y CLI.

## Plan de implementación

1. Crear la carpeta y barrel de `groq`.
2. Implementar mappers de mensajes y function tools.
3. Implementar chat no streaming con `chat.completions.create`.
4. Implementar streaming y acumulación de argumentos de tool calls.
5. Continuar el historial con mensajes assistant y tool.
6. Normalizar usage, límites y errores.
7. Añadir pruebas unitarias con streams simulados.
8. Actualizar documentación y barrels superiores.

## Criterios de aceptación

- [ ] `GroqClient` implementa `LlmClient`.
- [ ] Las conversaciones simples y con historial producen `LlmResponse`.
- [ ] `onChunk` recibe deltas de texto durante streaming.
- [ ] Las llamadas de tools fragmentadas se reconstruyen correctamente.
- [ ] Los resultados se vinculan con el ID de cada llamada.
- [ ] Se aplican límites de tools, iteraciones y duplicados.
- [ ] Las métricas disponibles se acumulan correctamente.
- [ ] Los errores del SDK no filtran secretos ni tipos Groq.
- [ ] Las pruebas no realizan llamadas de red.
- [ ] `npm run typecheck`, `npm test` y `npm run build` finalizan correctamente.

## Decisiones tomadas y descartadas

- **Sí:** Chat Completions del SDK oficial.
- **Sí:** reconstrucción explícita de tool calls en streaming.
- **Sí:** `parallel_tool_calls` se controla desde el contrato común.
- **No:** usar tipos Groq fuera del adaptador.
- **No:** añadir embeddings o audio en esta spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Argumentos JSON llegan en varios fragmentos | Acumular por índice y parsear solo al finalizar la iteración. |
| Usage no llega en todos los chunks | Usar el usage final disponible y validar la respuesta textual. |

## Lo que **no** está incluido en este spec

- Ollama.
- Embeddings, audio, RAG y persistencia.
- Casos de uso y CLI.
