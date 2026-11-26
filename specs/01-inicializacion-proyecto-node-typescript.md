# SPEC 01 — Inicialización del proyecto Node.js con TypeScript

> **Estado:** Aprobado
> **Depende de:** Ninguna
> **Fecha:** 2026-11-26
> **Objetivo:** Inicializar una aplicación de consola Node.js con TypeScript, arquitectura hexagonal y DDD, configuración segura y utilidades transversales, preparada para incorporar casos de uso de agentes LLM en specs posteriores.

## Alcance

**Incluye:**

- Proyecto npm privado, ESM y Node.js `>=22.12.0`.
- Dependencias LLM, SQLite y herramientas acordadas.
- Arquitectura base por capas y puertos/adaptadores.
- Scripts `dev`, `build`, `start`, `typecheck`, `test` y `test:watch`.
- Arranque limpio con el mensaje `Custom LLM Agent initialized.`.
- Manejo de variables de entorno mediante `dotenv`.
- `AppError` y manejador transversal de excepciones.
- Pruebas con Vitest para entorno y errores.
- Depuración manual desde VS Code con `tsx`.
- Actualización de `README.md`, `AGENTS.md`, `ARCHITECTURE.md` y `opencode.json`.
- Protocolo acordado para investigar y decidir asuntos técnicos.

**Fuera de alcance (para specs futuras):**

- Implementar agentes o llamadas reales a proveedores LLM.
- RAG, embeddings, bases vectoriales o esquemas SQLite.
- Function Calling y Tools.
- Menús interactivos o uso efectivo de `readline`.
- Selección de modelos y prompts.
- Linting, formatting, CI, cobertura y publicación npm.
- Credenciales reales.

## Archivos previstos

```text
.env
.env.template
.gitignore
.vscode/launch.json
AGENTS.md
ARCHITECTURE.md
README.md
opencode.json
package.json
package-lock.json
tsconfig.json

src/
├── main.ts
├── domain/
│   └── README.md
├── application/
│   ├── use-cases/
│   │   └── README.md
│   └── ports/
│       └── README.md
├── infrastructure/
│   └── adapters/
│       ├── llm/
│       │   └── README.md
│       └── persistence/
│           └── README.md
├── presentation/
│   └── cli/
│       └── README.md
└── shared/
    ├── README.md
    └── utils/
        ├── environment.ts
        ├── app-error.ts
        └── error-handler.ts

tests/
└── shared/
    └── utils/
        ├── environment.test.ts
        └── error-handler.test.ts
```

Los archivos `README.md`, incluidos los internos, estarán en español. `AGENTS.md` y `ARCHITECTURE.md` estarán en inglés.

## Dependencias

**Producción:**

- `@anthropic-ai/sdk`
- `@google/genai`
- `better-sqlite3`
- `dotenv`
- `groq-sdk`
- `ollama`
- `openai`
- `sqlite-vec`

**Desarrollo:**

- `@types/better-sqlite3`
- `@types/node`
- `tsx`
- `typescript`
- `vitest`

`readline` se utilizará posteriormente como módulo nativo de Node.js y no se instalará desde npm. Se usarán versiones estables compatibles, rangos npm convencionales y `package-lock.json` versionado.

## Modelo técnico

```ts
const ENVIRONMENT_VARIABLES = {
  anthropicApiKey: "ANTHROPIC_API_KEY",
  geminiApiKey: "GEMINI_API_KEY",
  openAiApiKey: "OPENAI_API_KEY",
  groqApiKey: "GROQ_API_KEY",
  ollamaBaseUrl: "OLLAMA_BASE_URL",
  ollamaApiKey: "OLLAMA_API_KEY",
  context7ApiKey: "CONTEXT7_API_KEY",
} as const;
```

`environment.ts` expondrá:

- Carga silenciosa de `.env`, sin sobrescribir variables del sistema.
- Lectura opcional de una variable.
- Lectura obligatoria que rechace valores ausentes, vacíos o compuestos solo por espacios.
- Errores `AppError` con código identificable, sin incluir el valor secreto.

`AppError` contendrá como mínimo:

- `message`
- `code`
- `cause` opcional
- contexto seguro opcional

El manejador de errores:

- Normalizará errores conocidos y desconocidos.
- Escribirá mediante `console.error`.
- No mostrará variables de entorno ni credenciales.
- No relanzará el error.
- No asignará códigos de salida ni finalizará el proceso.

## Configuración

- `package.json`: `private: true`, `type: "module"` y `engines.node: ">=22.12.0"`.
- TypeScript: `target: ES2022`, `module/moduleResolution: NodeNext`, `strict: true`, `src` → `dist` y source maps.
- Imports internos relativos y compatibles con NodeNext, usando extensión `.js`.
- `.env` y `.env.template` tendrán las mismas variables, vacías salvo:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

- `.env`, `dist/`, `node_modules/` y `.vitest/` estarán ignorados.
- `opencode.json` migrará a OpenCode V2 y usará `Bearer {env:CONTEXT7_API_KEY}` sin credenciales literales.

OpenCode recibirá `CONTEXT7_API_KEY` desde el entorno del proceso; no se asumirá que carga automáticamente el `.env` de la aplicación.

## Protocolo de decisiones técnicas

Toda decisión técnica relevante deberá seguir este proceso:

1. Consultar Context7 antes de decidir sobre arquitectura, librerías, SDKs, configuración, APIs, CLI, integraciones o mejores prácticas.
2. Usar la documentación obtenida como evidencia para comparar alternativas, no como una decisión automática.
3. Consultar, cuando sea necesario, la documentación oficial del proveedor.
4. Presentar las alternativas relevantes, beneficios, riesgos y recomendación.
5. Obtener un acuerdo explícito entre las partes involucradas antes de cerrar la decisión.
6. Registrar en `ARCHITECTURE.md` la decisión acordada, las alternativas descartadas, la evidencia consultada y su justificación.
7. Si Context7 no está disponible, dejar constancia de la limitación, consultar documentación oficial y alcanzar igualmente un acuerdo explícito.

