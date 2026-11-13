import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { confirmar } from '../lib/confirm';
import BotonAdmin from '../components/BotonAdmin';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { PerfilStackParamList } from '../navigation/PerfilStack';

type NavProp = NativeStackNavigationProp<PerfilStackParamList, 'Perfil'>;

export default function PerfilScreen() {
  const styles = useEstilos(crearEstilos);
  const { signOut } = useAuth();
  const navigation = useNavigation<NavProp>();

  const handleSignOut = () => {
    confirmar(
      { title: 'Cerrar sesión', message: '¿Seguro que quieres cerrar sesión?', confirmText: 'Cerrar sesión', destructive: true },
      signOut
    );
  };

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
          <Text style={styles.textoRolInactivo}>📍 Dueño de local</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.aviso}>Si eres músico o local, podrás gestionar tu perfil después.</Text>

      {/* Spec 114 — entradas a rutas registradas de antemano; cada pantalla
          la completa su propio spec. */}
      <View style={styles.acciones}>
        <TouchableOpacity style={styles.botonAccion} onPress={() => navigation.navigate('MisEntradas')}>
          <Text style={styles.textoAccion}>🎟️ Mis entradas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonAccion} onPress={() => navigation.navigate('PanelFan')}>
          <Text style={styles.textoAccion}>⭐ Mi panel</Text>
        </TouchableOpacity>
        <BotonAdmin style={styles.botonAccion} textStyle={styles.textoAccion} />
        <TouchableOpacity style={styles.botonAccion} onPress={() => navigation.navigate('CambiarContrasena')}>
          <Text style={styles.textoAccion}>🔑 Contraseña de tu cuenta</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botonSalir} onPress={handleSignOut}>
        <Text style={styles.textoBotonSalir}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, alignItems: 'center', paddingTop: 60 },
  icono: { fontSize: fontSize.xxl },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: c.primary, marginTop: spacing.sm },
  sub: { fontSize: fontSize.md, color: c.secondary, marginTop: spacing.sm },
  tarjetaRol: { backgroundColor: c.cardBackground, padding: 20, borderRadius: borderRadius.lg, marginTop: 30, width: '85%' },
  label: { fontSize: fontSize.md, fontWeight: '600', color: c.primary, marginBottom: 12 },
  botonRol: { paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, marginBottom: spacing.sm, backgroundColor: c.accentLight },
  botonActivo: { backgroundColor: c.accent },
  textoRol: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.md },
  textoRolInactivo: { color: c.secondary, fontSize: fontSize.md },
  aviso: { fontSize: fontSize.xs, color: c.muted, marginTop: 20, textAlign: 'center', paddingHorizontal: 30 },
  acciones: { width: '85%', marginTop: spacing.lg, gap: spacing.sm },
  botonAccion: { backgroundColor: c.accentLight, padding: 14, borderRadius: borderRadius.sm, alignItems: 'center' },
  textoAccion: { color: c.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  botonSalir: { marginTop: spacing.xl },
  textoBotonSalir: { color: c.danger, fontWeight: '600', fontSize: fontSize.md },
});
