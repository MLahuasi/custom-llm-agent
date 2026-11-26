# Adaptador Gemini

`GeminiClient` implementa `LlmClient` mediante una instancia configurada de
`GoogleGenAI` inyectada por constructor:

```ts
const client = new GeminiClient(gemini, 'gemini-2.5-flash', 1024);
```

El tercer argumento es el límite predeterminado de tokens de salida. Cada
operación puede sobrescribirlo con `LlmRequest.maxTokens`.

## Comportamiento

- `ask` usa `models.generateContent`.
- `stream` usa `models.generateContentStream` y entrega cada delta mediante
  `onChunk`.
- El historial neutral se convierte a `Content[]`; los mensajes `system` se
  envían como `systemInstruction`.
- Las tools se declaran como `functionDeclarations` y sus resultados como
  `functionResponse`.
- Las llamadas se ejecutan manualmente, en paralelo y dentro de los límites
  compartidos de iteraciones y tools.
- Los contenidos `model` y `user` se reconstruyen entre iteraciones para
  continuar la conversación.

Los tokens ausentes se normalizan a cero. Las respuestas vacías, métricas
inválidas y errores del SDK se convierten en `AppError` sin exponer payloads,
credenciales ni detalles internos.

Las pruebas usan un SDK simulado y no realizan llamadas de red.
