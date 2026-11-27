# SPEC 08 — Homologación de clientes LLM

> **Estado:** Borrador
> **Depende de:** SPEC 07
> **Fecha:** 2026-11-27
> **Objetivo:** Homologar los clientes LLM de esta aplicación con la lógica funcional de referencia del repositorio `ai-agent-labs`, conservando el contrato neutral, los límites de seguridad y el aislamiento de los SDKs.

## Referencias

- Clientes de chat de referencia: [`ai-agent-labs/ai-developer/src/llm/clients/chat`](https://github.com/MLahuasi/ai-agent-labs/tree/main/ai-developer/src/llm/clients/chat).
- Cliente de embeddings de referencia: [`ai-agent-labs/ai-developer/src/llm/clients/embedding`](https://github.com/MLahuasi/ai-agent-labs/tree/main/ai-developer/src/llm/clients/embedding).
- Adaptadores de esta aplicación: `src/infrastructure/adapters/llm/`.

La referencia funcional se utilizará como guía de comportamiento, no como código para copiar literalmente. Las decisiones de arquitectura de esta aplicación prevalecen cuando difieren de la referencia.

## Alcance

**Incluye:**

- Homologar `ask()` y `stream()` de Anthropic, OpenAI, Gemini, Groq y Ollama.
- Mantener historial, system prompt, tools, ejecución iterativa y callbacks de streaming.
- Añadir un límite separado de tokens para respuestas con tools mediante `maxTokensTools`.
- Completar el ciclo de tools durante streaming, incluyendo llamadas sucesivas al proveedor.
- Corregir acumulación, deduplicación y normalización de métricas de tokens en streaming.
- Homologar los mensajes de assistant y tool que se reinyectan en cada proveedor.
- Validar respuestas, argumentos de tools, tool calls incompletas y estados de stream.
- Mantener errores seguros mediante `AppError` con códigos estables.
- Integrar `LlmUsageLimiterService` antes de cada llamada física al proveedor.
- Integrar `LlmUsageTrackerService` con el número real de requests, proveedor y modelo.
- Aplicar limiter y tracker también a embeddings de OpenAI.
- Homologar `OpenAiClient` para conservar chat y embeddings sin duplicar clientes.
- Actualizar pruebas unitarias sin credenciales, red ni servidores externos.
- Actualizar `README.md`, `AGENTS.md` y `ARCHITECTURE.md` con las decisiones de homologación.

**Fuera de alcance (para specs futuras):**

- Nuevos proveedores o dependencias.
- Persistencia de conversaciones, métricas o límites.
- Casos de uso funcionales, RAG y composición CLI.
- Cambiar el contrato de herramientas para soportar esquemas distintos a JSON Schema.
- Implementar tools específicas de negocio.
- Hacer que los proveedores expongan tipos de sus SDK fuera de infraestructura.

## Modelo de datos

El contrato neutral de solicitud deberá incluir:

```ts
interface LlmRequest {
  prompt: string;
  systemPrompt?: string;
  history?: readonly LlmMessage[];
  tools?: readonly LlmToolDefinition[];
  toolExecutor?: LlmToolExecutor;
  maxTokens?: number;
  maxTokensTools?: number;
  maxIterations?: number;
  maxToolCalls?: number;
  onChunk?: (chunk: string) => unknown | Promise<unknown>;
}
```

El resultado continuará utilizando `LlmResponse` y `LlmUsage` normalizados:

- `provider`.
- `model`.
- `providerRequests` con la cantidad real de llamadas físicas.
- `inputTokens` acumulados.
- `outputTokens` acumulados.
- `toolsUsed` sin duplicados.
- `toolCallCount` acumulado durante la ejecución.

El cliente de embeddings deberá conservar:

```ts
interface EmbeddingClient {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: readonly string[]): Promise<number[][]>;
}
```

Las llamadas de embeddings registrarán `providerRequests: 1`, tokens de entrada reportados por OpenAI y `outputTokens: 0`.

## Reglas funcionales de homologación

### Llamadas y límites

- El limiter se consume inmediatamente antes de cada llamada física al SDK.
- Una ejecución con tools puede consumir varias solicitudes del limiter.
- `maxTokens` aplica a llamadas directas.
- `maxTokensTools` aplica a cada iteración que utilice tools; si no se proporciona, se utilizará el límite predeterminado del adaptador.
- `maxIterations` limita las iteraciones del ciclo de tools.
- `maxToolCalls` limita el total de llamadas de tools de la ejecución.
- El tracker registra una única métrica agregada por ejecución, con el número real de llamadas físicas.

### Tools

- Las llamadas se validan antes de ejecutarse.
- Los argumentos deben ser objetos JSON.
- Las tools no registradas, duplicadas, inválidas o fallidas producen resultados seguros para el modelo.
- Las ejecuciones permitidas se realizan en paralelo cuando el proveedor lo permite y sus resultados conservan el orden original.
- Los mensajes de resultados se serializan según el contrato de cada proveedor.
- Las excepciones internas de una tool no se exponen al modelo ni al usuario.

### Streaming

- Se reenvía cada fragmento mediante `onChunk`.
- Se esperan los callbacks asíncronos antes de devolver la respuesta.
- Las tool calls fragmentadas se acumulan por índice o identificador.
- Los tokens de cada iteración se suman, no se reemplazan.
- El stream debe terminar en un estado válido; estados incompletos o errores se convierten en `AppError`.
- Anthropic debe ejecutar el ciclo completo de `tool_use` y `tool_result` también en streaming.

### Embeddings

- Las entradas vacías o compuestas únicamente por espacios se rechazan.
- Se conserva el orden original de los vectores usando el índice del proveedor.
- Se valida que cada vector contenga únicamente números.
- Las respuestas incompletas o desordenadas producen `EMBEDDING_INVALID_RESPONSE`.
- Los errores del proveedor se convierten en `EMBEDDING_PROVIDER_ERROR`.

## Plan de implementación

1. Revisar y actualizar el contrato neutral `LlmRequest` con `maxTokensTools`, y eliminar la duplicación de `LlmUsage` entre ports y servicios.
2. Definir una política compartida de ejecución, límites, deduplicación, errores y registro de uso sin depender de SDKs.
3. Homologar Anthropic: ciclo completo de tools en streaming, preservación de mensajes assistant/tool y métricas agregadas.
4. Homologar OpenAI: Responses API, replay de output items, function calls en streaming y separación de límites directos/tools.
5. Homologar Gemini: acumulación de tokens, deduplicación de function calls y preservación de `Content` generado durante streaming.
6. Homologar Groq: uso de `x_groq.usage` en streaming, `max_completion_tokens` y reconstrucción robusta de tool calls.
7. Homologar Ollama: `think`, `keep_alive`, opciones de generación, system prompt configurado y mensajes de tools durante streaming.
8. Integrar limiter y tracker en cada llamada física de los cinco clientes y en embeddings OpenAI.
9. Actualizar pruebas unitarias de todos los adaptadores y agregar pruebas de paridad para streaming, tools, límites, errores, métricas y embeddings.
10. Actualizar barrels y documentación técnica y de uso.

## Criterios de aceptación

- [ ] `LlmRequest` soporta `maxTokensTools`.
- [ ] Existe una única definición reutilizable de `LlmUsage` con proveedor, modelo, requests y tokens.
- [ ] Los cinco clientes soportan chat directo, historial, system prompt y streaming.
- [ ] Anthropic ejecuta tools iterativamente tanto en `ask()` como en `stream()`.
- [ ] OpenAI conserva los output items necesarios para continuar un ciclo de tools en Responses API.
- [ ] Gemini conserva el `Content` del modelo y sus function calls entre iteraciones de streaming.
- [ ] Gemini suma correctamente tokens de todas las iteraciones.
- [ ] Groq obtiene el uso streaming desde `x_groq.usage` cuando el proveedor lo entrega.
- [ ] Groq utiliza `max_completion_tokens` para limitar la salida.
- [ ] Ollama conserva tools, mensajes de resultados, `think`, `keep_alive` y opciones configuradas.
- [ ] Las tool calls fragmentadas se reconstruyen y validan correctamente en los proveedores que las fragmentan.
- [ ] Los límites de iteraciones, tools y tokens producen errores seguros y verificables.
- [ ] Se ejecuta `LlmUsageLimiterService.consume()` antes de cada llamada física al proveedor.
- [ ] El tracker registra el número real de llamadas físicas y sus tokens acumulados.
- [ ] Embeddings OpenAI individuales y por lote consumen el limiter y registran uso.
- [ ] Los embeddings conservan el orden de entrada y validan vectores y respuestas.
- [ ] Los errores de proveedores, streams, tools y embeddings no exponen payloads ni credenciales.
- [ ] Las pruebas no requieren credenciales, red ni servidores de proveedores.
- [ ] `npm run typecheck`, `npm test` y `npm run build` finalizan correctamente.
- [ ] La documentación describe el contrato homologado y las diferencias relevantes por proveedor.

## Decisiones tomadas y descartadas

- **Sí:** usar los clientes de `ai-agent-labs` como referencia funcional.
- **Sí:** conservar la arquitectura hexagonal y los puertos neutrales de esta aplicación.
- **Sí:** inyectar clientes SDK y dependencias de prueba en los adaptadores.
- **Sí:** consumir el limiter por llamada física, no por ejecución lógica completa.
- **Sí:** registrar una métrica agregada por ejecución con `providerRequests` real.
- **Sí:** mantener errores seguros con `AppError` y códigos estables.
- **Sí:** conservar el ejecutor neutral compartido cuando cubra el comportamiento requerido.
- **Sí:** validar y ordenar embeddings antes de devolverlos.
- **No:** copiar directamente la creación de SDKs con credenciales desde la referencia.
- **No:** exponer tipos de Anthropic, OpenAI, Gemini, Groq u Ollama en el contrato de aplicación.
- **No:** integrar el menú CLI o los casos de uso funcionales en esta spec.
- **No:** usar un único `consume()` para una ejecución que puede realizar múltiples llamadas físicas.
- **No:** convertir costos o métricas desconocidas en cero silenciosamente.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El streaming de cada SDK representa tools de forma distinta | Mantener mappers y pruebas específicas por proveedor sobre un contrato neutral común. |
| Una ejecución con tools puede exceder el límite sin que el llamador lo perciba | Consumir el limiter inmediatamente antes de cada llamada física y probar iteraciones sucesivas. |
| Las métricas streaming pueden aparecer solo en el chunk final | Acumular la última métrica válida y probar respuestas con y sin métricas parciales. |
| Cambios en SDKs rompen tipos o eventos | Mantener tipos de SDK dentro de infraestructura y validar con `typecheck` y pruebas simuladas. |
| Los modelos pueden devolver argumentos inválidos o repetidos | Validar JSON, detectar duplicados y devolver mensajes seguros al modelo. |
| Los precios o modelos pueden no estar configurados | Mantener costos desconocidos como `null` en el tracker. |
| La referencia y la arquitectura local tienen contratos distintos | Documentar cada adaptación y no copiar decisiones de composición o credenciales. |

## Lo que **no** está incluido en este spec

- Menú CLI y composición de servicios desde `main.ts`.
- Implementación de casos de uso, RAG u orquestación de proveedores.
- Persistencia de conversaciones, límites o métricas.
- Nuevos proveedores o dependencias.
- Integración de guardrails dentro de los clientes LLM.
