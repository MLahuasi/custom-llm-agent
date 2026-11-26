# Adaptador Anthropic

`AnthropicClient` implementa `LlmClient` mediante inyección por constructor:

```ts
const client = new AnthropicClient(anthropic, 'claude-sonnet-4-5', 1024);
```

El tercer argumento es el `defaultMaxTokens`; `LlmRequest.maxTokens` puede
sobrescribirlo por operación.

## Comportamiento

- `ask` usa `messages.create` y conserva el historial neutral.
- `stream` usa `messages.stream` y entrega los deltas mediante `onChunk`.
- Los mensajes `system` se combinan en orden y se envían al parámetro superior
  `system` de Anthropic.
- Las tools se convierten desde JSON Schema neutral a `input_schema`.
- El bucle manual conserva los bloques `assistant` y responde con bloques
  `tool_result`, sin usar `beta.messages.toolRunner`.
- Las llamadas válidas se ejecutan en paralelo y sus resultados conservan el
  orden original.
- Los límites compartidos se configuran mediante `LLM_MAX_ITERATIONS` y
  `LLM_MAX_TOOL_CALLS`.

Los errores del proveedor, las respuestas vacías y los límites se convierten en
`AppError` con códigos estables. Los payloads, credenciales y detalles internos
no se exponen al modelo ni al consumidor.

Las pruebas del adaptador usan un SDK simulado y no realizan llamadas de red.
