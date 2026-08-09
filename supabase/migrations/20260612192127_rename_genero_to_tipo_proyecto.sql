-- Recuperada del historial remoto (supabase_migrations.schema_migrations)
-- el 2026-08-07. Contenido textual, sin modificar.
--
-- Nota: esta migración renombró la columna en la base, pero el código
-- TypeScript no se actualizó hasta el spec 019 — de ahí los 8 errores de
-- `tsc --noEmit` que arrastró `main` durante casi dos meses.

ALTER TABLE public.profiles RENAME COLUMN genero TO tipo_proyecto;
