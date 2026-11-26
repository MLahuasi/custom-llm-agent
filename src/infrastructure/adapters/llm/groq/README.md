# Adaptador Groq

`GroqClient` implementa `LlmClient` mediante una instancia configurada de
`Groq` inyectada por constructor:

```ts
const client = new GroqClient(groq, 'llama-3.3-70b-versatile', 1024);
```

El tercer argumento es el límite predeterminado de tokens de salida. Cada
operación puede sobrescribirlo con `LlmRequest.maxTokens`.

## Comportamiento

- `ask` y `stream` usan Chat Completions de `groq-sdk`.
- El historial neutral se convierte a mensajes `system`, `user`, `assistant` y
  `tool`.
- Las tools se declaran como funciones con JSON Schema compatible con Groq.
- Las llamadas fragmentadas durante streaming se acumulan por índice y sus
  argumentos se parsean únicamente al completar la llamada.
- Los mensajes `assistant` y `tool` se conservan entre iteraciones para
  continuar la conversación.
- Las tools se ejecutan mediante el ejecutor compartido, respetando límites y
  detección de duplicados.
- `onChunk` recibe cada delta textual del stream.

Usage, respuestas vacías, límites y errores del SDK se normalizan mediante el
contrato común y `AppError`, sin exponer payloads, credenciales ni detalles
internos.

Las pruebas usan un SDK simulado y no realizan llamadas de red.
