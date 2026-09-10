#!/usr/bin/env python3
"""Respaldo de datos de Sonópolis vía Management API — spec 025.

Vía secundaria, no la principal. La principal es pg_dump contra el pooler desde
victorwin; esta no necesita la contraseña de la base (usa el token del CLI que ya
está en el llavero), así que corre desde cualquier máquina donde Victor tenga
sesión de Supabase.

Qué captura:  datos de public + auth.users + storage.objects + los binarios del bucket.
Qué NO captura: funciones, policies, triggers, grants. Eso vive en las migraciones,
y para reconstruir el esquema hay que aplicarlas (ver scripts/restaurar-local.sql).

Salida: ~/backups/sonopolis/YYYY-MM-DD/ — JSON por tabla, datos.sql con INSERTs
portables, media/ con los archivos, conteos.json para la verificación.

NO commitear la salida: contiene emails de compradores y hashes de contraseña.
"""
import json, os, subprocess, sys, urllib.request, datetime

REF = "xluinfihjjtxkglihxqz"
API = f"https://api.supabase.com/v1/projects/{REF}/database/query"
PUB = f"https://{REF}.supabase.co/storage/v1/object/public/media/"
TOK = subprocess.check_output(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-w"], text=True).strip()
DIA = datetime.date.today().isoformat()
OUT = os.path.expanduser(f"~/backups/sonopolis/{DIA}")

def q(sql):
    req = urllib.request.Request(API, data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def lit(v, tipo=None):
    """tipo viene de information_schema: ARRAY y jsonb se serializan distinto y
    confundirlos es el error que rompió la primera carga."""
    if v is None: return "NULL"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list) and tipo == "ARRAY":
        elems = ", ".join("'" + str(e).replace("'", "''") + "'" for e in v)
        return f"ARRAY[{elems}]::text[]" if v else "'{}'::text[]"
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

TIPOS = {}
def tipos_de(esquema, tabla):
    k = f"{esquema}.{tabla}"
    if k not in TIPOS:
        TIPOS[k] = {c["column_name"]: c["data_type"] for c in q(
            "select column_name, data_type from information_schema.columns "
            f"where table_schema='{esquema}' and table_name='{tabla}'")}
    return TIPOS[k]

os.makedirs(f"{OUT}/tablas", exist_ok=True)
os.makedirs(f"{OUT}/media", exist_ok=True)

tablas = [t["table_name"] for t in q(
    "select table_name from information_schema.tables where table_schema='public' "
    "and table_type='BASE TABLE' order by table_name")]

sql = ["-- Respaldo de datos de Sonópolis — " + DIA,
       "-- Generado vía Management API (sin pg_dump). Restaurar sobre un esquema ya creado",
       "-- por las migraciones de AppAll: supabase db reset && psql -f este archivo",
       "set session_replication_role = replica;  -- sin esto el orden de FKs importa", ""]
conteos = {}

for esquema, tabla in [("public", t) for t in tablas] + [("auth", "users"), ("storage", "objects")]:
    filas = q(f"select * from {esquema}.{tabla}")
    if isinstance(filas, dict):            # error de la API
        print(f"  !! {esquema}.{tabla}: {filas.get('message')}", file=sys.stderr); continue
    conteos[f"{esquema}.{tabla}"] = len(filas)
    with open(f"{OUT}/tablas/{esquema}.{tabla}.json", "w") as f:
        json.dump(filas, f, ensure_ascii=False, indent=1, default=str)
    if filas:
        cols = list(filas[0].keys())
        tipos = tipos_de(esquema, tabla)
        sql.append(f"-- {esquema}.{tabla} ({len(filas)} filas)")
        for fila in filas:
            vals = ", ".join(lit(fila[c], tipos.get(c)) for c in cols)
            sql.append(f'insert into {esquema}.{tabla} ({", ".join(chr(34)+c+chr(34) for c in cols)}) '
                       f"values ({vals}) on conflict do nothing;")
        sql.append("")
    print(f"  {esquema}.{tabla}: {len(filas)}")

sql.append("set session_replication_role = default;")
open(f"{OUT}/datos.sql", "w").write("\n".join(sql))

# binarios del bucket (es público)
objs = json.load(open(f"{OUT}/tablas/storage.objects.json"))
bajados = 0
for o in objs:
    nombre = o["name"]
    destino = f"{OUT}/media/{nombre.replace('/', '_')}"
    try:
        urllib.request.urlretrieve(PUB + urllib.parse.quote(nombre), destino)
        bajados += 1
    except Exception as e:
        print(f"  !! media/{nombre}: {e}", file=sys.stderr)
print(f"  media: {bajados}/{len(objs)} archivos")
json.dump({"fecha": DIA, "conteos": conteos, "media_bajados": bajados},
          open(f"{OUT}/conteos.json", "w"), indent=1)
