import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEventos } from '../context/EventosContext';
import GeneroPicker from '../components/GeneroPicker';
import { colors, spacing, borderRadius, fontSize } from '../theme';

/**
 * Spec 034 — formulario igual al de CrearEventoScreen pero precargado y sin
 * selector de venue/artista: cambiar venueId o artistId reabre la pregunta de
 * a quién agregar al equipo, que events_claim_owner_trg solo resuelve en el
 * INSERT. Está fuera de alcance a propósito.
 *
 * Registrada en las tres stacks (Cartelera/Musico/MiLocal) porque
 * DetalleEventoScreen, que abre esta pantalla, vive en CarteleraStack — mismo
 * patrón que EquipoEvento. El cast de `route.params` sigue el mismo estilo
 * que EquipoEventoScreen: no vale la pena tipar contra las tres ParamList a
 * la vez para un solo campo.
 */
export default function EditarEventoScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { eventoId } = route.params as { eventoId: string };
  const { eventos, updateEvento } = useEventos();

  const evento = eventos.find((e) => e.id === eventoId);

  const [artista, setArtista] = useState(evento?.artista ?? '');
  const [fecha, setFecha] = useState(evento?.fecha ?? '');
  const [hora, setHora] = useState(evento?.hora ?? '');
  const [genero, setGenero] = useState(evento?.genero ?? '');
  const [pickerGeneroVisible, setPickerGeneroVisible] = useState(false);
  const [precio, setPrecio] = useState(evento?.precio ?? '');
  const [guardando, setGuardando] = useState(false);

  if (!evento) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>Evento no encontrado</Text>
      </View>
    );
  }

  const handleGuardar = async () => {
    if (!artista.trim() || !fecha.trim() || !hora.trim()) {
      Alert.alert('Faltan campos', 'Completa al menos artista, fecha y hora');
      return;
    }
    setGuardando(true);
    try {
      await updateEvento(evento.id, { artista, fecha, hora, genero, precio });
      Alert.alert('Cambios guardados', undefined, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      // Sin catch{} silencioso — mismo criterio que cancelEvento/deleteEvento
      // tras el spec 033: si RLS rechaza el UPDATE, el mensaje llega tal cual.
      Alert.alert('No se pudo guardar', err?.message ?? 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.titulo}>Editar evento</Text>

        <Text style={styles.label}>Artista *</Text>
        <TextInput
          style={styles.input}
          value={artista}
          onChangeText={setArtista}
          placeholder="Ej: Juana Fe"
          placeholderTextColor={colors.muted}
        />

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
        <TouchableOpacity style={styles.input} onPress={() => setPickerGeneroVisible(true)}>
          <Text style={genero ? styles.inputTexto : styles.inputPlaceholder}>
            {genero || 'Seleccionar género'}
          </Text>
        </TouchableOpacity>
        <GeneroPicker
          visible={pickerGeneroVisible}
          onClose={() => setPickerGeneroVisible(false)}
          seleccionados={genero ? [genero] : []}
          onCambiar={(gs) => setGenero(gs[0] ?? '')}
        />

        <Text style={styles.label}>Precio</Text>
        <TextInput
          style={styles.input}
          value={precio}
          onChangeText={setPrecio}
          placeholder="Ej: $5.000"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.aviso}>
          El local ({evento.venueName}) y el artista vinculado no se pueden cambiar desde acá.
        </Text>

        <TouchableOpacity
          style={[styles.boton, guardando && styles.botonDesactivado]}
          onPress={handleGuardar}
          disabled={guardando}
        >
          {guardando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.textoBoton}>Guardar cambios</Text>
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
  // Spec 056 — igual que en CrearEventoScreen: el campo de género es un
  // TouchableOpacity, el texto interno necesita su propio estilo.
  inputTexto: { fontSize: fontSize.md, color: colors.primary },
  inputPlaceholder: { fontSize: fontSize.md, color: colors.muted },
  aviso: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: spacing.md,
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
  errorTexto: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
