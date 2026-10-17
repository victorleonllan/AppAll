import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, SectionList, StyleSheet, ActivityIndicator, Platform, TouchableOpacity, Modal,
  TextInput, Switch, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEventos } from '../context/EventosContext';
import { useAuth } from '../context/AuthContext';
import { usePais } from '../context/PaisContext';
import { PAISES } from '../constants/paises';
import EventoDestacado from '../components/EventoDestacado';
import TarjetaEventoExterno from '../components/TarjetaEventoExterno';
import GeneroPicker from '../components/GeneroPicker';
import { eventoCoincideConGenero } from '../lib/generos';
import { useEventosExternos } from '../hooks/useEventosExternos';
import { claveDiaLocal, formatearDiaLargo, rangoFecha, FiltroFecha } from '../lib/fechaCartelera';
import { EventoExterno } from '../types';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, fontSize, borderRadius } from '../theme';

type NavigationProp = NativeStackNavigationProp<CarteleraStackParamList, 'CarteleraList'>;

/**
 * Spec 119 (W-127) — un evento sigue en la cartelera hasta 6 horas después de
 * empezar. Se corta por hora de inicio y no por fecha de calendario: un show que
 * empieza a la 1:00 no desaparece a medianoche ni antes de terminar.
 */
const HORAS_VISIBLE_TRAS_INICIO = 6;

const FILTROS_FECHA: { clave: FiltroFecha; etiqueta: string }[] = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'finde', etiqueta: 'Finde' },
  { clave: 'semana', etiqueta: 'Esta semana' },
];

/** Un rango nunca incluye eventos sin fecha: no se afirma que caen "hoy". */
function enRango(iso: string | null | undefined, rango: [Date, Date] | null): boolean {
  if (!rango) return true;
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= rango[0].getTime() && t < rango[1].getTime();
}

/**
 * Spec 096, Decisión 4 — mismo criterio que el chip de la web (W-113): con un
 * solo país en `PAISES` es un texto informativo, con dos o más abre el selector.
 * Decide el largo del catálogo, no una prop: el día que entra un país el
 * selector aparece solo.
 */
