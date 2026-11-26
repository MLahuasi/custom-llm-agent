# SPEC 03 — Cliente OpenAI y embeddings

> **Estado:** Aprobado
> **Depende de:** SPEC 02
> **Fecha:** 2026-11-26
> **Objetivo:** Implementar el cliente OpenAI compatible con el contrato común y el adaptador de embeddings de OpenAI usando el mismo estándar de configuración, errores y métricas.

## Alcance

**Incluye:**

- `OpenAiClient` en `src/infrastructure/adapters/llm/openai/` implementando `LlmClient` y `EmbeddingClient`.
- Chat mediante Responses API con `ask` y `stream`.
- Historial neutral, system prompt, tools iterativas y callback `onChunk`.
- Mapeo de function tools y resultados al formato de Responses API.
- Métodos `generateEmbedding` y `generateEmbeddings` en `OpenAiClient`.
- Configuración por constructor de la instancia SDK `OpenAI`, modelo de chat,
  modelo de embeddings y límite predeterminado de tokens de salida.
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
  generateEmbeddings(texts: readonly string[]): Promise<number[][]>;
}
```

`EmbeddingClient` es un puerto separado de `LlmClient`: un adaptador puede
implementar una capacidad sin estar obligado a implementar la otra. En esta spec,
`OpenAiClient` implementará ambas interfaces.

El adaptador recibirá una instancia ya configurada de `OpenAI`; la API key se
resolverá al componer el cliente y no dentro del adaptador. OpenAI conservará los
items de Responses API necesarios para continuar el bucle de tools. Los embeddings
conservarán el orden de entrada y devolverán un vector por texto.

Las métricas normalizadas (`providerRequests`, `inputTokens` y `outputTokens`)
aplican a las operaciones de chat. El puerto de embeddings devuelve únicamente
vectores en esta versión y no expone métricas.

## Plan de implementación

1. Crear `src/infrastructure/adapters/llm/openai/` y sus barrels.
2. Añadir el puerto `EmbeddingClient` en `src/application/ports/llm/`.
3. Mover el ejecutor seguro y neutral de tools a `src/infrastructure/adapters/llm/`
   y actualizar Anthropic para reutilizarlo.
4. Implementar mappers OpenAI para mensajes, tools y resultados.
5. Implementar `OpenAiClient.ask` con Responses API.
6. Implementar `OpenAiClient.stream` y reconstrucción de llamadas de tools en streaming.
7. Implementar `generateEmbedding` y `generateEmbeddings` con `embeddings.create`
   para uno o varios textos.
8. Normalizar uso, respuestas inválidas y errores del SDK.
9. Añadir pruebas unitarias con SDK simulado.
10. Actualizar READMEs y `ARCHITECTURE.md`.

## Criterios de aceptación

- [ ] `OpenAiClient` implementa `LlmClient` y `EmbeddingClient`.
- [ ] Chat simple, historial y system prompt funcionan con la respuesta normalizada.
- [ ] Streaming entrega deltas y respuesta final.
- [ ] Tools iterativas conservan los items necesarios para Responses API.
- [ ] Los resultados de tools se asocian mediante `call_id`.
- [ ] Las tools de OpenAI reutilizan el ejecutor seguro y neutral compartido con Anthropic.
- [ ] `generateEmbeddings` conserva el orden de los textos.
- [ ] Un texto vacío, un elemento vacío o una lista vacía se rechaza con `AppError`.
- [ ] Las métricas de chat acumulan requests y tokens disponibles.
- [ ] Las operaciones de embeddings devuelven únicamente vectores y no exponen tipos del SDK.
- [ ] Las pruebas no realizan llamadas de red.
- [ ] `npm run typecheck`, `npm test` y `npm run build` finalizan correctamente.

## Decisiones tomadas y descartadas

- **Sí:** Responses API para chat OpenAI.
- **Sí:** embeddings únicamente para OpenAI en esta spec.
- **Sí:** contrato `EmbeddingClient` separado de `LlmClient`.
- **Sí:** `OpenAiClient` implementa ambas interfaces como capacidades independientes.
- **Sí:** inyección de una instancia configurada del SDK `OpenAI` mediante constructor.
- **Sí:** reutilizar el ejecutor seguro de tools desde el módulo común de adaptadores LLM.
- **Sí:** métricas únicamente en el resultado normalizado de chat; embeddings devuelve vectores.
- **No:** exponer objetos crudos del SDK.
- **No:** crear un `OpenAiEmbeddingClient` separado en esta spec.
- **No:** implementar almacenamiento vectorial junto con embeddings.

## Riesgos

| Riesgo                                                     | Mitigación                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Diferencias entre Responses API y mensajes tradicionales   | Aislar la conversión en mappers y probar tool loops.                     |
| Orden incorrecto de embeddings                             | Verificar posiciones de entrada y salida en pruebas.                     |
| Modelos que no soporten tools                              | Propagar error normalizado del proveedor.                                |
| Duplicación de ejecución segura de tools entre proveedores | Reutilizar el ejecutor neutral desde `src/infrastructure/adapters/llm/`. |

## Lo que **no** está incluido en este spec

- Gemini, Groq y Ollama.
- RAG y persistencia vectorial.
- Un cliente de embeddings separado de `OpenAiClient`.
- Funcionalidades OpenAI fuera de chat y embeddings.

---

Plan de implementación

1.  Crear el adaptador OpenAI y sus barrels.
2.  Añadir EmbeddingClient.
3.  Compartir el ejecutor seguro de tools con Anthropic.
4.  Implementar mappers OpenAI.
5.  Implementar OpenAiClient.ask.
6.  Implementar OpenAiClient.stream.
7.  Implementar embeddings.
8.  Normalizar uso, respuestas y errores.
9.  Añadir pruebas unitarias sin red.
10. Actualizar READMEs y ARCHITECTURE.md.
