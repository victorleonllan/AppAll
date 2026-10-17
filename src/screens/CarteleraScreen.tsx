import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Platform, TouchableOpacity, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEventos } from '../context/EventosContext';
import { useAuth } from '../context/AuthContext';
import { usePais } from '../context/PaisContext';
import { PAISES } from '../constants/paises';
import TarjetaEvento from '../components/TarjetaEvento';
import GeneroPicker from '../components/GeneroPicker';
import { eventoCoincideConGenero } from '../lib/generos';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, fontSize, borderRadius } from '../theme';

type NavigationProp = NativeStackNavigationProp<CarteleraStackParamList, 'CarteleraList'>;

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
  const { eventosDelPais, loading } = useEventos();
  const { pais, listo } = usePais();
  const { user } = useAuth();
  const nombrePaisActivo = PAISES[pais]?.nombre ?? pais;

  // Spec 056 — primer filtro de Cartelera: por género, sobre el listado cerrado
  // del spec 054. `null` = sin filtro (todos los géneros).
  const [generoFiltro, setGeneroFiltro] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const eventosFiltrados = eventosDelPais.filter((e) => eventoCoincideConGenero(e.genero, generoFiltro));

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
  // defecto antes de que llegue la elección guardada.
  if (loading || !listo) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Proximos eventos</Text>

      <View style={styles.filaFiltros}>
        <SelectorPais />
        <TouchableOpacity style={styles.filtro} onPress={() => setPickerVisible(true)}>
          <Text style={styles.filtroTexto}>
            Género: {generoFiltro ?? 'Todos'}
          </Text>
        </TouchableOpacity>
      </View>
      <GeneroPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        seleccionados={generoFiltro ? [generoFiltro] : []}
        onCambiar={(gs) => setGeneroFiltro(gs[0] ?? null)}
        permitirTodos
        titulo="Filtrar por género"
      />

      <FlatList
        data={eventosFiltrados}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TarjetaEvento
            evento={item}
            onPress={() => navigation.navigate('DetalleEvento', { eventoId: item.id })}
          />
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
        // Spec 096, Decisión 5 — el vacío nombra el país: con varios países es
        // la diferencia entre "la app está rota" y "acá todavía no llegamos".
        ListEmptyComponent={
          <Text style={styles.vacio}>
            {generoFiltro
              ? `Sin eventos de ${generoFiltro} en ${nombrePaisActivo} por ahora.`
              : `Todavía no hay eventos en ${nombrePaisActivo}.`}
          </Text>
        }
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
