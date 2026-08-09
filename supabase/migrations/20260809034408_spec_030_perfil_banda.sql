-- Spec 030 — Dashboard de banda: perfil completo.
-- Toda aditiva: columnas nuevas nullable. Ninguna fila existente se invalida.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ciudad          text,
  ADD COLUMN IF NOT EXISTS generos         text[],
  ADD COLUMN IF NOT EXISTS integrantes     integer,
  ADD COLUMN IF NOT EXISTS duracion_show   integer,
  ADD COLUMN IF NOT EXISTS telefono        text,
  ADD COLUMN IF NOT EXISTS email_contacto  text,
  ADD COLUMN IF NOT EXISTS sitio_web       text,
  ADD COLUMN IF NOT EXISTS tiktok          text,
  ADD COLUMN IF NOT EXISTS rider_tecnico   text,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

-- tipo_proyecto pasa de texto libre a vocabulario cerrado.
-- Seguro hoy: las 4 filas lo tienen NULL, y un CHECK admite NULL.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tipo_proyecto_check
  CHECK (tipo_proyecto IS NULL
         OR tipo_proyecto IN ('solista','duo','banda','dj','colectivo'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_integrantes_check
  CHECK (integrantes IS NULL OR integrantes BETWEEN 1 AND 50);
