import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEventos } from '../context/EventosContext';
import { useAuth } from '../context/AuthContext';
import TarjetaEvento from '../components/TarjetaEvento';
import GeneroPicker from '../components/GeneroPicker';
import { eventoCoincideConGenero } from '../lib/generos';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, fontSize, borderRadius } from '../theme';

type NavigationProp = NativeStackNavigationProp<CarteleraStackParamList, 'CarteleraList'>;

export default function CarteleraScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { eventos, loading } = useEventos();
  const { user } = useAuth();

  // Spec 056 — primer filtro de Cartelera: por género, sobre el listado cerrado
  // del spec 054. `null` = sin filtro (todos los géneros).
  const [generoFiltro, setGeneroFiltro] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const eventosFiltrados = eventos.filter((e) => eventoCoincideConGenero(e.genero, generoFiltro));

  // Auto-navegar al evento si hay una compra pendiente del magic link
  useEffect(() => {
    const getPending = async () => {
      try {
        let pendingId: string | null = null;
        if (Platform.OS === 'web') {
          pendingId = localStorage.getItem('pending_ticket');
        } else {
          pendingId = await AsyncStorage.getItem('pending_ticket');
        }
        if (pendingId && user) {
          navigation.navigate('DetalleEvento', { eventoId: pendingId });
        }
      } catch (e) {
        console.error('[Cartelera] no se pudo leer pending_ticket:', e);
      }
    };
    getPending();
  }, [user, navigation]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Proximos eventos</Text>

      <TouchableOpacity style={styles.filtro} onPress={() => setPickerVisible(true)}>
        <Text style={styles.filtroTexto}>
          Género: {generoFiltro ?? 'Todos'}
        </Text>
      </TouchableOpacity>
      <GeneroPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        seleccionados={generoFiltro ? [generoFiltro] : []}
        onCambiar={(gs) => setGeneroFiltro(gs[0] ?? null)}
        permitirTodos
        titulo="Filtrar por género"
      />

      <FlatList
        data={eventosFiltrados}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TarjetaEvento
            evento={item}
            onPress={() => navigation.navigate('DetalleEvento', { eventoId: item.id })}
          />
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
        ListEmptyComponent={
          generoFiltro ? (
            <Text style={styles.vacio}>Sin eventos de {generoFiltro} por ahora.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginBottom: spacing.sm },
  filtro: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: spacing.md,
    marginBottom: spacing.sm,
  },
  filtroTexto: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  vacio: { textAlign: 'center', color: colors.muted, marginTop: spacing.lg },
});
