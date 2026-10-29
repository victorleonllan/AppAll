// Spec 157 — las fotos o el video del redactor. Solo pinta lo que devuelve
// `useSubirMediosRedes` (spec 150 §11): cada archivo ya empieza a subir al agregarse.

import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { useSubirMediosRedes, ItemMedio } from '../../hooks/useSubirMediosRedes';
import { colors, spacing, borderRadius, fontSize } from '../../theme';

type Medios = ReturnType<typeof useSubirMediosRedes>;

const LADO = 64;

function Miniatura({ item, medios }: { item: ItemMedio; medios: Medios }) {
  return (
    <View style={styles.item}>
      <View style={styles.miniatura}>
        {item.tipo === 'imagen' && item.preview ? (
          <Image source={{ uri: item.preview }} style={styles.imagen} />
        ) : (
          <View style={[styles.imagen, styles.video]}>
            <Ionicons name="videocam" size={24} color={colors.muted} />
          </View>
        )}
        {item.estado === 'preparando' && (
          <View style={styles.capa}>
            <Text style={styles.textoCapa}>Preparando…</Text>
          </View>
        )}
        {item.estado === 'subiendo' && (
          <View style={styles.capa}>
            <Text style={styles.textoCapa}>{Math.round(item.progreso * 100)}%</Text>
            <View style={styles.barra}>
              <View style={[styles.relleno, { width: `${item.progreso * 100}%` }]} />
            </View>
          </View>
        )}
        <TouchableOpacity style={styles.quitar} onPress={() => medios.quitar(item.id)} hitSlop={8}>
          <Text style={styles.textoQuitar}>×</Text>
        </TouchableOpacity>
      </View>
      {item.estado === 'error' && (
        <>
          <Text style={styles.error} numberOfLines={3}>
            {item.error}
          </Text>
          <TouchableOpacity onPress={() => medios.reintentar(item.id)}>
            <Text style={styles.link}>Reintentar</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

export default function MediosRedes({ medios }: { medios: Medios }) {
  return (
    <View>
      <TouchableOpacity style={styles.boton} onPress={medios.agregarDeGaleria}>
        <Text style={styles.textoBoton}>Agregar fotos o video</Text>
      </TouchableOpacity>
      {medios.aviso && <Text style={styles.error}>{medios.aviso}</Text>}
      {medios.items.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
          {medios.items.map((item) => (
            <Miniatura key={item.id} item={item} medios={medios} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  boton: {
    backgroundColor: colors.accentLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  textoBoton: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  fila: { gap: spacing.sm, paddingTop: spacing.sm },
  item: { width: LADO + 8 },
  miniatura: { width: LADO, height: LADO, marginTop: 8 },
  imagen: { width: LADO, height: LADO, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  video: { alignItems: 'center', justifyContent: 'center' },
  capa: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  textoCapa: { color: colors.white, fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  barra: {
    width: '90%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginTop: 4,
    overflow: 'hidden',
  },
  relleno: { height: 4, backgroundColor: colors.white },
  quitar: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoQuitar: { color: colors.white, fontSize: 14, lineHeight: 16, fontWeight: 'bold' },
  error: { fontSize: fontSize.xs, color: colors.danger, marginTop: spacing.xs },
  link: { fontSize: fontSize.xs, color: colors.accent, fontWeight: 'bold', marginTop: 2 },
});
