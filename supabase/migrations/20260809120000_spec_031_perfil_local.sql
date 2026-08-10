-- Spec 031 — Dashboard de local: perfil editable, dueño y panel de gestión
--
-- Aditiva sobre venues: agrega los campos que EditarLocalScreen necesita
-- escribir. `rating` NO se toca — sigue existiendo, pero se oculta de la UI
-- (ver spec) hasta que exista un flujo real de reseñas.
--
-- El timestamp es 20260809120000 y no el 20260808120000 original: la migración
-- del spec 030 (20260809034408) ya está aplicada en remoto, y `db push` rechaza
-- un archivo local anterior a la última migración remota ("found local migration
-- files to be inserted before the last migration"). Renombrar es la corrección;
-- el archivo nunca llegó a aplicarse con el nombre viejo.

alter table public.venues
  add column if not exists ciudad          text,
  add column if not exists comuna          text,
  add column if not exists aforo           integer,
  add column if not exists telefono        text,
  add column if not exists email_contacto  text,
  add column if not exists instagram       text,
  add column if not exists sitio_web       text,
  add column if not exists horarios        text,
  add column if not exists tiene_escenario boolean default false,
  add column if not exists tiene_sonido    boolean default false,
  add column if not exists tiene_backline  boolean default false,
  add column if not exists updated_at      timestamptz default now();

-- Postgres no acepta `add constraint if not exists`. Sin la guarda, reaplicar
-- esta migración aborta con "constraint already exists" — y en este proyecto
-- todo va directo a producción, sin entorno local donde descubrirlo antes.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venues_aforo_check'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_aforo_check
      check (aforo is null or aforo between 1 and 100000);
  end if;
end $$;
