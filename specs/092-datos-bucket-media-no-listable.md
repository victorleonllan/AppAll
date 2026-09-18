# Spec 092 — El bucket `media` deja de ser listable por cualquiera

> Estado: **aplicado en producción** (17-sep-2026) — `20260917170000_spec_092_media_no_listable.sql`,
> aplicada en local y después contra `xluinfihjjtxkglihxqz` por Management API, registrada en
> `schema_migrations`. En producción el bucket tenía **18 objetos, 5 de ellos en `pendientes/`**.
> Con la anon key real, antes: el listado devolvía 4 entradas y `prefix=pendientes` devolvía 2.
> Después: **0 y 0**. Las imágenes siguen sirviéndose por URL —probadas una de `perfiles/` y una
> de `pendientes/`, las dos HTTP 200— que es exactamente lo que la decisión 1 anticipaba: la
> policy no era lo que las hacía visibles. Las 8 policies de `insert`/`update` intactas, los 18
> objetos intactos, y splinter baja de **48 a 47**.
> Capa: DATOS. `supabase/migrations/20260917170000_spec_092_media_no_listable.sql`
> Depende de: spec 089 (entorno local). Toca la policy `media_select` nacida en el spec 053
> (= W-010); las de `insert`/`update` de los specs 053 y 062 no se tocan.
> Origen: Security Advisor de Supabase, 16-sep-2026 — regla `Public Bucket Allows Listing`
> sobre `storage.media`.

> **En una frase:** la policy de lectura del bucket es `using (bucket_id = 'media')` sin más
> condición, y eso no habilita ver las imágenes —el bucket es público, eso ya pasa por otro
> lado— sino **enumerar todo lo que hay dentro**, incluida la carpeta `pendientes/` donde se
> guardan los flyers de eventos que todavía no existen.

## El problema

El spec 053 creó el bucket `public = true` y esta policy:

```sql
-- Lectura pública: las tres imágenes se ven en la cartelera sin sesión.
create policy media_select on storage.objects for select
  using (bucket_id = 'media');
```

El comentario describe una intención correcta pero atribuye el efecto al lugar equivocado, y
esa confusión es todo el spec. En Supabase Storage hay dos caminos de lectura:

| Camino | Pasa por RLS | Qué hace |
|---|---|---|
| `GET /storage/v1/object/public/media/<ruta>` | **No** | Sirve el archivo porque el bucket tiene `public = true`. No consulta `storage.objects` |
| `POST /storage/v1/object/list/media` | **Sí** | Devuelve el inventario: consulta `storage.objects` y aplica las policies de `select` |

O sea: **las imágenes de la cartelera no se ven gracias a `media_select`**, se ven porque el
bucket es público. Lo único que `media_select` habilita hoy es el segundo camino — y como la
policy no declara `to`, aplica a `PUBLIC`, es decir también a `anon`. Con la anon key, que
viaja en el bundle del navegador, cualquiera pide el listado completo del bucket.

Las cuatro carpetas que quedan expuestas al listado, con sus specs de origen:

- `eventos/<event_id>/` (053) — flyers de eventos publicados. Enumerarlos no revela nada
  que la cartelera no muestre.
- `perfiles/<user_id>/` y `locales/<venue_id>/` (053) — fotos de perfil, ya públicas.
- **`pendientes/<user_id>/` (062)** — acá está el daño. Es el staging de un flyer subido
  **antes de que el evento exista**: el arte de un show que todavía no se anunció, subido por
  alguien que está armando la publicación. El listado lo entrega agrupado por `user_id`, así
  que además dice quién está preparando qué.

Verificado en los dos clientes: **nadie llama `.list()`**. `sonopolisWeb/libs/storage.js` solo
hace `.upload()` y construye la URL con `urlPublica()`, que es una función pura de formato —
ni siquiera usa `getPublicUrl()`. En `~/projects/AppAll/src`, `grep -rn "\.storage\."` no
devuelve nada: la app móvil no toca Storage. La policy no sostiene ninguna funcionalidad
viva.

## Decisión 1 — se borra `media_select` y no se reemplaza por otra

Lo tentador es acotarla: dejar el `select` para las tres carpetas públicas y sacar
`pendientes`. No sirve para lo que parece. Como el bucket es público, quien conozca la URL de
un objeto de `pendientes/` lo descarga igual, con policy o sin ella — recortarla daría la
sensación de haber protegido el flyer cuando lo único que se quitó es el índice.

Entonces la policy acotada no protegería nada más que la versión borrada, y costaría código.
Se borra:

