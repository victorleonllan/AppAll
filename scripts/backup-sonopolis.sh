#!/usr/bin/env bash
# Respaldo nocturno de Sonópolis — spec 025
#
# Corre desde el cron de WSL en victorwin. Hace tres cosas, en este orden:
#   1. pg_dump de producción (esquema + datos, dos formatos)
#   2. restaura el dump en una base local — un respaldo que no se restaura no es un respaldo
#   3. compara conteos réplica vs producción y deja el resultado por escrito
#
# Si algo falla deja $ERR_FILE escrito y sale con código 1: eso es lo que Hermes vigila
# para avisar por WhatsApp. Si todo sale bien no imprime nada — silencio es la señal de OK.
#
# Config esperada en ~/.config/sonopolis-backup.env (chmod 600, fuera de git):
#   DB_URL="postgresql://postgres.<ref>:<password>@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
#   DEST_DIR="/mnt/c/Backups/Sonopolis"      # disco Windows, no el filesystem de WSL
#   REPLICA_DB="sonopolis_backup"
#   REPO_DIR="$HOME/projects/AppAll"          # para que el CLI encuentre el proyecto
#   RETENCION_DIAS=30
#
# El pooler en modo sesión, no la conexión directa: db.<ref>.supabase.co resuelve solo IPv6
# y en el plan Free no hay IPv4.

set -uo pipefail

