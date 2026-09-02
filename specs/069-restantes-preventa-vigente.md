# Spec 069 — `precio_vigente_de` expone cuántas quedan

**Capa: LÓGICA · `supabase/migrations/` + `sonopolisWeb/libs/data/preventas.js` ·
Depende de: spec 068 (cupo obligatorio), spec 065 (`precio_vigente_de`) ·
Pedido desde el vault, sesión 2026-09-02**

## Motivo

Pedido de Victor: que el evento destacado de la cartelera muestre "cuántas quedan" de la
preventa vigente. `precio_vigente_de` (spec 065) ya resuelve *cuál* preventa está vigente
y salta sola a la siguiente cuando la anterior se agota (`vendidos < cupo`) — pero no
devuelve el número, así que el frontend no tiene con qué mostrarlo sin una segunda
consulta a `event_preventas`. Con spec 068 aplicado, `cupo` ya nunca es `NULL` en una
preventa real, así que `restantes` siempre es un número calculable, sin rama especial para
"sin cupo".

## RPC: agrega `restantes` a la salida

```sql
CREATE OR REPLACE FUNCTION public.precio_vigente_de(p_evento_id uuid)
RETURNS TABLE (precio text, monto integer, preventa_id uuid, preventa_nombre text, restantes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento    public.events%ROWTYPE;
  v_preventa  public.event_preventas%ROWTYPE;
BEGIN
  SELECT * INTO v_evento FROM public.events WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_existe: %', p_evento_id;
  END IF;

  IF v_evento.tipo_precio = 'puerta' THEN
    SELECT * INTO v_preventa
      FROM public.event_preventas
     WHERE event_id = p_evento_id
       AND activa = true
       AND vendidos < cupo
     ORDER BY orden
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_preventa.precio, v_preventa.monto, v_preventa.id,
        v_preventa.nombre, (v_preventa.cupo - v_preventa.vendidos);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_evento.precio, v_evento.monto, NULL::uuid, NULL::text, NULL::integer;
END; $$;
```

Único cambio real sobre spec 065: la columna `restantes` nueva, y el `WHERE` deja de
necesitar `(cupo IS NULL OR vendidos < cupo)` — con spec 068, `cupo` nunca es `NULL`, así
que `vendidos < cupo` alcanza solo. `CREATE OR REPLACE` conserva la firma como para no
romper el `GRANT` existente (`anon`, `authenticated`), pero cambia el tipo de retorno
(agrega una columna) — Postgres exige `DROP FUNCTION` primero cuando cambia el
`RETURNS TABLE`, así que la migración hace ambas cosas:

```sql
DROP FUNCTION IF EXISTS public.precio_vigente_de(uuid);
-- (CREATE OR REPLACE de arriba)
REVOKE ALL ON FUNCTION public.precio_vigente_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precio_vigente_de(uuid) TO anon, authenticated;
```

`_reservar_ticket_shared` (spec 065) no se toca — ya calcula su propio cupo restante con
lock antes de insertar, no necesita el RPC de cotización.

## `getPrecioVigente` (sonopolisWeb) pasa el campo nuevo

```js
// libs/data/preventas.js
return {
  precio: data.precio,
  monto: data.monto,
  preventaId: data.preventa_id ?? null,
  preventaNombre: data.preventa_nombre ?? null,
  restantes: data.restantes ?? null,
};
```

Puro passthrough — sin decisión de UI acá. `restantes` llega `null` cuando no hay preventa
vigente (mismo caso que `preventaId: null`), y como número siempre que sí la hay.

## Fuera de alcance

- **Mostrar "quedan X" en pantalla.** FRONTEND, spec w070.
- **Revalidación en tiempo real mientras alguien mira la página.** El número es el de la
  carga del server component (`cartelera/page.js`, `cartelera/[id]/page.js`) — se
  actualiza al recargar, no con un socket. Mismo patrón que el resto de la cartelera hoy;
  no lo pidió Victor.

> Estado: aplicado en producción (2026-09-02) —
> `20260902143500_spec_069_restantes_preventa_vigente.sql` corrida contra
> `xluinfihjjtxkglihxqz`.
