import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { useRoute, RouteProp, useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import {
  esTokenInvitacion, getInvitacionLocalPublica, reclamarInvitacionLocal, cerrarSesionSoloAqui,
  InvitacionLocalPublica,
} from '../lib/invitacionLocal';
import { venueLabel } from '../lib/venues';
import { VenueType } from '../types';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { RootTabParamList } from '../navigation/linking';
import { colors, spacing, fontSize, borderRadius } from '../theme';

type InvitacionLocalRoute = RouteProp<CarteleraStackParamList, 'InvitacionLocal'>;
type Vista = 'tarjeta' | 'login' | 'register';
type Reclamo =
  | { estado: 'idle' }
  | { estado: 'activando' }
  | { estado: 'listo' }
  | { estado: 'error'; mensaje: string };

// Spec 141 — hermana de /invitacion/[token] en la web (W-230–232). Quién puede
// reclamar lo decide la base; esta pantalla solo elige qué mostrar según la sesión.
export default function InvitacionLocalScreen() {
  const { token } = useRoute<InvitacionLocalRoute>().params;
  const navigation = useNavigation();
  const { session, user } = useAuth();
  const tokenValido = esTokenInvitacion(token);

  const [invitacion, setInvitacion] = useState<InvitacionLocalPublica | null>(null);
  const [cargando, setCargando] = useState(tokenValido);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('tarjeta');
  const [reclamo, setReclamo] = useState<Reclamo>({ estado: 'idle' });
  const [cerrando, setCerrando] = useState(false);
  // El efecto puede correr dos veces (StrictMode, re-render con el mismo usuario):
  // el RPC se llama una sola vez.
  const reclamoLanzado = useRef(false);

  // Se recarga al cambiar de usuario: al entrar con el correo invitado el trigger
  // de la base ya activó el local y la invitación llega `accepted`.
  useEffect(() => {
    if (!tokenValido) return;
    let vigente = true;
    setCargando(true);
    setErrorCarga(null);
    getInvitacionLocalPublica(token)
      .then((inv) => { if (vigente) setInvitacion(inv); })
      .catch((e: any) => { if (vigente) setErrorCarga(e?.message ?? 'No pudimos cargar la invitación.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [token, tokenValido, user?.id]);

  const correoCoincide =
    !!invitacion && !!user?.email && user.email.toLowerCase() === invitacion.correo.toLowerCase();

  useEffect(() => {
    if (!session || !invitacion || invitacion.estado !== 'pending' || !correoCoincide) return;
    if (reclamoLanzado.current) return;
    reclamoLanzado.current = true;
    setReclamo({ estado: 'activando' });
    reclamarInvitacionLocal(token)
      .then(() => setReclamo({ estado: 'listo' }))
      .catch((e: any) => setReclamo({ estado: 'error', mensaje: e?.message ?? 'No pudimos activar el local.' }));
  }, [session, invitacion, correoCoincide, token]);

  // La pestaña «Mi Local» aparece cuando el rol de la sesión pasa a `local`
  // (reclamarInvitacionLocal refresca la sesión, spec 135).
  const irAMiLocal = () =>
    navigation.getParent<NavigationProp<RootTabParamList>>()
      ?.navigate('Mi Local', { screen: 'Dashboard' });

  const cerrarYContinuar = async () => {
    setCerrando(true);
    try {
      await cerrarSesionSoloAqui();
    } catch (e: any) {
      setErrorCarga(e?.message ?? 'No pudimos cerrar la sesión.');
    } finally {
      setCerrando(false);
    }
  };

  // Login y registro dentro de esta pantalla (patrón de AuthScreen) para no perder
  // el token; al aparecer la sesión se vuelve a la tarjeta.
  if (!session && vista === 'login') {
    return (
      <LoginScreen
        onSwitchToRegister={() => setVista('register')}
        onBack={() => setVista('tarjeta')}
      />
    );
  }
  if (!session && vista === 'register') {
    return (
      <RegisterScreen
        preselectedRole="local"
        onSwitchToLogin={() => setVista('login')}
        onBack={() => setVista('tarjeta')}
      />
    );
  }

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!tokenValido || (!invitacion && !errorCarga)) {
    return (
      <View style={styles.centro}>
        <Text style={styles.mensaje}>Esta invitación no existe. Revisa que el enlace esté completo.</Text>
      </View>
    );
  }

  if (!invitacion) {
    return (
      <View style={styles.centro}>
        <Text style={styles.error}>{errorCarga}</Text>
      </View>
    );
  }

  if (invitacion.estado === 'revoked') {
    return (
      <View style={styles.centro}>
        <Text style={styles.mensaje}>
          Esta invitación ya no es válida. Escríbenos a victor@sonopolis.org y te mandamos una nueva.
        </Text>
      </View>
    );
  }

  const { nombreLocal } = invitacion;
  const ubicacion = [invitacion.direccion, invitacion.comuna].filter(Boolean).join(', ');

  const botonMiLocal = (
    <TouchableOpacity style={styles.boton} onPress={irAMiLocal}>
      <Text style={styles.botonTexto}>Ir a mi local</Text>
    </TouchableOpacity>
  );

  let cuerpo: ReactNode;
  if (reclamo.estado === 'listo') {
    cuerpo = (
      <>
        <Text style={styles.exito}>Listo: {nombreLocal} ya es tuyo.</Text>
        {botonMiLocal}
      </>
    );
  } else if (invitacion.estado === 'accepted') {
    cuerpo = (
      <>
        <Text style={styles.mensaje}>Este local ya está activado.</Text>
        {session ? botonMiLocal : (
          <TouchableOpacity style={styles.boton} onPress={() => setVista('login')}>
            <Text style={styles.botonTexto}>Entra para administrarlo</Text>
          </TouchableOpacity>
        )}
      </>
    );
  } else if (session && correoCoincide) {
    cuerpo = reclamo.estado === 'error' ? (
      <Text style={styles.error}>{reclamo.mensaje}</Text>
    ) : (
      <View style={styles.fila}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.mensajeFila}>Activando tu local…</Text>
      </View>
    );
  } else if (session) {
    cuerpo = (
      <>
        <Text style={styles.mensaje}>
          Esta invitación es para {invitacion.correo}. Ahora estás con {user?.email}.
        </Text>
        <TouchableOpacity style={styles.boton} onPress={cerrarYContinuar} disabled={cerrando}>
          {cerrando
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.botonTexto}>Cerrar sesión y continuar</Text>}
        </TouchableOpacity>
        {errorCarga && <Text style={styles.error}>{errorCarga}</Text>}
      </>
    );
  } else {
    cuerpo = (
      <>
        <Text style={styles.mensaje}>Vas a entrar con {invitacion.correo}</Text>
        <TouchableOpacity style={styles.boton} onPress={() => setVista('login')}>
          <Text style={styles.botonTexto}>Ya tengo cuenta — entrar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={() => setVista('register')}>
          <Text style={[styles.botonTexto, styles.botonTextoSecundario]}>Crear mi cuenta</Text>
        </TouchableOpacity>
        <Text style={styles.ayuda}>
          Usa el correo {invitacion.correo}: el local se activa en esa cuenta. Si creas la cuenta,
          confirma tu correo y vuelve a abrir este enlace.
        </Text>
      </>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Text style={styles.antetitulo}>INVITACIÓN</Text>
      <Text style={styles.titulo}>Activa {nombreLocal} en Sonópolis</Text>

      <View style={styles.tarjeta}>
        {invitacion.imagen ? <Image source={{ uri: invitacion.imagen }} style={styles.imagen} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{nombreLocal}</Text>
          <Text style={styles.tipo}>{venueLabel(invitacion.tipo as VenueType)}</Text>
          {ubicacion ? <Text style={styles.ubicacion}>{ubicacion}</Text> : null}
        </View>
      </View>

      {cuerpo}

      <Text style={styles.pie}>¿No eres de {nombreLocal}? Ignora esta invitación.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.lg },
  centro: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: spacing.lg, backgroundColor: colors.background,
  },
  antetitulo: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted, letterSpacing: 1 },
  titulo: {
    fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary,
    marginTop: spacing.xs, marginBottom: spacing.md,
  },
  tarjeta: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  imagen: { width: 64, height: 64, borderRadius: borderRadius.sm, marginRight: spacing.md },
  nombre: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  tipo: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  ubicacion: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  mensaje: { fontSize: fontSize.md, color: colors.primary, textAlign: 'center', lineHeight: 22 },
  exito: { fontSize: fontSize.md, color: colors.success, textAlign: 'center', fontWeight: '600' },
  error: { fontSize: fontSize.md, color: colors.danger, textAlign: 'center', marginTop: spacing.sm },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  mensajeFila: { fontSize: fontSize.md, color: colors.primary, marginLeft: spacing.sm },
  boton: {
    backgroundColor: colors.accent, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4, alignItems: 'center', marginTop: spacing.md,
  },
  botonSecundario: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
  botonTexto: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  botonTextoSecundario: { color: colors.accent },
  ayuda: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.md, lineHeight: 18 },
  pie: {
    fontSize: fontSize.xs, color: colors.muted, textAlign: 'center',
    marginTop: spacing.xl, fontStyle: 'italic',
  },
});
