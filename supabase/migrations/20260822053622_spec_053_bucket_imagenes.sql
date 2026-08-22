-- Spec 053 (= W-010 de sonopolisWeb) — bucket de imágenes y sus policies.
-- El bucket nunca se creó: events.imagen, profiles.foto y venues.image
-- siempre fueron null. Diseño completo en
-- sonopolisWeb/specs/w010-datos-storage-imagenes.md — este archivo es la
-- aplicación literal de esa SQL, sin cambios.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Lectura pública: las tres imágenes se ven en la cartelera sin sesión.
create policy media_select on storage.objects for select
  using (bucket_id = 'media');

-- eventos/<evento_id>/<archivo>: solo quien ya puede editar ese evento.
-- Reusa can_edit_event() del spec 033 — no reimplementa el permiso.
create policy media_insert_eventos on storage.objects for insert
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'eventos'
    and public.can_edit_event(((storage.foldername(name))[2])::uuid)
  );

create policy media_update_eventos on storage.objects for update
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'eventos'
    and public.can_edit_event(((storage.foldername(name))[2])::uuid)
  );

-- perfiles/<user_id>/<archivo>: solo el dueño del perfil.
create policy media_insert_perfiles on storage.objects for insert
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'perfiles'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

create policy media_update_perfiles on storage.objects for update
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'perfiles'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

-- locales/<venue_id>/<archivo>: solo el dueño de ese local.
create policy media_insert_locales on storage.objects for insert
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'locales'
    and exists (
      select 1 from public.venues v
       where v.id = ((storage.foldername(name))[2])::uuid
         and v.owner_id = auth.uid()
    )
  );

create policy media_update_locales on storage.objects for update
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'locales'
    and exists (
      select 1 from public.venues v
       where v.id = ((storage.foldername(name))[2])::uuid
         and v.owner_id = auth.uid()
    )
  );
