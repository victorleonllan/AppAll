-- Spec W-058 (sonopolisWeb) — collab_requests: proponerle tocar juntos a otro músico.
--
-- El paso previo entre pares, cuando todavía no hay ni evento ni local.
-- `event_collaborators` (spec 033) es colaboración sobre un evento que YA existe;
-- `booking_requests` (spec 051 / W-031) es la negociación previa pero músico↔local,
-- con `venue_id NOT NULL` porque el local es el objeto de la negociación.
--
-- Tabla nueva y no `venue_id` nullable en booking_requests: sus funciones de
-- autorización hacen JOIN contra venues, así que un venue_id nulo dejaría de
-- proteger también las filas viejas.

create table collab_requests (
  id            uuid        primary key default gen_random_uuid(),
  from_musician uuid        not null references profiles(id) on delete cascade,
  to_musician   uuid        not null references profiles(id) on delete cascade,
  proposed_at   timestamptz,
  note          text,
  status        text        not null default 'pending'
                            check (status in ('pending','accepted','declined','cancelled')),
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint collab_requests_no_self check (from_musician <> to_musician)
);

-- Sin `created_by`: a diferencia de booking_requests (donde cualquiera de las dos
-- partes puede iniciar), acá `from_musician` ES quien propone. Guardar el mismo
-- hecho dos veces es el drift que documentó el spec 032.

create index collab_requests_from_idx on collab_requests (from_musician);
create index collab_requests_to_idx   on collab_requests (to_musician);

-- Dos pestañas abiertas no pueden crear dos solicitudes vivas al mismo par. Solo
-- `pending`: una rechazada o cancelada no bloquea volver a proponer más adelante.
-- (booking_requests sigue sin su equivalente — deuda #18 de W-PENDIENTES, spec propio.)
create unique index collab_requests_una_viva
  on collab_requests (from_musician, to_musician)
  where status = 'pending';

alter table collab_requests enable row level security;

create policy collab_requests_select on collab_requests for select
  using (from_musician = auth.uid() or to_musician = auth.uid());

-- Las dos puntas tienen que ser músicos de verdad: el FK a `profiles` no lo
-- garantiza (ahí viven fans y locales también), y sin este check un usuario
-- 'local' podría insertarse como from_musician con su propio id.
create policy collab_requests_insert on collab_requests for insert
  with check (
    from_musician = auth.uid()
    and exists (select 1 from profiles p where p.id = from_musician and p.role = 'musician')
    and exists (select 1 from profiles p where p.id = to_musician   and p.role = 'musician')
  );

-- Responder: solo el destinatario, y solo mientras sigue pending.
create policy collab_requests_respond on collab_requests for update
  using      (status = 'pending' and to_musician = auth.uid())
  with check (status in ('accepted','declined'));

-- Cancelar: solo quien propuso, y solo mientras sigue pending.
-- Dos policies de UPDATE y no una, por el mismo mecanismo que explica el spec 051:
-- Postgres las combina con OR para alcanzar la fila, pero cada WITH CHECK se evalúa
-- contra el resultado final, así que quien propuso no puede auto-aceptarse.
create policy collab_requests_cancel on collab_requests for update
  using      (status = 'pending' and from_musician = auth.uid())
  with check (status = 'cancelled');

-- Se reusa la función del spec 051: solo mira NEW.status/OLD.status y escribe
-- NEW.responded_at, columnas que esta tabla también tiene. Copiarla con otro
-- nombre serían dos funciones que corregir dos veces.
create trigger collab_requests_set_responded_at_trg
  before update on collab_requests
  for each row execute function public.booking_requests_set_responded_at();
