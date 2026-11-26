# SPEC 03 — Cliente OpenAI y embeddings

> **Estado:** Draft
> **Depende de:** SPEC 02
> **Fecha:** 2026-11-26
> **Objetivo:** Implementar el cliente OpenAI compatible con el contrato común y el adaptador de embeddings de OpenAI usando el mismo estándar de configuración, errores y métricas.

## Alcance

**Incluye:**

- `OpenAiClient` en `src/infrastructure/adapters/llm/openai/` implementando `LlmClient`.
- Chat mediante Responses API con `ask` y `stream`.
- Historial neutral, system prompt, tools iterativas y callback `onChunk`.
- Mapeo de function tools y resultados al formato de Responses API.
- `OpenAiEmbeddingClient` implementando `EmbeddingClient`.
- Métodos `generateEmbedding` y `generateEmbeddings`.
- Configuración por constructor de API key, modelo y modelo de embeddings.
- Uso normalizado y errores `AppError` sin filtrar tipos del SDK.
- Pruebas unitarias sin red.
- Documentación del adaptador y actualización de documentación raíz.

**Fuera de alcance (para specs futuras):**

- Clientes Gemini, Groq u Ollama.
- RAG, almacenamiento vectorial y búsquedas.
- Realtime, audio, imágenes y respuestas estructuradas no requeridas por el contrato.
- Contenedor DI, limitadores globales y tracking de costes.

## Modelo técnico

```ts
interface EmbeddingClient {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}
```

OpenAI conservará los items de Responses API necesarios para continuar el bucle de tools. Los embeddings conservarán el orden de entrada y devolverán un vector por texto.

## Plan de implementación

1. Crear `src/infrastructure/adapters/llm/openai/` y sus barrels.
2. Añadir el puerto `EmbeddingClient` en `src/application/ports/llm/`.
3. Implementar mappers OpenAI para mensajes, tools y resultados.
4. Implementar `OpenAiClient.ask` con Responses API.
5. Implementar `OpenAiClient.stream` y reconstrucción de llamadas de tools en streaming.
6. Implementar `OpenAiEmbeddingClient` con `embeddings.create` para uno o varios textos.
7. Normalizar uso, respuestas inválidas y errores del SDK.
8. Añadir pruebas unitarias con SDK simulado.
9. Actualizar READMEs y `ARCHITECTURE.md`.

## Criterios de aceptación

- [ ] `OpenAiClient` implementa `LlmClient`.
- [ ] `OpenAiEmbeddingClient` implementa `EmbeddingClient`.
- [ ] Chat simple, historial y system prompt funcionan con la respuesta normalizada.
- [ ] Streaming entrega deltas y respuesta final.
- [ ] Tools iterativas conservan los items necesarios para Responses API.
- [ ] Los resultados de tools se asocian mediante `call_id`.
- [ ] `generateEmbeddings` conserva el orden de los textos.
- [ ] Un texto vacío o una lista vacía se rechaza con `AppError`.
- [ ] Las métricas acumulan requests y tokens disponibles.
- [ ] Las pruebas no realizan llamadas de red.
- [ ] `npm run typecheck`, `npm test` y `npm run build` finalizan correctamente.

## Decisiones tomadas y descartadas

- **Sí:** Responses API para chat OpenAI.
- **Sí:** embeddings únicamente para OpenAI en esta spec.
- **Sí:** contrato `EmbeddingClient` separado de `LlmClient`.
- **No:** exponer objetos crudos del SDK.
- **No:** implementar almacenamiento vectorial junto con embeddings.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Diferencias entre Responses API y mensajes tradicionales | Aislar la conversión en mappers y probar tool loops. |
| Orden incorrecto de embeddings | Verificar posiciones de entrada y salida en pruebas. |
| Modelos que no soporten tools | Propagar error normalizado del proveedor. |

## Lo que **no** está incluido en este spec

- Gemini, Groq y Ollama.
- RAG y persistencia vectorial.
- Funcionalidades OpenAI fuera de chat y embeddings.
