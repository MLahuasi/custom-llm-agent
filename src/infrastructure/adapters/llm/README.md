# Adaptadores LLM

Esta carpeta contiene las implementaciones de los puertos de salida que se comunican con proveedores de modelos de lenguaje.

## Proveedores previstos

- Anthropic mediante `@anthropic-ai/sdk`.
- Gemini mediante `@google/genai`.
- OpenAI mediante `openai`.
- Groq mediante `groq-sdk`.
- Ollama mediante `ollama`.

## Reglas

- Cada proveedor debe tener un adaptador independiente.
- Las credenciales se obtienen mediante la utilidad transversal de entorno.
- Los detalles del SDK no deben filtrarse a los casos de uso.
- Los errores del proveedor deben normalizarse antes de cruzar la frontera de infraestructura.
