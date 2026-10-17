import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { elegirMiRol, RolElegible } from '../lib/rol';
import { colors, spacing, borderRadius, fontSize } from '../theme';

// Mismos textos que DETALLE_ROL de /quien-eres en la web.
const ROLES: { rol: RolElegible; titulo: string; descripcion: string; habilita: string[] }[] = [
  {
    rol: 'fan',
    titulo: '🎟 Fan',
    descripcion: 'Sigo bandas, compro entradas y voy a shows.',
    habilita: ['Seguir músicos y locales', 'Comprar entradas', 'Guardar tus entradas con QR'],
  },
  {
    rol: 'musician',
    titulo: '🎸 Músico',
    descripcion: 'Tengo un proyecto musical: banda, solista, DJ o colectivo.',
    habilita: ['Perfil público con tu música', 'Publicar fechas y vender entradas', 'Recibir propuestas de locales'],
  },
  {
    rol: 'local',
    titulo: '📍 Local',
    descripcion: 'Tengo un bar, café, sala o centro cultural.',
    habilita: ['Ficha del local en el directorio', 'Programar y publicar fechas', 'Recibir solicitudes de músicos'],
  },
];

interface Props {
  onListo?: () => void;
}

// Spec 128 — sin useNavigation: GuardaRol lo monta en un Modal, fuera de todo
// navegador. Al elegir no navega: el refresh de sesión cambia `role` en
// AuthContext y getThirdTab cambia sola la tercera pestaña.
export default function FormElegirRol({ onListo }: Props) {
  const { user, signOut } = useAuth();
  const [enviando, setEnviando] = useState<RolElegible | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nombre = user?.user_metadata?.full_name as string | undefined;
  const cuenta = nombre ? `${nombre} · ${user?.email ?? ''}` : user?.email ?? '';

  const elegir = async (rol: RolElegible) => {
    setEnviando(rol);
    setError(null);
    const mensaje = await elegirMiRol(rol);
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setEnviando(null);
    onListo?.();
  };

  return (
    <View style={styles.container}>
      {/* Primero de todo: con varias cuentas de Google abiertas, la persona no sabe
          con cuál entró hasta verla escrita. */}
      <View style={styles.filaCuenta}>
        <Text style={styles.cuenta} numberOfLines={1}>{cuenta}</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.noEresTu}>¿No eres tú?</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.titulo}>¿Quién eres?</Text>
      <Text style={styles.texto}>
        Falta un dato para terminar de entrar. Elige cómo vas a usar Sonópolis: define lo que puedes
        hacer en la app. Por ahora no se puede cambiar después desde la app.
      </Text>

      {ROLES.map((r) => {
        const esteEnvia = enviando === r.rol;
        const deshabilitada = enviando !== null;
        return (
          <TouchableOpacity
            key={r.rol}
            style={[styles.tarjeta, deshabilitada && !esteEnvia && styles.tarjetaDesactivada]}
            onPress={() => elegir(r.rol)}
            disabled={deshabilitada}
          >
            <View style={styles.cabeceraTarjeta}>
              <Text style={styles.tituloTarjeta}>{r.titulo}</Text>
              {esteEnvia && <ActivityIndicator color={colors.accent} />}
            </View>
            <Text style={styles.descripcion}>{r.descripcion}</Text>
            <Text style={styles.habilita}>{r.habilita.join(' · ')}</Text>
          </TouchableOpacity>
        );
      })}

      {error && (
        <View style={styles.recuadroError}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setError(null);
              setEnviando(null);
            }}
          >
            <Text style={styles.reintentar}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  filaCuenta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cuenta: { flex: 1, fontSize: fontSize.sm, color: colors.secondary },
  noEresTu: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary, marginTop: spacing.lg },
  texto: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.sm, marginBottom: spacing.lg },
  tarjeta: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  tarjetaDesactivada: { opacity: 0.5 },
  cabeceraTarjeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tituloTarjeta: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  descripcion: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.xs },
  habilita: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.sm },
  recuadroError: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  error: { color: colors.danger, fontSize: fontSize.sm },
  reintentar: { color: colors.accent, fontWeight: '600', fontSize: fontSize.sm },
});
