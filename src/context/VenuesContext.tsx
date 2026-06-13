import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Venue } from '../types';
import { allVenues as mockVenues } from '../data/mock/venues';

interface VenuesState {
  cafes: Venue[];
  otherVenues: Venue[];
  allVenues: Venue[];
  loading: boolean;
  refresh: () => Promise<void>;
  createVenue: (venue: Omit<Venue, 'id'>) => Promise<Venue>;
}

const VenuesContext = createContext<VenuesState>({} as VenuesState);

function mapVenueFromDB(db: any): Venue {
  return {
    id: db.id,
    name: db.name,
    type: db.type,
    ownerId: db.owner_id,
    address: db.address,
    description: db.description,
    estilo: db.estilo,
    rating: db.rating,
    lat: db.lat,
    lng: db.lng,
    distance: undefined,
    image: db.image,
  };
}

function mapVenueToDB(venue: Omit<Venue, 'id'>): any {
  return {
    name: venue.name,
    type: venue.type,
    owner_id: venue.ownerId ?? null,
    address: venue.address ?? null,
    description: venue.description ?? null,
    estilo: venue.estilo ?? null,
    rating: venue.rating ?? null,
    lat: venue.lat ?? null,
    lng: venue.lng ?? null,
    image: venue.image ?? null,
  };
}

export function VenuesProvider({ children }: { children: ReactNode }) {
  const [allVenues, setAllVenues] = useState<Venue[]>(mockVenues);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(true);

  const loadFromSupabase = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('venues').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        const mapped = data.map(mapVenueFromDB);
        setAllVenues(mapped);
        setUseMock(false);
      }
    } catch {
      setAllVenues([...mockVenues]);
      setUseMock(true);
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

  const createVenue = useCallback(async (venue: Omit<Venue, 'id'>): Promise<Venue> => {
    if (!useMock) {
      try {
        const { data, error } = await supabase
          .from('venues')
          .insert(mapVenueToDB(venue))
          .select()
          .single();
        if (!error && data) {
          const newVenue = mapVenueFromDB(data);
          setAllVenues((prev) => [...prev, newVenue]);
          return newVenue;
        }
      } catch {}
    }
    const newVenue: Venue = { ...venue, id: `venue-${Date.now()}` };
    setAllVenues((prev) => [...prev, newVenue]);
    return newVenue;
  }, [useMock]);

  const cafes = allVenues.filter((v) => v.type === 'cafe');
  const otherVenues = allVenues.filter((v) => v.type === 'venue');

  return (
    <VenuesContext.Provider value={{ cafes, otherVenues, allVenues, loading, refresh, createVenue }}>
      {children}
    </VenuesContext.Provider>
  );
}

export const useVenues = () => useContext(VenuesContext);
