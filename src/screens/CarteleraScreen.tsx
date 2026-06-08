import { View, Text, FlatList, StyleSheet } from 'react-native';
import { eventos } from '../data/mock/eventos';
import TarjetaEvento from '../components/TarjetaEvento';
import { colors, spacing, fontSize } from '../theme';

export default function CarteleraScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>📅 Próximos eventos</Text>
      <FlatList
        data={eventos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TarjetaEvento evento={item} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginBottom: spacing.sm },
});
