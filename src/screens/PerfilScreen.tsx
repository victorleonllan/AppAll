import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function PerfilScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icono}>👤</Text>
      <Text style={styles.titulo}>Tu Perfil</Text>
      <Text style={styles.sub}>Crea tu cuenta para empezar</Text>

      <View style={styles.tarjetaRol}>
        <Text style={styles.label}>Yo soy...</Text>
        <TouchableOpacity style={[styles.botonRol, styles.botonActivo]}>
          <Text style={styles.textoRol}>🎭 Público</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonRol}>
          <Text style={styles.textoRolInactivo}>🎸 Músico</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonRol}>
          <Text style={styles.textoRolInactivo}>☕ Dueño de café</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.aviso}>Si eres músico o café, podrás gestionar tu perfil después.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF0E6", alignItems: "center", paddingTop: 60 },
  icono: { fontSize: 48 },
  titulo: { fontSize: 28, fontWeight: "bold", color: "#3D2B1F", marginTop: 8 },
  sub: { fontSize: 16, color: "#6B4F3A", marginTop: 8 },
  tarjetaRol: { backgroundColor: "#fff", padding: 20, borderRadius: 16, marginTop: 30, width: "85%" },
  label: { fontSize: 16, fontWeight: "600", color: "#3D2B1F", marginBottom: 12 },
  botonRol: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginBottom: 8, backgroundColor: "#F5EDE6" },
  botonActivo: { backgroundColor: "#8B4513" },
  textoRol: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  textoRolInactivo: { color: "#6B4F3A", fontSize: 16 },
  aviso: { fontSize: 13, color: "#A0897A", marginTop: 20, textAlign: "center", paddingHorizontal: 30 },
});
