# Architecture

## Purpose

This repository is a private Node.js ESM console application for learning how to build custom LLM agents. It follows Hexagonal Architecture and Domain-Driven Design (DDD). Every future example is an application use case.

## Runtime conventions

- Node.js `>=22.12.0` is required.
- Node.js 24 LTS is the recommended development runtime.
- npm is the package manager and `package-lock.json` is preserved.
- TypeScript uses `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, and strict checking.
- Internal imports use relative paths with `.js` extensions.

## Barrel modules

Every directory under `src/` has an `index.ts` barrel. Barrels define the public surface of a layer or module.

- Use named exports explicitly; do not use `export *`.
- Consumers crossing a layer must import from the layer root barrel, such as `./shared/index.js`.
- Consumers crossing modules in the same layer must import from the destination module barrel.
- Files inside the same module may import one another directly to avoid cycles through their own barrel.
- Every ESM import must use an explicit `.js` extension, including imports that target a compiled barrel.
- Do not introduce aliases or `package.json#imports` for this convention.

The current public shared surface is exported by `src/shared/index.ts`, which delegates explicit exports to `src/shared/utils/index.ts`.

## Layers

### Domain

Path: `src/domain`

The domain contains entities, value objects, aggregates, domain services, and business invariants. It must remain independent of SDKs, databases, files, environment variables, and the CLI.

### Application

Paths: `src/application/use-cases`, `src/application/ports`, `src/application/services`

Use cases orchestrate application actions. Ports define input and output contracts. Application services implement provider-neutral policies such as input guardrails and in-memory usage controls. Application code depends on contracts and domain concepts, never on concrete provider SDKs.

### Infrastructure

Path: `src/infrastructure/adapters`

Infrastructure implements output ports for external systems. LLM adapters will be isolated by provider. Persistence adapters will encapsulate SQLite and future vector storage details.

### Presentation

Path: `src/presentation/cli`

The CLI translates user input into input-port calls and formats results. It must not contain business rules or call provider SDKs directly.

### Shared

Path: `src/shared`

Shared utilities contain cross-cutting technical concerns such as environment loading and error handling. They must not contain business rules or depend on a specific use case.

## Informative dependency diagram

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

## Dependency direction

Dependencies point inward:

```text
presentation -> application -> domain
infrastructure -> application ports
shared -> reusable technical concerns
```

The domain does not depend on infrastructure. Use cases depend on ports, and adapters implement those ports. This keeps providers replaceable and makes use cases testable without network calls.

## Provider boundaries

The project prepares for these providers:

- Anthropic through `@anthropic-ai/sdk`.
- Gemini through `@google/genai`.
- OpenAI through `openai`.
- Groq through `groq-sdk`.
- Ollama through `ollama`.

Each provider must have a separate adapter. Provider credentials are retrieved through `src/shared/utils/environment.ts` immediately before the relevant use case runs. Provider-specific request and error types must not cross into the domain.

## Persistence boundaries

SQLite uses `better-sqlite3`. Future vector search may use `sqlite-vec`. Persistence schemas, connection lifecycles, SQL, and vector-extension details belong in infrastructure. RAG and functional persistence are not implemented by the current bootstrap.

## Errors

`AppError` is the application error type. It includes a stable code and may include a safe cause or context. `handleError` logs normalized safe information through `console.error`, does not expose credentials, does not rethrow, and does not terminate the process.

## Environment configuration

`.env` is local and ignored by Git. `.env.template` documents the required names without real secrets. `loadEnvironment` uses dotenv without overriding variables already present in the process. `optionalEnv` returns undefined for absent or blank values. `requiredEnv` throws `AppError` for absent or blank values.

OpenCode uses `CONTEXT7_API_KEY` through `{env:CONTEXT7_API_KEY}` in `opencode.json`. OpenCode is not assumed to load the application's `.env` automatically; the variable must be present in the process environment before OpenCode starts.

## Technical decision protocol

The following protocol is mandatory for relevant technical decisions:

1. Consult Context7 for current documentation and best practices before deciding.
2. Treat Context7 as evidence, not as an authority that makes the decision automatically.
3. Consult official provider documentation when needed.
4. Compare alternatives, benefits, risks, and the recommended option.
5. Reach explicit agreement with the stakeholders before implementation.
6. Record the decision, rejected alternatives, consulted evidence, and rationale in this document.
7. If Context7 is unavailable, record the limitation, use official documentation, and obtain explicit agreement anyway.

An agent must stop and ask when a relevant decision is unresolved. It must not silently choose an architecture, dependency, provider behavior, or configuration convention.

## Recorded decisions

