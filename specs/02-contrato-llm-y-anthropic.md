# SPEC 02 — Contrato común LLM y cliente Anthropic

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-11-26
> **Objetivo:** Definir el puerto común para clientes LLM e implementar el adaptador Anthropic con chat, streaming, historial, tools iterativas, métricas normalizadas y errores seguros.

## Alcance

**Incluye:**

- Contratos `LlmClient`, `LlmRequest`, `LlmResponse`, `LlmUsage`, `LlmMessage`, `LlmMessageRole`, `LlmToolDefinition`, `LlmToolCall` y `LlmToolExecutor` en `src/application/ports/llm/`.
- Inyección por constructor y composición manual.
- Métodos `ask` y `stream` con callback opcional `onChunk`.
- Historial neutral con roles `system`, `user`, `assistant` y `tool`.
- Ejecución iterativa de tools mediante `Messages API` manual.
- Validación básica de tools, detección de llamadas duplicadas y límites de iteraciones y llamadas.
- Normalización de texto, tools, tokens y requests del proveedor.
- Adaptador `AnthropicClient` en `src/infrastructure/adapters/llm/anthropic/`.
- Errores `AppError` con códigos estables y contexto seguro.
- Pruebas unitarias sin red ni credenciales reales.
- Actualización de barrels, READMEs locales, `README.md`, `AGENTS.md` y `ARCHITECTURE.md`.

**Fuera de alcance (para specs futuras):**

- Clientes OpenAI, Gemini, Groq u Ollama.
- Embeddings.
- Casos de uso, CLI o modificaciones de `src/main.ts`.
- Contenedor de inyección de dependencias.
- Tracking acumulado de costes y limitadores globales.
- Validación completa de JSON Schema mediante una dependencia externa.
- `beta.messages.toolRunner`, `AbortSignal`, RAG y persistencia.

## Modelo técnico

```ts
interface LlmClient {
  ask(request: LlmRequest): Promise<LlmResponse>;
  stream(request: LlmRequest): Promise<LlmResponse>;
}

interface LlmResponse {
  text: string;
  usage: {
    providerRequests: number;
    inputTokens: number;
    outputTokens: number;
  };
  toolsUsed: string[];
  toolCallCount: number;
}
```

`LlmRequest` recibirá `prompt`, `systemPrompt`, historial opcional, tools opcionales, ejecutor de tools, límites de tokens, `maxIterations`, `maxToolCalls` y `onChunk`.

El historial existente se conservará y `prompt` se añadirá siempre como último mensaje `user`. Los mensajes `system` se combinarán en orden y después se añadirá `systemPrompt`.

## Plan de implementación

1. Crear los tipos y barrels explícitos de `src/application/ports/llm/`.
2. Documentar el contrato y sus reglas de portabilidad en `src/application/ports/README.md`.
3. Crear la carpeta `src/infrastructure/adapters/llm/anthropic/` y sus barrels.
4. Implementar los mappers de mensajes y tools hacia Anthropic.
5. Implementar el ejecutor de tools con ejecución paralela, resultados ordenados y errores seguros.
6. Implementar `AnthropicClient.ask` mediante `messages.create`.
7. Implementar `AnthropicClient.stream` mediante `messages.stream` y `onChunk`.
8. Normalizar uso, errores del SDK, respuestas vacías y límites del bucle.
9. Añadir pruebas unitarias con el SDK simulado.
10. Actualizar documentación raíz y local con las decisiones adoptadas.

## Criterios de aceptación

- [ ] `npm run typecheck` finaliza sin errores.
- [ ] `LlmClient` no importa SDKs ni tipos de infraestructura.
- [ ] `AnthropicClient` implementa `LlmClient` mediante inyección por constructor.
- [ ] `ask` conserva el historial y añade `prompt` al final.
- [ ] `ask` devuelve texto y uso normalizado sin exponer tipos Anthropic.
- [ ] `stream` entrega todos los deltas de texto mediante `onChunk` y devuelve la respuesta final.
- [ ] Las tools se mapean desde JSON Schema neutral a Anthropic.
- [ ] Varias tools permitidas se ejecutan en paralelo y sus resultados conservan el orden de las llamadas.
- [ ] Las tools desconocidas, duplicadas, inválidas o fallidas producen resultados seguros para el modelo.
- [ ] Se aplican `maxIterations` y `maxToolCalls`.
- [ ] Se acumulan tokens y requests de todas las llamadas reales del bucle.
- [ ] Los errores del proveedor se convierten en `AppError` sin credenciales ni payloads sensibles.
- [ ] Las pruebas no realizan llamadas de red.
- [ ] `npm test` finaliza correctamente.

## Decisiones tomadas y descartadas

- **Sí:** el contrato vive en `src/application/ports/`; la infraestructura lo implementa.
- **Sí:** composición manual e inyección por constructor.
- **Sí:** JSON Schema neutral para tools.
- **Sí:** bucle manual con `Messages API`.
- **Sí:** ejecución paralela de tools con resultados ordenados.
- **Sí:** respuesta con `text`, `usage`, `toolsUsed` y `toolCallCount`.
- **No:** tipos nativos de Anthropic en la aplicación.
- **No:** `beta.messages.toolRunner`, por ser una abstracción específica y beta.
- **No:** limitadores globales y tracking de costes, porque no existen en SPEC 01.

## Riesgos

| Riesgo                                                | Mitigación                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Diferencias entre roles neutrales y bloques Anthropic | Mantener mappers aislados y probar historial con tools.        |
| Respuestas parciales o sin texto                      | Convertirlas en `AppError` estable.                            |
| Repetición de llamadas a tools                        | Registrar una firma determinista por nombre y argumentos.      |
| Retries internos del SDK                              | Usar defaults del SDK y contar requests lógicas del adaptador. |

## Lo que **no** está incluido en este spec

- Otros proveedores LLM.
- Embeddings.
- Casos de uso y CLI.
- Persistencia, RAG, cancelación y costes globales.

---

Plan de implementación

1.  Crear tipos y barrels del contrato LLM.
2.  Documentar el contrato en src/application/ports/README.md.
3.  Crear la estructura del adaptador Anthropic.
4.  Implementar mappers de mensajes y tools.
5.  Implementar el ejecutor paralelo de tools.
6.  Implementar AnthropicClient.ask.
7.  Implementar AnthropicClient.stream.
8.  Normalizar uso, errores, respuestas vacías y límites.
9.  Añadir pruebas unitarias con SDK simulado.
10. Actualizar documentación raíz y local.
