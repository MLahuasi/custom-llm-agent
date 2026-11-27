# SPEC 07 — Servicios de seguridad y consumo LLM

> **Estado:** Implementado
> **Depende de:** SPEC 06
> **Fecha:** 2026-11-27
> **Objetivo:** Incorporar servicios de guardrails, limitación y seguimiento de consumo LLM, junto con el uso normalizado requerido por los adaptadores existentes.

## Alcance

**Incluye:**

- Servicio `GuardrailsService` para sanitizar entradas y detectar patrones heurísticos de prompt injection en español e inglés.
- Servicio `LlmUsageLimiterService` para limitar llamadas LLM dentro de una ventana temporal.
- Servicio `LlmUsageTrackerService` para acumular requests, tokens y costos estimados durante la sesión.
- Contratos, tabla de precios, errores y barrels explícitos bajo `src/application/services/`.
- Extensión del contrato `LlmUsage` con proveedor y modelo.
- Actualización de Anthropic, OpenAI, Gemini, Groq y Ollama para devolver proveedor y modelo en sus métricas normalizadas.
- Pruebas unitarias de sanitización, detección, límite, cálculo, agrupación y costos desconocidos.
- Actualización de `README.md`, `AGENTS.md` y `ARCHITECTURE.md`.

**Fuera de alcance (para specs futuras):**

- Integración del limiter y tracker dentro de las llamadas de los adaptadores.
- Menú CLI y composición de servicios en `main.ts`.
- Casos de uso funcionales, RAG, tools adicionales y persistencia.
- Persistencia del consumo entre ejecuciones.
- Cambios en dependencias externas.

## Modelo de datos

Los servicios se organizarán en los siguientes módulos:

- `src/application/services/security/contracts.ts`
  - `GuardrailResult` con `safe`, `sanitized` y `reason` opcional.
  - `RateLimiterConfig` con `maxRequest` y `windowMs`.
  - `GuardrailsConfig` con `maxInputLength` y configuración de límite.
- `src/application/services/security/injection-patterns.ts`
  - Catálogo explícito de patrones heurísticos en español e inglés.
- `src/application/services/llm-usage/contracts.ts`
  - `LlmUsage` con `provider`, `model`, `providerRequests`, `inputTokens` y `outputTokens`.
  - `LlmUsageLimiterOptions`.
  - `LlmUsageLimitStats`.
  - `LlmUsageCost` con costos `number | null`.
  - `LlmUsageSummary` con `totalCost: number | null`.
- `src/application/services/llm-usage/pricing.ts`
  - Tabla de precios de referencia en USD por millón de tokens.
  - Un modelo sin precio configurado produce costos `null`, no costo cero.

Las instancias de los servicios mantendrán estado únicamente en memoria durante la ejecución actual.

## Plan de implementación

1. Crear los módulos `security` y `llm-usage` con barrels de exports nombrados.
2. Definir los contratos de guardrails y consumo sin depender de SDKs ni infraestructura.
3. Implementar el catálogo de patrones de prompt injection en español e inglés.
4. Implementar `GuardrailsService` con sanitización, truncamiento, detección y resultado seguro.
5. Implementar `LlmUsageLimiterService` con eliminación de solicitudes expiradas, consumo, estadísticas y `AppError` con código estable `LLM_USAGE_LIMIT_EXCEEDED`.
6. Implementar `LlmUsageTrackerService` con registro, consulta, agrupación y cálculo de costos conocidos o desconocidos.
7. Actualizar el contrato LLM y los cinco adaptadores para incluir `provider` y `model` en sus respuestas de uso.
8. Actualizar las pruebas existentes y agregar pruebas unitarias nuevas sin llamadas de red.
9. Actualizar los barrels superiores y la documentación técnica y de uso.

## Criterios de aceptación

- [x] `GuardrailsService` elimina bytes nulos y caracteres de control no permitidos.
- [x] `GuardrailsService` limita entradas según `maxInputLength` y conserva una indicación de truncamiento.
- [x] `GuardrailsService` detecta los patrones heurísticos definidos en español e inglés.
- [x] Una entrada detectada devuelve `safe: false` y no registra una llamada LLM.
- [x] `LlmUsageLimiterService.consume()` registra llamadas dentro de la ventana configurada.
- [x] El limiter rechaza una llamada excedida con `AppError` y código `LLM_USAGE_LIMIT_EXCEEDED`.
- [x] `getStats()` informa uso, disponibilidad, máximo, ventana y `retryAfterMs`.
- [x] `LlmUsageTrackerService` registra y devuelve copias de los consumos de sesión.
- [x] El tracker calcula costos de entrada, salida y total por modelo conocido.
- [x] El tracker representa con `null` el costo de un modelo sin precio.
- [x] Un resumen mixto muestra `totalCost: null` cuando contiene un modelo sin precio.
- [x] La agrupación por proveedor y modelo suma requests y tokens correctamente.
- [x] `LlmUsage` incluye proveedor y modelo en los cinco adaptadores.
- [x] Las pruebas no requieren credenciales, red ni servidores de proveedores.
- [x] `npm run typecheck`, `npm test` y `npm run build` finalizan correctamente.
- [x] La documentación describe la ubicación, límites y ciclo de vida en memoria de los servicios.

## Decisiones tomadas y descartadas

- **Sí:** ubicar los servicios en `src/application/services/` porque representan políticas neutrales de la aplicación.
- **Sí:** separar `security` y `llm-usage` para mantener contratos y responsabilidades acotados.
- **Sí:** extender el `LlmUsage` existente con proveedor y modelo para conservar una única métrica normalizada.
- **Sí:** usar `AppError` con código estable para el límite excedido.
- **Sí:** representar costos desconocidos con `null` para distinguirlos de los modelos gratuitos.
- **Sí:** conservar patrones heurísticos en español e inglés basados en el catálogo de referencia.
- **No:** duplicar el rate limiting de guardrails y el limiter de llamadas LLM.
- **No:** conectar todavía los servicios a las llamadas reales de los adaptadores.
- **No:** persistir consumo o límites entre ejecuciones.
- **No:** usar `Error` genérico para una condición de aplicación conocida.

## Riesgos

| Riesgo                                                    | Mitigación                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Extender `LlmUsage` rompe respuestas y pruebas existentes | Actualizar los cinco adaptadores y validar typecheck y pruebas antes de cerrar la spec. |
| Los patrones heurísticos pueden producir falsos positivos | Documentar que la detección no es garantía completa y mantener el catálogo acotado.     |
| Los precios pueden quedar desactualizados                 | Mantener la tabla aislada y marcar modelos no configurados como costo no disponible.    |
| El estado se pierde al reiniciar la aplicación            | Documentar explícitamente que la persistencia pertenece a otra spec.                    |

## Lo que **no** está incluido en este spec

- Integración del limiter y tracker en las llamadas reales de los adaptadores.
- Menú CLI y composición desde `main.ts`.
- Casos de uso, RAG, persistencia y almacenamiento histórico.
- Nuevos proveedores o dependencias.

---
