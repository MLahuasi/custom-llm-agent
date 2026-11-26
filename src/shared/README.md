# Shared

Esta capa contiene utilidades transversales que pueden ser utilizadas por las demás capas sin introducir dependencias hacia un proveedor concreto.

## Responsabilidades

- Proveer utilidades comunes y contratos técnicos reutilizables.
- Centralizar configuración transversal, errores y logging inicial.
- Mantener componentes pequeños y sin lógica de negocio.

## Reglas

- No depende de casos de uso concretos.
- No debe convertirse en un contenedor de lógica de negocio.
- Las utilidades deben tener pruebas aisladas cuando su comportamiento sea verificable.
