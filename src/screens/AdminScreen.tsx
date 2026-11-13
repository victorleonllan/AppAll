// Spec 158 — el inicio del back office de Sonópolis en la app. Reemplaza a la barra
// `AdminNav` de la web: en el teléfono no hay espacio para cuatro botones arriba de
// cada pantalla, así que es una lista de destinos.

import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEsAdmin } from '../hooks/useEsAdmin';
import type { AdminParamList } from '../navigation/pantallasAdmin';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

type NavProp = NativeStackNavigationProp<AdminParamList, 'Admin'>;

// Las bajadas son los subtítulos de cada página de la web.
const DESTINOS: { ruta: 'AdminPagos' | 'AdminEventos' | 'AdminCrm' | 'AdminVisitas' | 'AdminLocales'; titulo: string; bajada: string }[] = [
  { ruta: 'AdminPagos', titulo: 'Pagos', bajada: 'Lo que hay que transferirle a los locales después de cada show.' },
  { ruta: 'AdminEventos', titulo: 'Eventos', bajada: 'Todos los eventos de la plataforma, incluidos los borradores.' },
  { ruta: 'AdminCrm', titulo: 'CRM', bajada: 'El público de cada local y banda, como lo ve cada uno.' },
  { ruta: 'AdminVisitas', titulo: 'Visitas', bajada: 'Quién entró a la web, según la cartelera de país que vio.' },
  {
    ruta: 'AdminLocales',
    titulo: 'Locales',
    bajada: 'Busca el local por nombre o dirección e invita a su dueño real con su correo oficial.',
  },
];

export default function AdminScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation<NavProp>();
  const { esAdmin, cargando } = useEsAdmin();

  // Guarda de navegación, no de seguridad: esa vive en las policies y los RPC.
  useEffect(() => {
    if (!cargando && !esAdmin) navigation.goBack();
  }, [cargando, esAdmin, navigation]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colores.accent} />
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

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  contenido: { padding: spacing.md, gap: spacing.sm },
  centrado: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center' },
  tarjeta: { backgroundColor: c.cardBackground, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: c.border },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: c.primary },
  bajada: { fontSize: fontSize.sm, color: c.secondary, marginTop: spacing.xs },
});
