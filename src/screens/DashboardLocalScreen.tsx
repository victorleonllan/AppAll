import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useEventos } from '../context/EventosContext';
import { supabase } from '../lib/supabase';
import { confirmar } from '../lib/confirm';
import TarjetaEvento from '../components/TarjetaEvento';
import TarjetaPro from '../components/TarjetaPro';
import { useMiSuscripcionPro } from '../hooks/useMiSuscripcionPro';
import BotonAdmin from '../components/BotonAdmin';
import NumerosPanel from '../components/NumerosPanel';
import { venueEmoji, venueLabel } from '../lib/venues';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';
import { MiLocalStackParamList } from '../navigation/MiLocalStack';
import { Venue } from '../types';

type NavigationProp = NativeStackNavigationProp<MiLocalStackParamList, 'Dashboard'>;

type MusicoPerfil = { id: string; nombre: string; tipoProyecto: string };

// Campos que cuentan para "perfil completo". `image` queda fuera: exige pegar
// una URL de una foto real y no es comparable al resto de los datos de texto.
const CAMPOS_PERFIL: (keyof Venue)[] = [
  'name', 'type', 'address', 'ciudad', 'comuna', 'aforo', 'description',
  'estilo', 'horarios', 'tieneEscenario', 'tieneSonido', 'tieneBackline',
  'telefono', 'emailContacto', 'instagram', 'sitioWeb',
];

function completitud(v: Venue): { llenos: number; total: number } {
  const llenos = CAMPOS_PERFIL.filter((k) => {
    const val = v[k];
    // Un boolean en false (ej: "no tiene backline") ya es una respuesta, no un vacío.
    if (typeof val === 'boolean') return true;
    return val !== undefined && val !== null && String(val).trim() !== '';
  }).length;
  return { llenos, total: CAMPOS_PERFIL.length };
}

