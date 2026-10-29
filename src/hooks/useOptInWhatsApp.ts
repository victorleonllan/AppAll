import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { TipoTenant } from './useTenantCrm';

export type FuenteOptIn = 'perfil' | 'checkout';

const DEFAULT_COUNTRY_CODE = '56'; // Chile — mercado inicial de Sonópolis.

/**
 * Port exacto de `normalizarE164` (`sonopolisWeb/libs/telefono.js:17-28`). Un mismo
 * criterio en los dos lados evita guardar un número que Kapso después rechaza por forma.
 * Acepta "+56912345678", "56912345678", "912345678" o con espacios/guiones.
 */
export function normalizarE164(numero: string | null | undefined): string | null {
  if (!numero) return null;
  const digitos = numero.replace(/[^\d+]/g, '');
  const soloDigitos = digitos.replace(/^\+/, '');
  if (soloDigitos.length < 8) return null;

  if (digitos.startsWith('+')) return `+${soloDigitos}`;
  if (soloDigitos.startsWith(DEFAULT_COUNTRY_CODE) && soloDigitos.length > 9) {
    return `+${soloDigitos}`;
  }
  return `+${DEFAULT_COUNTRY_CODE}${soloDigitos}`;
}

/** Spec 149 — el teléfono del perfil propio, solo para prellenar (la casilla sigue
 * siendo explícita). La RLS deja leer la fila propia sea cual sea el rol (spec 020).
 * '' si no hay sesión o no hay teléfono. */
export function useTelefonoPropio(): string {
  const { user } = useAuth();
  const userId = user?.id;
  const [telefono, setTelefono] = useState('');

  useEffect(() => {
    if (!userId) {
      setTelefono('');
      return;
    }
    let vigente = true;
    supabase
      .from('profiles')
      .select('telefono')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (vigente) setTelefono((data as any)?.telefono ?? '');
      });
    return () => {
      vigente = false;
    };
  }, [userId]);

  return telefono;
}

/**
 * Spec 149 — opt-in del perfil público (`source: 'perfil'`). Sin `p_user_id` ni
 * `p_email`, igual que `OptInWhatsApp.js` de la web: admite gente sin cuenta y la RPC
 * está abierta a `anon`. Vía RPC y no insert: solo el upsert de
 * `crear_optin_whatsapp` puede reactivar un opt-in revocado (W-049).
 */
export function useOptInWhatsApp(): {
  guardando: boolean;
  guardar: (p: { tenantTipo: TipoTenant; tenantId: string; telefono: string }) =>
    Promise<{ ok: true } | { ok: false; mensaje: string }>;
} {
  const [guardando, setGuardando] = useState(false);

  const guardar = useCallback(
    async (p: { tenantTipo: TipoTenant; tenantId: string; telefono: string }) => {
      const phoneE164 = normalizarE164(p.telefono);
      if (!phoneE164) return { ok: false as const, mensaje: 'Ese número no parece válido' };
      setGuardando(true);
      try {
        const { error } = await supabase.rpc('crear_optin_whatsapp', {
          p_tenant_type: p.tenantTipo,
          p_tenant_id: p.tenantId,
          p_phone_e164: phoneE164,
          p_source: 'perfil' satisfies FuenteOptIn,
        });
        if (error) return { ok: false as const, mensaje: error.message ?? 'No se pudo guardar el aviso' };
        return { ok: true as const };
      } finally {
        setGuardando(false);
      }
    },
    []
  );

  return { guardando, guardar };
}

/**
 * Spec 149 — opt-in pedido en la compra. Port de `dispararOptInDeCompra`
 * (`sonopolisWeb/libs/purchase.js`). No es async y no devuelve nada esperable: la
 * compra no puede depender de esto en ninguna dirección.
 *
 * `userId`/`email` son la identidad de W-103, que deja cruzar el opt-in con la compra
 * en el CRM. Van como `undefined`, no `null`: `undefined` no viaja en el JSON de la RPC
 * y Postgres usa el `default null` del argumento.
 */
export function dispararOptInDeCompra(p: {
  tenantTipo: TipoTenant; tenantId: string; telefono: string; userId?: string; email?: string;
}): void {
  const phoneE164 = normalizarE164(p.telefono);
  if (!phoneE164) return;
  Promise.resolve(
    supabase.rpc('crear_optin_whatsapp', {
      p_tenant_type: p.tenantTipo,
      p_tenant_id: p.tenantId,
      p_phone_e164: phoneE164,
      p_source: 'checkout' satisfies FuenteOptIn,
      p_user_id: p.userId ?? undefined,
      p_email: p.email ?? undefined,
    })
  )
    .then(({ error }) => {
      // Sin el teléfono ni el correo en el log.
      if (error) console.error('[opt-in checkout] no se pudo guardar:', error.message);
    })
    .catch((err) => console.error('[opt-in checkout] no se pudo guardar:', err?.message ?? err));
}
