import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ArtistaBreve, buscarArtistas, crearArtista } from '../lib/artistas';
import { colors, spacing, borderRadius, fontSize } from '../theme';

/**
 * Spec 136 — equivalente de `ArtistaSelect.js` de la web. Busca y crea en la
 * tabla `artists` (no en `profiles`): `events.artist_id` apunta ahí desde el
 * spec 061, y mandar un id de `profiles` violaba la FK (23503).
 *
 * Los errores van en un `Text` rojo y no en `Alert.alert`: en el build web de
 * Expo `Alert.alert` no hace nada (`src/lib/confirm.ts`).
 */
interface ArtistaSelectorProps {
  userId: string;
  value: ArtistaBreve | null;
  onChange: (a: ArtistaBreve | null) => void;
}

export default function ArtistaSelector({ userId, value, onChange }: ArtistaSelectorProps) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ArtistaBreve[]>([]);
  const [mostrarContacto, setMostrarContacto] = useState(false);
  const [contacto, setContacto] = useState('');
  const [instagram, setInstagram] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 300 ms después de la última tecla, y solo sin selección.
  useEffect(() => {
    if (value || texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    const timeout = setTimeout(async () => {
      try {
        const encontrados = await buscarArtistas(texto);
        if (!cancelado) {
          setResultados(encontrados);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelado) {
          setResultados([]);
          setError(err?.message ?? 'No se pudo buscar artistas');
        }
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(timeout); };
  }, [texto, value]);

  const limpio = texto.trim();
  const hayExacto = resultados.some((a) => a.nombre.toLowerCase() === limpio.toLowerCase());
  const puedeCrear = limpio.length >= 2 && !hayExacto;

  const elegir = (artista: ArtistaBreve) => {
    onChange(artista);
    setResultados([]);
    setError(null);
  };

  const handleCrear = async () => {
    setCreando(true);
    setError(null);
    try {
      const nuevo = await crearArtista({ nombre: limpio, contacto, instagram, creadoPor: userId });
      setMostrarContacto(false);
      setContacto('');
      setInstagram('');
      elegir(nuevo);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo crear el artista');
    } finally {
      setCreando(false);
    }
  };

  const handleCambiar = () => {
    setTexto('');
    onChange(null);
  };

  if (value) {
    return (
      <View style={styles.elegido}>
        <Text style={styles.elegidoTexto}>🎤 {value.nombre}</Text>
        <TouchableOpacity onPress={handleCambiar}>
          <Text style={styles.enlace}>Cambiar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        style={styles.input}
        value={texto}
        onChangeText={setTexto}
        placeholder="Buscar o escribir el artista..."
        placeholderTextColor={colors.muted}
      />
      {(resultados.length > 0 || puedeCrear) && (
        <View style={styles.lista}>
          {resultados.map((a) => (
            <TouchableOpacity key={a.id} style={styles.item} onPress={() => elegir(a)}>
              <Text style={styles.itemTexto}>🎤 {a.nombre}</Text>
            </TouchableOpacity>
          ))}
          {puedeCrear && (
            <TouchableOpacity
              style={[styles.item, styles.itemNuevo]}
              onPress={handleCrear}
              disabled={creando}
            >
              {creando ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.itemTexto}>+ Crear "{limpio}" como artista nuevo</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
      {puedeCrear && (
        <>
          <TouchableOpacity onPress={() => setMostrarContacto((v) => !v)}>
            <Text style={styles.enlace}>Agregar contacto (opcional)</Text>
          </TouchableOpacity>
          {mostrarContacto && (
            <>
              <TextInput
                style={[styles.input, styles.inputExtra]}
                value={contacto}
                onChangeText={setContacto}
                placeholder="Contacto (teléfono o correo)"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, styles.inputExtra]}
                value={instagram}
                onChangeText={setInstagram}
                placeholder="Instagram (@usuario)"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputExtra: { marginTop: spacing.xs },
  lista: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemNuevo: { backgroundColor: colors.accentLight },
  itemTexto: { fontSize: fontSize.md, color: colors.primary, fontWeight: '500' },
  elegido: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  elegidoTexto: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600', flexShrink: 1 },
  enlace: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600', marginTop: spacing.xs },
  error: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.xs },
});
