# Spec 062 — Carpeta `pendientes/`: subir el flyer antes de que el evento exista

**Capa: DATOS · `supabase/migrations/` · Depende de: spec 053 (bucket `media`)**

Pedido de Victor: al crear un evento, el flyer se debería poder arrastrar o buscar como
archivo — no pegar una URL a mano. Hoy `ImageUpload.js` (sonopolisWeb, spec W-011) ya sube
archivos, pero solo funciona al **editar**: sube a `eventos/<evento_id>/`, y
`media_insert_eventos` (spec 053) exige `can_edit_event(evento_id)` — una función que
necesita que la fila `events` ya exista. En el formulario de creación, `evento.id` todavía
no existe, así que la ruta no se puede armar y el campo cae a una URL de texto (ver el
comentario en `FormEvento.js`, "Sin evento.id todavía no hay carpeta donde subir").

No se puede resolver apuntando a `can_edit_event()` con un id que no existe. La solución es
la misma que ya existe para perfiles: una carpeta gateada por `auth.uid()`, no por el
recurso.

## Migración

```sql
-- pendientes/<user_id>/<archivo>: staging para un flyer subido antes de que el
-- evento exista. Mismo mecanismo que perfiles/<user_id>/ (spec 053) — cada
-- quien sube solo a su propia carpeta, sin relación con ningún evento todavía.
create policy media_insert_pendientes on storage.objects for insert
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'pendientes'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

create policy media_update_pendientes on storage.objects for update
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'pendientes'
    and auth.uid()::text = (storage.foldername(name))[2]
  );
```

`media_select` (spec 053, `using (bucket_id = 'media')`) ya cubre lectura pública — no hace
falta policy nueva para eso.

## Por qué no mover el archivo a `eventos/<id>/` después de crear

Se evaluó copiar el objeto de `pendientes/` a `eventos/<id>/` en el momento de
`createEvento`, para que la carpeta final quede prolija. Se descarta: `storage.copy`
necesita permiso de lectura sobre el origen y escritura sobre el destino en la misma
operación, y el destino recién pasa `can_edit_event()` una vez que el evento existe — hay
una carrera entre "crear el evento" y "mover el archivo" que puede dejar el flyer huérfano
en `pendientes/` si el paso 2 falla. Dejar la URL apuntando a `pendientes/<user_id>/…`
permanentemente es más simple y no rompe nada: Storage no exige que la ruta describa el
recurso, solo que la policy la autorice. El nombre de la carpeta en el bucket es un detalle
interno, no algo que el usuario vea.

## Consecuencia para sonopolisWeb

`ImageUpload.js` no cambia — ya recibe `{ carpeta, id }` como props genéricos. Al crear un
evento, `FormEvento.js` lo llama con `carpeta="pendientes"`, `id={userId}` en vez de
`carpeta="eventos"`, `id={evento.id}`. Frontend en spec w046.

> Estado: aplicado en producción (2026-08-28) —
> `20260828000000_spec_062_storage_flyer_pendiente.sql` corrida a mano por Victor contra
> `xluinfihjjtxkglihxqz` (el `supabase db push` automático había quedado bloqueado por el
> classifier de la herramienta).
