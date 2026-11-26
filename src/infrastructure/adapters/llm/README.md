# Adaptadores LLM

Esta carpeta contiene implementaciones de los puertos LLM definidos en
`src/application/ports/llm/`. Cada proveedor debe permanecer aislado en su propio
módulo y no debe filtrar tipos del SDK hacia la aplicación.

## Reglas

- Inyectar el cliente del proveedor mediante el constructor.
- Convertir requests, mensajes, tools, respuestas y errores en el contrato neutral.
- Usar `getLlmDefaults()` para los límites compartidos de iteraciones y tools.
- Mantener las pruebas sin red ni credenciales reales.
- Añadir un barrel `index.ts` con exports nombrados explícitos.

El ejecutor seguro y neutral de tools está en `tool-executor.ts` y es reutilizado
por todos los proveedores.

Consulta los README locales:

- `anthropic/README.md` para el adaptador Anthropic.
- `gemini/README.md` para el adaptador Gemini.
- `openai/README.md` para el adaptador OpenAI y embeddings.
