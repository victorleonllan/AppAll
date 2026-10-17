import { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSeguir } from '../hooks/useSeguir';
import { TipoSeguible } from '../types';
import { colors, borderRadius, fontSize } from '../theme';

interface Props {
  tipo: TipoSeguible;
  targetId: string;
  onCambio?: (siguiendo: boolean) => void;
}

// Spec 124 — hermano de components/BotonSeguir.js de la web. Chico a propósito:
// va en el pie de una tarjeta del directorio y al lado de un nombre.
export default function BotonSeguir({ tipo, targetId, onCambio }: Props) {
  const { user } = useAuth();
  const s = useSeguir(tipo, targetId);
  // `s` dentro de `tocar` es el del render del toque: el error que deja
  // `alternar()` llega en el render siguiente. Se avisa desde un efecto, y solo
  // si vino de un toque (no del error de la consulta inicial).
  const tocado = useRef(false);
  useEffect(() => {
    if (tocado.current && s.error) {
      tocado.current = false;
      Alert.alert('No se pudo actualizar', s.error);
    }
  }, [s.error]);

  // Seguirse a uno mismo no tiene sentido.
  if (tipo === 'musico' && user?.id === targetId) return null;

  if (!s.haySesion) {
    return (
      <TouchableOpacity
        style={[styles.boton, styles.seguir]}
        onPress={() => Alert.alert('Inicia sesión', 'Entra o crea tu cuenta para seguir a músicos y locales.')}
      >
        <Text style={[styles.texto, styles.textoSeguir]}>Seguir</Text>
      </TouchableOpacity>
    );
  }

  const tocar = async () => {
    const siguiendoAntes = s.siguiendo;
    tocado.current = true;
    const ok = await s.alternar();
    if (ok) {
      tocado.current = false;
      onCambio?.(!siguiendoAntes);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.boton, s.siguiendo ? styles.siguiendo : styles.seguir]}
      onPress={tocar}
      disabled={s.cargando}
    >
      {s.cargando ? (
        <ActivityIndicator size="small" color={s.siguiendo ? colors.accent : colors.white} />
      ) : (
        <Text style={[styles.texto, s.siguiendo ? styles.textoSiguiendo : styles.textoSeguir]}>
          {s.siguiendo ? '✓ Siguiendo' : 'Seguir'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  boton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seguir: { backgroundColor: colors.accent, borderColor: colors.accent },
  siguiendo: { backgroundColor: 'transparent', borderColor: colors.accent },
  texto: { fontSize: fontSize.sm, fontWeight: '600' },
  textoSeguir: { color: colors.white },
  textoSiguiendo: { color: colors.accent },
});
