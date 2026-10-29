import { useCallback, useEffect, useState } from 'react';
import { ErrorApiWeb, llamarApiWeb } from '../lib/apiWeb';
import type { TipoTenant } from './useTenantCrm';

export type SegmentoCorreo = 'compradores' | 'seguidores' | 'ambos';

export interface EstadoCorreo {
  conteos: { compradores: number; seguidores: number };
  ultimoEnvio: { createdAt: string; destinatarios: number; segmento: SegmentoCorreo } | null;
  proximoEnvio: string | null;
}

export const MAX_ASUNTO_CORREO = 120;
export const MAX_CUERPO_CORREO = 3000;

/** Copia de `MOTIVOS` de `sonopolisWeb/libs/emails/correoCrm.js:34-37`: por qué le
 * llega el correo a cada persona (Ley 19.496, art. 28 B). */
export const MOTIVOS_CORREO: Record<'compradores' | 'seguidores', (nombre: string) => string> = {
  compradores: () => 'compraste una entrada para uno de sus shows',
  seguidores: (nombre) => `sigues a ${nombre} en Sonópolis`,
};

const ESPERA_ENTRE_ENVIOS_MS = 24 * 60 * 60 * 1000;

/**
 * Spec 149 — mensaje para la persona a partir de un error de `llamarApiWeb`. En las
 * rutas del CRM `codigo` es la frase del servidor («Ya mandaste un correo…»), no un
 * código; `HTTP <status>` significa que la ruta no trajo frase.
 */
export function mensajeApiWeb(e: unknown, respaldo: string): string {
  if (e instanceof ErrorApiWeb) {
    if (e.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if (e.codigo.startsWith('HTTP ')) return respaldo;
    return e.codigo;
  }
  return 'No pudimos conectar con Sonópolis. Revisa tu conexión e intenta de nuevo.';
}

/**
 * Spec 149 — conteos y envío del correo del CRM vía `/api/crm/correo` de la web (W-249).
 * Con `tipo === null` no pide nada: la pantalla pasa `null` sin Pro, porque la ruta
 * responde 402 y pedirlo sería un error seguro.
 */
export function useCorreoCrm(tipo: TipoTenant | null): {
  estado: EstadoCorreo | null; cargando: boolean; error: string | null; enviando: boolean;
  enviar: (p: { segmento: SegmentoCorreo; asunto: string; cuerpo: string }) =>
    Promise<{ ok: true; enviados: number } | { ok: false; mensaje: string }>;
} {
  const [estado, setEstado] = useState<EstadoCorreo | null>(null);
  const [cargando, setCargando] = useState(tipo !== null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const pedirEstado = useCallback(
    () => llamarApiWeb<EstadoCorreo>(`/api/crm/correo?tenantType=${tipo}`),
    [tipo]
  );

  useEffect(() => {
    if (tipo === null) {
      setEstado(null);
      setCargando(false);
      setError(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    pedirEstado()
      .then((e) => {
        if (vigente) setEstado(e);
      })
      .catch((e) => {
        if (vigente) setError(mensajeApiWeb(e, 'No se pudo cargar el correo de tu CRM'));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [tipo, pedirEstado]);

  const enviar = useCallback(
    async (p: { segmento: SegmentoCorreo; asunto: string; cuerpo: string }) => {
      if (tipo === null) return { ok: false as const, mensaje: 'No se pudo mandar el correo' };
      setEnviando(true);
      try {
        const data = await llamarApiWeb<{ enviados: number }>('/api/crm/correo', {
          metodo: 'POST',
          cuerpo: { tenantType: tipo, segmento: p.segmento, asunto: p.asunto, cuerpo: p.cuerpo },
        });
        // Como RedactarCorreo.js de la web: el envío recién hecho y la próxima ventana a 24 h.
        const ahora = new Date();
        setEstado((prev) =>
          prev
            ? {
                ...prev,
                ultimoEnvio: { createdAt: ahora.toISOString(), destinatarios: data.enviados, segmento: p.segmento },
                proximoEnvio: new Date(ahora.getTime() + ESPERA_ENTRE_ENVIOS_MS).toISOString(),
              }
            : prev
        );
        return { ok: true as const, enviados: data.enviados };
      } catch (e) {
        // 429 (ya se mandó uno) o 502 (salió solo una parte, ya registrada): ErrorApiWeb
        // pierde `proximoEnvio`, así que se vuelve a pedir el GET para traer el real.
        if (e instanceof ErrorApiWeb && (e.status === 429 || e.status === 502)) {
          try {
            setEstado(await pedirEstado());
          } catch (err) {
            console.error('[useCorreoCrm] no se pudo releer el estado:', (err as any)?.message ?? err);
          }
        }
        return { ok: false as const, mensaje: mensajeApiWeb(e, 'No se pudo mandar el correo') };
      } finally {
        setEnviando(false);
      }
    },
    [tipo, pedirEstado]
  );

  return { estado, cargando, error, enviando, enviar };
}
