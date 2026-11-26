# Adaptador Ollama

`OllamaClient` implementa `LlmClient` usando el cliente oficial `ollama` y un
host configurable:

```ts
const client = new OllamaClient(
  process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  'llama3.1',
  { temperature: 0.2 },
);
```

El tercer argumento contiene opciones de generación de Ollama. `maxTokens` de
cada request se traduce a `options.num_predict`. El cuarto argumento permite
inyectar `fetch` en pruebas; normalmente se usa el `fetch` global de Node.js.

## Comportamiento

- `ask` y `stream` usan `ollama.chat`.
- El historial neutral se convierte a mensajes `system`, `user`, `assistant` y
  `tool`.
- Las tools se declaran con el formato de funciones de Ollama.
- Los tool calls se acumulan por posición durante streaming y sus argumentos se
  combinan antes de ejecutar la tool.
- Los mensajes `assistant` y `tool` se conservan entre iteraciones.
- Los resultados de tools usan `role: 'tool'` y `tool_name`.
- Los límites compartidos de iteraciones y llamadas se leen mediante
  `getLlmDefaults()`.
- `prompt_eval_count` y `eval_count` se normalizan a tokens de entrada y salida;
  si faltan, el valor es `0`.

El servidor Ollama debe estar iniciado y el modelo debe existir en el host
configurado. Las pruebas inyectan un `fetch` simulado y no requieren un servidor
Ollama real.