Ningún agente podrá imponer unilateralmente una decisión técnica relevante ni tratar la recomendación de Context7 como autorización para modificar el diseño.

## Plan de implementación

1. Crear `package.json`, instalar dependencias y generar `package-lock.json`.
2. Configurar TypeScript ESM y los scripts npm.
3. Crear `src/main.ts`, cargar silenciosamente `.env` y mostrar únicamente el mensaje de inicialización.
4. Crear la estructura hexagonal/DDD y documentar las reglas de cada capa.
5. Implementar `AppError` y el manejador central de errores.
6. Implementar la lectura opcional y obligatoria de variables de entorno.
7. Añadir las pruebas Vitest de entorno y errores.
8. Configurar `.env`, `.env.template` y `.gitignore`.
9. Añadir `.vscode/launch.json` para depurar `src/main.ts` mediante `tsx`.
10. Migrar `opencode.json` a OpenCode V2 y retirar la credencial literal.
11. Documentar instalación, comandos, arquitectura y reglas para agentes en `README.md`, `ARCHITECTURE.md` y `AGENTS.md`.

## Criterios de aceptación

- [ ] `npm install` finaliza correctamente con Node.js `>=22.12.0`.
- [ ] `npm run typecheck` finaliza sin errores.
- [ ] `npm test` ejecuta correctamente las pruebas de entorno y errores.
- [ ] `npm run build` genera `dist/` y source maps.
- [ ] `npm run dev` imprime únicamente `Custom LLM Agent initialized.`.
- [ ] `npm run start` imprime el mismo mensaje desde `dist/main.js`.
- [ ] Las claves vacías no impiden el arranque.
- [ ] Una variable requerida ausente genera un `AppError`.
- [ ] El manejador registra la excepción sin relanzarla ni finalizar el proceso.
- [ ] `.env` no queda versionado y `.env.template` no contiene secretos.
- [ ] `opencode.json` no contiene tokens literales.
- [ ] El debugger de VS Code puede detenerse en `src/main.ts`.
- [ ] `AGENTS.md` referencia `ARCHITECTURE.md` como fuente técnica.
- [ ] `AGENTS.md` exige consultar Context7 y alcanzar un acuerdo para decisiones técnicas.
- [ ] `ARCHITECTURE.md` documenta el protocolo de consulta, evaluación y acuerdo.
- [ ] No existen clientes LLM, casos de uso funcionales, RAG ni Tools implementados.

## Decisiones tomadas y descartadas

- **Sí:** arquitectura hexagonal y DDD organizada por capas.
- **Sí:** cada ejemplo futuro será un caso de uso.
- **Sí:** Groq mediante `groq-sdk`; xAI Grok queda fuera.
- **Sí:** Vitest para las pruebas iniciales.
- **Sí:** Node.js `>=22.12.0`; Node 24 LTS será la recomendación documental.
- **Sí:** validación de credenciales justo antes de cada caso de uso futuro.
- **Sí:** Context7 como fuente de evidencia para decisiones técnicas.
- **Sí:** acuerdo explícito como condición para cerrar decisiones técnicas.
- **No:** validación global de todas las claves durante el arranque.
- **No:** instalar `readline`, porque forma parte de Node.js.
- **No:** aliases TypeScript en este spec.
- **No:** credenciales reales en archivos versionados.
- **No:** aceptar recomendaciones de Context7 sin evaluación y acuerdo.

## Riesgos

| Riesgo                                                           | Mitigación                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Compatibilidad de módulos nativos SQLite entre versiones de Node | Verificar la instalación con Node 24 LTS y conservar el lockfile.                       |
| Compatibilidad futura de SDKs con Node.js 26                     | Recomendar Node 24 aunque `engines` permita versiones posteriores.                      |
| OpenCode no carga automáticamente `.env`                         | Documentar que `CONTEXT7_API_KEY` debe existir en el entorno antes de iniciar OpenCode. |
| El token actual ya apareció en configuración local               | Retirarlo, rotarlo y no reutilizarlo.                                                   |
| Registro accidental de secretos                                  | No incluir valores de entorno en errores, contexto ni logs.                             |
| Context7 no está disponible durante una decisión                 | Consultar documentación oficial, registrar la limitación y obtener acuerdo explícito.   |

## Lo que **no** está incluido en este spec

- Implementación de agentes LLM.
- Integraciones funcionales con Anthropic, Gemini, OpenAI, Groq u Ollama.
- RAG, embeddings, SQLite vectorial y persistencia funcional.
- Function Calling y Tools.
- Menús interactivos y ejecución de prompts.
- Linting, formatting, CI, cobertura y publicación npm.
- Decisiones técnicas cerradas sin consulta y acuerdo explícito.

---

Plan de implementación

1.  Crear package.json, instalar dependencias y generar package-lock.json.
2.  Configurar TypeScript ESM y scripts npm.
3.  Crear src/main.ts.
4.  Crear la estructura hexagonal/DDD.
5.  Implementar AppError y el manejador de errores.
6.  Implementar lectura de variables de entorno.
7.  Añadir pruebas Vitest.
8.  Configurar .env, .env.template y .gitignore.
9.  Añadir configuración de depuración VS Code.
10. Migrar opencode.json a OpenCode V2.
11. Actualizar README.md, ARCHITECTURE.md y AGENTS.md.
