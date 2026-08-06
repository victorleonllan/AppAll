import { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEventos } from '../context/EventosContext';
import { useAuth } from '../context/AuthContext';
import TarjetaEvento from '../components/TarjetaEvento';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, fontSize } from '../theme';

type NavigationProp = NativeStackNavigationProp<CarteleraStackParamList, 'CarteleraList'>;

export default function CarteleraScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { eventos, loading } = useEventos();
  const { user } = useAuth();

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
      } catch {}
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
      <FlatList
        data={eventos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TarjetaEvento
            evento={item}
            onPress={() => navigation.navigate('DetalleEvento', { eventoId: item.id })}
          />
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginBottom: spacing.sm },
});