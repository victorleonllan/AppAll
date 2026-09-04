# Spec 076 — Dos arreglos del equipo de evento: los locales no aparecen y las invitaciones se cuelgan

> Estado: escrito (4-sep-2026), sin aplicar
> Capa: DATOS. Corrige dos funciones de los specs 033 y 052, ya aplicados.
>
> **En una frase:** hoy no puedes invitar a un local al equipo de un evento (la búsqueda no
> lo encuentra), y si invitas por correo a alguien que ya tiene cuenta, la invitación queda
> colgada para siempre. Dos líneas de SQL arreglan las dos cosas.

## Bug 1 — la búsqueda de colaboradores no ve a los locales

`search_collaborator_candidates` (spec 033) filtra:

```sql
WHERE p.role IN ('musician','cafe')
```

El spec 046 renombró los roles: `'cafe'` pasó a `'local'` y `'public'` a `'fan'`, con un
`UPDATE` sobre las filas existentes. Esa función nunca se actualizó, así que sigue buscando
un valor que ya no existe en ninguna fila.

Verificado contra producción (4-sep-2026):

| Rol | Filas | ¿La búsqueda las encuentra? |
|---|---|---|
| `musician` | 3 | Sí |
| `local` | 3 | **No** |
| `fan` | 7 | No (correcto, ver abajo) |
| `cafe` | **0** | — |

**Consecuencia:** el buscador de "Invitar" en el panel de equipo solo devuelve músicos.
Un músico que quiere sumar a su local al equipo del evento no lo encuentra, escriba lo que
escriba.

Es exactamente el fantasma que advierte el `W-README` de sonopolisWeb —`role='cafe'`
conviviendo con `'local'`— sobreviviendo en una función que el rename no tocó.

```sql
CREATE OR REPLACE FUNCTION public.search_collaborator_candidates(q text)
RETURNS TABLE(id uuid, nombre text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre, p.role
    FROM public.profiles p
   WHERE p.role IN ('musician','local')
     AND p.nombre ILIKE '%' || q || '%'
   LIMIT 20;
$$;
```

**`'cafe'` no se deja "por si acaso".** Hay 0 filas con ese valor, y dejarlo es lo que
mantiene vivo un vocabulario muerto — que es la causa de este bug, no su solución.

**Los `fan` siguen fuera, a propósito.** El equipo de un evento es quien lo trabaja: el
local, el músico, quien escanea en la puerta. Un fan es público. Esto no es un descuido del
rename: es la regla, y ahora queda escrita.

## Bug 2 — invitar por correo a alguien que ya tiene cuenta no hace nada

El spec 052 modeló la invitación por correo así: se crea una fila `pending` en
`event_collaborator_invites`, y un trigger la convierte en colaborador **cuando esa persona
crea su cuenta**:

```sql
CREATE TRIGGER claim_event_collaborator_invites_trg
  AFTER INSERT ON auth.users
```

`AFTER INSERT` significa: solo al registrarse. Si la persona **ya tiene cuenta** —el caso
más frecuente en una plataforma que ya tiene usuarios— nada reclama esa invitación nunca.
Entra, no ve ningún cambio, y la fila queda `pending` para siempre. No hay ningún otro
camino que la reclame: se verificó que ni `libs/auth.js` ni el middleware de sonopolisWeb
hacen nada parecido.

**El arreglo es un segundo trigger sobre el mismo evento de la vida del usuario: iniciar
sesión.** GoTrue actualiza `auth.users.last_sign_in_at` en cada login, así que eso sirve de
señal.

```sql
CREATE TRIGGER claim_event_collaborator_invites_login_trg
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
  EXECUTE FUNCTION public.claim_event_collaborator_invites();
```

**La función no se toca ni se duplica.** La del spec 052 ya usa `NEW.id` y `NEW.email`, y ya
es idempotente (`ON CONFLICT (event_id, user_id) DO NOTHING` + el `UPDATE` a `accepted` que
solo alcanza filas `pending`). Sirve igual disparada por INSERT o por UPDATE. Una segunda
copia sería una segunda cosa que mantener y una manera de que un día difieran.

**Por qué un trigger en la base y no una llamada desde la app:** el mismo usuario entra
desde la web y desde la app nativa de Expo, contra la misma base. Si el reclamo viviera en
el código de la web, entrar desde el teléfono no reclamaría nada. En la base cubre los dos,
y cualquier cliente futuro.

**El `WHEN` importa:** sin él, el trigger corre en cada `UPDATE` a `auth.users` (metadata,
cambio de correo, refresh de token). Con él, solo cuando efectivamente hubo un login.

## Criterios de cierre

1. `supabase db push` aplica sin error.
2. `select * from search_collaborator_candidates('<parte del nombre de un local>')` devuelve
   ese local. Antes devolvía vacío.
3. Con una invitación `pending` para el correo de una cuenta **que ya existe**: esa persona
   inicia sesión → queda en `event_collaborators` y la invitación pasa a `accepted`.
4. Un login sin invitaciones pendientes no cambia nada y no falla.

## Lo que este spec NO hace

- **No avisa a quien se agrega por nombre.** Sumar a alguien buscándolo por nombre lo mete
  al equipo al instante y en silencio: no le llega ningún correo, y se entera si entra al
  evento por casualidad. Que ese camino también avise es un cambio de la capa LÓGICA
  (`invitarColaborador` / el route de correo), y va aparte.
- No toca el texto del correo de invitación, que además está escrito en voseo argentino
  («Creá tu cuenta») contra la convención de español neutro del proyecto. Es copy, no datos.
