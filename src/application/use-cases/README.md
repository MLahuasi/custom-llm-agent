# Casos de uso

Esta capa orquesta las acciones que la aplicación puede ejecutar.

Cada ejemplo de agente LLM, RAG, Function Calling o Tools deberá implementarse como un caso de uso independiente.

## Responsabilidades

- Coordinar reglas de dominio y puertos de entrada/salida.
- Validar la intención y los datos necesarios para ejecutar una operación.
- Devolver resultados definidos por la aplicación.
- Convertir errores técnicos en errores útiles para el flujo de aplicación.

## Reglas

- No importa SDKs concretos de proveedores.
- Depende de abstracciones declaradas en `application/ports`.
- No contiene lógica específica de la consola.
