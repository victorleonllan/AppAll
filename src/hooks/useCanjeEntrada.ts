import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useEventos } from '../context/EventosContext';

/** Las seis respuestas de `redeem_ticket_item` / `peek_ticket_item` (spec 040). */
type ResultadoRpc = 'ok' | 'ya_usada' | 'anulada' | 'evento_cancelado' | 'no_existe' | 'sin_permiso';

/**
 * Los dos resultados que agrega la pantalla y que la base no puede dar:
 * `otro_evento` sale de comparar el evento del token con el evento elegido, y
 * `folio_no_existe` de la entrada manual cuando ese número no está en el evento.
 */
export type ResultadoCanje = ResultadoRpc | 'otro_evento' | 'folio_no_existe';

export type ColorResultado = 'verde' | 'rojo' | 'naranja';

export interface Canje {
  resultado: ResultadoCanje;
  color: ColorResultado;
  titulo: string;
  detalle: string;
  folio: number | null;
}

interface FilaRpc {
  resultado: ResultadoRpc;
  folio: number | null;
  evento_id: string | null;
  comprador: string | null;
  redeemed_at: string | null;
}

/**
 * Cuánto tiempo se ignora un token ya procesado. La cámara lee el mismo código
 * varias veces por segundo: sin esta guarda la pantalla parpadearía entre 'ok' y
 * 'ya_usada' sobre la misma entrada, y en la puerta eso se lee como un fallo del
 * sistema cuando en realidad fue un acierto.
 */
const REBOTE_MS = 5000;

