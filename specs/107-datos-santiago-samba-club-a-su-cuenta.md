# Spec 107 — El registro de banda de Santiago Samba Club pasa a la cuenta de la banda

> Estado: **aplicado en producción** (05-oct-2026). `20261005220000` (`supabase db push --linked`, única migración pendiente). Antes del push se probó en producción dentro de una transacción revertida. Después del push, criterios 1-4 verificados: el registro apunta a `s.sambacluboficial`, 0 filas de `artists` y 0 de `event_collaborators` con la cuenta de prueba, y `cuentasDelEvento` incluye a la banda en los 2 eventos.
> Capa: DATOS (corrección de filas, sin cambio de esquema).
> `supabase/migrations/20261005220000_spec_107_santiago_samba_club_a_su_cuenta.sql`.
> Depende de: spec 061 (`artists`, el backfill que creó el enlace mal puesto), spec 033
> (`event_collaborators`).
> Relacionado: W-194/W-195 de sonopolisWeb (el feed del fan cruza por `artists.profile_id`).

> **En una frase:** el registro de banda «Santiago samba club» y el rol admin de sus 2 eventos
> pasan de `leonmusic.lab@gmail.com` (cuenta de prueba de Victor) a la cuenta real de la
> banda, `s.sambacluboficial@gmail.com`.

## Motivo

En la revisión de seguir músicos (05-oct-2026, W-194) apareció que el registro de banda
«Santiago samba club» (`artists`) está enlazado con `profile_id` a `leonmusic.lab@gmail.com`
(`65766e7e-8b0a-43dd-85c7-7785f0a1b319`), no a la cuenta de la banda
(`ad1f7193-eefe-426a-9b18-a148a625f851`, creada el 1-sep, 4 seguidores).

**Causa:** el 7-ago la cuenta `leonmusic.lab` era músico y se llamaba «Santiago samba club».
El backfill del spec 061 (27-ago) creó un registro en `artists` por cada músico existente,
copiando nombre y cuenta. Después ese perfil quedó sin nombre, la banda se registró con su
propia cuenta y nadie cambió el enlace. Victor confirmó (05-oct-2026) que `leonmusic.lab` era
una cuenta de prueba: «si se puede eliminar o cambiar de nombre, lo que quieras».

**Consecuencias:**
- Los fans que siguen a la cuenta real no reciben las fechas de la banda en `/fan`. W-194
  resuelve el músico por `artists.profile_id`, y ese campo apunta a la cuenta de prueba.
- Al crear los 2 eventos de Quintal Clandesta (6-sep y 17-sep), el trigger
  `events_claim_owner` (fix del spec 061) agregó como admin a la cuenta detrás del
  registro, o sea a la de prueba. La banda real no ve esos eventos en su panel ni puede
  administrarlos.

## Qué cambia

Inventario previo de todo lo que cuelga de `65766e7e-…` (05-oct-2026): 1 registro en
`artists` (lo creó y lo tiene reclamado), 2 filas en `event_collaborators` (rol `admin`,
`source` del trigger). Nada más: 0 opt-ins, 0 broadcasts, 0 seguidores, 0 eventos creados, 0
solicitudes.

1. **`artists`:** la fila `name = 'Santiago samba club'` con `profile_id = 65766e7e-…` pasa a
   `profile_id = ad1f7193-…` y a `name = 'Santiago Samba Club'`, el nombre que usa la banda en
   su perfil. `created_by` no se toca: es el registro de quién la creó, no un permiso que se
   necesite corregir.
2. **`event_collaborators`:** en los eventos de ese registro, la fila de `65766e7e-…` pasa a
   `user_id = ad1f7193-…`. Se conservan `role`, `source`, `can_delete` e `invited_by`.
   Antes se verifica que la banda no figure ya en esos eventos: la clave primaria es
   `(event_id, user_id)`, y si figura el `UPDATE` fallaría.

Las dos sentencias filtran por los dos ids exactos. Correr la migración dos veces no hace
nada la segunda vez.

**No se borra la cuenta de prueba.** Eliminarla no hace falta para el arreglo y borrar es
irreversible. Queda como perfil músico sin nombre, oculto del directorio por W-194.

## Criterios de aceptación (contra producción, después del push)

1. `artists` «Santiago Samba Club» tiene `profile_id = ad1f7193-…`. Ninguna fila de `artists`
   apunta a `65766e7e-…`.
2. Los 2 eventos de Santiago Samba Club tienen como colaboradores a `quintalclandesta`
   (owner) y `s.sambacluboficial` (admin). `leonmusic.lab` no figura en ninguno.
3. `cuentasDelEvento` (W-194) sobre esos eventos incluye `ad1f7193-…`.
4. `supabase migration list --linked` muestra la migración aplicada en local y remoto.
