# Repository Guidance

## Project status

This repository contains a private Node.js ESM console application written in TypeScript. Its current entrypoint is `src/main.ts`, and the compiled entrypoint is `dist/main.js`.

The project currently provides the bootstrap, the hexagonal/DDD directory structure, environment utilities, and error handling. Functional LLM agents, RAG, Function Calling, and Tools are out of scope until a later approved spec.

## Runtime and package manager

- Use Node.js `>=22.12.0`; Node.js 24 LTS is the recommended development version.
- Use npm and preserve `package-lock.json`.
- The package is private and uses ESM.
- Use relative NodeNext imports with `.js` extensions in TypeScript source files.

## Verified commands

```text
npm install
npm run dev
npm run build
npm run start
npm run typecheck
npm test
npm run test:watch
```

`npm run dev` executes `src/main.ts` through `tsx`. `npm run build` compiles `src/` to `dist/`. `npm run start` executes `dist/main.js`. Vitest tests are located under `tests/` and use `.test.ts` filenames.

## Architecture rules

- `src/domain` contains business concepts and must not depend on infrastructure, presentation, SDKs, or environment access.
- `src/application/use-cases` orchestrates application actions.
- `src/application/ports` defines input and output contracts.
- `src/infrastructure/adapters` implements external provider and persistence contracts.
- `src/presentation/cli` handles console input and output only.
- `src/shared` contains reusable technical utilities and must not contain business rules.
- Every future example of an agent, RAG flow, Function Calling flow, or Tools flow must be represented as an application use case.

Read `ARCHITECTURE.md` before changing boundaries, dependencies, providers, persistence, or technical conventions.

## Environment and secrets

- Never commit `.env` or real credentials.
- Use `.env.template` to document required variable names.
- Use `src/shared/utils/environment.ts` for environment loading and validation.
- Validate provider credentials immediately before the use case that needs them.
- Do not include secret values in error messages, contexts, logs, tests, or documentation.
- OpenCode reads `CONTEXT7_API_KEY` from the process environment through `opencode.json`; do not put a literal token in configuration.

## Technical decision protocol

For every relevant decision involving architecture, libraries, SDKs, APIs, CLI behavior, configuration, integrations, or best practices:

1. Consult Context7 first for current documentation and recommended practices.
2. Use the result as evidence, not as an automatic decision.
3. Consult official provider documentation when Context7 is incomplete or the decision concerns provider-specific behavior.
4. Present the relevant alternatives, benefits, risks, and recommendation.
5. Reach an explicit agreement with the stakeholders before implementing the decision.
6. Record the decision, rejected alternatives, evidence, and rationale in `ARCHITECTURE.md`.
7. If Context7 is unavailable, record that limitation, consult official documentation, and still obtain explicit agreement.

Agents must not impose a significant technical decision unilaterally. If the spec does not resolve an ambiguity, stop and ask for a decision instead of improvising.

## Scope discipline

Implement only the approved spec. Do not add provider integrations, tests, tools, refactors, or dependencies that are not in scope. Preserve unrelated user changes and never use destructive Git commands to discard them.
