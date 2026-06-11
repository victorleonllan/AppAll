import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { cafesAsociados, cafesPendientes } from '../data/mock/cafes';
import { musicosMock } from '../data/mock/musicos';
import TarjetaCafe from '../components/TarjetaCafe';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { CafesStackParamList } from '../navigation/CafesStack';

type NavigationProp = NativeStackNavigationProp<CafesStackParamList, 'CafesList'>;

const generos = [...new Set(musicosMock.map((m) => m.genero))];

export default function CafesScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const [generoSeleccionado, setGeneroSeleccionado] = useState<string | null>(null);

  const musicosFiltrados = generoSeleccionado
    ? musicosMock.filter((m) => m.genero === generoSeleccionado)
    : [];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.seccionBuscar}>
        <Text style={styles.tituloBuscar}>🎸 Buscar músicos por género</Text>

        {!session ? (
          <Text style={styles.aviso}>Inicia sesión como café para contactar músicos</Text>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContainer}
        >
          {generos.map((item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.chip,
                generoSeleccionado === item && styles.chipActivo,
              ]}
              onPress={() =>
                setGeneroSeleccionado(generoSeleccionado === item ? null : item)
              }
            >
              <Text
                style={[
                  styles.chipTexto,
                  generoSeleccionado === item && styles.chipTextoActivo,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {generoSeleccionado && (
          <View style={styles.resultados}>
            {musicosFiltrados.map((musico) => (
              <TouchableOpacity
                key={musico.id}
                style={styles.tarjetaMusico}
                onPress={() => navigation.navigate('VerMusico', { musicoId: musico.id })}
              >
                <Text style={styles.nombreMusico}>{musico.nombre}</Text>
                <Text style={styles.generoMusico}>{musico.genero}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <Text style={styles.titulo}>☕ Asociados</Text>
      <View style={{ maxHeight: 200 }}>
        {cafesAsociados.map((item) => (
          <TarjetaCafe key={item.id} cafe={item} tipo="asociado" />
        ))}
      </View>

      <Text style={styles.titulo}>📍 Otros cafés del sector</Text>
      <View style={{ marginBottom: 30 }}>
        {cafesPendientes.map((item) => (
          <TarjetaCafe key={item.id} cafe={item} tipo="pendiente" onInvitar={() => {}} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  seccionBuscar: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  tituloBuscar: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginBottom: spacing.sm },
  aviso: { fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing.sm, fontStyle: 'italic' },
  chipsContainer: { gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { backgroundColor: colors.accentLight, paddingHorizontal: 16, paddingVertical: 8, borderRadius: borderRadius.lg },
  chipActivo: { backgroundColor: colors.accent },
  chipTexto: { fontSize: fontSize.sm, color: colors.secondary },
  chipTextoActivo: { color: colors.white, fontWeight: 'bold' },
  resultados: { marginTop: spacing.sm, gap: spacing.sm },
  tarjetaMusico: {
    backgroundColor: colors.cardBackground,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  nombreMusico: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  generoMusico: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
});