```sql
-- El bucket es público: las imágenes de la cartelera las sirve
-- /object/public/, que no consulta storage.objects. Esta policy solo habilitaba
-- /object/list/, es decir enumerar el bucket entero —incluida pendientes/, que
-- es arte de eventos sin publicar— y ningún cliente lista. Sin policy de select,
-- RLS deniega el listado a todos salvo service_role.
drop policy if exists media_select on storage.objects;
```

Lo que se pierde, dicho explícito: a partir de acá **nadie puede listar el bucket** salvo
`service_role` (que salta RLS) y el Studio de Supabase. Si mañana un panel necesita mostrar
"tus imágenes subidas", eso es una policy nueva y acotada al dueño de la carpeta, con su
propio spec. Escribirla ahora sería adelantar una funcionalidad que nadie pidió.

## Decisión 2 — el bucket sigue siendo público, y `pendientes/` sigue expuesto por URL

Este spec cierra la enumeración, no la lectura. Un flyer de `pendientes/` cuya URL se filtre
—por un log, un historial de navegador, un link compartido— se sigue descargando sin sesión.

El arreglo de fondo es otro: `pendientes/` debería vivir en un bucket **privado**, servido con
URLs firmadas de vida corta. Eso toca la subida y el render en `sonopolisWeb`, o sea cruza a
LÓGICA y FRONTEND, y por la regla de una capa por spec no entra acá. **Va a PENDIENTES como
spec candidato**, con este número como referencia.

Lo que sí mejora hoy y no es poco: sin listado, una URL de `pendientes/` hay que **conocerla**,
y contiene un `crypto.randomUUID()` como nombre de archivo (`libs/storage.js`). Adivinarla no
es una opción realista; enumerarla sí lo era hasta esta migración.

## Lo que este spec no toca

- **`media_insert_*` y `media_update_*`** (specs 053 y 062). Quién puede subir dónde no
  cambia, y siguen apoyándose en `can_edit_event()` — que es justo la función que el spec 093
  toca en sus permisos de ejecución. **Este spec va antes que el 093** para no mezclar dos
  causas si algo falla en la subida.
- **El flag `public` del bucket.** Cambiarlo rompería la cartelera entera, que arma las URLs
  por convención de string.
- **El frontend.** Cero cambios.

## Criterios de cierre

1. Contra la base local del spec 089: `select * from pg_policies where tablename = 'objects'
   and schemaname = 'storage'` ya no lista `media_select`; sí lista las seis de
   `insert`/`update`.
2. Con la **anon key local**, `POST /storage/v1/object/list/media` con `{"prefix":""}`
   devuelve lista vacía o error de permiso. Antes de la migración devolvía el inventario.
3. Con la misma anon key, `GET /storage/v1/object/public/media/<ruta conocida>` **sigue
   devolviendo la imagen**. Es el criterio que importa: prueba que la cartelera no dependía de
   la policy.
4. Subir una imagen a `eventos/<id>/` como el dueño del evento sigue funcionando, y sigue
   fallando para quien no lo es (las policies de `insert` no se tocaron).
5. `supabase db lint --level warning` local: el warning `Public Bucket Allows Listing`
   desaparece.
6. En producción, después de aplicar: la cartelera de `sonopolisWeb` carga todas las imágenes
   (eventos, perfiles y locales) sin un solo 403 en la pestaña de red.

---

## Addendum — verificado contra la base local (16-sep-2026)

### La regla no se dispara sola: hay que inyectarle los buckets

`public_bucket_allows_listing` **no lee `storage.buckets`**. Lee los buckets públicos de un
parámetro de sesión que el dashboard inyecta antes de correr la consulta, y si no está, la
regla no encuentra nada y no reporta nada. La primera corrida local devolvió cero para esta
regla, y eso no significaba que el problema no existiera: significaba que no se había
preguntado. Hay que correrla así:

```sql
SET splinter.public_buckets = '[{"bucket_id":"media","bucket_name":"media"}]';
\i splinter.sql
```

**Sin esa línea, el criterio 5 daría verde sin haber probado nada.** Es la trampa más fácil de
pisar de las cuatro reglas que cierran estos specs.

### El diagnóstico, confirmado

Con el parámetro puesto aparece el hallazgo, uno solo, y su texto sostiene la decisión 1 casi
palabra por palabra:

> Public bucket `media` has 1 broad SELECT policy on `storage.objects` (`media_select`),
> allowing clients to list all files. **Public buckets don't need this for object URL access**
> and it may expose more data than intended.

"Public buckets don't need this for object URL access" es exactamente el punto: la policy no
es lo que hace visible la cartelera. Borrarla no puede romper una imagen.

Corrección de procedimiento en el criterio 5: `supabase db lint` no corre splinter sino
`plpgsql_check`. El procedimiento completo está en el addendum del spec 089.