function hora(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

interface CanjeEntradaState {
  procesando: boolean;
  ultimo: Canje | null;
  canjeados: number;
  error: string | null;
  canjearToken: (token: string) => Promise<void>;
  canjearFolio: (folio: number) => Promise<void>;
  limpiar: () => void;
}

/**
 * Spec 041 — el único camino de canje de la app. La cámara y la entrada manual
 * son dos disparadores de esta misma función: si algún día cambia la regla de
 * la puerta, cambia en un solo lugar.
 *
 * `eventoId` es el evento fijado en la pantalla. No autoriza nada —de eso se
 * encarga `can_edit_event()` dentro del RPC (spec 040)— pero evita el error más
 * común de la puerta: escanear con el escáner del show de anoche abierto.
 */
export function useCanjeEntrada(eventoId: string | undefined): CanjeEntradaState {
  const { eventos } = useEventos();
  const [procesando, setProcesando] = useState(false);
  const [ultimo, setUltimo] = useState<Canje | null>(null);
  const [canjeados, setCanjeados] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs y no estado: el callback de la cámara se dispara muchas veces por
  // segundo y no puede depender de un re-render para saber que ya está ocupado.
  const vistos = useRef<Map<string, number>>(new Map());
  const ocupado = useRef(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const presentar = useCallback((fila: FilaRpc, eventoDelToken?: string | null): Canje => {
    switch (fila.resultado) {
      case 'ok':
        return {
          resultado: 'ok', color: 'verde', folio: fila.folio,
          titulo: 'Adelante',
          detalle: fila.comprador ?? 'Entrada válida',
        };
      case 'ya_usada':
        return {
          resultado: 'ya_usada', color: 'rojo', folio: fila.folio,
          titulo: 'Ya entró',
          // La hora del ingreso anterior es el dato con el que se resuelve la
          // discusión en la puerta; sin ella el rojo es una acusación sin prueba.
          detalle: fila.redeemed_at ? `Ingresó a las ${hora(fila.redeemed_at)}` : 'Esta entrada ya se usó',
        };
      case 'anulada':
        return {
          resultado: 'anulada', color: 'rojo', folio: fila.folio,
          titulo: 'Entrada anulada',
          detalle: 'La compra fue anulada o reembolsada',
        };
      case 'evento_cancelado':
        return {
          resultado: 'evento_cancelado', color: 'naranja', folio: fila.folio,
          titulo: 'Evento cancelado',
          detalle: 'El show no va: esta entrada no da acceso',
        };
      case 'no_existe':
        return {
          resultado: 'no_existe', color: 'rojo', folio: null,
          titulo: 'QR no reconocido',
          detalle: 'No es una entrada de Sonópolis',
        };
      case 'sin_permiso':
      default:
        return {
          resultado: 'sin_permiso', color: 'naranja', folio: null,
          titulo: 'Sin acceso',
          detalle: eventoDelToken
            ? `No eres del equipo de ${eventoDelToken}`
            : 'No eres del equipo del evento de esta entrada',
        };
    }
  }, []);

  const mostrar = useCallback((canje: Canje) => {
    if (!montado.current) return;
    setUltimo(canje);
    if (canje.resultado === 'ok') setCanjeados((n) => n + 1);
  }, []);

  /**
   * Camino de la cámara: `peek` primero, `redeem` solo si la entrada es de este
   * evento y está por canjear. Un escaneo accidental —el teléfono apuntando a la
   * pantalla de alguien que pasaba— no quema una entrada, porque `peek` no
   * escribe. Cuando la respuesta ya es definitiva (usada, anulada, de otro
   * equipo, QR ajeno) tampoco hay segunda llamada: una sola RPC.
   */
  const canjearToken = useCallback(async (token: string) => {
    if (!token || ocupado.current) return;

    const ahora = Date.now();
    const visto = vistos.current.get(token);
    if (visto !== undefined && ahora - visto < REBOTE_MS) return;
    vistos.current.set(token, ahora);

    ocupado.current = true;
    setProcesando(true);
    setError(null);
    try {
      const { data: peekData, error: peekError } = await supabase.rpc('peek_ticket_item', { p_token: token });
      if (peekError) throw peekError;
      const peek = (peekData as FilaRpc[] | null)?.[0];
      if (!peek) throw new Error('La consulta de la entrada no devolvió respuesta');

      const nombreEventoDelToken = peek.evento_id
        ? eventos.find((e) => e.id === peek.evento_id)?.artista ?? null
        : null;

      // El evento se compara ANTES de traducir el resultado: una entrada usada
      // de otro evento tiene que decir "de otro evento", no "ya entró" — que en
      // la puerta se leería como que la entrada de ESTE show ya se usó, y es
      // justo la confusión que este chequeo existe para evitar.
      // El RPC autorizaría igual —soy del equipo de los dos eventos—, así que
      // esto es de usabilidad, no de seguridad.
      if (eventoId && peek.evento_id && peek.evento_id !== eventoId) {
        mostrar({
          resultado: 'otro_evento', color: 'naranja', folio: peek.folio,
          titulo: 'Entrada de otro evento',
          detalle: nombreEventoDelToken
            ? `Es de "${nombreEventoDelToken}", no del evento que estás escaneando`
            : 'No corresponde al evento que estás escaneando',
        });
        return;
      }

      if (peek.resultado !== 'ok') {
        mostrar(presentar(peek, nombreEventoDelToken));
        return;
      }

      // Entre el peek y el redeem cabe otro escáner: manda lo que diga el
      // redeem, que es el único que escribe.
      const { data: redeemData, error: redeemError } = await supabase.rpc('redeem_ticket_item', { p_token: token });
      if (redeemError) throw redeemError;
      const redeem = (redeemData as FilaRpc[] | null)?.[0];
      if (!redeem) throw new Error('El canje no devolvió respuesta');

      mostrar(presentar(redeem, nombreEventoDelToken));
    } catch (err: any) {
      // Un rechazo de negocio llega como fila, no como excepción (spec 040): si
      // caímos acá es un fallo real de red o de la base, y se dice como tal en
      // vez de dejar al portero adivinando si la entrada era mala.
      if (montado.current) setError(err?.message ?? 'No se pudo consultar la entrada');
      // Sin rastro del token: un fallo de red no debe bloquear el reintento.
      vistos.current.delete(token);
    } finally {
      ocupado.current = false;
      if (montado.current) setProcesando(false);
    }
  }, [eventoId, eventos, mostrar, presentar]);

  /**
   * Camino de la entrada manual: el folio es único **dentro del evento** (spec
   * 036), así que se resuelve contra el evento ya elegido y de ahí en adelante
   * es el mismo canje. El SELECT lo autoriza `ti_select` del 036 — quien no es
   * del equipo no encuentra el folio, y ni siquiera llega al RPC.
   */
  const canjearFolio = useCallback(async (folio: number) => {
    if (!eventoId || ocupado.current) return;
    ocupado.current = true;
    setProcesando(true);
    setError(null);
    try {
      const { data, error: qError } = await supabase
        .from('ticket_items')
        .select('qr_token')
        .eq('evento_id', eventoId)
        .eq('folio', folio)
        .maybeSingle();
      if (qError) throw qError;

      if (!data?.qr_token) {
        mostrar({
          resultado: 'folio_no_existe', color: 'naranja', folio,
          titulo: 'Folio no encontrado',
          detalle: `No hay una entrada #${String(folio).padStart(3, '0')} en este evento`,
        });
        return;
      }

      const { data: redeemData, error: redeemError } = await supabase
        .rpc('redeem_ticket_item', { p_token: data.qr_token });
      if (redeemError) throw redeemError;
      const redeem = (redeemData as FilaRpc[] | null)?.[0];
      if (!redeem) throw new Error('El canje no devolvió respuesta');

      // Se marca como visto para que la cámara no reprocese el mismo token si
      // el QR de esa entrada aparece delante del lente justo después.
      vistos.current.set(data.qr_token, Date.now());
      mostrar(presentar(redeem));
    } catch (err: any) {
      if (montado.current) setError(err?.message ?? 'No se pudo canjear la entrada');
    } finally {
      ocupado.current = false;
      if (montado.current) setProcesando(false);
    }
  }, [eventoId, mostrar, presentar]);

  const limpiar = useCallback(() => {
    setUltimo(null);
    setError(null);
  }, []);

  return { procesando, ultimo, canjeados, error, canjearToken, canjearFolio, limpiar };
}
