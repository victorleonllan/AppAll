import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { CarpetaMedia } from '../lib/imagenes';
import { useSubirImagen } from '../hooks/useSubirImagen';
import { colors, spacing, borderRadius, fontSize } from '../theme';

/**
 * Spec 130 — equivalente móvil de `ImageUpload.js` de la web. Lo reusan el
 * perfil del músico, el local (spec 134) y el flyer (spec 136).
 *
 * La imagen se sube al elegirla, pero queda ligada a la fila recién cuando
 * la pantalla guarda: si la persona sale sin guardar, el archivo queda
 * huérfano en el bucket (igual que en la web).
 */
interface CampoImagenProps {
  carpeta: CarpetaMedia;
  id: string | undefined;
  valor: string;                  // URL actual ('' si no hay)
  onCambiar: (url: string) => void;
  aspecto?: [number, number];     // [1, 1] para avatar; sin recorte si se omite
  ayuda?: string;                 // texto bajo la etiqueta
}

export default function CampoImagen({ carpeta, id, valor, onCambiar, aspecto, ayuda }: CampoImagenProps) {
  const { subiendo, elegirYSubir } = useSubirImagen({ carpeta, id });

  const handleSubir = async () => {
    try {
      const url = await elegirYSubir({ aspecto });
      if (url) onCambiar(url);
    } catch (err: any) {
      Alert.alert('No se pudo subir la imagen', err?.message ?? 'Error desconocido');
    }
  };

  return (
    <View>
      {ayuda ? <Text style={styles.ayuda}>{ayuda}</Text> : null}

      {valor ? <Image source={{ uri: valor }} style={styles.preview} /> : null}

      <TouchableOpacity
        style={[styles.boton, subiendo && styles.botonDesactivado]}
        onPress={handleSubir}
        disabled={subiendo}
      >
        {subiendo ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.textoBoton}>{valor ? 'Cambiar imagen' : 'Subir imagen'}</Text>
        )}
      </TouchableOpacity>

      {/* Mismo respaldo que la web (`ImageUpload.js`): si Storage falla,
          todavía se puede pegar una URL. */}
      <TextInput
        style={styles.inputUrl}
        value={valor}
        onChangeText={onCambiar}
        placeholder="O pega una URL"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ayuda: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.xs },
  preview: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.accentLight,
  },
  boton: {
    backgroundColor: colors.accentLight,
    padding: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  botonDesactivado: { opacity: 0.6 },
  textoBoton: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  inputUrl: {
    backgroundColor: colors.cardBackground,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.sm,
    color: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
});
