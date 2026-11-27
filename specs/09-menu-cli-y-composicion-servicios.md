# SPEC 09 — Menú CLI y composición de servicios

> **Estado:** Borrador
> **Depende de:** SPEC 08
> **Fecha:** 2026-11-27
> **Objetivo:** Reemplazar el mensaje de arranque por un menú interactivo de consola que permita navegar por diez casos de uso provisionales y componga los servicios compartidos de la sesión.

## Alcance

**Incluye:**

- `menu.ts` ejecutable desde `src/main.ts`.
- Menú principal interactivo con las diez opciones y nombres del archivo de referencia.
- Submenú provisional para cada opción que muestra el caso seleccionado y permite regresar con Enter.
- Salida limpia con la opción `0`, Ctrl+C, EOF y cierre de `readline`.
- Manejo de opciones inválidas sin terminar la aplicación.
- Composición de una instancia única de `GuardrailsService`, `LlmUsageLimiterService` y `LlmUsageTrackerService` por ejecución.
- Configuración de guardrails y limiter mediante variables documentadas en `.env.template` y `README.md`.
- `usage-utils.ts` con las cinco funciones de formato, consulta e impresión acordadas.
- Pruebas unitarias y de CLI con entrada y salida inyectadas, sin interacción real.
- Actualización de `README.md`, `AGENTS.md` y `ARCHITECTURE.md`.

**Fuera de alcance (para specs futuras):**

- Implementación de los diez casos de uso.
- Submenús funcionales específicos de cada caso de uso.
- Ejecución de llamadas LLM desde el menú.
- Integración del limiter y tracker dentro de los cinco adaptadores.
- Persistencia de métricas o configuración.
- Nuevos proveedores, dependencias o funcionalidades RAG.

## Modelo de datos

El menú trabajará con una lista de opciones inmutable, equivalente a:

```ts
interface MenuOption {
  readonly value: string;
  readonly label: string;
}
```

Las diez etiquetas serán exactamente:

1. `Simple Call`
2. `System Prompt`
3. `Streaming Response`
4. `Chat`
5. `Read file and call LLM`
6. `Agentic Loop with tools`
7. `Agentic Loop with RAG`
8. `Agentic Loop`
9. `Orchestrate Llms`
10. `Security - Guardrails`

La configuración de sesión se construirá con:

- `GUARDRAIL_MAX_INPUT_LENGTH`, con valor predeterminado `8000`.
- `LLM_MAX_REQUESTS`, con valor predeterminado `20`.
- `LLM_USAGE_WINDOW_MS`, con valor predeterminado `600000`.

El limiter, tracker y guardrails se crearán una sola vez y se conservarán mientras la aplicación esté activa.

## Plan de implementación

1. Crear los lectores de configuración `guardrails-config.ts` y `llm-usage-config.ts`, reutilizando `environment.ts` y validación segura con `AppError`.
2. Añadir las tres variables a `.env.template` con comentarios que expliquen sus unidades y propósito.
3. Crear `usage-utils.ts` con `formatDuration`, `formatWindow`, `printLlmUsage`, `getSessionUsage` y `hasAvailableLlmRequests`, recibiendo servicios por parámetros explícitos.
4. Crear `menu.ts` con una interfaz `readline/promises` compartida, el menú principal y el flujo provisional de submenús.
5. Implementar opciones inválidas, errores recuperables, `0`, Ctrl+C, EOF y cierre en `finally`.
6. Actualizar `main.ts` para cargar el entorno, construir las instancias compartidas e invocar el menú.
7. Mostrar el estado de requests, tokens y costos al volver de cada opción; el estado inicial debe ser cero y no debe requerir un caso de uso real.
8. Añadir pruebas de configuración, utilidades y navegación CLI mediante streams o dependencias inyectadas.
9. Actualizar barrels, `README.md`, `AGENTS.md` y `ARCHITECTURE.md` con el nuevo flujo de arranque y sus decisiones.

## Criterios de aceptación

- [ ] `src/main.ts` carga el entorno, crea los tres servicios compartidos e inicia el menú.
- [ ] La aplicación ya no termina mostrando únicamente `Custom LLM Agent initialized.`.
- [ ] El menú muestra las diez opciones con sus nombres exactos y la opción `0. Salir`.
- [ ] Introducir un número del `1` al `10` muestra el nombre del caso de uso seleccionado.
- [ ] Cada opción seleccionada muestra el mensaje para presionar Enter y vuelve al menú principal al recibir Enter.
- [ ] El menú continúa ejecutándose después de una opción inválida.
- [ ] La opción `0` cierra readline y termina sin error.
- [ ] Ctrl+C, EOF y el cierre de readline terminan limpiamente sin dejar preguntas pendientes.
- [ ] Los errores recuperables se muestran sin cerrar el menú principal.
- [ ] `GuardrailsService`, `LlmUsageLimiterService` y `LlmUsageTrackerService` son instancias únicas por ejecución.
- [ ] `GUARDRAIL_MAX_INPUT_LENGTH` se documenta con valor predeterminado `8000`.
- [ ] `LLM_MAX_REQUESTS` se documenta con valor predeterminado `20`.
- [ ] `LLM_USAGE_WINDOW_MS` se documenta con valor predeterminado `600000`.
- [ ] Los valores de configuración inválidos producen errores seguros y verificables.
- [ ] `printLlmUsage` muestra requests de sesión, ventana, disponibilidad, tokens y costo estimado.
- [ ] Un costo `null` se muestra como no disponible, no como `$0`.
- [ ] El estado de uso se muestra al regresar de cada opción del menú.
- [ ] Las pruebas de CLI no necesitan una terminal, credenciales ni red.
- [ ] `npm run typecheck`, `npm test` y `npm run build` finalizan correctamente.
- [ ] `README.md`, `AGENTS.md` y `ARCHITECTURE.md` describen el menú y las variables nuevas.

## Decisiones tomadas y descartadas

- **Sí:** mantener una sola interfaz `readline/promises` para el menú y sus submenús.
- **Sí:** usar Enter para regresar desde el submenú provisional.
- **Sí:** conservar exactamente los nombres ingleses del menú de referencia.
- **Sí:** construir los servicios una vez en `main.ts` e inyectarlos al menú.
- **Sí:** mostrar el resumen de consumo al volver de cada opción.
- **Sí:** documentar configuración en `.env.template` y `README.md`; `.env` permanece local y sin modificar.
- **Sí:** hacer `usage-utils.ts` dependiente de servicios recibidos por parámetros, evitando singletons ocultos.
- **No:** implementar casos de uso reales en esta spec.
- **No:** aplicar guardrails al número de selección del menú.
- **No:** crear una opción adicional de consumo que altere la numeración acordada.
- **No:** crear o versionar `.env`.
- **No:** mantener múltiples interfaces readline activas simultáneamente.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Dos interfaces leen simultáneamente de stdin | Crear una sola interfaz y cerrarla únicamente en el flujo principal. |
| Ctrl+C deja una promesa de pregunta pendiente | Manejar `SIGINT`, cerrar la interfaz y verificarlo con una prueba de CLI. |
| El menú aparenta ejecutar casos inexistentes | Mostrar explícitamente que el submenú es provisional y no invocar casos de uso. |
| Variables de entorno inválidas producen límites inseguros | Validar enteros positivos y ventanas mayores que cero antes de componer servicios. |

## Lo que **no** está incluido en este spec

- Casos de uso funcionales y sus submenús reales.
- Llamadas LLM desde las opciones del menú.
- Integración del consumo con los adaptadores.
- Persistencia de costos, tokens o límites.
- Archivo `.env` versionado o modificado automáticamente.
