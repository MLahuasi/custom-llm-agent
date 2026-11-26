# Presentación CLI

Esta capa contiene la interfaz de consola de la aplicación.

## Responsabilidades

- Interpretar argumentos y entradas del usuario.
- Invocar casos de uso mediante sus puertos de entrada.
- Formatear resultados y mensajes para la consola.
- Presentar errores sin exponer secretos ni detalles internos innecesarios.

## Reglas

- No contiene reglas de negocio.
- No accede directamente a SDKs LLM ni a bases de datos.
- La interacción con `readline` se incorporará en una spec futura.
