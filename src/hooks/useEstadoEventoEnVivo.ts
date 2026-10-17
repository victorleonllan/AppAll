import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';

interface EstadoEvento {
  cancelado: boolean;
  motivo: string | null;
}

/**
 * Spec 120 — equivalente de `EstadoEvento.js` de la web (W-008/W-009): vigila si
 * el evento se cancela mientras el detalle está abierto.
 *
 * Vía principal: Realtime sobre los `UPDATE` de esa fila (`events` está en la
 * publicación `supabase_realtime` desde el spec 044). Red de seguridad: al volver
 * la app a primer plano se pregunta el estado, porque el socket se cae sin avisar
 * cuando el teléfono suspende la app o cambia de red.
 *
 * Esto no es lo que evita el daño: la guarda de la base al reservar (spec 044)
 * rechaza comprar un evento cancelado. Por eso un error de `revisar()` solo se
 * registra y deja el estado como estaba.
 */
export function useEstadoEventoEnVivo(eventoId: string | null, inicial: EstadoEvento): EstadoEvento {
  const [estado, setEstado] = useState<EstadoEvento>(inicial);

  // El contexto puede traer la cancelación por su cuenta (recarga, cancelación
  // desde esta misma app): no se pierde aunque el estado ya esté inicializado.
  useEffect(() => {
    if (inicial.cancelado) setEstado({ cancelado: true, motivo: inicial.motivo });
  }, [inicial.cancelado, inicial.motivo]);

  const revisar = useCallback(async () => {
    if (!eventoId) return;
    try {
      const { data, error } = await supabase
        .from('events')
        .select('status, cancel_reason')
        .eq('id', eventoId)
        .maybeSingle();
      if (error) throw error;
      if (data?.status === 'cancelled') {
        setEstado({ cancelado: true, motivo: data.cancel_reason ?? null });
      }
    } catch (e) {
      console.error('[useEstadoEventoEnVivo] revisar:', e);
    }
  }, [eventoId]);

  useEffect(() => {
    if (!eventoId || estado.cancelado) return; // ya cancelado: no hay nada que vigilar

    const canal = supabase
      .channel(`evento:${eventoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventoId}` },
        (payload: any) => {
          if (payload.new?.status === 'cancelled') {
            setEstado({ cancelado: true, motivo: payload.new.cancel_reason ?? null });
          }
        }
      )
      .subscribe();

    const subscription = AppState.addEventListener('change', (s) => {
      if (s === 'active') revisar();
    });

    return () => {
      subscription.remove();
      supabase.removeChannel(canal);
    };
  }, [eventoId, estado.cancelado, revisar]);

  return estado;
}
