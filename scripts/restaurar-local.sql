-- Andamiaje mínimo para restaurar Sonópolis en un Postgres puro — spec 025
--
-- Por qué existe: las migraciones de AppAll asumen que Supabase ya puso ciertas
-- piezas (los esquemas auth y storage, sus funciones helper, los roles de la API,
-- la publicación de Realtime). En un Postgres 17 recién instalado nada de eso
-- existe y las migraciones fallan. Esto es exactamente la superficie de
-- dependencia con Supabase: son ~40 líneas, y esa es la buena noticia para el
-- objetivo "poder irse de Supabase".
--
-- Uso:
--   createdb sonopolis_backup
--   psql -d sonopolis_backup -f scripts/restaurar-local.sql
--   for m in supabase/migrations/*.sql; do psql -d sonopolis_backup -f "$m"; done
--   psql -d sonopolis_backup -f ~/backups/sonopolis/<fecha>/datos.sql
--
-- El orden de las migraciones ya está arreglado (spec 086): el bucle de arriba corre
-- tal cual, sin intervención manual.

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Roles que las policies nombran en sus GRANT y USING
do $$ declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','authenticator',
                           'supabase_auth_admin','supabase_storage_admin'] loop
    if not exists (select from pg_roles where rolname = r) then execute format('create role %I', r); end if;
  end loop;
end $$;

-- auth.users: mismas columnas que la tabla real de Supabase (GoTrue)
create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, invited_at timestamptz,
  confirmation_token text, confirmation_sent_at timestamptz, recovery_token text,
  recovery_sent_at timestamptz, email_change_token_new text, email_change text,
  email_change_sent_at timestamptz, last_sign_in_at timestamptz, raw_app_meta_data jsonb,
  raw_user_meta_data jsonb, is_super_admin boolean, created_at timestamptz, updated_at timestamptz,
  phone text, phone_confirmed_at timestamptz, phone_change text, phone_change_token text,
  phone_change_sent_at timestamptz, confirmed_at timestamptz, email_change_token_current text,
  email_change_confirm_status smallint, banned_until timestamptz, reauthentication_token text,
  reauthentication_sent_at timestamptz, is_sso_user boolean, deleted_at timestamptz,
  is_anonymous boolean);

create table if not exists storage.buckets (id text primary key, name text, public boolean,
  created_at timestamptz, updated_at timestamptz);
create table if not exists storage.objects (
  id uuid primary key, bucket_id text, name text, owner uuid, created_at timestamptz,
  updated_at timestamptz, last_accessed_at timestamptz, metadata jsonb, path_tokens text[],
  version text, owner_id text, user_metadata jsonb, archived_at timestamptz,
  is_delete_marker boolean, is_versioned boolean);

-- Las funciones que las RLS policies usan en cada USING/WITH CHECK.
-- Devuelven lo que PostgREST inyecta por request; fuera de PostgREST dan NULL,
-- que es lo correcto: sin JWT no hay identidad y las policies niegan.
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create or replace function auth.email() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

-- Helpers de Storage que las policies del bucket media usan para leer la carpeta
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name,'/'),1)-1,0)] $$;
create or replace function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name,'/'),1)] $$;
create or replace function storage.extension(name text) returns text language sql immutable as
  $$ select (string_to_array(storage.filename(name), '.'))[2] $$;

-- Realtime: el spec 044 agrega tablas a esta publicación
do $$ begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime')
  then create publication supabase_realtime; end if;
end $$;
