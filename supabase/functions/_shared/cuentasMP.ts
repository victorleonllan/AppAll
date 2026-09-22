// Spec 101 — una cuenta de Mercado Pago por país.
//
// El catálogo de qué país cobra y en qué moneda vive en la base (`paises_cobro`,
// spec 100); acá solo están los secretos, que no pueden vivir en la base.
//
// Chile conserva los nombres sin sufijo: son los que ya están cargados en
// producción, y renombrarlos obligaría a un despliegue coordinado sin ganar nada.
const SECRETOS: Record<string, { token?: string; webhookSecret?: string }> = {
  CL: {
    token: Deno.env.get('MERCADOPAGO_ACCESS_TOKEN'),
    webhookSecret: Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET'),
  },
  MX: {
    token: Deno.env.get('MERCADOPAGO_ACCESS_TOKEN_MX'),
    webhookSecret: Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET_MX'),
  },
};

export interface CuentaMP {
  pais: string;
  token: string;
  webhookSecret: string;
}

// `throw` y no un fallback a Chile: cobrar con la cuenta equivocada es
// exactamente el bug que este spec cierra. Un país activo en `paises_cobro`
// sin secrets cargados tiene que fallar ruidoso, no cobrar con otra cuenta.
export function cuentaMP(pais: string): CuentaMP {
  const c = SECRETOS[pais];
  if (!c?.token || !c?.webhookSecret) {
    throw new Error(`cuenta_mp_no_configurada: ${pais}`);
  }
  return { pais, token: c.token, webhookSecret: c.webhookSecret };
}
