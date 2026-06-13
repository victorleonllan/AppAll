import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEventos } from '../context/EventosContext';
import TarjetaEvento from '../components/TarjetaEvento';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, fontSize } from '../theme';

type NavigationProp = NativeStackNavigationProp<CarteleraStackParamList, 'CarteleraList'>;

export default function CarteleraScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { eventos, loading } = useEventos();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>📅 Próximos eventos</Text>
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
