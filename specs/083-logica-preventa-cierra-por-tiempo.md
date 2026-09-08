# Spec 083 — La preventa cierra por reloj en el cobro, no en pantalla

> Estado: **escrito, sin aplicar** (8-sep-2026)
> Capa: LÓGICA. `supabase/migrations/<timestamp>_spec_083_preventa_cierra_por_tiempo.sql`.
> Depende de: spec 082 (columnas de cierre), spec 069 (`precio_vigente_de` con
> `restantes`), spec 071 (última versión de `_reservar_ticket_shared`).

> **En una frase:** las columnas del 082 no cierran nada por sí solas — este spec hace que
> los dos únicos lugares que deciden el precio (cotización y reserva) miren la hora de
> cierre, y expone esa hora para que el formulario la muestre sin recalcularla.

## Por qué en Postgres y no en el frontend

Esconder el badge de preventa en la cartelera cuando pasó la hora no alcanza: alguien con
la ficha abierta desde antes, o un `POST` directo a `create-preference`, compra igual. El
spec 065 dejó una regla para esto — el precio se decide **solo** en `precio_vigente_de`
(cotización) y en `_reservar_ticket_shared` (reserva con lock), y todo lo demás relaya el
número. El cierre por tiempo entra a esos dos lugares y a ninguno más.

## Decisión 1 — dos funciones sobre la fila, para no repetir el criterio

El criterio "esta preventa está abierta" hoy está escrito dos veces (065: cotización y
reserva), y con el reloj se vuelve más largo. Se saca a dos funciones que reciben la fila
de `event_preventas`:

```sql
-- Instante en que cierra por tiempo. NULL solo cuando la regla es 'horas_antes' y el
-- evento no tiene comienza_at (spec 045 lo dejó nullable; la app móvil no lo escribe).
CREATE OR REPLACE FUNCTION public.preventa_cierra_at(p public.event_preventas)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p.cierre_tipo
    WHEN 'fecha' THEN p.cierre_at
    WHEN 'horas_antes' THEN (
      SELECT e.comienza_at - make_interval(hours => p.cierre_horas_antes)
        FROM public.events e WHERE e.id = p.event_id
    )
  END;
$$;

-- Abierta = activa, con cupo y antes de la hora de cierre. Las tres a la vez.
CREATE OR REPLACE FUNCTION public.preventa_abierta(p public.event_preventas)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.activa
     AND p.vendidos < p.cupo
     AND public.preventa_cierra_at(p) IS NOT NULL
     AND public.preventa_cierra_at(p) > now();
$$;

REVOKE ALL ON FUNCTION public.preventa_cierra_at(public.event_preventas) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preventa_abierta(public.event_preventas)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preventa_cierra_at(public.event_preventas) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preventa_abierta(public.event_preventas)  TO anon, authenticated;
```

**Falla cerrado.** Si `preventa_cierra_at` da `NULL` (regla "horas antes" sobre un evento
sin `comienza_at`), la preventa se considera **cerrada** y se cobra puerta. El error barato
es cobrar de más a alguien que sí llegó a tiempo; el error caro es el del incidente,
cobrar preventa en la puerta. Antes de aplicar, listar quién cae en ese caso:
`SELECT p.id, p.nombre, e.artist_name FROM event_preventas p JOIN events e ON e.id = p.event_id WHERE p.activa AND e.comienza_at IS NULL;`
— hoy debería dar cero filas (las preventas nacen en la web, que sí escribe
`comienza_at`), y si no, se completa `comienza_at` a mano antes de seguir.

**Por qué funciones de fila y no columnas generadas.** Una columna `GENERATED` no puede
mirar `events`, y el instante depende de `comienza_at`. Y una función con la fila como
único argumento es lo que PostgREST expone como **columna calculada**: desde la web,
`.select("*, preventa_cierra_at")` trae el instante por preventa sin una consulta extra ni
reimplementar la resta en JS. Es la misma razón por la que existe `precio_vigente_de`: el
criterio vive en un solo lugar.

`SECURITY DEFINER` porque `preventa_cierra_at` lee `events`; con `SECURITY INVOKER` un
`anon` la podría llamar igual (`events_select` es público) — se pone por simetría con
`precio_vigente_de`, que ya lo es, y para que la función no dependa de qué policies tenga
`events` mañana.

## Decisión 2 — `precio_vigente_de` usa `preventa_abierta` y devuelve `cierra_at`

Se recrea con una columna más de salida, `cierra_at`: la ficha del evento puede decir
"preventa hasta el sábado 18:00" sin otra consulta. Cambia `RETURNS TABLE`, así que
`DROP` + `CREATE` como en el 069 (misma firma de entrada, los `GRANT` se vuelven a dar):