- Hexagonal Architecture and DDD were selected to isolate business use cases from providers and delivery mechanisms.
- Groq is represented by `groq-sdk`; xAI Grok is not part of the current scope.
- Vitest is the initial test framework.
- Node.js `>=22.12.0` is the package engine range, with Node.js 24 LTS recommended for development.
- Provider credentials are validated at use-case execution time rather than during global startup.
- Context7 research and explicit agreement are required before closing relevant technical decisions.
- Barrels with explicit named exports are required at every `src/` directory boundary.
- LLM providers implement the neutral contract in `src/application/ports/llm/`; provider SDK types remain inside infrastructure adapters.
- `AnthropicClient` receives the Anthropic SDK client, model, and default token limit through constructor injection. The request-level `maxTokens` overrides the constructor default.
- Anthropic tool execution uses the manual Messages API loop rather than the beta `messages.toolRunner`, preserving portability for future providers.
- Tool calls are executed in parallel with deterministic duplicate detection and results returned in original call order. Unknown, invalid, and failed tools produce safe model-facing results.
- `LLM_MAX_ITERATIONS` and `LLM_MAX_TOOL_CALLS` are shared environment overrides, with positive defaults of `8` and `32`, exposed through `src/shared/utils/llm-config.ts`.
- Provider error codes remain stable application constants; credentials, provider payloads, and internal error details are never exposed.
- `OpenAiClient` implements both `LlmClient` and the separate reusable `EmbeddingClient`; embedding operations return vectors only and do not expose usage metrics.
- `OpenAiClient` receives an already configured OpenAI SDK instance, chat model, embedding model, and default output-token limit through constructor injection. OpenAI credentials are resolved during composition, not inside the adapter.
- OpenAI chat uses the Responses API. Its manual tool loop preserves response output items and associates `function_call_output` items through `call_id`.
- The safe, provider-neutral tool executor lives at `src/infrastructure/adapters/llm/tool-executor.ts` and is shared by Anthropic and OpenAI adapters.
- OpenAI Responses API and function-calling mappings were checked against current OpenAI documentation through Context7; provider-specific SDK types remain isolated in the OpenAI infrastructure module.
- `GeminiClient` receives an already configured `GoogleGenAI` SDK instance, chat model, and default output-token limit through constructor injection. Gemini credentials are resolved during composition, not inside the adapter.
- Gemini chat uses `generateContent` and `generateContentStream`; manual function calling preserves the shared iteration and tool-call limits instead of using automatic function calling.
- Gemini `Content`, function declarations, function calls, and function responses remain isolated in the Gemini infrastructure module and are mapped to the neutral LLM contract.
- Gemini SDK request shapes and streaming behavior were checked against the current `@google/genai` documentation through Context7; tests use simulated SDK responses and never access the network.
- `GroqClient` receives an already configured `Groq` SDK instance, chat model, and default output-token limit through constructor injection. Groq credentials are resolved during composition, not inside the adapter.
- Groq chat uses Chat Completions from `groq-sdk`; fragmented streaming tool calls are accumulated by index before JSON arguments are parsed.
- Groq assistant tool-call messages and tool result messages remain inside the Groq infrastructure module while mapping to the neutral LLM contract; the shared tool executor handles parallel execution and duplicate detection.
- Groq SDK request shapes, Chat Completions tools, and streaming deltas were checked against current `groq-sdk` documentation through Context7; tests use simulated SDK responses and never access the network.
- `OllamaClient` receives the Ollama host, model, generation options, and an optional fetch implementation through its constructor. The fetch injection keeps local and cloud compositions configurable while allowing tests to avoid network access.
- Ollama chat uses the official `ollama` client's `chat` method. Streaming tool calls are accumulated by position, while assistant messages and `role: tool` results with `tool_name` are preserved between iterations.
- Ollama `prompt_eval_count` and `eval_count` are mapped to normalized input and output tokens; absent counters are treated as zero and provider payloads are never exposed in errors.
- Ollama SDK request shapes, streaming responses, and tool message fields were checked against the current `ollama` v0.6.4 documentation through Context7; tests use an injected simulated fetch and never access a real server.
- `LlmUsage` is defined once in `src/application/ports/llm/contracts.ts`; usage services re-export and consume that normalized port contract rather than defining a second metric shape.
- `GuardrailsService` sanitizes input, detects heuristic prompt-injection patterns, and applies its own in-memory input rate limit. It is intentionally separate from the LLM call limiter.
- `LlmUsageLimiterService` applies an in-memory rolling window and throws `AppError` with code `LLM_USAGE_LIMIT_EXCEEDED` when the configured request budget is exhausted.
- `LlmUsageTrackerService` stores defensive copies for the current process, aggregates requests and tokens by provider/model, and represents unknown model prices as `null` rather than zero.
- Application service and port surfaces use explicit named exports through `src/application/services/index.ts` and `src/application/index.ts`; no SDK types cross the application boundary.
