import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Venue } from '../types';
import { venueEmoji } from '../lib/venues';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useEventos } from '../context/EventosContext';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function CrearEventoScreen() {
  const navigation = useNavigation();
  const { user, role } = useAuth();
  const { allVenues, createVenue } = useVenues();
  const { createEvento, buscarCandidatos } = useEventos();
  const [artista, setArtista] = useState('');
  const [artistaId, setArtistaId] = useState<string | null>(null);
  const [artistaSuggestions, setArtistaSuggestions] = useState<{ id: string; nombre: string }[]>([]);
  const [venueQuery, setVenueQuery] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [suggestions, setSuggestions] = useState<Venue[]>([]);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [genero, setGenero] = useState('');
  const [precio, setPrecio] = useState('');
  const [publicando, setPublicando] = useState(false);

  useEffect(() => {
    if (venueQuery.length > 0 && !selectedVenue) {
      const filtrados = allVenues.filter(v =>
        v.name.toLowerCase().includes(venueQuery.toLowerCase())
      );
      setSuggestions(filtrados);
    } else {
      setSuggestions([]);
    }
  }, [venueQuery, selectedVenue, allVenues]);

  // Spec 033 — vincular a un músico con perfil real (artist_id) es opcional:
  // al elegirlo, ese músico entra al equipo del evento como colaborador
  // automático (events_claim_owner_trg). Si no se elige nada, `artista` sigue
  // siendo texto libre, igual que antes — un local puede anunciar a alguien
  // que todavía no tiene cuenta en Sonópolis.
  useEffect(() => {
    if (artistaId || artista.trim().length < 2) {
      setArtistaSuggestions([]);
      return;
    }
    let cancelado = false;
    const timeout = setTimeout(async () => {
      try {
        const candidatos = await buscarCandidatos(artista);
        if (!cancelado) {
          setArtistaSuggestions(
            candidatos.filter((c) => c.role === 'musician').map((c) => ({ id: c.id, nombre: c.nombre }))
          );
        }
      } catch {
        // La función search_collaborator_candidates es del spec 033 — si la
        // migración todavía no está aplicada, se degrada a sin sugerencias.
        if (!cancelado) setArtistaSuggestions([]);
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(timeout); };
  }, [artista, artistaId, buscarCandidatos]);

  const handleSelectArtista = (candidato: { id: string; nombre: string }) => {
    setArtista(candidato.nombre);
    setArtistaId(candidato.id);
    setArtistaSuggestions([]);
  };

  // Un local que publica su propio evento no debería tener que buscarse a
  // sí mismo en la lista — se preselecciona su venue (spec 031).
  useEffect(() => {
    if (role === 'cafe' && user && !selectedVenue) {
      const miVenue = allVenues.find((v) => v.ownerId === user.id);
      if (miVenue) {
        setSelectedVenue(miVenue);
        setVenueQuery(miVenue.name);
      }
    }
  }, [role, user, allVenues, selectedVenue]);

  const handleSelectVenue = (venue: Venue) => {
    setSelectedVenue(venue);
    setVenueQuery(venue.name);
    setSuggestions([]);
  };

  const handleAgregarNuevoVenue = async () => {
    if (!user) {
      Alert.alert('Error', 'Debes iniciar sesión para crear un local');
      return;
    }
    try {
      // 'sala' es el default neutro tras el spec 018 (ya no existe el type
      // genérico 'venue'). Deuda: el músico debería poder elegir el tipo al
      // crear el local. El local que inventa este venue queda como su dueño
      // (spec 031) — es mejor que huérfano, que hoy nadie puede editar.
      const nuevoVenue = await createVenue({
        name: venueQuery,
        type: "sala",
        ownerId: user.id,
      });
      handleSelectVenue(nuevoVenue);
    } catch {
      Alert.alert('Error', 'No se pudo crear el local');
    }
  };

  const handlePublicar = async () => {
    if (!artista.trim() || !fecha.trim() || !hora.trim()) {
      Alert.alert('Faltan campos', 'Completa al menos artista, fecha y hora');
      return;
    }
    if (!user) {
      Alert.alert('Error', 'Debes iniciar sesión para publicar');
      return;
    }
    setPublicando(true);
    try {
      let venue = selectedVenue;
      if (!venue) {
        venue = await createVenue({ name: venueQuery || "Sin nombre", type: "sala", ownerId: user.id });
      }
      const nuevo = await createEvento({
        artista,
        artistId: artistaId,
        venueId: venue.id,
        venueName: venue.name,
        fecha,
        hora,
        genero,
        precio,
        imagen: null,
        createdBy: user.id,
      });
      // Spec 039 — "que se inicie después de crear el evento": un evento recién
      // publicado tiene 0 entradas, y eso es justo lo que hay que mostrar — le
      // dice al organizador que el dashboard existe y dónde encontrarlo después.
      Alert.alert(
        'Evento publicado',
        `"${artista}" en ${venue.name} el ${fecha}`,
        [{ text: "Ver entradas", onPress: () =>
            (navigation as any).navigate('EntradasEvento', { eventoId: nuevo.id }) }]
      );
    } catch {
      Alert.alert('Error', 'No se pudo publicar el evento');
    } finally {
      setPublicando(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.titulo}>Nuevo Evento</Text>

        <Text style={styles.label}>Artista *</Text>
        <TextInput
          style={styles.input}
          value={artista}
          onChangeText={(t) => { setArtista(t); setArtistaId(null); }}
          placeholder="Ej: Juana Fe"
          placeholderTextColor={colors.muted}
        />
        {artistaSuggestions.length > 0 && (
          <View style={styles.suggestions}>
            {artistaSuggestions.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.suggestionItem}
                onPress={() => handleSelectArtista(c)}
              >
                <Text style={styles.suggestionText}>🎤 {c.nombre}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {artistaId && (
          <Text style={styles.selectedVenue}>
            ✅ Vinculado al perfil de {artista} — entrará al equipo del evento
          </Text>
        )}

        <Text style={styles.label}>Local (venue) *</Text>
        <TextInput
          style={styles.input}
          value={venueQuery}
          onChangeText={(t) => { setVenueQuery(t); setSelectedVenue(null); }}
          placeholder="Buscar o escribir nuevo local..."
          placeholderTextColor={colors.muted}
        />
        {suggestions.length > 0 && (
          <View style={styles.suggestions}>
            {suggestions.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={styles.suggestionItem}
                onPress={() => handleSelectVenue(v)}
              >
                <Text style={styles.suggestionText}>
                  {venueEmoji(v.type)} {v.name}
                </Text>
                <Text style={styles.suggestionSub}>{v.address}</Text>
              </TouchableOpacity>
            ))}
            {venueQuery.trim().length > 0 && !allVenues.some(v => v.name.toLowerCase() === venueQuery.toLowerCase()) && (
              <TouchableOpacity
                style={[styles.suggestionItem, styles.suggestionNew]}
                onPress={handleAgregarNuevoVenue}
              >
                <Text style={styles.suggestionText}>+ Agregar "{venueQuery}" como nuevo local</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {selectedVenue && (
          <Text style={styles.selectedVenue}>
            ✅ {venueEmoji(selectedVenue.type)} {selectedVenue.name}
          </Text>
        )}

        <Text style={styles.label}>Fecha *</Text>
        <TextInput
          style={styles.input}
          value={fecha}
          onChangeText={setFecha}
          placeholder="Ej: Sáb 28 Jun"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Hora *</Text>
        <TextInput
          style={styles.input}
          value={hora}
          onChangeText={setHora}
          placeholder="Ej: 21:00"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Género</Text>
        <TextInput
          style={styles.input}
          value={genero}
          onChangeText={setGenero}
          placeholder="Ej: Jazz fusión"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Precio</Text>
        <TextInput
          style={styles.input}
          value={precio}
          onChangeText={setPrecio}
          placeholder="Ej: $5.000"
          placeholderTextColor={colors.muted}
        />

        <TouchableOpacity
          style={[styles.boton, publicando && styles.botonDesactivado]}
          onPress={handlePublicar}
          disabled={publicando}
        >
          {publicando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.textoBoton}>Publicar evento</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  titulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestions: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionNew: {
    backgroundColor: colors.accentLight,
  },
  suggestionText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '500',
  },
  suggestionSub: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
  },
  selectedVenue: {
    fontSize: fontSize.sm,
    color: colors.success,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  boton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  botonDesactivado: {
    opacity: 0.6,
  },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
});
