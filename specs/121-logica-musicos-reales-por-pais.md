# Spec 121 — `useMusicos`: los músicos de la app salen de `profiles`, por país

> Estado: propuesto (16-oct-2026)
> Capa: LÓGICA. `src/hooks/useMusicos.ts` (nuevo), `src/lib/profiles.ts`, `src/types/index.ts`.
> Depende de: spec 106
> Alimenta: spec 122 (directorio y perfil público), spec 123 (`mapProfileFromDB` con `avatar` y `pais`), spec 124, spec 130.
> Hermano en la web: W-040 (directorio de músicos), W-206 (músicos por país), W-207 (directorio del país del entorno). Archivos: `sonopolisWeb/libs/data/profiles.js` (`getMusicos`, `getPerfilMusico`), `libs/mappers.js:309` (`mapPerfilMusicoFromDB`).

> **En una frase:** la lista de músicos y el perfil público de la app leen
> `musicosMock`, datos inventados; este spec da los hooks que leen `profiles` de verdad,
> filtrables por país, sin respaldo de mock y con el error a la vista.

## Contexto

- `LocalesScreen.tsx:7` y `VerMusicoScreen.tsx:3` importan `musicosMock`
  (`src/data/mock/musicos.ts:6`): los músicos «Juana Fe» y «Los Andes Jazz» no existen en
  la base, y tocar uno lleva a un perfil que tampoco existe. La web dejó eso atrás en el
  W-040 (`app/(marketing)/musicos/page.js`, comentario «⚠️ Cambio real respecto de la app
  RN»).
- La única lectura real de músicos en la app es la de `DashboardLocalScreen.tsx:69-87`,
  inline en la pantalla y con solo tres columnas.
- `PerfilMusico` (`src/types/index.ts:115`) no tiene `pais`, `avatar` ni `available`, y
  `mapProfileFromDB` (`src/lib/profiles.ts`) no los lee. Las columnas existen: `pais`
  `NOT NULL DEFAULT 'CL'` (spec 106, `20261005210000_spec_106_pais_del_perfil.sql:13-28`),
  `avatar` (spec 085) y `available boolean NOT NULL DEFAULT false` (spec 051).
- RLS de `profiles` (spec 020, `20260807200248_spec_020_fix_rls_critico.sql:13`): un
  tercero, con o sin sesión, solo ve filas con `role = 'musician'`; cada quien ve además la
  suya. Por eso «no existe» y «no tienes permiso de verlo» llegan igual, como `null`.

## Diseño

### 1. Tipos (`src/types/index.ts`)

`PerfilMusico` suma, opcionales:

```ts
pais?: string;            // spec 106 — ISO alpha-2
avatar?: string | null;   // spec 085 — logo chico; `foto` es la imagen grande
available?: boolean;      // spec 051 — «disponible este finde»
```

### 2. Mapper (`src/lib/profiles.ts`)

`mapProfileFromDB` suma `pais: db.pais ?? undefined`, `avatar: db.avatar ?? null`,
`available: db.available ?? false`. **`mapProfileToDB` no se toca:** escribir país,
avatar y disponibilidad es del spec 130 (editar perfil), y mandar `pais` desde acá cambiaría
lo que guarda `PerfilMusicoScreen` sin que nadie lo haya pedido.

### 3. `src/hooks/useMusicos.ts` (nuevo)

Dos hooks en el mismo archivo:

```ts
export function useMusicos(opciones?: { pais?: string }): {
  musicos: PerfilMusico[];
  loading: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
}

export function usePerfilMusico(id: string | null): {
  musico: PerfilMusico | null;
  loading: boolean;
  error: string | null;
}
```

**`useMusicos`** — copia de `getMusicos` (`libs/data/profiles.js`):

```ts
let q = supabase.from('profiles').select('*').eq('role', 'musician');
if (opciones?.pais) q = q.eq('pais', opciones.pais);
const { data, error } = await q.order('nombre', { ascending: true });
```

- Mapea con `mapProfileFromDB` y **deja fuera los perfiles sin nombre**
  (`(m.nombre ?? '').trim() !== ''`, W-194): quien eligió rol músico y nunca completó el
  perfil sale como tarjeta en blanco, imposible de reconocer.
- `pais` es opcional a propósito, como en la web (W-206): el directorio lo pasa siempre;
  quien busca músicos por id (seguidos, solicitudes) no lo pasa, porque filtrar escondería a
  un músico de otro país.
- Vuelve a consultar cuando cambia `opciones?.pais` (dependencia del efecto: el string, no
  el objeto, para no consultar en cada render).
- **Sin mock y sin `catch {}`:** si Supabase falla, `musicos = []`, `error` con el mensaje y
  `console.error('[useMusicos]', error)`. El mock es lo que hizo que la app «funcionara» con
  datos falsos durante meses (`CLAUDE.md` del repo, «Providers con fallback a mock»).

**`usePerfilMusico`** — copia de `getPerfilMusico`:
`supabase.from('profiles').select('*').eq('id', id).maybeSingle()`. Con `id === null` no
consulta. `musico = null` significa «no existe o no es visible» (ver RLS arriba); el hook no
intenta distinguirlos.

### 4. Lo que no hace este spec

No toca pantallas: el reemplazo de `musicosMock` en `LocalesScreen` y `VerMusicoScreen` es
del spec 122, y el de `PerfilMusicoScreen` (`:44`, `:48`) es del spec 130, que reescribe esa
pantalla. `src/data/mock/musicos.ts` sigue existiendo hasta que el 130 quite su último uso.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. `useMusicos({ pais: 'CL' })` devuelve solo perfiles `role = 'musician'` con `pais = 'CL'`,
   ordenados por nombre, sin ninguno de nombre vacío o solo espacios (comprobable con un
   componente temporal o con `console.log` en desarrollo, que no se commitea).
3. `useMusicos()` sin opciones devuelve músicos de todos los países.
4. `usePerfilMusico(<id de un fan>)` con otra sesión devuelve `musico: null` sin `error`.
5. Con la red cortada, `useMusicos` devuelve `musicos: []` y `error` no nulo; no aparece
   ningún músico de `musicosMock`.
6. `rg -n "musicosMock" src/hooks src/lib` no devuelve nada.
7. `mapProfileToDB` no cambia (`git diff src/lib/profiles.ts` solo toca `mapProfileFromDB`).

## Fuera de alcance

- Cualquier pantalla (specs 122 y 130).
- Escribir `pais`, `avatar` o `available` (spec 130).
- Paginación: con el volumen actual de músicos una sola consulta alcanza, igual que en la web.
- Buscar por género: la web lo tiene apagado a pedido de Victor (24-ago-2026,
  `DirectorioMusicos.js`).

## Verificación manual (candidatas a `V#`)

- V-a: comparar el número de músicos de `CL` del hook con `/musicos` de la web con el país
  `CL` elegido: tienen que coincidir.