export default function DashboardLocalScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation<NavigationProp>();
  const { user, signOut } = useAuth();
  const { allVenues } = useVenues();
  const { eventos, misColaboraciones } = useEventos();

  const handleSignOut = () => {
    confirmar(
      { title: 'Cerrar sesión', message: '¿Seguro que quieres cerrar sesión?', confirmText: 'Cerrar sesión', destructive: true },
      signOut
    );
  };

  const [musicos, setMusicos] = useState<MusicoPerfil[]>([]);
  const [cargandoMusicos, setCargandoMusicos] = useState(true);

  // Busca entre todos los locales, no solo los de type 'cafe': tras el spec 018
  // el dueño puede tener un bar, una sala o un centro cultural.
  const miVenue = user ? allVenues.find((v) => v.ownerId === user.id) : null;
  // Spec 033 — incluye los eventos creados en el local por un músico: el
  // dueño entra como admin automático (events_claim_owner_trg) y necesita
  // verlos acá, no solo los que creó él mismo.
  const misEventoIds = new Set(misColaboraciones.map((c) => c.eventId));
  const misEventos = user
    ? eventos.filter((e) => e.createdBy === user.id || misEventoIds.has(e.id))
    : [];

  // "Músicos disponibles" deja de leer musicosMock: consulta profiles
  // directo. La policy "Perfiles de músicos son públicos" (spec 020) permite
  // el SELECT sin filtrar por dueño.
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nombre, tipo_proyecto')
          .eq('role', 'musician');
        if (!error && data) {
          setMusicos(data.map((p: any) => ({
            id: p.id,
            nombre: p.nombre ?? 'Sin nombre',
            tipoProyecto: p.tipo_proyecto ?? '',
          })));
        }
      } finally {
        setCargandoMusicos(false);
      }
    })();
  }, []);

  // Spec 169 — la suscripción a Pro para la tarjeta. Antes del return temprano: un
  // hook no puede ir después; sin local, `null` no consulta.
  const { suscripcion, recargar: recargarSuscripcion } = useMiSuscripcionPro('venue', miVenue?.id ?? null);

  // Sin local asociado: no hay nada que resumir. El único camino es
  // registrarlo — esto es lo que hoy no existe (spec 031, "El local no existe").
  if (!miVenue) {
    return (
      <View style={styles.vacioContainer}>
        <Text style={styles.vacioTitulo}>📍 Aún no registras tu local</Text>
        <Text style={styles.vacioTexto}>
          Crea tu perfil para publicar eventos, aparecer en la cartelera y que los músicos te encuentren.
        </Text>
        <TouchableOpacity style={styles.botonNuevo} onPress={() => navigation.navigate('EditarLocal')}>
          <Text style={styles.textoBotonNuevo}>+ Registrar mi local</Text>
        </TouchableOpacity>
        {/* Spec 128 — también sin local: la contraseña es de la cuenta. */}
        <BotonAdmin style={styles.botonEscaner} textStyle={styles.textoBotonSecundario} />
        <TouchableOpacity style={styles.botonEscaner} onPress={() => navigation.navigate('CambiarContrasena')}>
          <Text style={styles.textoBotonSecundario}>🔑 Contraseña de tu cuenta</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonSalir} onPress={handleSignOut}>
          <Text style={styles.textoBotonSalir}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { llenos, total } = completitud(miVenue);

  return (
    <FlatList
      style={styles.container}
      data={misEventos}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TarjetaEvento evento={item} />}
      ListHeaderComponent={
        <View>
          <View style={styles.tarjetaLocal}>
            {miVenue.image ? (
              <Image source={{ uri: miVenue.image }} style={styles.imagenLocal} />
            ) : (
              <View style={[styles.imagenLocal, styles.imagenLocalVacia]}>
                <Text style={{ fontSize: fontSize.xl }}>{venueEmoji(miVenue.type)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.nombreLocal}>{miVenue.name} {venueEmoji(miVenue.type)}</Text>
              <Text style={styles.infoLocal}>
                {[miVenue.address, miVenue.comuna].filter(Boolean).join(' · ') || venueLabel(miVenue.type)}
              </Text>
              <Text style={styles.infoLocal}>
                {[
                  miVenue.aforo ? `Aforo ${miVenue.aforo}` : null,
                  miVenue.tieneSonido ? '🎤 sonido' : null,
                  miVenue.tieneEscenario ? '🎭 escenario' : null,
                ].filter(Boolean).join(' · ') || 'Sin datos técnicos aún'}
              </Text>
              <Text style={styles.completitud}>● Perfil completo {llenos}/{total}</Text>
            </View>
          </View>

          {/* Spec 204 — números, vendidas, solicitudes y ventas recientes. */}
          <NumerosPanel
            tipo="venue"
            tenantId={miVenue.id}
            pais={miVenue.pais}
            eventos={misEventos}
            onVerSolicitudes={() => navigation.navigate('Solicitudes')}
            onVerContactos={() => navigation.navigate('Contactos', { tipo: 'venue' })}
            onVerVentas={() => navigation.navigate('Ventas')}
          />

          {/* Spec 154 — Pro informativo, sin precio ni compra: Pro no se vende en la app. */}
          <View style={styles.tarjetaPro}>
            <TarjetaPro
              tenant={miVenue}
              tipo="venue"
              etiqueta="tu local"
              onVerContactos={() => navigation.navigate('Contactos', { tipo: 'venue' })}
              suscripcion={suscripcion}
              onCambio={recargarSuscripcion}
            />
          </View>

          {/* Botón de crear evento arriba: hasta ahora quedaba al final de toda la lista. */}
          <TouchableOpacity style={styles.botonNuevo} onPress={() => navigation.navigate('CrearEvento')}>
            <Text style={styles.textoBotonNuevo}>+ Crear evento</Text>
          </TouchableOpacity>
          <View style={styles.accionesRow}>
            <TouchableOpacity style={styles.botonSecundario} onPress={() => navigation.navigate('Ventas')}>
              <Text style={styles.textoBotonSecundario}>📊 Ventas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botonSecundario} onPress={() => navigation.navigate('EditarLocal')}>
              <Text style={styles.textoBotonSecundario}>✏️ Editar local</Text>
            </TouchableOpacity>
          </View>
          {/* Spec 041 — el mismo EscanerQRScreen que monta MusicoStack, sin
              evento en los params: la pantalla pide cuál antes de la cámara. */}
          <TouchableOpacity style={styles.botonEscaner} onPress={() => navigation.navigate('Escaner')}>
            <Text style={styles.textoBotonSecundario}>📷 Escanear entradas</Text>
          </TouchableOpacity>
          {/* Spec 155 — con y sin Pro, como la pestaña de la web: sin Pro muestra cuántos son. */}
          <TouchableOpacity
            style={styles.botonEscaner}
            onPress={() => navigation.navigate('Contactos', { tipo: 'venue' })}
          >
            <Text style={styles.textoBotonSecundario}>✉️ Correo</Text>
          </TouchableOpacity>
          {/* Spec 157 — también sin Pro: lleva a la explicación neutra, no a una oferta. */}
          <TouchableOpacity style={styles.botonEscaner} onPress={() => navigation.navigate('Redes')}>
            <Text style={styles.textoBotonSecundario}>📣 Redes</Text>
          </TouchableOpacity>

          <Text style={styles.tituloSeccion}>Próximos eventos</Text>
          {misEventos.length === 0 && (
            <Text style={styles.vacio}>Aún no tienes eventos. ¡Crea el primero!</Text>
          )}
        </View>
      }
      ListFooterComponent={
        <View>
          <Text style={styles.tituloSeccion}>Músicos disponibles</Text>
          {cargandoMusicos ? (
            <ActivityIndicator color={colores.accent} style={{ marginTop: spacing.md }} />
          ) : musicos.length === 0 ? (
            <Text style={styles.vacio}>Todavía no hay músicos con perfil.</Text>
          ) : (
            musicos.map((musico) => (
              <TouchableOpacity
                key={musico.id}
                style={styles.tarjetaMusico}
                onPress={() => navigation.navigate('VerMusico', { musicoId: musico.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombreMusico}>{musico.nombre}</Text>
                  {!!musico.tipoProyecto && <Text style={styles.generoMusico}>{musico.tipoProyecto}</Text>}
                </View>
                <View style={styles.botonPerfil}>
                  <Text style={styles.textoBotonPerfil}>Ver perfil</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          {/* Spec 114 — entradas a rutas registradas de antemano; cada pantalla
              la completa su propio spec. */}
          <View style={styles.accionesRow}>
            <TouchableOpacity style={styles.botonSecundario} onPress={() => navigation.navigate('MisEntradas')}>
              <Text style={styles.textoBotonSecundario}>🎟️ Mis entradas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botonSecundario} onPress={() => navigation.navigate('Solicitudes')}>
              <Text style={styles.textoBotonSecundario}>📨 Solicitudes</Text>
            </TouchableOpacity>
          </View>
          <BotonAdmin style={styles.botonEscaner} textStyle={styles.textoBotonSecundario} />
          <TouchableOpacity style={styles.botonEscaner} onPress={() => navigation.navigate('CambiarContrasena')}>
            <Text style={styles.textoBotonSecundario}>🔑 Contraseña de tu cuenta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.botonSalir} onPress={handleSignOut}>
            <Text style={styles.textoBotonSalir}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      }
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  vacioContainer: {
    flex: 1,
    backgroundColor: c.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  vacioTitulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: c.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  vacioTexto: {
    fontSize: fontSize.md,
    color: c.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  tarjetaLocal: {
    flexDirection: 'row',
    backgroundColor: c.cardBackground,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  imagenLocal: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
  },
  imagenLocalVacia: {
    backgroundColor: c.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nombreLocal: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: c.primary,
  },
  infoLocal: {
    fontSize: fontSize.sm,
    color: c.secondary,
    marginTop: 2,
  },
  completitud: {
    fontSize: fontSize.xs,
    color: c.success,
    marginTop: 4,
    fontWeight: '600',
  },
  tituloSeccion: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: c.primary,
    marginLeft: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  tarjetaPro: { marginHorizontal: spacing.md, marginTop: spacing.md },
  accionesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  botonNuevo: {
    backgroundColor: c.accent,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonNuevo: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.md },
  botonSecundario: {
    flex: 1,
    backgroundColor: c.accentLight,
    padding: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonSecundario: { color: c.secondary, fontWeight: 'bold', fontSize: fontSize.sm },
  botonEscaner: {
    backgroundColor: c.accentLight,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  vacio: {
    fontSize: fontSize.sm,
    color: c.muted,
    marginLeft: spacing.md,
    fontStyle: 'italic',
  },
  tarjetaMusico: {
    backgroundColor: c.cardBackground,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: c.accent,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nombreMusico: { fontSize: fontSize.md, fontWeight: '600', color: c.primary },
  generoMusico: { fontSize: fontSize.sm, color: c.secondary, marginTop: 2 },
  botonPerfil: {
    backgroundColor: c.accentLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    marginLeft: 12,
  },
  textoBotonPerfil: { color: c.secondary, fontWeight: 'bold', fontSize: fontSize.sm },
  botonSalir: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md },
  textoBotonSalir: { color: c.danger, fontWeight: '600', fontSize: fontSize.sm },
});
