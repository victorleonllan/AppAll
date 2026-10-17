import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useMisEntradas, EntradaPropia, CompraEnEmision } from '../hooks/useMisEntradas';
import TalonEntrada from '../components/TalonEntrada';
import { RootTabParamList } from '../navigation/linking';
import { colors, spacing, borderRadius, fontSize } from '../theme';

// Spec 126 — misma ventana que PollTrasCompra.js de la web: 6 intentos cada 3 s (~18 s).
const INTERVALO_EMISION_MS = 3000;
const MAX_INTENTOS_EMISION = 6;
const ANCHO_MAX_TALON = 420;

function textoEmision(compra: CompraEnEmision): string {
  const artista = compra.evento?.artista ?? 'el evento';
  return compra.cantidad === 1
    ? `Pago confirmado. Tu entrada para ${artista} se está emitiendo.`
    : `Pago confirmado. Tus ${compra.cantidad} entradas para ${artista} se están emitiendo.`;
}

export default function MisEntradasScreen() {
  const { user } = useAuth();
  const { cargando, error, proximas, pasadas, comprasEnEmision, refrescar } = useMisEntradas();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const anchoTalon = Math.min(width - spacing.md * 2, ANCHO_MAX_TALON);

  const hayEmision = comprasEnEmision.length > 0;
  // Los intentos se cuentan por montaje: al agotarse no vuelve a preguntar solo,
  // aunque la compra siga sin emitir; desde ahí manda el deslizar para recargar.
  const intentos = useRef(0);
  const [emisionAgotada, setEmisionAgotada] = useState(false);
  const refrescarRef = useRef(refrescar);
  refrescarRef.current = refrescar;

  useEffect(() => {
    if (!hayEmision || intentos.current >= MAX_INTENTOS_EMISION) return;
    const intervalo = setInterval(() => {
      if (intentos.current >= MAX_INTENTOS_EMISION) {
        clearInterval(intervalo);
        return;
      }
      intentos.current += 1;
      refrescarRef.current();
      if (intentos.current >= MAX_INTENTOS_EMISION) {
        clearInterval(intervalo);
        setEmisionAgotada(true);
      }
    }, INTERVALO_EMISION_MS);
    return () => clearInterval(intervalo);
  }, [hayEmision]);

  const irACartelera = () => {
    // La ruta vive en varios stacks: se sube al Tab para cambiar de pestaña (spec 114).
    navigation.getParent<NavigationProp<RootTabParamList>>()?.navigate('Cartelera', { screen: 'CarteleraList' });
  };

  if (!user) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.textoCentrado}>Inicia sesión para ver tus entradas.</Text>
      </View>
    );
  }

  const sinDatos = proximas.length === 0 && pasadas.length === 0 && !hayEmision;

  if (cargando && sinDatos && !error) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (sinDatos && !error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.textoCentrado}>Todavía no tienes entradas</Text>
        <TouchableOpacity style={styles.boton} onPress={irACartelera}>
          <Text style={styles.textoBoton}>Ver la cartelera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const secciones = [
    { title: 'Próximas', data: proximas },
    ...(pasadas.length > 0 ? [{ title: 'Pasadas', data: pasadas }] : []),
  ];

  const encabezado = (
    <View style={{ width: anchoTalon }}>
      {error && (
        <View style={styles.aviso}>
          <Text style={styles.textoError}>{error}</Text>
          <TouchableOpacity style={styles.botonReintentar} onPress={refrescar}>
            <Text style={styles.textoBotonReintentar}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}
      {comprasEnEmision.map((compra) => (
        <View key={compra.ticketId} style={styles.tarjetaEmision}>
          <Text style={styles.textoEmision}>{textoEmision(compra)}</Text>
          {emisionAgotada && <Text style={styles.textoEmisionAyuda}>Desliza hacia abajo para actualizar.</Text>}
        </View>
      ))}
    </View>
  );

  return (
    <SectionList<EntradaPropia>
      style={styles.lista}
      contentContainerStyle={styles.contenido}
      sections={secciones}
      keyExtractor={(entrada) => entrada.id}
      ListHeaderComponent={encabezado}
      renderSectionHeader={({ section }) =>
        section.data.length > 0 ? (
          <Text style={[styles.encabezadoSeccion, { width: anchoTalon }]}>{section.title}</Text>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={[styles.item, { width: anchoTalon }]}>
          <TalonEntrada entrada={item} />
        </View>
      )}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={refrescar} tintColor={colors.accent} />}
    />
  );
}

const styles = StyleSheet.create({
  centrado: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  textoCentrado: { fontSize: fontSize.md, color: colors.secondary, textAlign: 'center' },
  boton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: borderRadius.sm,
    marginTop: spacing.lg,
  },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  lista: { flex: 1, backgroundColor: colors.background },
  contenido: { alignItems: 'center', paddingVertical: spacing.md },
  aviso: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  textoError: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center' },
  botonReintentar: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textoBotonReintentar: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  tarjetaEmision: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  textoEmision: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  textoEmisionAyuda: { color: colors.secondary, fontSize: fontSize.xs, marginTop: spacing.xs },
  encabezadoSeccion: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  // Al menos spacing.xl entre talones: la cámara nunca encuadra dos QR a la vez.
  item: { marginBottom: spacing.xl },
});
