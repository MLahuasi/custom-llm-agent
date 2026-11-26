# Adaptador OpenAI

`OpenAiClient` implementa `LlmClient` y `EmbeddingClient` mediante una instancia
configurada de `OpenAI` inyectada por constructor:

```ts
const client = new OpenAiClient(
  openai,
  'gpt-5',
  'text-embedding-3-small',
  1024,
);
```

Los argumentos son, en orden, el SDK, el modelo de chat, el modelo de embeddings
y el límite predeterminado de tokens de salida. `LlmRequest.maxTokens` puede
sobrescribir el límite de chat por operación.

## Chat

- `ask` y `stream` usan Responses API.
- El historial neutral se convierte a `ResponseInput`.
- Los mensajes de sistema se envían como `instructions`.
- Las function tools se ejecutan en un bucle manual y sus resultados se asocian
  mediante `call_id`.
- `stream` entrega los eventos `response.output_text.delta` mediante `onChunk`.
- Los items de output se conservan para continuar el bucle de tools.

## Embeddings

- `generateEmbedding` genera un vector para un texto.
- `generateEmbeddings` conserva el orden original mediante el índice devuelto por
  OpenAI.
- Textos vacíos, elementos vacíos y listas vacías producen `AppError`.
- El puerto de embeddings devuelve únicamente `number[]` y `number[][]`; no expone
  métricas ni tipos del SDK.

Los límites compartidos de iteraciones y tools se leen mediante
`getLlmDefaults()`, usando `LLM_MAX_ITERATIONS` y `LLM_MAX_TOOL_CALLS`.
Los errores del SDK, las respuestas inválidas y las métricas inválidas se
normalizan a `AppError` sin filtrar credenciales ni payloads.

Las pruebas usan un SDK simulado y no realizan llamadas de red.
