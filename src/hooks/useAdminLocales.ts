import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { llamarApiWeb } from '../lib/apiWeb';

export interface LocalAdmin {
  venueId: string;
  nombre: string;
  tipo: string | null;
  pais: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  imagen: string | null;
  dueno: { id: string; nombre: string | null; rol: string | null; correo: string | null } | null;
  invitacion: { correo: string; token: string; creadaAt: string; enviadaAt: string | null } | null;
  eventos: number;
}

/** Port de `mapLocalAdmin` (`sonopolisWeb/libs/data/invitacionesLocal.js:8-32`). */
function mapLocalAdmin(r: any): LocalAdmin {
  return {
    venueId: r.venue_id,
    nombre: r.name,
    tipo: r.type ?? null,
    pais: r.pais ?? null,
    direccion: r.address ?? null,
    comuna: r.comuna ?? null,
    ciudad: r.ciudad ?? null,
    imagen: r.image ?? null,
    dueno: r.owner_id
      ? { id: r.owner_id, nombre: r.owner_nombre ?? null, rol: r.owner_role ?? null, correo: r.owner_email ?? null }
      : null,
    invitacion: r.invite_token
      ? {
          correo: r.invite_email,
          token: r.invite_token,
          creadaAt: r.invite_created_at,
          enviadaAt: r.invite_sent_at ?? null,
        }
      : null,
    eventos: r.eventos ?? 0,
  };
}

// Sin acentos ni mayúsculas, como `_sin_acentos()` de la base (W-230) y `src/lib/generos.ts`.
const normalizar = (s: string | null | undefined) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const estaANombreDelLocal = (l: LocalAdmin) => l.dueno?.rol === 'local';

/**
 * Copia de `BuscadorLocales.js:24-48` de la web. Busca en nombre, dirección, comuna
 * y ciudad; primero los que NO están a nombre de un local (dueño músico, fan o
 * ninguno), que son los que necesitan la invitación, y después por nombre.
 */
export function filtrarLocales(locales: LocalAdmin[], q: string): LocalAdmin[] {
  const n = normalizar(q.trim());
  const filtrados = n
    ? locales.filter((l) =>
        [l.nombre, l.direccion, l.comuna, l.ciudad].some((c) => normalizar(c).includes(n))
      )
    : locales;
  return [...filtrados].sort(
    (a, b) =>
      Number(estaANombreDelLocal(a)) - Number(estaANombreDelLocal(b)) ||
      a.nombre.localeCompare(b.nombre, 'es')
  );
}

interface AdminLocalesState {
  cargando: boolean;
  error: string | null;
  locales: LocalAdmin[];
  recargar: () => Promise<void>;
  invitar: (venueId: string, email: string) => Promise<{ token: string; emailError: string | null }>;
  cancelar: (token: string) => Promise<void>;
}

/**
 * Spec 153 — lo mismo que `/admin/locales` de la web. Quién puede invitar y a qué
 * correo lo decide Postgres (`es_admin_sonopolis()`, W-230). Invitar y cancelar van
 * por `/api/admin/locales/invitar` de la web porque crear la invitación y mandar el
 * correo con Resend son un solo paso de servidor (W-250 acepta el Bearer). Sus
 * errores suben como `ErrorApiWeb` con el mensaje de la base.
 */
export function useAdminLocales(): AdminLocalesState {
  const [locales, setLocales] = useState<LocalAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // La base limita a 50; la web también carga todo y filtra en el cliente.
      const { data, error: err } = await supabase.rpc('admin_buscar_locales', { p_q: null });
      if (err) throw err;
      setLocales(((data ?? []) as any[]).map(mapLocalAdmin));
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron cargar los locales');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const invitar = useCallback(
    async (venueId: string, email: string) => {
      const r = await llamarApiWeb<{ token: string; emailError?: string | null }>(
        '/api/admin/locales/invitar',
        { metodo: 'POST', cuerpo: { venueId, email } }
      );
      // También con `emailError`: la invitación quedó creada y la lista tiene que mostrarla.
      await recargar();
      return { token: r.token, emailError: r.emailError ?? null };
    },
    [recargar]
  );

  const cancelar = useCallback(
    async (token: string) => {
      await llamarApiWeb('/api/admin/locales/invitar', { metodo: 'DELETE', cuerpo: { token } });
      await recargar();
    },
    [recargar]
  );

  return { cargando, error, locales, recargar, invitar, cancelar };
}