function SelectorPais() {
  const { pais, setPais } = usePais();
  const [abierto, setAbierto] = useState(false);
  const paises = Object.values(PAISES);
  const actual = PAISES[pais];
  const etiqueta = actual ? `${actual.bandera} ${actual.nombre}` : pais;

  if (paises.length < 2) {
    return (
      <View style={styles.filtro}>
        <Text style={styles.filtroTexto}>{etiqueta}</Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity style={styles.filtro} onPress={() => setAbierto(true)}>
        <Text style={styles.filtroTexto}>{etiqueta} ▾</Text>
      </TouchableOpacity>
      <Modal visible={abierto} animationType="slide" transparent onRequestClose={() => setAbierto(false)}>
        <View style={styles.overlay}>
          <View style={styles.hoja}>
            <View style={styles.encabezado}>
              <Text style={styles.tituloHoja}>País</Text>
              <TouchableOpacity onPress={() => setAbierto(false)}>
                <Text style={styles.cerrar}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            {paises.map((p) => (
              <TouchableOpacity
                key={p.codigo}
                style={styles.item}
                onPress={() => {
                  setPais(p.codigo);
                  setAbierto(false);
                }}
              >
                <Text style={[styles.itemTexto, p.codigo === pais && styles.itemTextoActivo]}>
                  {p.bandera} {p.nombre}
                </Text>
                {p.codigo === pais && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function CarteleraScreen() {
  const navigation = useNavigation<NavigationProp>();
  // Spec 096 — la Cartelera lista solo el país activo; el filtro vive en el
  // contexto (Decisión 2), la pantalla no filtra por país.
  const { eventosDelPais, loading, error, refresh } = useEventos();
  const { pais, listo } = usePais();
  const { user } = useAuth();
  // Spec 119 — eventos scrapeados de otras plataformas, del mismo país activo.
  const { externos, error: errorExternos, refrescar } = useEventosExternos(pais);
  const nombrePaisActivo = PAISES[pais]?.nombre ?? pais;

  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('todos');
  // Spec 056 — filtro por género, sobre el listado cerrado del spec 054.
  // `null` = sin filtro (todos los géneros).
  const [generoFiltro, setGeneroFiltro] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  // Spec 119 (W-024, Decisión 4) — apagado por defecto: se ven los dos tipos.
  const [soloSonopolis, setSoloSonopolis] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  // Spec 119 — lo que la cartelera puede mostrar, antes de cualquier filtro.
  // Mismo criterio que la web (`page.js:97-104`).
  const visibles = useMemo(() => {
    const corte = Date.now() - HORAS_VISIBLE_TRAS_INICIO * 3600 * 1000;
    return eventosDelPais.filter(
      (e) =>
        e.status !== 'draft' &&
        e.visibleEnCartelera !== false &&
        (e.comienzaAt == null || Date.parse(e.comienzaAt) >= corte)
    );
  }, [eventosDelPais]);

  const texto = busqueda.trim().toLowerCase();
  const rango = rangoFecha(filtroFecha);

  // Todos los internos que pasan los filtros van destacados, en el orden del
  // contexto (por `comienzaAt`) — W-128 supera al W-016, que destacaba uno solo.
  const destacados = visibles.filter(
    (e) =>
      (!texto || `${e.artista} ${e.genero} ${e.venueName}`.toLowerCase().includes(texto)) &&
      enRango(e.comienzaAt, rango) &&
      eventoCoincideConGenero(e.genero, generoFiltro)
  );

  // Los externos casi nunca traen género: con un género elegido quedan fuera,
  // porque no se afirma un dato que no se tiene.
  const externosFiltrados = soloSonopolis
    ? []
    : externos.filter(
        (e) =>
          (!texto || `${e.titulo} ${e.venueNombre ?? ''}`.toLowerCase().includes(texto)) &&
          enRango(e.comienzaAt, rango) &&
          (!generoFiltro || e.genero === generoFiltro)
      );

  // Los externos llegan ordenados por `comienza_at`: el Map conserva ese orden.
  const porDia = new Map<string, EventoExterno[]>();
  for (const e of externosFiltrados) {
    const clave = claveDiaLocal(e.comienzaAt);
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave)!.push(e);
  }
  const secciones = Array.from(porDia.values()).map((data) => ({
    title: formatearDiaLargo(data[0].comienzaAt),
    data,
  }));

  const total = destacados.length + externosFiltrados.length;

  const onRefresh = async () => {
    setRefrescando(true);
    await Promise.all([refresh(), refrescar()]);
    setRefrescando(false);
  };

  // Auto-navegar al evento si hay una compra pendiente del magic link
  useEffect(() => {
    const getPending = async () => {
      try {
        let pendingId: string | null = null;
        if (Platform.OS === 'web') {
          pendingId = localStorage.getItem('pending_ticket');
        } else {
          pendingId = await AsyncStorage.getItem('pending_ticket');
        }
        if (pendingId && user) {
          navigation.navigate('DetalleEvento', { eventoId: pendingId });
        }
      } catch (e) {
        console.error('[Cartelera] no se pudo leer pending_ticket:', e);
      }
    };
    getPending();
  }, [user, navigation]);

  // Esperar a `listo` evita mostrar un instante la cartelera del país por
  // defecto antes de que llegue la elección guardada. `refrescando` deja el
  // pull-to-refresh a la vista en vez del spinner de pantalla completa.
  if ((loading && !refrescando) || !listo) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Spec 115 — sin mock: si `events` no cargó se dice, con salida.
  if (error) {
    return (
      <View style={[styles.container, styles.centrado]}>
        <Text style={styles.vacio}>No se pudo cargar la cartelera.</Text>
        <TouchableOpacity style={styles.botonReintentar} onPress={refresh}>
          <Text style={styles.textoReintentar}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const encabezado = (
    <View>
      <Text style={styles.titulo}>Próximos eventos</Text>
      <Text style={styles.contador}>{total} shows</Text>

      <TextInput
        style={styles.busqueda}
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por artista, género o local…"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
      />

      <View style={styles.filaFiltros}>
        {FILTROS_FECHA.map((f) => (
          <TouchableOpacity
            key={f.clave}
            style={[styles.filtro, filtroFecha === f.clave && styles.filtroActivo]}
            onPress={() => setFiltroFecha(f.clave)}
          >
            <Text style={[styles.filtroTexto, filtroFecha === f.clave && styles.filtroTextoActivo]}>
              {f.etiqueta}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filaFiltros}>
        <SelectorPais />
        <TouchableOpacity style={styles.filtro} onPress={() => setPickerVisible(true)}>
          <Text style={styles.filtroTexto}>
            Género: {generoFiltro ?? 'Todos'}
          </Text>
        </TouchableOpacity>
      </View>

      {externos.length > 0 && (
        <View style={styles.filaSwitch}>
          <Text style={styles.textoSwitch}>Solo Sonópolis</Text>
          <Switch
            value={soloSonopolis}
            onValueChange={setSoloSonopolis}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      )}

      {destacados.map((e) => (
        <EventoDestacado
          key={e.id}
          evento={e}
          onPress={() => navigation.navigate('DetalleEvento', { eventoId: e.id })}
        />
      ))}

      {errorExternos && (
        <Text style={styles.avisoExternos}>No se pudieron cargar los eventos de otras plataformas.</Text>
      )}
    </View>
  );

  // Spec 096, Decisión 5 / W-113 — el vacío nombra el país: con varios países
  // es la diferencia entre "la app está rota" y "acá todavía no llegamos".
  const sinDatos = visibles.length === 0 && externos.length === 0;

  return (
    <View style={styles.container}>
      <GeneroPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        seleccionados={generoFiltro ? [generoFiltro] : []}
        onCambiar={(gs) => setGeneroFiltro(gs[0] ?? null)}
        permitirTodos
        titulo="Filtrar por género"
      />

      <SectionList
        sections={secciones}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TarjetaEventoExterno evento={item} />}
        renderSectionHeader={({ section }) => <Text style={styles.dia}>{section.title}</Text>}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={encabezado}
        ListFooterComponent={
          total === 0 ? (
            <Text style={styles.vacio}>
              {sinDatos
                ? `Todavía no hay eventos en ${nombrePaisActivo}.`
                : 'Ningún evento calza con estos filtros.'}
            </Text>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginBottom: spacing.sm },
  filaFiltros: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginLeft: spacing.md, marginBottom: spacing.sm },
  filtro: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  filtroTexto: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  filtroActivo: { backgroundColor: colors.accent, borderColor: colors.accent },
  filtroTextoActivo: { color: colors.white },
  contador: { fontSize: fontSize.sm, color: colors.muted, marginLeft: spacing.md, marginBottom: spacing.sm },
  busqueda: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  filaSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  textoSwitch: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  dia: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    marginLeft: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  avisoExternos: { fontSize: fontSize.sm, color: colors.muted, marginHorizontal: spacing.md, marginTop: spacing.sm },
  centrado: { justifyContent: 'center', alignItems: 'center' },
  botonReintentar: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.md,
  },
  textoReintentar: { color: colors.white, fontWeight: 'bold' },
  vacio: { textAlign: 'center', color: colors.muted, marginTop: spacing.lg },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  tituloHoja: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  cerrar: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemTexto: { fontSize: fontSize.md, color: colors.primary },
  itemTextoActivo: { color: colors.accent, fontWeight: '600' },
  check: { color: colors.accent, fontWeight: 'bold' },
});
