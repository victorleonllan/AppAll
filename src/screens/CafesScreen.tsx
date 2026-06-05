import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";

const cafesAsociados = [
  { id: "1", nombre: "Café La Palma", estilo: "Jazz en vivo", distancia: "2 km", rating: 4.8 },
  { id: "2", nombre: "Café Central", estilo: "Blues los sábados", distancia: "3 km", rating: 4.5 },
  { id: "3", nombre: "Café del Artista", estilo: "Rock acústico", distancia: "1.5 km", rating: 4.7 },
];

const cafesPendientes = [
  { id: "4", nombre: "Café del Mar", distancia: "500 m" },
  { id: "5", nombre: "Star cafés", distancia: "1 km" },
  { id: "6", nombre: "Café Foresta", distancia: "800 m" },
];

export default function CafesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.tituloSeccion}>☕ Asociados</Text>
      <FlatList
        data={cafesAsociados}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.tarjetaAsociado}>
            <Text style={styles.nombre}>{item.nombre}</Text>
            <Text style={styles.info}>{item.estilo} · ⭐ {item.rating}</Text>
            <Text style={styles.info}>📍 {item.distancia}</Text>
          </View>
        )}
        style={styles.lista}
      />

      <Text style={styles.tituloSeccion}>📍 Otros cafés del sector</Text>
      <FlatList
        data={cafesPendientes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.tarjetaPendiente}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{item.nombre}</Text>
              <Text style={styles.info}>📍 {item.distancia}</Text>
            </View>
            <TouchableOpacity style={styles.botonInvitar}>
              <Text style={styles.textoBoton}>💬 Invitar</Text>
            </TouchableOpacity>
          </View>
        )}
        style={styles.lista}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF0E6", paddingTop: 20 },
  tituloSeccion: { fontSize: 20, fontWeight: "bold", color: "#3D2B1F", marginLeft: 16, marginTop: 10, marginBottom: 6 },
  lista: { maxHeight: 200 },
  tarjetaAsociado: { backgroundColor: "#fff", marginHorizontal: 16, marginVertical: 4, padding: 14, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: "#8B4513" },
  tarjetaPendiente: { backgroundColor: "#fff", marginHorizontal: 16, marginVertical: 4, padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", opacity: 0.8 },
  nombre: { fontSize: 16, fontWeight: "600", color: "#3D2B1F" },
  info: { fontSize: 13, color: "#6B4F3A", marginTop: 2 },
  botonInvitar: { backgroundColor: "#8B4513", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  textoBoton: { color: "#FAF0E6", fontWeight: "bold", fontSize: 13 },
});
