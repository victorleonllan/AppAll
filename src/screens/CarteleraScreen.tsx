import { View, Text, StyleSheet } from "react-native";

export default function CarteleraScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icono}>🎵</Text>
      <Text style={styles.titulo}>Cartelera</Text>
      <Text style={styles.sub}>Eventos de música en cafés</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF0E6", alignItems: "center", justifyContent: "center" },
  icono: { fontSize: 48 },
  titulo: { fontSize: 28, fontWeight: "bold", color: "#3D2B1F" },
  sub: { fontSize: 16, color: "#6B4F3A", marginTop: 8 },
});