CONFIG="${SONOPOLIS_BACKUP_ENV:-$HOME/.config/sonopolis-backup.env}"
[[ -r "$CONFIG" ]] || { echo "falta $CONFIG" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG"

: "${DB_URL:?falta DB_URL en la config}"
DEST_DIR="${DEST_DIR:-$HOME/backups/sonopolis}"
REPLICA_DB="${REPLICA_DB:-sonopolis_backup}"
RETENCION_DIAS="${RETENCION_DIAS:-30}"
ESQUEMAS=(public auth storage)

DIA="$(date +%F)"
DEST="$DEST_DIR/$DIA"
ERR_FILE="$DEST_DIR/ULTIMO_ERROR.txt"
LOG="$DEST/backup.log"

mkdir -p "$DEST" || { echo "no se pudo crear $DEST" >&2; exit 1; }
rm -f "$ERR_FILE"

fallar() {
  { echo "[$(date +'%F %T')] FALLÓ: $*"; echo "Log: $LOG"; } | tee -a "$ERR_FILE" >&2
  exit 1
}
log() { echo "[$(date +'%F %T')] $*" >> "$LOG"; }

# pg_dump tiene que ser >= 17: el servidor es 17.6 y uno de 16 aborta con version mismatch
version_dump="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
[[ "$version_dump" -ge 17 ]] || fallar "pg_dump es $version_dump, se necesita 17 o mayor"

args_esquemas=()
for e in "${ESQUEMAS[@]}"; do args_esquemas+=(--schema="$e"); done

# --- 1. dump ------------------------------------------------------------------
log "dump de esquema"
pg_dump "$DB_URL" --schema-only --no-owner --no-privileges "${args_esquemas[@]}" \
  > "$DEST/esquema.sql" 2>>"$LOG" || fallar "pg_dump --schema-only"

log "dump de datos (sql plano, portable a cualquier Postgres)"
# --disable-triggers es obligatorio: al cargar events, el trigger que agrega al creador como
# colaborador vuelve a insertar en event_collaborators y la carga choca con su propia clave.
pg_dump "$DB_URL" --data-only --no-owner --disable-triggers "${args_esquemas[@]}" \
  > "$DEST/datos.sql" 2>>"$LOG" || fallar "pg_dump --data-only"

log "dump custom (restauración selectiva con pg_restore -t)"
pg_dump "$DB_URL" --format=custom --no-owner "${args_esquemas[@]}" \
  --file "$DEST/completo.dump" 2>>"$LOG" || fallar "pg_dump --format=custom"

[[ -s "$DEST/esquema.sql" && -s "$DEST/datos.sql" && -s "$DEST/completo.dump" ]] \
  || fallar "algún dump quedó vacío"

# --- 2. archivos del bucket ---------------------------------------------------
# Los binarios no salen en ningún pg_dump: storage.objects guarda las filas, no los archivos.
if command -v supabase >/dev/null 2>&1 && [[ -n "${REPO_DIR:-}" && -d "${REPO_DIR:-}" ]]; then
  log "descargando bucket media"
  # el CLI resuelve el proyecto por el supabase/ del repo: sin este cd falla con
  # "Cannot find project ref"
  (cd "$REPO_DIR" && supabase storage cp -r ss:///media "$DEST/media/" --experimental) >>"$LOG" 2>&1 \
    || log "AVISO: falló la descarga del bucket (el resto del respaldo sigue siendo válido)"
else
  log "AVISO: sin CLI de supabase o sin REPO_DIR, no se descargó el bucket"
fi

# --- 3. restauración en la réplica --------------------------------------------
log "restaurando en $REPLICA_DB"
dropdb --if-exists "$REPLICA_DB" >>"$LOG" 2>&1
createdb "$REPLICA_DB" >>"$LOG" 2>&1 || fallar "createdb $REPLICA_DB"

# El dump se limita a public/auth/storage, pero las funciones referencian extensions.*
# (pgcrypto, uuid-ossp) y las policies nombran los roles de la API. Nada de eso viaja en el
# dump: hay que ponerlo antes o el esquema se restaura a medias.
psql -q -d "$REPLICA_DB" >>"$LOG" 2>&1 <<'PREAMBULO' || fallar "preámbulo de la réplica"
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
do $$ declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','authenticator',
                           'supabase_auth_admin','supabase_storage_admin'] loop
    if not exists (select from pg_roles where rolname = r) then execute format('create role %I', r); end if;
  end loop;
end $$;
PREAMBULO
psql -q -d "$REPLICA_DB" -f "$DEST/esquema.sql" >>"$LOG" 2>&1 || fallar "restaurar esquema"
psql -q -d "$REPLICA_DB" -f "$DEST/datos.sql"   >>"$LOG" 2>&1 || fallar "restaurar datos"

# --- 4. verificación ----------------------------------------------------------
# "Exacto" tiene que ser un hecho medido, no una suposición. external_events queda fuera
# de la comparación estricta: el scraping corre solo y el conteo deriva entre el dump y esta
# consulta, sin que eso signifique que el respaldo esté mal.
log "verificando conteos"
conteo_sql="select table_name, (xpath('/row/c/text()',
  query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
  false, true, '')))[1]::text::int as n
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"

psql -qtAF, -d "$REPLICA_DB" -c "$conteo_sql" > "$DEST/conteos_replica.csv" 2>>"$LOG" \
  || fallar "conteos de la réplica"
psql -qtAF, "$DB_URL" -c "$conteo_sql" > "$DEST/conteos_produccion.csv" 2>>"$LOG" \
  || fallar "conteos de producción"

difs="$(join -t, -j1 <(sort "$DEST/conteos_produccion.csv") <(sort "$DEST/conteos_replica.csv") \
  | awk -F, '$2 != $3 && $1 != "external_events" {print "  "$1": produccion "$2" vs replica "$3}')"

if [[ -n "$difs" ]]; then
  fallar "la réplica no coincide con producción:"$'\n'"$difs"
fi
log "verificación OK: todas las tablas coinciden"

# --- 5. retención -------------------------------------------------------------
# Diarios 30 días; el primero de cada mes se conserva para siempre (cuesta ~15 MB al año
# y es lo que permite volver a "cómo estaba la base en julio").
find "$DEST_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*-*-*' -mtime "+$RETENCION_DIAS" \
  ! -name '*-01' -exec rm -rf {} + 2>>"$LOG"

log "listo — $(du -sh "$DEST" | cut -f1)"
exit 0
