import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { buscarBandas, crearFichaSuelta } from '../lib/artistas';
import { bandaDeLaCuenta } from '../lib/cuentaEsBanda';
import type { Banda } from '../types';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

/**
 * Spec 136 — equivalente de `ArtistaSelect.js` de la web.
 *
 * Spec 198 — entrega una `Banda`: una cuenta de músico (va a `events.musico_id`) o
 * una ficha de `artists` (va a `events.artist_id`). Quien lo usa no debe mezclarlas:
 * un id de `profiles` en `artist_id` viola la FK (23503).
 *
 * Los errores van en un `Text` rojo y no en `Alert.alert`: en el build web de
 * Expo `Alert.alert` no hace nada (`src/lib/confirm.ts`).
 */
interface ArtistaSelectorProps {
  userId: string;
  value: Banda | null;
  onChange: (b: Banda | null) => void;
  /** Solo si quien crea es músico: habilita «Soy yo» (su propia cuenta). */
  yo?: { nombre: string; foto: string | null } | null;
}

export default function ArtistaSelector({ userId, value, onChange, yo }: ArtistaSelectorProps) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Banda[]>([]);
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
        const encontrados = await buscarBandas(texto);
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

  const elegir = (banda: Banda) => {
    onChange(banda);
    setResultados([]);
    setError(null);
  };

  const handleCrear = async () => {
    setCreando(true);
    setError(null);
    try {
      const nuevo = await crearFichaSuelta({ nombre: limpio, contacto, instagram, creadoPor: userId });
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
        <View style={styles.elegidoBanda}>
          <Text style={styles.elegidoTexto}>🎤 {value.nombre}</Text>
          {value.tipo === 'cuenta' && <Text style={styles.enSonopolis}>En Sonópolis</Text>}
        </View>
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
        placeholderTextColor={colores.muted}
      />
      {/* «Soy yo» es la propia cuenta: no se busca ni se crea nada. */}
      {yo && (
        <TouchableOpacity
          style={[styles.soyYo, !yo.nombre && styles.soyYoOff]}
          onPress={() => elegir(bandaDeLaCuenta({ id: userId, nombre: yo.nombre, foto: yo.foto }))}
          disabled={!yo.nombre}
        >
          <Text style={styles.soyYoTexto}>
            {yo.nombre ? `Soy yo: ${yo.nombre}` : 'Soy yo (pon el nombre de tu banda en tu perfil)'}
          </Text>
        </TouchableOpacity>
      )}
      {(resultados.length > 0 || puedeCrear) && (
        <View style={styles.lista}>
          {resultados.map((b) => (
            <TouchableOpacity
              key={`${b.tipo}:${b.id}`}
              style={[styles.item, styles.itemBanda]}
              onPress={() => elegir(b)}
            >
              {b.tipo === 'cuenta' &&
                (b.foto ? (
                  <Image source={{ uri: b.foto }} style={styles.foto} />
                ) : (
                  <View style={[styles.foto, styles.sinFoto]}>
                    <Text style={styles.inicial}>{b.nombre.charAt(0).toUpperCase()}</Text>
                  </View>
                ))}
              <Text style={[styles.itemTexto, styles.itemNombre]}>{b.nombre}</Text>
              <Text style={b.tipo === 'cuenta' ? styles.enSonopolis : styles.sinCuenta}>
                {b.tipo === 'cuenta' ? 'En Sonópolis' : 'Sin cuenta'}
              </Text>
            </TouchableOpacity>
          ))}
          {puedeCrear && (
            <TouchableOpacity
              style={[styles.item, styles.itemNuevo]}
              onPress={handleCrear}
              disabled={creando}
            >
              {creando ? (
                <ActivityIndicator color={colores.accent} />
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
                placeholderTextColor={colores.muted}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, styles.inputExtra]}
                value={instagram}
                onChangeText={setInstagram}
                placeholder="Instagram (@usuario)"
                placeholderTextColor={colores.muted}
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

const crearEstilos = (c: Paleta) => StyleSheet.create({
  input: {
    backgroundColor: c.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: c.primary,
    borderWidth: 1,
    borderColor: c.border,
  },
  inputExtra: { marginTop: spacing.xs },
  lista: {
    backgroundColor: c.cardBackground,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  itemNuevo: { backgroundColor: c.accentLight },
  itemBanda: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemNombre: { flex: 1 },
  foto: { width: 24, height: 24, borderRadius: 12 },
  sinFoto: { backgroundColor: c.border, alignItems: 'center', justifyContent: 'center' },
  inicial: { fontSize: fontSize.xs, color: c.secondary, fontWeight: '600' },
  enSonopolis: { fontSize: fontSize.xs, color: c.success, fontWeight: '600' },
  sinCuenta: { fontSize: fontSize.xs, color: c.muted },
  soyYo: {
    padding: 12,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: c.border,
    marginTop: spacing.xs,
  },
  soyYoOff: { opacity: 0.5 },
  soyYoTexto: { fontSize: fontSize.sm, color: c.primary, fontWeight: '600' },
  itemTexto: { fontSize: fontSize.md, color: c.primary, fontWeight: '500' },
  elegido: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  elegidoBanda: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  elegidoTexto: { fontSize: fontSize.md, color: c.primary, fontWeight: '600', flexShrink: 1 },
  enlace: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600', marginTop: spacing.xs },
  error: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.xs },
});
