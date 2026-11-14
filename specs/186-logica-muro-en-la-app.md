# Spec 186 — La app lee el muro de un local o banda, comenta y borra

> Estado: diseñado (14-nov-2026)
> Capa: LÓGICA. `src/lib/muro.ts` (nuevo), `src/hooks/useMuro.ts` (nuevo), `src/hooks/useCorreoCrm.ts`.
> Depende de: spec 185 (tablas `muro_publicaciones`, `muro_comentarios`; funciones `muro_eventos_pasados`, `muro_comentar`), con su migración ya pusheada.
> Alimenta: spec 187 (FRONTEND).
> Hermano en la web: `libs/muro.js`, `libs/data/muro.js` (W-279).

> **En una frase:** un módulo puro que arma el muro (correos publicados y flyers de eventos
> pasados, con sus comentarios) y un hook que lo lee, comenta y borra con la sesión de la app.

## Motivo

Pedido de Victor (14-nov-2026): el perfil público de cada local y banda tiene un muro con los
correos que mandó a su público y los flyers de sus eventos pasados, y la gente comenta. «La
idea es hacer una proto red social.» Datos en el spec 185; la web en W-279 a W-281.

## Decisión

### `src/lib/muro.ts` — puro, port de `sonopolisWeb/libs/muro.js`

```ts
export const MAX_COMENTARIO = 500;
export const MAX_ENTRADAS = 30;

export interface ComentarioMuro { id: string; autorId: string; autorNombre: string; cuerpo: string; fecha: string }
export interface EntradaMuro {
  clave: string;                 // "correo:<id>" | "evento:<id>"
  tipo: 'correo' | 'evento';
  id: string;
  fecha: string;                 // created_at del correo o comienza_at del evento
  titulo: string;                // asunto del correo o artist_name del evento
  cuerpo: string | null;         // solo correo
  imagen: string | null;         // solo evento (el flyer)
  venue: string | null;          // solo evento (venue_name)
  comentarios: ComentarioMuro[]; // del más viejo al más nuevo
}

export function armarMuro(publicaciones: any[], eventos: any[], comentarios: any[]): EntradaMuro[];
export function mensajeErrorMuro(error: { message?: string } | null): string;
```

Mismas reglas que la web: orden por `fecha` descendente, se cortan las primeras
`MAX_ENTRADAS`; un comentario va al correo de su `publicacion_id` o al evento de su
`event_id`, y uno sin destino en la lista se descarta. `mensajeErrorMuro` traduce
`sin_sesion` → «Inicia sesión para comentar.», `comentario_invalido` → «El comentario va de 1
a 500 caracteres.», `demasiados_comentarios` → «Estás comentando muy rápido. Espera unos
minutos.», `destino_desconocido` → «Esa publicación ya no está en el muro.», otro → «No se
pudo guardar. Intenta de nuevo.»

### `src/hooks/useMuro.ts`

```ts
export function useMuro(tipo: TipoTenant, id: string | null | undefined): {
  entradas: EntradaMuro[] | null;   // null = todavía cargando o error de lectura
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  comentar: (destino: { publicacionId?: string; eventId?: string }, cuerpo: string) => Promise<{ ok: true } | { ok: false; mensaje: string }>;
  borrarComentario: (comentarioId: string) => Promise<{ ok: true } | { ok: false; mensaje: string }>;
  quitarPublicacion: (publicacionId: string) => Promise<{ ok: true } | { ok: false; mensaje: string }>;
}
```

- Lee con el cliente de Supabase de la app (`src/lib/supabase`), en paralelo:
  `muro_publicaciones` del tenant (`created_at desc`, 30),
  `rpc('muro_eventos_pasados', { p_tenant_type, p_tenant_id, p_limite: 30 })` y
  `muro_comentarios` del tenant (`created_at asc`, 500). Funciona sin sesión (el muro es público).
- Un error de lectura deja `entradas: null` y `error` con texto, nunca una lista vacía (misma
  regla que `useContactosCrm`).
- `comentar` → `rpc('muro_comentar', …)`; con error devuelve `mensajeErrorMuro`. Con éxito
  llama a `recargar()`.
- `borrarComentario` / `quitarPublicacion` → `delete().eq('id', …).select('id')`; si no borró
  ninguna fila devuelve «No puedes borrar este comentario.» / «No puedes quitar esta
  publicación.» Con éxito, `recargar()`.
- Sin `id`, no consulta y devuelve `entradas: []`.

### `src/hooks/useCorreoCrm.ts`

El envío del correo ya pasa por `/api/crm/correo` de la web, que desde W-279 responde también
`enMuro: boolean`. El resultado de éxito del hook suma `enMuro?: boolean` tomado de la
respuesta (`undefined` si la web todavía no lo manda). Sin otro cambio.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `git diff --stat` del commit toca solo los tres archivos de «Capa» y los del cierre.
3. Lectura del código: `armarMuro` no modifica sus argumentos y `useMuro` no usa ninguna
   llave que no sea la anónima de la app.

## Fuera de alcance

- Las pantallas → spec 187.
