# Puertos de aplicación

Esta carpeta contiene las interfaces que desacoplan los casos de uso de los adaptadores externos.

## Tipos de puertos

- Puertos de entrada: contratos para ejecutar casos de uso.
- Puertos de salida: contratos para LLMs, persistencia, embeddings y herramientas.

## Reglas

- Las interfaces describen capacidades, no implementaciones.
- No deben importar SDKs de Anthropic, Gemini, OpenAI, Groq u Ollama.
- Los casos de uso consumen puertos de salida mediante inversión de dependencias.
