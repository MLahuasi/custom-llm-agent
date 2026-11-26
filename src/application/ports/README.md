# Puertos de aplicación

Esta carpeta contiene las interfaces que desacoplan los casos de uso de los adaptadores externos.

## Contrato LLM

El contrato público está en `src/application/ports/llm/` y se exporta mediante los
barrels de `llm`, `ports` y `application`.

### Cliente

`LlmClient` define dos operaciones:

- `ask(request)`: obtiene una respuesta completa.
- `stream(request)`: entrega los fragmentos de texto mediante `onChunk` y devuelve
  igualmente la respuesta final completa.

Ambas operaciones reciben un `LlmRequest` y devuelven un `LlmResponse` con:

- `text`: texto final normalizado.
- `usage`: requests al proveedor y tokens de entrada y salida.
- `toolsUsed`: nombres de las tools ejecutadas.
- `toolCallCount`: número total de llamadas a tools.

### Requests e historial

`prompt` es obligatorio y siempre representa el último mensaje `user`. El historial
opcional se conserva en `history`, con mensajes de rol `system`, `user`, `assistant`
o `tool`. `systemPrompt`, cuando existe, se añade después de los mensajes `system`
del historial.

Los límites `maxTokens`, `maxIterations` y `maxToolCalls` son opcionales y los
adaptadores deben aplicar valores seguros cuando no se proporcionen. `onChunk`
puede ser síncrono o asíncrono.

### Tools

`LlmToolDefinition` utiliza un esquema JSON neutral mediante `inputSchema`; no
expone tipos de ningún proveedor. `LlmToolCall` contiene un identificador estable,
el nombre de la tool y sus argumentos ya interpretados.

`LlmToolExecutor` ejecuta una llamada individual y devuelve un resultado que el
adaptador convierte al formato del proveedor. Los adaptadores deben convertir en
resultados seguros los nombres desconocidos, argumentos inválidos y errores de
ejecución, sin filtrar credenciales, payloads sensibles ni detalles internos.

## Tipos de puertos

- Puertos de entrada: contratos para ejecutar casos de uso.
- Puertos de salida: contratos para LLMs, persistencia, embeddings y herramientas.

## Reglas

- Las interfaces describen capacidades, no implementaciones.
- No deben importar SDKs de Anthropic, Gemini, OpenAI, Groq u Ollama.
- Los casos de uso consumen puertos de salida mediante inversión de dependencias.
- Los tipos compartidos deben permanecer neutrales para que un adaptador pueda
  sustituirse sin cambiar los casos de uso.
- Las respuestas y métricas expuestas por un adaptador deben estar normalizadas;
  los tipos nativos del proveedor permanecen dentro de infraestructura.
- La composición de clientes y ejecutores se realiza mediante inyección por
  constructor o composición manual, no mediante un contenedor obligatorio.
