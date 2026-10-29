import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TenantCrm } from './useTenantCrm';
// Solo tipo: useAvisoWhatsApp importa contarPorSegmento de acá, y un `import type`
// se borra al compilar, así que no queda un ciclo entre módulos en tiempo de ejecución.
import type { SegmentoBroadcast } from './useAvisoWhatsApp';

export type OrigenContacto = 'comprador' | 'seguidor' | 'whatsapp';

export interface ContactoCrm {
  clave: string;            // md5 de la vista: sirve de key de React sin exponer nada
  email: string | null;     // ya enmascarado por la base
  telefono: string | null;  // phone_e164, solo existe si dejó su WhatsApp
  origenes: OrigenContacto[];
  primerContacto: string;
  ultimaCompra: string | null;
  entradas: number;
  totalGastado: number;
  aceptaWhatsapp: boolean;
}

export type FiltroContactos = 'todos' | OrigenContacto;

/** Port de `mapContactoCrmFromDB` (`sonopolisWeb/libs/mappers.js`) sin `userId` ni
 * `tenantType`/`tenantId`, que ninguna pantalla usa. */
function mapContactoCrmFromDB(db: any): ContactoCrm {
  return {
    clave: db.contacto_key,
    email: db.email ?? null,
    telefono: db.phone_e164 ?? null,
    origenes: db.origenes ?? [],
    primerContacto: db.primer_contacto,
    ultimaCompra: db.ultima_compra ?? null,
    entradas: db.entradas ?? 0,
    totalGastado: db.total_gastado ?? 0,
    aceptaWhatsapp: db.acepta_whatsapp ?? false,
  };
}

/**
 * Spec 149 — contactos de un tenant desde la vista `crm_contactos`, que ya sale
 * enmascarada de la base (W-198) y es `security_invoker`: la RLS recorta a lo del dueño.
 * Port de `getContactos` (`sonopolisWeb/libs/data/crm.js:19-28`).
 *
 * Un error deja `contactos: null`, no `[]`: un CRM que dice «no tienes contactos»
 * cuando no pudo leer la vista es peor que uno caído (W-100).
 */
export function useContactosCrm(tenant: Pick<TenantCrm, 'tipo' | 'id'> | null): {
  contactos: ContactoCrm[] | null; cargando: boolean; error: string | null; refrescar: () => Promise<void>;
} {
  const tipo = tenant?.tipo;
  const id = tenant?.id;
  const [contactos, setContactos] = useState<ContactoCrm[] | null>(null);
  const [cargando, setCargando] = useState(Boolean(tipo && id));
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    if (!tipo || !id) {
      setContactos(null);
      setCargando(false);
      setError(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      // La vista es global (W-099): el filtro por tenant evita que Postgres recorra
      // todo lo visible (W-100).
      const { data, error: err } = await supabase
        .from('crm_contactos')
        .select('*')
        .eq('tenant_type', tipo)
        .eq('tenant_id', id)
        .order('primer_contacto', { ascending: false });
      if (err) throw err;
      setContactos(((data ?? []) as any[]).map(mapContactoCrmFromDB));
    } catch (e: any) {
      setContactos(null);
      setError(e?.message ?? 'No se pudieron cargar tus contactos');
    } finally {
      setCargando(false);
    }
  }, [tipo, id]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  return { contactos, cargando, error, refrescar };
}

/** `resumirContactos` de `sonopolisWeb/libs/data/crm.js` sin `ingresos`: el resumen no
 * muestra montos (W-218). */
export function resumirContactos(c: ContactoCrm[]): {
  total: number; compradores: number; seguidores: number; conWhatsapp: number;
} {
  const lista = c ?? [];
  return {
    total: lista.length,
    compradores: lista.filter((x) => x.origenes.includes('comprador')).length,
    seguidores: lista.filter((x) => x.origenes.includes('seguidor')).length,
    conWhatsapp: lista.filter((x) => x.aceptaWhatsapp).length,
  };
}

/** Port de `contarPorSegmento` (`sonopolisWeb/libs/data/crm.js:108-115`). El piso es
 * `aceptaWhatsapp`: el segmento recorta los opt-ins, nunca los amplía (W-107). */
export function contarPorSegmento(
  c: Pick<ContactoCrm, 'origenes' | 'aceptaWhatsapp'>[]
): Record<SegmentoBroadcast, number> {
  const conWhatsapp = (c ?? []).filter((x) => x.aceptaWhatsapp);
  return {
    todos: conWhatsapp.length,
    compradores: conWhatsapp.filter((x) => x.origenes.includes('comprador')).length,
    seguidores: conWhatsapp.filter((x) => x.origenes.includes('seguidor')).length,
  };
}

// `normalize` existe en Hermes moderno, pero no se da por hecho: sin él se compara
// en minúsculas sin más (un correo enmascarado o un teléfono rara vez llevan tildes).
const TIENE_NORMALIZE = typeof String.prototype.normalize === 'function';

/** Copia de `normalizar` de `sonopolisWeb/components/TablaContactos.js`. */
function normalizar(texto: string | null | undefined): string {
  const minusculas = String(texto ?? '').toLowerCase();
  return TIENE_NORMALIZE ? minusculas.normalize('NFD').replace(/[̀-ͯ]/g, '') : minusculas;
}

/** Filtro por origen (`whatsapp` = `aceptaWhatsapp`) y búsqueda sin acentos sobre
 * email y teléfono, como `components/TablaContactos.js` de la web. */
export function filtrarContactos(c: ContactoCrm[], filtro: FiltroContactos, busqueda: string): ContactoCrm[] {
  const q = busqueda ? normalizar(busqueda) : '';
  return c.filter((x) => {
    const pasa =
      filtro === 'todos' ? true : filtro === 'whatsapp' ? x.aceptaWhatsapp : x.origenes.includes(filtro);
    if (!pasa) return false;
    if (!q) return true;
    return normalizar(x.email).includes(q) || normalizar(x.telefono).includes(q);
  });
}

// Copia de GRUPOS de `sonopolisWeb/components/TablaContactos.js` (W-197): cada persona
// en UN grupo, por prioridad — la compra manda.
const GRUPOS: { titulo: string; entra: (c: ContactoCrm) => boolean }[] = [
  { titulo: 'Compraron entradas', entra: (c) => c.origenes.includes('comprador') },
  { titulo: 'Te siguen', entra: (c) => c.origenes.includes('seguidor') },
  { titulo: 'Dejaron su WhatsApp', entra: () => true },
];

/** Tres grupos excluyentes, omitiendo los vacíos. */
export function agruparContactos(c: ContactoCrm[]): { titulo: string; contactos: ContactoCrm[] }[] {
  const grupos = GRUPOS.map((g) => ({ titulo: g.titulo, entra: g.entra, contactos: [] as ContactoCrm[] }));
  for (const x of c) grupos.find((g) => g.entra(x))!.contactos.push(x);
  return grupos.filter((g) => g.contactos.length > 0).map(({ titulo, contactos }) => ({ titulo, contactos }));
}
