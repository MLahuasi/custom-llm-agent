# Custom LLM Agent

Aplicación de consola construida con Node.js y TypeScript para estudiar la creación de agentes personalizados con diferentes proveedores LLM.

## Estado actual

Este proyecto contiene el bootstrap técnico, el contrato LLM neutral y adaptadores
para Anthropic y OpenAI. La aplicación actualmente solo muestra un mensaje de
inicialización:

```text
Custom LLM Agent initialized.
```

Los casos de uso de agentes, RAG y persistencia vectorial se incorporarán en specs
posteriores. Los adaptadores ya encapsulan el chat, el streaming y la ejecución de
tools necesarias para que esos casos de uso los orquesten.

## Requisitos

- Node.js `>=22.12.0`.
- npm.

Node.js 24 LTS es la versión recomendada para mantener compatibilidad documentada con las dependencias actuales.

## Instalación

```bash
npm install
```

Copia `.env.template` a `.env` y completa únicamente las credenciales que necesites. El archivo `.env` está ignorado por Git.

## Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Ejecuta `src/main.ts` con `tsx`. |
| `npm run build` | Compila TypeScript en `dist/`. |
| `npm run start` | Ejecuta `dist/main.js` con Node.js. |
| `npm run typecheck` | Valida los tipos sin generar archivos. |
| `npm test` | Ejecuta las pruebas Vitest una vez. |
| `npm run test:watch` | Ejecuta Vitest en modo observación. |

## Variables de entorno

`.env` y `.env.template` contienen estas variables:

- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `GROQ_API_KEY`
- `OLLAMA_BASE_URL`
- `OLLAMA_API_KEY`
- `CONTEXT7_API_KEY`
- `LLM_MAX_ITERATIONS`: máximo de iteraciones de proveedor en un bucle de tools; por defecto `8`.
- `LLM_MAX_TOOL_CALLS`: máximo total de llamadas a tools por operación; por defecto `32`.

`src/shared/utils/environment.ts` expone `loadEnvironment`, `optionalEnv` y `requiredEnv`. Las variables requeridas se validan al ejecutar el caso de uso que las necesita, no durante el arranque global.

`LLM_MAX_ITERATIONS` y `LLM_MAX_TOOL_CALLS` se leen mediante
`src/shared/utils/llm-config.ts`, por lo que los mismos límites pueden reutilizarse
en todos los adaptadores LLM. Si no se configuran, se aplican los valores por defecto
documentados arriba. Deben ser enteros positivos.

La configuración de OpenCode usa `CONTEXT7_API_KEY` desde el entorno del proceso. OpenCode no debe asumir que carga automáticamente el `.env` de esta aplicación.

## Contrato LLM y adaptadores

El contrato neutral está en `src/application/ports/llm/` e incluye clientes,
requests, respuestas, historial, uso y tools. No importa SDKs ni tipos de
infraestructura.

`src/infrastructure/adapters/llm/anthropic/` implementa `AnthropicClient` con
`ask`, streaming, historial, ejecución iterativa de tools y métricas normalizadas.

`src/infrastructure/adapters/llm/openai/` implementa `OpenAiClient` con el mismo
contrato de chat mediante Responses API. También implementa el puerto separado
`EmbeddingClient` para generar vectores individuales o por lote. Su constructor
recibe el SDK configurado, el modelo de chat, el modelo de embeddings y el límite
predeterminado de tokens:

```ts
const client = new OpenAiClient(
  openai,
  'gpt-5',
  'text-embedding-3-small',
  1024,
);
```

Ambos adaptadores reciben sus clientes SDK por constructor para permitir composición
manual y pruebas sin red. Las métricas normalizadas aplican al chat; embeddings
devuelve únicamente vectores. Consulta los README locales para las reglas de cada
adaptador.

## Arquitectura

El proyecto usa arquitectura hexagonal y Domain-Driven Design:

- `src/domain`: reglas y modelos del dominio.
- `src/application/use-cases`: casos de uso de la aplicación.
- `src/application/ports`: contratos de entrada y salida.
- `src/infrastructure/adapters/llm`: adaptadores de proveedores LLM.
- `src/infrastructure/adapters/persistence`: adaptadores de SQLite y vectores.
- `src/presentation/cli`: interfaz de consola.
- `src/shared`: utilidades transversales.

Consulta [ARCHITECTURE.md](ARCHITECTURE.md) para las reglas técnicas completas.

### Diagrama informativo

```text
                         ┌──────────────────────┐
                         │  Presentation / CLI  │
                         └──────────┬───────────┘
                                    │ input ports
                                    ▼
                         ┌──────────────────────┐
                         │ Application Use Cases│
                         └───────┬────────┬─────┘
                                 │        │ output ports
                                 │        ▼
                                 │  ┌──────────────────────┐
                                 │  │ Infrastructure        │
                                 │  │ LLM / Persistence     │
                                 │  └──────────┬───────────┘
                                 │             │
                                 ▼             │
                         ┌──────────────────────┐
                         │       Domain         │
                         └──────────────────────┘

        ┌────────────────────────────────────────────────────┐
        │ Shared: environment, errors and cross-cutting code │
        └────────────────────────────────────────────────────┘
```

Cada carpeta de `src/` tiene un barrel `index.ts`. Los consumidores externos de una capa importan desde el barrel raíz de esa capa, por ejemplo `./shared/index.js`. Los barrels usan exports nombrados explícitos.

Los archivos internos de un mismo módulo pueden importarse directamente para evitar ciclos; los imports entre módulos o capas deben pasar por el barrel correspondiente.

## Decisiones técnicas

Antes de cerrar una decisión técnica relevante se debe consultar Context7 para investigar documentación actual y mejores prácticas. La respuesta de Context7 es evidencia, no una decisión automática. Las alternativas, riesgos, recomendación y acuerdo explícito deben registrarse en `ARCHITECTURE.md`.

Si Context7 no está disponible, se debe consultar documentación oficial, registrar la limitación y obtener igualmente un acuerdo explícito.

## Verificación inicial

```bash
npm run typecheck
npm test
npm run build
npm run dev
```

La aplicación debe iniciar sin credenciales reales y mostrar el mensaje de inicialización.
