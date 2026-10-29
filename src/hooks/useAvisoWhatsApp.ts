import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ErrorApiWeb, llamarApiWeb } from '../lib/apiWeb';
import { esPro } from '../lib/pro';
import type { TenantCrm } from './useTenantCrm';
import { contarPorSegmento } from './useContactosCrm';
import { mensajeApiWeb } from './useCorreoCrm';

export type SegmentoBroadcast = 'todos' | 'compradores' | 'seguidores';

/** Copia de `SEGMENTOS_BROADCAST` de `sonopolisWeb/libs/constants.js:194-200`. Espejo
 * del `check` de `whatsapp_broadcasts.segmento`: no se agrega un valor sin migrar. */
export const SEGMENTOS_BROADCAST: { value: SegmentoBroadcast; label: string }[] = [
  { value: 'todos', label: 'Todos los que aceptaron WhatsApp' },
  { value: 'compradores', label: 'Solo quienes ya compraron' },
  { value: 'seguidores', label: 'Solo quienes te siguen' },
];

export const SEGMENTO_BROADCAST_DEFAULT: SegmentoBroadcast = 'todos';

export type ResultadoAviso =
  | { tipo: 'enviado'; recipientsCount: number }
  | { tipo: 'no_conectado'; mensaje: string }
  | { tipo: 'error'; mensaje: string };

/**
 * Spec 149 — el aviso por WhatsApp de un evento vía `/api/whatsapp/broadcast` (W-249).
 * `habilitado` lo calcula la pantalla (owner del evento y evento no cancelado, como
 * `cartelera/[id]/page.js:434` de la web). Con `habilitado` falso o sin tenant no
 * consulta nada y `tienePro = false`.
 */
export function useAvisoWhatsApp(p: { eventoId: string | null; tenant: TenantCrm | null; habilitado: boolean }): {
  tienePro: boolean;
  ultimoEnvioAt: string | null;
  conteos: Record<SegmentoBroadcast, number> | null;
  cargando: boolean;
  enviando: boolean;
  avisar: (segmento: SegmentoBroadcast) => Promise<ResultadoAviso>;
} {
  const { eventoId, tenant, habilitado } = p;
  const activo = habilitado && Boolean(tenant) && Boolean(eventoId);
  const tienePro = activo && esPro(tenant);
  const tenantTipo = tenant?.tipo;
  const tenantId = tenant?.id;

  const [ultimoEnvioAt, setUltimoEnvioAt] = useState<string | null>(null);
  const [conteos, setConteos] = useState<Record<SegmentoBroadcast, number> | null>(null);
  const [cargando, setCargando] = useState(tienePro);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!tienePro || !eventoId || !tenantTipo || !tenantId) {
      setUltimoEnvioAt(null);
      setConteos(null);
      setCargando(false);
      return;
    }
    let vigente = true;
    setCargando(true);
    (async () => {
      try {
        // La policy whatsapp_broadcasts_select_owner solo deja leer al dueño del
        // tenant: si el owner del evento no lo es, ve null, igual que en la web.
        // El servidor sigue frenando el doble envío con su 409.
        const { data, error } = await supabase
          .from('whatsapp_broadcasts')
          .select('sent_at')
          .eq('event_id', eventoId)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        const ultimo = (data as any)?.sent_at ?? null;
        if (!vigente) return;
        setUltimoEnvioAt(ultimo);

        // Conteos solo si hay modal que abrir. Misma fuente que la pantalla de
        // contactos, así los números no pueden discrepar (W-108).
        if (ultimo) {
          setConteos(null);
          return;
        }
        const { data: filas, error: errConteos } = await supabase
          .from('crm_contactos')
          .select('origenes, acepta_whatsapp')
          .eq('tenant_type', tenantTipo)
          .eq('tenant_id', tenantId);
        if (errConteos) throw errConteos;
        if (!vigente) return;
        setConteos(
          contarPorSegmento(
            ((filas ?? []) as any[]).map((f) => ({
              origenes: f.origenes ?? [],
              aceptaWhatsapp: f.acepta_whatsapp ?? false,
            }))
          )
        );
      } catch (e: any) {
        console.error('[useAvisoWhatsApp] no se pudo leer el estado del aviso:', e?.message ?? e);
        if (vigente) setConteos(null);
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [tienePro, eventoId, tenantTipo, tenantId]);

  const avisar = useCallback(
    async (segmento: SegmentoBroadcast): Promise<ResultadoAviso> => {
      if (!eventoId) return { tipo: 'error', mensaje: 'No se pudo mandar el aviso' };
      setEnviando(true);
      try {
        const data = await llamarApiWeb<{ recipientsCount: number }>('/api/whatsapp/broadcast', {
          metodo: 'POST',
          cuerpo: { eventoId, segmento },
        });
        // La idempotencia es por evento, no por segmento (W-107).
        setUltimoEnvioAt(new Date().toISOString());
        return { tipo: 'enviado', recipientsCount: data.recipientsCount ?? 0 };
      } catch (e) {
        // 503 = Kapso sin conectar. Se distingue por status porque el `codigo` del
        // cuerpo no llega a ErrorApiWeb. No es un fallo de quien usa la app.
        if (e instanceof ErrorApiWeb && e.status === 503) {
          return {
            tipo: 'no_conectado',
            mensaje: mensajeApiWeb(e, 'El aviso por WhatsApp todavía no está activo'),
          };
        }
        return { tipo: 'error', mensaje: mensajeApiWeb(e, 'No se pudo mandar el aviso') };
      } finally {
        setEnviando(false);
      }
    },
    [eventoId]
  );

  return { tienePro, ultimoEnvioAt, conteos, cargando, enviando, avisar };
}
