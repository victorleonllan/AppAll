import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useEventos } from '../context/EventosContext';
import { supabase } from '../lib/supabase';
import TarjetaEvento from '../components/TarjetaEvento';
import { venueEmoji, venueLabel } from '../lib/venues';
import { colors, spacing, borderRadius, fontSize } from '../theme';
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
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { allVenues } = useVenues();
  const { eventos, misColaboraciones } = useEventos();

  const [musicos, setMusicos] = useState<MusicoPerfil[]>([]);
  const [cargandoMusicos, setCargandoMusicos] = useState(true);
  const [resumenVentas, setResumenVentas] = useState({ entradas: 0, monto: 0 });

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
  const idsEventos = misEventos.map((e) => e.id).join(',');

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

  // tickets_select_event_owner filtra por events.created_by: el local solo
  // ve las ventas de los eventos que él mismo publicó (ver spec — ampliar a
  // "dueño del venue" queda fuera de alcance).
  //
  // ⚠️ Tras el spec 033, misEventos también trae eventos donde el local entró
  // como colaborador sin haberlos creado. Para esos, la policy devuelve cero
  // tickets: la consulta no falla, el total simplemente queda corto. La
  // corrección es reescribir la policy sobre event_collaborators — otro spec.
  useEffect(() => {
    if (misEventos.length === 0) {
      setResumenVentas({ entradas: 0, monto: 0 });
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('cantidad, monto, status')
        .in('evento_id', misEventos.map((e) => e.id))
        .eq('status', 'completed');
      if (!error && data) {
        const entradas = data.reduce((sum: number, t: any) => sum + (t.cantidad ?? 1), 0);
        const monto = data.reduce((sum: number, t: any) => sum + (t.monto ?? 0), 0);
        setResumenVentas({ entradas, monto });
      }
    })();
    // idsEventos (no misEventos) porque el array se recrea en cada render.
  }, [idsEventos]);

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

          <Text style={styles.tituloSeccion}>Resumen</Text>
          <View style={styles.resumenRow}>
            <View style={styles.resumenCard}>
              <Text style={styles.resumenNumero}>{misEventos.length}</Text>
              <Text style={styles.resumenLabel}>Eventos publicados</Text>
            </View>
            <View style={styles.resumenCard}>
              <Text style={styles.resumenNumero}>{resumenVentas.entradas}</Text>
              <Text style={styles.resumenLabel}>Entradas vendidas</Text>
            </View>
            <View style={styles.resumenCard}>
              <Text style={styles.resumenNumero}>${resumenVentas.monto.toLocaleString()}</Text>
              <Text style={styles.resumenLabel}>Recaudado</Text>
            </View>
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
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} />
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
        </View>
      }
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  vacioContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  vacioTitulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  vacioTexto: {
    fontSize: fontSize.md,
    color: colors.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  tarjetaLocal: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
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
    backgroundColor: colors.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nombreLocal: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
  },
  infoLocal: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  completitud: {
    fontSize: fontSize.xs,
    color: colors.success,
    marginTop: 4,
    fontWeight: '600',
  },
  tituloSeccion: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    marginLeft: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  resumenRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
  },
  resumenCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  resumenNumero: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.accent },
  resumenLabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: 4, textAlign: 'center' },
  accionesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  botonNuevo: {
    backgroundColor: colors.accent,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonNuevo: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  botonSecundario: {
    flex: 1,
    backgroundColor: colors.accentLight,
    padding: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonSecundario: { color: colors.secondary, fontWeight: 'bold', fontSize: fontSize.sm },
  vacio: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginLeft: spacing.md,
    fontStyle: 'italic',
  },
  tarjetaMusico: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nombreMusico: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  generoMusico: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  botonPerfil: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    marginLeft: 12,
  },
  textoBotonPerfil: { color: colors.secondary, fontWeight: 'bold', fontSize: fontSize.sm },
});
