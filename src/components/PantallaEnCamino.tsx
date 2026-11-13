import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';

interface Props {
  titulo: string;
  /** Ruta de la web, p. ej. "/mis-entradas" — se abre en SONOPOLIS_URL + rutaWeb. */
  rutaWeb: string;
  accionSecundaria?: { texto: string; onPress: () => void };
}

// Misma base que OAuthErrorScreen: la sección vive completa en la web mientras
// su pantalla nativa no llega.
const SONOPOLIS_URL = 'https://sonopolis.org';

// Spec 114 — pantalla provisoria de las rutas registradas de antemano. Lleva a la
// web en vez de a un "Próximamente": el botón de entrada ya es visible y entre
// este spec y el FRONTEND de cada pantalla puede pasar un tiempo real.
export default function PantallaEnCamino({ titulo, rutaWeb, accionSecundaria }: Props) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>{titulo}</Text>
      <Text style={styles.mensaje}>
        Esta sección está llegando a la app. Mientras tanto, la tienes en sonopolis.org.
      </Text>
      <TouchableOpacity style={styles.boton} onPress={() => Linking.openURL(`${SONOPOLIS_URL}${rutaWeb}`)}>
        <Text style={styles.textoBoton}>Abrir en sonopolis.org</Text>
      </TouchableOpacity>
      {accionSecundaria && (
        <TouchableOpacity style={styles.botonSecundario} onPress={accionSecundaria.onPress}>
          <Text style={styles.textoBotonSecundario}>{accionSecundaria.texto}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  titulo: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: c.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  mensaje: {
    fontSize: fontSize.md,
    color: c.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  boton: {
    backgroundColor: c.accent,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
  },
  textoBoton: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.md },
  botonSecundario: { marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  textoBotonSecundario: { color: c.secondary, fontWeight: '600', fontSize: fontSize.md },
});
