# Spec 054 — Vocabulario cerrado de géneros musicales

> Estado: aplicado (2026-08-24)

**Capa: DATOS · `src/constants/` · Depende de: nada**

## Pedido de Victor

`genero` (evento, single) y `generos` (perfil de banda, múltiple) son texto libre hoy —
cada pantalla escribe lo que quiere ("Jazz fusión", "Rock alternativo", "Rock acústico" en
los mocks). Victor pidió reemplazarlo por un listado cerrado, usando como base el catálogo
de géneros de OffStep (distribuidora digital) ya scrapeado en el vault:
`08-KNOWLEDGE/Sonopolis/2026-08-24 Géneros musicales - listado OffStep.md`. Este spec cubre
solo la capa de datos: la fuente de verdad del listado. Buscar/filtrar (055) y las
pantallas (056) van en specs aparte, encadenados a este.

## Decisión: constante TS, sin migración de DB

Mismo problema que resolvió el spec 030 con `tipo_proyecto` (texto libre → vocabulario
cerrado), pero acá **no se agrega constraint en la base de datos**, a diferencia de ese
precedente. Motivo: `tipo_proyecto` tenía 5 valores y las 4 filas existentes estaban en
`NULL` — el `CHECK` era seguro de aplicar. Acá el listado tiene 174 valores y ya hay datos
de producción en `events.genero` (`text NOT NULL`) y `profiles.generos` (`text[]`) escritos
como texto libre, que casi seguro no calzan contra el listado cerrado ("Jazz fusión" no está
en la lista; está "Jazz"). Agregar un `CHECK`/FK ahora rompería esas filas o exigiría un
backfill de normalización con juicio editorial (qué género de la lista corresponde a cada
valor libre existente) — eso es trabajo de datos separado, no de este spec, y no se hace
sin decisión explícita de Victor sobre esa normalización.

Consecuencia: el listado cerrado se aplica **desde la UI hacia adelante** (specs 055/056) —
los pickers solo permiten elegir de la lista, así que todo dato nuevo ya nace válido. Los
valores viejos quedan como están hasta que alguien edite ese evento/perfil desde la UI
nueva. Endurecer con un `CHECK`/FK en DB queda fuera de alcance, es un spec futuro si hace
falta integridad a nivel de base (ver "Fuera de alcance").

## Trabajo

`src/constants/generos.ts` — un solo array exportado, sin capas, sin labels (no hace falta
`Record` como `TIPO_PROYECTO_LABEL`: los géneros ya son su propio label legible).

```ts
/** Spec 054 — vocabulario cerrado de géneros musicales.
 * Fuente: listado de géneros de OffStep (distribuidora digital), scrapeado el
 * 2026-08-24 — ver 08-KNOWLEDGE/Sonopolis/2026-08-24 Géneros musicales - listado OffStep.md
 * en el vault. 174 géneros, orden alfabético original.
 * Agregar un género nuevo: addendum en el spec 054, no edición silenciosa. */
export const GENEROS_MUSICALES: string[] = [
  'Afoxé', 'African', 'Afro House', /* … 174 en total … */
];
```

El array completo (174 strings) se copia tal cual del listado del vault, sin editorializar.

## Fuera de alcance

- Migración de datos existentes (`events.genero`, `profiles.generos`) al listado cerrado —
  requiere normalización con juicio editorial, spec aparte si Victor lo pide.
- `CHECK`/FK en la base de datos — solo tiene sentido después de esa migración.
- Buscar/filtrar por género (spec 055) y las pantallas que usan el listado (spec 056).

## Criterios de aceptación

- [x] `src/constants/generos.ts` existe, exporta `GENEROS_MUSICALES: string[]` con 174
      elementos, sin duplicados
- [x] El array calza 1:1 (mismo orden, mismos 174 valores) con el listado del vault

## Relacionado

- Spec 030 — precedente de texto libre → vocabulario cerrado (`tipo_proyecto`), por qué acá
  se resuelve distinto (sin `CHECK` en DB)
- `08-KNOWLEDGE/Sonopolis/2026-08-24 Géneros musicales - listado OffStep.md` (vault) — fuente
  del listado y su propio mapeo contra Sonópolis
- Spec 055 — filtrar/buscar por género (LÓGICA)
- Spec 056 — picker de género en Crear/Editar evento, perfil de banda y Cartelera (FRONTEND)
