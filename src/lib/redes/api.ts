// Spec 150 — las llamadas a las rutas `/api/redes/*` de la web, sin estado.
//
// La app pasa por la web y no por Supabase directo porque las tablas `redes_*`
// (spec 113) tienen RLS sin policies: con la sesión del usuario devuelven cero filas.
// Las rutas las leen con service role, cifran los tokens y exigen Pro (402); desde
// W-249 aceptan el `Authorization: Bearer` que manda `llamarApiWeb`.
//
// Los tipos son los de los mappers de sonopolisWeb/libs/data/redes.js, solo con los
// campos que la app lee.

import { ErrorApiWeb, llamarApiWeb } from '../apiWeb';
import { esRed, Red } from './catalogo';
import type { MedioRed } from './reglas';

export type TenantType = 'venue' | 'musician';

export interface ConexionRed {
  id: string;
  red: Red;
  cuentaNombre: string | null;
  cuentaAvatar: string | null;
  estado: 'activa' | 'reconectar';
  error: string | null;
}

export type EstadoDestino = 'pendiente' | 'publicando' | 'esperando' | 'publicada' | 'fallida' | 'cancelada';

export interface DestinoRed {
  id: string;
  red: Red;
  estado: EstadoDestino;
  urlExterna: string | null;
  error: string | null;
  publicadoAt: string | null;
}

export type EstadoPublicacion = 'programada' | 'publicando' | 'publicada' | 'parcial' | 'fallida' | 'cancelada';

export interface PublicacionRed {
  id: string;
  eventoId: string | null;
  texto: string;
  medios: MedioRed[];
  programadaPara: string | null;
  estado: EstadoPublicacion;
  createdAt: string;
  destinos: DestinoRed[];
}

export type PrivacidadTikTok = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';

export interface NuevaPublicacion {
  texto: string;
  textosPorRed: Partial<Record<Red, string>>;
  medios: MedioRed[];
  redes: Red[];
  opcionesPorRed: { tiktok?: { privacidad: PrivacidadTikTok; comentarios: boolean } };
  programadaPara: string | null;
  eventoId: string | null;
}

export interface SubidaFirmada {
  path: string;
  token: string;
  url: string;
}

export async function getConexionesRedes(
  t: TenantType
): Promise<{ disponibles: Red[]; conexiones: ConexionRed[] }> {
  const r = await llamarApiWeb<{ disponibles?: unknown[]; conexiones?: ConexionRed[] }>(
    `/api/redes/conexiones?tenantType=${t}`
  );
  // Una red nueva en la web no rompe la app: se ignora hasta que la app la conozca.
  const disponibles = (r.disponibles ?? []).filter(esRed);
  return { disponibles, conexiones: r.conexiones ?? [] };
}

export async function desconectarRed(t: TenantType, red: Red): Promise<void> {
  await llamarApiWeb<{ ok: true }>(`/api/redes/conexiones?tenantType=${t}&red=${red}`, {
    metodo: 'DELETE',
  });
}

/** Las últimas 50 publicaciones del tenant, con sus destinos. Exige Pro (402). */
export function getPublicacionesRedes(t: TenantType): Promise<PublicacionRed[]> {
  return llamarApiWeb<PublicacionRed[]>(`/api/redes/publicaciones?tenantType=${t}`);
}

/** 400 trae `{ error, generales, porRed }` en `ErrorApiWeb.cuerpo`. */
export function crearPublicacionRed(t: TenantType, nueva: NuevaPublicacion): Promise<PublicacionRed> {
  return llamarApiWeb<PublicacionRed>('/api/redes/publicaciones', {
    metodo: 'POST',
    cuerpo: { tenantType: t, ...nueva },
  });
}

export function cancelarPublicacionRed(t: TenantType, id: string): Promise<PublicacionRed> {
  return llamarApiWeb<PublicacionRed>(`/api/redes/publicaciones/${id}`, {
    metodo: 'PATCH',
    cuerpo: { tenantType: t, accion: 'cancelar' },
  });
}

export function reintentarDestinoRed(t: TenantType, id: string, red: Red): Promise<PublicacionRed> {
  return llamarApiWeb<PublicacionRed>(`/api/redes/publicaciones/${id}`, {
    metodo: 'PATCH',
    cuerpo: { tenantType: t, accion: 'reintentar', red },
  });
}

/** URL firmada para subir un archivo al bucket `redes` (válida 2 horas). Exige Pro. */
export function firmarSubidaRed(t: TenantType, tipo: string, tamano: number): Promise<SubidaFirmada> {
  return llamarApiWeb<SubidaFirmada>('/api/redes/medios', {
    metodo: 'POST',
    cuerpo: { tenantType: t, tipo, tamano },
  });
}

/**
 * El texto para el `Text` rojo de la pantalla. En estas rutas el `codigo` de
 * `ErrorApiWeb` ya es una frase en español («Conecta X antes de publicar»).
 */
export function mensajeRedes(e: unknown): string {
  if (e instanceof ErrorApiWeb) {
    if (e.status === 401) return 'Tu sesión se cerró. Entra de nuevo.';
    return e.codigo;
  }
  if (e instanceof TypeError) return 'No pudimos conectar con Sonópolis. Revisa tu conexión.';
  if (e instanceof Error && e.message) return e.message;
  return 'Algo salió mal. Inténtalo de nuevo.';
}

/** El Pro venció (o nunca estuvo): la ruta respondió 402. */
export function esSinPro(e: unknown): boolean {
  return e instanceof ErrorApiWeb && e.status === 402;
}
