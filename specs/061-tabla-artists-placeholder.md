# Spec 061 — Tabla `artists`: placeholder de banda simétrico al de local

**Capa: DATOS · `supabase/migrations/` · Depende de: spec 033 (artist_id), spec 046 (roles)**

Pedido de Victor: al crear un evento, si el local escribe una banda que no existe en el
sistema, o si un músico escribe un local que no existe, se debe crear un placeholder real
— no solo texto. El de local ya es posible porque `venues` es una tabla propia,
independiente de las cuentas (`owner_id` es una referencia opcional, no la clave). El de
banda no existe porque `events.artist_id` apunta a `profiles`, y `profiles.id` es
`REFERENCES auth.users(id) PRIMARY KEY` (spec 003) — la fila **es** la cuenta, no se puede
insertar sin una. Crear un perfil sin cuenta real repite el patrón que el spec 046 evaluó
y descartó para tickets de invitado (cuenta placeholder = superficie de ataque sin
beneficio).

La solución es darle a las bandas el mismo molde que ya tienen los locales: una tabla
propia, separada de `profiles`.

## Tabla nueva

```sql
CREATE TABLE public.artists (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  genero      TEXT,
  comuna      TEXT,
  contacto    TEXT,
  instagram   TEXT,
  image       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  profile_id  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY artists_select ON public.artists FOR SELECT USING (true);
CREATE POLICY artists_insert ON public.artists FOR INSERT
  WITH CHECK (auth.uid() = created_by);
-- Solo quien la creó, o el músico que ya la reclamó, puede editar sus datos.
-- Reclamarla (setear profile_id) es un paso aparte: ver "Fuera de alcance".
CREATE POLICY artists_update ON public.artists FOR UPDATE
  USING (auth.uid() = created_by OR auth.uid() = profile_id);
```

`created_by` en vez de `owner_id`: quien registra el placeholder no es dueño de la banda,
solo la anotó — la semántica no es la misma que en `venues` aunque la columna se parezca.

## Migración de `events.artist_id`

Hoy apunta a `profiles`. Backfill antes de repuntar, para no perder los vínculos que ya
existen:

```sql
-- 1. Una fila en artists por cada músico que ya tiene cuenta — nace ya reclamada.
INSERT INTO public.artists (name, profile_id, created_by, created_at)
SELECT p.nombre, p.id, p.id, p.created_at
FROM public.profiles p
WHERE p.role = 'musician';

-- 2. Repuntar los eventos que ya enlazaban a un profile de músico.
UPDATE public.events e
SET artist_id = a.id
FROM public.artists a
WHERE a.profile_id = e.artist_id;

-- 3. Cambiar el FK.
ALTER TABLE public.events DROP CONSTRAINT events_artist_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_artist_id_fkey FOREIGN KEY (artist_id)
  REFERENCES public.artists(id) ON DELETE SET NULL;
```

`artist_name` (spec 033) se conserva sin cambios como respaldo de lectura — no hay que
tocar filas que no tengan `artist_id`; el texto libre ya cubre ese caso y no bloquea nada.

## Fuera de alcance (specs futuros, no bloquean este)

- **Auto-crear `artists` al pasar a rol `musician`.** Hoy el backfill cubre a los músicos
  existentes; a alguien que se registre después de esta migración no le nace la fila sola.
  Enganchar esto en `set_my_role` es un spec de LÓGICA aparte — sin él, un músico nuevo
  simplemente no tiene fila en `artists` hasta que algún local lo escriba como placeholder
  o él mismo la cree.
- **Flujo de reclamo real** (un músico busca su nombre entre los placeholders y linkea
  `profile_id` a su cuenta). La policy `artists_update` de arriba technically lo permite
  si el músico ya conoce el `id` — pero sin una pantalla de "¿eres tú?" nadie lo va a
  encontrar. Frontend aparte, cuando haga falta.
- **Reemplazar `artist_name` por completo.** Se deja como está; `artist_id` NULL sigue
  siendo válido.

## Consecuencia para las apps que consumen esto

`events.artistId` en `mapEventoFromDB`/`mapEventoToDB` (sonopolisWeb) sigue siendo el
mismo campo — cambia a qué apunta, no su forma. El picker de artista en `FormEvento.js`
pasa de texto libre a buscar/crear contra `artists` (spec w045, FRONTEND).

> Estado: aplicado en producción (2026-08-27) —
> `20260827000000_spec_061_tabla_artists_placeholder.sql` corrida contra `xluinfihjjtxkglihxqz`.
> Pendiente de verificar a mano: conteo de `artists` (debería ser una fila por cada
> `profiles.role='musician'`) y que ningún `events.artist_id` haya quedado huérfano tras
> el repunte del FK — el permiso para correr esa verificación se bloqueó del lado de la
> herramienta después de aplicar.
