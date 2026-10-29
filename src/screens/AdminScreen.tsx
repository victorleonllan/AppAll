// Spec 158 — el inicio del back office de Sonópolis en la app. Reemplaza a la barra
// `AdminNav` de la web: en el teléfono no hay espacio para cuatro botones arriba de
// cada pantalla, así que es una lista de destinos.

import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEsAdmin } from '../hooks/useEsAdmin';
import type { AdminParamList } from '../navigation/pantallasAdmin';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type NavProp = NativeStackNavigationProp<AdminParamList, 'Admin'>;

// Las bajadas son los subtítulos de cada página de la web.
const DESTINOS: { ruta: keyof AdminParamList; titulo: string; bajada: string }[] = [
  { ruta: 'AdminPagos', titulo: 'Pagos', bajada: 'Lo que hay que transferirle a los locales después de cada show.' },
  { ruta: 'AdminEventos', titulo: 'Eventos', bajada: 'Todos los eventos de la plataforma, incluidos los borradores.' },
];

export default function AdminScreen() {
  const navigation = useNavigation<NavProp>();
  const { esAdmin, cargando } = useEsAdmin();

  // Guarda de navegación, no de seguridad: esa vive en las policies y los RPC.
  useEffect(() => {
    if (!cargando && !esAdmin) navigation.goBack();
  }, [cargando, esAdmin, navigation]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!esAdmin) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      {DESTINOS.map((d) => (
        <TouchableOpacity key={d.ruta} style={styles.tarjeta} onPress={() => navigation.navigate(d.ruta)}>
          <Text style={styles.titulo}>{d.titulo}</Text>
          <Text style={styles.bajada}>{d.bajada}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.md, gap: spacing.sm },
  centrado: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  tarjeta: { backgroundColor: colors.cardBackground, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  bajada: { fontSize: fontSize.sm, color: colors.secondary, marginTop: spacing.xs },
});
