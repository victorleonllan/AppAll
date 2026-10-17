import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { EstadoSolicitud } from './useSolicitudes';

export interface Conexion {
  id: string;
  fromMusician: string;
  toMusician: string;
  propuseYo: boolean;
  otroId: string;
  otroNombre: string | null;
  note: string | null;
  status: EstadoSolicitud; // mismo CHECK en booking_requests y collab_requests
  createdAt: string;
  respondedAt: string | null;
}

interface ConexionesState {
  conexiones: Conexion[];
  cargando: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
  crear: (datos: { toMusician: string; note?: string | null }) => Promise<void>;
  responder: (id: string, status: 'accepted' | 'declined') => Promise<void>;
}

/**
 * Spec 131 — conexiones músico ↔ músico (`collab_requests`, W-058). Hermano
 * de libs/data/collab.js de la web (W-058, W-059, W-060). Networking sin
 * fecha ni show: proposed_at existe en la tabla pero nadie la escribe.
 *
 * Sin `cancelar`: la policy existe, pero la web no ofrece cancelar una
 * conexión y no se agrega API que nadie usa.
 */
export function useConexiones(): ConexionesState {
  const { user } = useAuth();
  const userId = user?.id;
  const [conexiones, setConexiones] = useState<Conexion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) {
      setConexiones([]);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      // RLS ya filtra a from_musician = yo or to_musician = yo.
      const { data, error: err } = await supabase
        .from('collab_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;

      const filas = (data ?? []) as any[];
      const otroDe = (f: any): string => (f.from_musician === userId ? f.to_musician : f.from_musician);

      // Join manual y no embed: las dos columnas apuntan a profiles y
      // PostgREST necesitaría desambiguar el FK. Si los nombres fallan, la
      // conexión igual se muestra — el nombre es cosmético.
      let nombres: Record<string, string> = {};
      const otros = Array.from(new Set(filas.map(otroDe)));
      if (otros.length > 0) {
        const { data: perfiles } = await supabase.from('profiles').select('id, nombre').in('id', otros);
        nombres = Object.fromEntries((perfiles ?? []).map((p: any) => [p.id, p.nombre]));
      }

      setConexiones(
        filas.map((f) => {
          const otroId = otroDe(f);
          return {
            id: f.id,
            fromMusician: f.from_musician,
            toMusician: f.to_musician,
            propuseYo: f.from_musician === userId,
            otroId,
            otroNombre: nombres[otroId] ?? null,
            note: f.note ?? null,
            status: f.status as EstadoSolicitud,
            createdAt: f.created_at,
            respondedAt: f.responded_at ?? null,
          };
        }),
      );
    } catch (err: any) {
      setError(err?.message ?? 'No se pudieron cargar las conexiones');
    } finally {
      setCargando(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // La policy collab_requests_insert exige las dos puntas role='musician' y
  // from_musician = yo; si rechaza, se relanza con el mensaje de Supabase.
  const crear = useCallback(
    async (datos: { toMusician: string; note?: string | null }) => {
      if (!userId) throw new Error('Inicia sesión para enviar una solicitud.');
      const { error: err } = await supabase.from('collab_requests').insert({
        from_musician: userId,
        to_musician: datos.toMusician,
        note: datos.note ?? null,
      });
      if (err) {
        // 23505 = violación de collab_requests_una_viva (índice único sobre pending).
        if (err.code === '23505') {
          throw new Error('Ya tienes una solicitud de conexión pendiente con este músico.');
        }
        throw err;
      }
      await cargar();
    },
    [userId, cargar],
  );

  const responder = useCallback(
    async (id: string, status: 'accepted' | 'declined') => {
      if (status !== 'accepted' && status !== 'declined') {
        throw new Error('Respuesta inválida');
      }
      const { data, error: err } = await supabase
        .from('collab_requests')
        .update({ status })
        .eq('id', id)
        .select('id');
      if (err) throw err;
      if (!data || data.length === 0) throw new Error('La solicitud ya no está pendiente.');
      await cargar();
    },
    [cargar],
  );

  return { conexiones, cargando, error, refrescar: cargar, crear, responder };
}

/**
 * Pura, copia de musicosYaConectados de collab.js. Map otroId → estado para
 * que la tarjeta sepa qué dibujar. Bloquean `pending` y `accepted` (a
 * diferencia de los bolos): reconectar con alguien ya conectado no tiene
 * sentido, y el índice único solo cubre `pending`.
 */
export function musicosYaConectados(conexiones: Conexion[]): Map<string, 'pending' | 'accepted'> {
  const out = new Map<string, 'pending' | 'accepted'>();
  for (const c of conexiones ?? []) {
    if (c.status === 'pending' || c.status === 'accepted') {
      out.set(c.otroId, c.status);
    }
  }
  return out;
}
