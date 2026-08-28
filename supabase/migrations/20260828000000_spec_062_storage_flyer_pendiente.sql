-- Spec 062 — Carpeta pendientes/<user_id>/: subir el flyer antes de que el
-- evento exista. Ver specs/062-storage-flyer-pendiente-antes-de-crear.md.

-- pendientes/<user_id>/<archivo>: staging para un flyer subido antes de que
-- el evento exista. Mismo mecanismo que perfiles/<user_id>/ (spec 053) —
-- cada quien sube solo a su propia carpeta, sin relación con ningún evento
-- todavía.
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