```sql
DROP FUNCTION IF EXISTS public.precio_vigente_de(uuid);

CREATE FUNCTION public.precio_vigente_de(p_evento_id uuid)
RETURNS TABLE (precio text, monto integer, preventa_id uuid, preventa_nombre text,
               restantes integer, cierra_at timestamptz)
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
      FROM public.event_preventas ep
     WHERE ep.event_id = p_evento_id
       AND public.preventa_abierta(ep)
     ORDER BY ep.orden
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_preventa.precio, v_preventa.monto, v_preventa.id,
        v_preventa.nombre, (v_preventa.cupo - v_preventa.vendidos),
        public.preventa_cierra_at(v_preventa);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_evento.precio, v_evento.monto, NULL::uuid, NULL::text,
    NULL::integer, NULL::timestamptz;
END; $$;

REVOKE ALL ON FUNCTION public.precio_vigente_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precio_vigente_de(uuid) TO anon, authenticated;
```

El salto a la siguiente preventa ya funciona igual que con el cupo: si la Preventa 1 cerró
por fecha y la Preventa 2 sigue abierta, `ORDER BY orden LIMIT 1` devuelve la 2. Si
ninguna está abierta, puerta.

## Decisión 3 — `_reservar_ticket_shared`, el mismo `WHERE`

`CREATE OR REPLACE` sobre la versión del spec 071, cambiando solo el `SELECT` de la
preventa. Firma, grants y el resto del cuerpo (aforo, email, `INSERT`) no se tocan:

```sql
  -- antes (spec 065/071):
  --   WHERE event_id = p_evento_id AND activa = true
  --     AND (cupo IS NULL OR vendidos < cupo)
  -- ahora:
  IF v_evento.tipo_precio = 'puerta' THEN
    SELECT * INTO v_preventa
      FROM public.event_preventas ep
     WHERE ep.event_id = p_evento_id
       AND public.preventa_abierta(ep)
     ORDER BY ep.orden
     LIMIT 1
     FOR UPDATE;
    v_hay_preventa := FOUND;
  END IF;
```

El `IF v_preventa.cupo IS NOT NULL AND ...` que sigue después queda igual; con el 068 el
`cupo` nunca es `NULL`, pero no vale la pena tocar una rama que ya funciona en un spec
que no es sobre cupo.

**Carrera aceptada:** una reserva `pending` hecha un minuto antes del cierre que se paga
después del cierre queda `completed` a precio de preventa — `webhook-mp` no vuelve a
cotizar, el monto se fijó al reservar (spec 065). Es la misma ventana que ya existe con el
cupo y dura lo que MP tarde en cobrar. Si alguna vez importa, la perilla es
`expiration_date_to` en la preferencia de MP, no este spec.

## Criterios de aceptación

Con un evento de prueba `tipo_precio = 'puerta'`, `comienza_at` mañana a las 21:00, y una
preventa con cupo:

- [ ] `cierre_tipo = 'horas_antes'`, `cierre_horas_antes = 3` → `preventa_cierra_at` da
      mañana 18:00 y `precio_vigente_de` devuelve la preventa con ese `cierra_at`.
- [ ] Mover `comienza_at` a hace 1 hora → `precio_vigente_de` devuelve puerta
      (`preventa_id NULL`) aunque `activa` y con cupo. `reservar_ticket_pending` cobra
      `events.monto`, no el de la preventa.
- [ ] `cierre_tipo = 'fecha'`, `cierre_at = now() + interval '1 hour'` → preventa;
      `cierre_at = now() - interval '1 minute'` → puerta.
- [ ] Preventa 1 con `cierre_at` pasado y Preventa 2 abierta → `precio_vigente_de` devuelve
      la 2.
- [ ] `comienza_at = NULL` con regla `horas_antes` → puerta (falla cerrado).
- [ ] Desde la web, `.from("event_preventas").select("*, preventa_cierra_at")` trae la
      columna calculada con `anon`.
- [ ] `pg_get_functiondef` de las cuatro funciones coincide con el archivo (como se hizo
      en el 065).

## Fuera de alcance

- **Selector de cierre en el formulario y mostrar "cierra el …"** — `sonopolisWeb`
  spec W-116.
- **`create-preference` y `webhook-mp` no se tocan.** Relayan el número del RPC (spec 065);
  no tienen nada que saber del reloj.
- **Mostrar `cierra_at` en la cartelera pública.** El RPC ya lo devuelve; qué hace la
  ficha con eso es FRONTEND aparte, no pedido.
