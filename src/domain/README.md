# Dominio

Esta capa contiene las reglas de negocio y los modelos propios del proyecto.

## Responsabilidades

- Definir entidades, objetos de valor, agregados y servicios de dominio.
- Mantener invariantes de negocio independientes de frameworks y proveedores.
- Exponer contratos de dominio cuando sean necesarios.

## Reglas

- No depende de `infrastructure`, `presentation` ni de SDKs externos.
- No accede directamente a variables de entorno, archivos, bases de datos o APIs.
- Sus nombres deben representar conceptos del dominio de agentes LLM.
