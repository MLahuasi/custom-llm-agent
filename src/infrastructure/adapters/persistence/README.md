# Adaptadores de persistencia

Esta carpeta contiene las implementaciones de persistencia para datos de la aplicación.

## Tecnologías previstas

- SQLite mediante `better-sqlite3`.
- Vectores mediante `sqlite-vec` para casos de uso RAG futuros.

## Reglas

- La infraestructura implementa puertos definidos fuera de esta carpeta.
- Las decisiones de almacenamiento no deben aparecer en el dominio.
- Las conexiones y recursos deben tener un ciclo de vida explícito.
- RAG y persistencia funcional se implementarán en specs posteriores.
