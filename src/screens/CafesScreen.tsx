import { View, Text, FlatList, StyleSheet } from 'react-native';
import { cafesAsociados, cafesPendientes } from '../data/mock/cafes';
import TarjetaCafe from '../components/TarjetaCafe';
import { colors, spacing, fontSize } from '../theme';

export default function CafesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>☕ Asociados</Text>
      <FlatList
        data={cafesAsociados}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TarjetaCafe cafe={item} tipo="asociado" />}
        style={{ maxHeight: 200 }}
      />

      <Text style={styles.titulo}>📍 Otros cafés del sector</Text>
      <FlatList
        data={cafesPendientes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TarjetaCafe cafe={item} tipo="pendiente" onInvitar={() => {}} />
        )}
        style={{ maxHeight: 200 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginTop: 10, marginBottom: 6 },
});
