---
description: Valida y corrige los criterios de aceptación de una spec
agent: spec-acceptance-validator
---

Valida la spec indicada en `$ARGUMENTS`.

Si no se indicó una spec, lista los archivos disponibles en `specs/` y solicita
al usuario que elija uno. Sigue íntegramente el flujo definido por el agente.

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
