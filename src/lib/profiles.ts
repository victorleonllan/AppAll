import { PerfilMusico, TipoProyecto } from '../types';

/** Etiqueta legible por tipo de proyecto (spec 030 — antes era texto libre). */
export const TIPO_PROYECTO_LABEL: Record<TipoProyecto, string> = {
  solista: 'Solista',
  duo: 'Dúo',
  banda: 'Banda',
  dj: 'DJ',
  colectivo: 'Colectivo',
};

export const TIPOS_PROYECTO: TipoProyecto[] = ['solista', 'duo', 'banda', 'dj', 'colectivo'];

/**
 * Única fuente del mapeo snake_case (DB) ↔ camelCase (TS) para `profiles`.
 * Antes vivía inline en `PerfilMusicoScreen`, campo por campo, en dos lugares
 * (carga y guardado) — con 12 campos eso era el próximo bug de "agregué el
 * campo en un lado y no en el otro" (spec 030).
 */
export function mapProfileFromDB(db: any): PerfilMusico {
  return {
    id: db.id,
    userId: db.id,
    nombre: db.nombre ?? '',
    tipoProyecto: db.tipo_proyecto ?? '',
    bio: db.bio ?? '',
    instagram: db.instagram ?? undefined,
    spotify: db.spotify ?? undefined,
    youtube: db.youtube ?? undefined,
    foto: db.foto ?? null,
    ciudad: db.ciudad ?? undefined,
    generos: db.generos ?? undefined,
    integrantes: db.integrantes ?? undefined,
    duracionShow: db.duracion_show ?? undefined,
    telefono: db.telefono ?? undefined,
    emailContacto: db.email_contacto ?? undefined,
    sitioWeb: db.sitio_web ?? undefined,
    tiktok: db.tiktok ?? undefined,
    riderTecnico: db.rider_tecnico ?? undefined,
    updatedAt: db.updated_at ?? undefined,
  };
}

/**
 * `role` es NOT NULL: si el perfil no existiera, un upsert sin él sería un
 * INSERT que viola la restricción (spec 019). Siempre se manda 'musician'
 * porque este mapper solo lo usa el flujo de perfil de músico.
 */
export function mapProfileToDB(perfil: Partial<PerfilMusico> & { userId: string }): any {
  return {
    id: perfil.userId,
    role: 'musician',
    nombre: perfil.nombre,
    tipo_proyecto: perfil.tipoProyecto || null,
    bio: perfil.bio,
    instagram: perfil.instagram || null,
    spotify: perfil.spotify || null,
    youtube: perfil.youtube || null,
    foto: perfil.foto || null,
    ciudad: perfil.ciudad || null,
    generos: perfil.generos && perfil.generos.length > 0 ? perfil.generos : null,
    integrantes: perfil.integrantes ?? null,
    duracion_show: perfil.duracionShow ?? null,
    telefono: perfil.telefono || null,
    email_contacto: perfil.emailContacto || null,
    sitio_web: perfil.sitioWeb || null,
    tiktok: perfil.tiktok || null,
    rider_tecnico: perfil.riderTecnico || null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Cuenta sobre 12 (spec 030): un perfil vacío es invisible para los locales
 * y hoy nada se lo dice al músico. `redes` cuenta como un solo punto —
 * cualquiera de los cinco canales sirve para que el local escriba.
 */
export function perfilCompletitud(p: PerfilMusico): { completos: number; total: number } {
  const tieneRedes = Boolean(p.instagram || p.spotify || p.youtube || p.tiktok || p.sitioWeb);
  const campos = [
    Boolean(p.nombre),
    Boolean(p.tipoProyecto),
    Boolean(p.generos && p.generos.length > 0),
    Boolean(p.bio),
    Boolean(p.ciudad),
    Boolean(p.integrantes),
    Boolean(p.duracionShow),
    Boolean(p.riderTecnico),
    Boolean(p.telefono),
    Boolean(p.emailContacto),
    tieneRedes,
    Boolean(p.foto),
  ];
  return { completos: campos.filter(Boolean).length, total: campos.length };
}
