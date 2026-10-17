import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Venue } from '../types';
import { usePais } from './PaisContext';

interface VenuesState {
  // Spec 096 — `allVenues` son todos los países ("mi local" y el resto de las
  // pantallas privadas); `venuesDelPais` es lo que lista LocalesScreen.
  allVenues: Venue[];
  venuesDelPais: Venue[];
  loading: boolean;
  // Spec 115 — mensaje de la última carga fallida de `venues`; null si salió bien.
  error: string | null;
  refresh: () => Promise<void>;
  createVenue: (venue: Omit<Venue, 'id'> & { ownerId: string }) => Promise<Venue>;
  updateVenue: (id: string, updates: Partial<Omit<Venue, 'id'>>) => Promise<Venue>;
}

const VenuesContext = createContext<VenuesState>({} as VenuesState);

function mapVenueFromDB(db: any): Venue {
  return {
    id: db.id,
    name: db.name,
    type: db.type,
    pais: db.pais,
    ownerId: db.owner_id,
    address: db.address,
    description: db.description,
    estilo: db.estilo,
    ciudad: db.ciudad,
    comuna: db.comuna,
    aforo: db.aforo ?? undefined,
    telefono: db.telefono,
    emailContacto: db.email_contacto,
    instagram: db.instagram,
    sitioWeb: db.sitio_web,
    horarios: db.horarios,
    tieneEscenario: db.tiene_escenario ?? false,
    tieneSonido: db.tiene_sonido ?? false,
    tieneBackline: db.tiene_backline ?? false,
    updatedAt: db.updated_at,
    rating: db.rating,
    lat: db.lat,
    lng: db.lng,
    distance: undefined,
    image: db.image,
  };
}

/**
 * Mapea solo las claves presentes en `venue` (chequeo `in`, no `??`+spread):
 * así sirve tanto para un insert completo (todas las claves, algunas `null`)
 * como para un update parcial (solo las claves que cambiaron, sin pisar el
 * resto de la fila con `null`).
 */
function mapVenueToDB(venue: Partial<Venue>): Record<string, any> {
  const out: Record<string, any> = {};
  if ('name' in venue) out.name = venue.name;
  if ('type' in venue) out.type = venue.type;
  // Spec 095 — entra al insert y al update (updateVenue usa este mismo mapper):
  // equivocarse de país es reversible desde EditarLocalScreen.
  if ('pais' in venue) out.pais = venue.pais;
  if ('ownerId' in venue) out.owner_id = venue.ownerId ?? null;
  if ('address' in venue) out.address = venue.address ?? null;
  if ('description' in venue) out.description = venue.description ?? null;
  if ('estilo' in venue) out.estilo = venue.estilo ?? null;
  if ('ciudad' in venue) out.ciudad = venue.ciudad ?? null;
  if ('comuna' in venue) out.comuna = venue.comuna ?? null;
  if ('aforo' in venue) out.aforo = venue.aforo ?? null;
  if ('telefono' in venue) out.telefono = venue.telefono ?? null;
  if ('emailContacto' in venue) out.email_contacto = venue.emailContacto ?? null;
  if ('instagram' in venue) out.instagram = venue.instagram ?? null;
  if ('sitioWeb' in venue) out.sitio_web = venue.sitioWeb ?? null;
  if ('horarios' in venue) out.horarios = venue.horarios ?? null;
  if ('tieneEscenario' in venue) out.tiene_escenario = venue.tieneEscenario ?? false;
  if ('tieneSonido' in venue) out.tiene_sonido = venue.tieneSonido ?? false;
  if ('tieneBackline' in venue) out.tiene_backline = venue.tieneBackline ?? false;
  if ('lat' in venue) out.lat = venue.lat ?? null;
  if ('lng' in venue) out.lng = venue.lng ?? null;
  if ('image' in venue) out.image = venue.image ?? null;
  // `rating` deliberadamente fuera: ninguna pantalla lo escribe (spec 031).
  return out;
}

export function VenuesProvider({ children }: { children: ReactNode }) {
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { pais } = usePais();

  // Spec 096 — mismo criterio que `eventosDelPais` en EventosContext: derivado.
  const venuesDelPais = useMemo(
    () => allVenues.filter((v) => v.pais === pais),
    [allVenues, pais]
  );

  // Spec 115 — mismo criterio que loadFromSupabase en EventosContext: 0 filas
  // es lista vacía, el error se expone en `error` y no vacía lo ya cargado.
  const loadFromSupabase = useCallback(async () => {
    setError(null);
    try {
      const { data, error } = await supabase.from('venues').select('*');
      if (error) throw error;
      setAllVenues((data ?? []).map(mapVenueFromDB));
    } catch (e: any) {
      console.error('[VenuesContext] no se pudo cargar venues:', e);
      setError(e?.message ?? 'No se pudieron cargar los locales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromSupabase();
  }, [loadFromSupabase]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadFromSupabase();
  }, [loadFromSupabase]);

  // `ownerId` deja de ser opcional: un local sin dueño no se puede editar
  // después (venues_update exige auth.uid() = owner_id), así que nacía roto.
  // El catch ya no se traga el error — quien llama decide qué mostrar; un
  // venue que no se guardó no puede aparecer como si se hubiera guardado.
  const createVenue = useCallback(async (venue: Omit<Venue, 'id'> & { ownerId: string }): Promise<Venue> => {
    const { data, error } = await supabase
      .from('venues')
      .insert(mapVenueToDB(venue))
      .select()
      .single();
    if (error) throw error;
    const newVenue = mapVenueFromDB(data);
    setAllVenues((prev) => [...prev, newVenue]);
    return newVenue;
  }, []);

  const updateVenue = useCallback(async (id: string, updates: Partial<Omit<Venue, 'id'>>): Promise<Venue> => {
    const { data, error } = await supabase
      .from('venues')
      .update({ ...mapVenueToDB(updates), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = mapVenueFromDB(data);
    setAllVenues((prev) => prev.map((v) => (v.id === id ? updated : v)));
    return updated;
  }, []);

  return (
    <VenuesContext.Provider value={{ allVenues, venuesDelPais, loading, error, refresh, createVenue, updateVenue }}>
      {children}
    </VenuesContext.Provider>
  );
}

export const useVenues = () => useContext(VenuesContext);
