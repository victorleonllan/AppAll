#!/usr/bin/env bash
# Corre un archivo de pruebas SQL contra la base enlazada DENTRO de una
# transacción que siempre se revierte: no deja datos.
#
#   supabase/tests/correr.sh <pruebas.sql> [migración.sql ...]
#
# Las migraciones que se pasen se aplican antes de las pruebas, dentro de la
# misma transacción: sirve para probar una migración ANTES del `db push`.
set -euo pipefail
cd "$(dirname "$0")/../.."
pruebas="$1"; shift
tmp="$(mktemp -t pruebas-sql).sql"
trap 'rm -f "$tmp"' EXIT
{
  echo "begin;"
  for m in "$@"; do cat "$m"; echo; done
  cat "$pruebas"
  echo; echo "rollback;"
} > "$tmp"
supabase db query --linked -f "$tmp" 2>&1 | grep -v "new version\|recommend regularly\|Initialising\|Connecting"
