import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Venue } from '../types';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useEventos } from '../context/EventosContext';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function CrearEventoScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { allVenues, createVenue } = useVenues();
  const { createEvento } = useEventos();
  const [artista, setArtista] = useState('');
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

  const handleSelectVenue = (venue: Venue) => {
    setSelectedVenue(venue);
    setVenueQuery(venue.name);
    setSuggestions([]);
  };

  const handleAgregarNuevoVenue = async () => {
    const nuevoVenue = await createVenue({
      name: venueQuery,
      type: "venue",
    });
    handleSelectVenue(nuevoVenue);
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
        venue = await createVenue({ name: venueQuery || "Sin nombre", type: "venue" });
      }
      await createEvento({
        artista,
        venueId: venue.id,
        venueName: venue.name,
        fecha,
        hora,
        genero,
        precio,
        imagen: null,
        createdBy: user.id,
      });
      Alert.alert(
        'Evento publicado',
        `"${artista}" en ${venue.name} el ${fecha}`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
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
          onChangeText={setArtista}
          placeholder="Ej: Juana Fe"
          placeholderTextColor={colors.muted}
        />

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
                  {v.type === "cafe" ? "☕ " : "🎪 "} {v.name}
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
            ✅ {selectedVenue.type === "cafe" ? "☕" : "🎪"} {selectedVenue.name}
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
