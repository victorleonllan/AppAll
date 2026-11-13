// Spec 172 — visitantes de la web por cartelera de país, en el admin de la app. Port de
// `app/(private)/admin/visitas/page.js` de sonopolisWeb (W-263, W-266, W-269). Los
// textos son literales de la web, incluido el recuadro de explicación: «Las compras
// hechas en la app no pasan por la web» sigue siendo cierto visto desde la app
// (Decisión 7). Sin guarda propia: la de navegación es `AdminScreen` y la de seguridad
// es la RPC, que a un no-admin le responde «solo admin» (Decisión 6).

import { useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useAdminVisitas } from '../hooks/useAdminVisitas';
import {
  PERIODOS_VISITAS,
  PERIODO_POR_DEFECTO,
  MAX_VISITANTES,
  origenDeVisita,
  etiquetaDeRuta,
  formatearMomento,
  resumirVisitas,
  type ClavePeriodo,
  type Visitante,
  type VisitasPais,
} from '../lib/visitas';
import { etiquetaPais } from '../constants/paises';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';
import { spacing, borderRadius, fontSize, type Paleta } from '../theme';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const CLAVES = Object.keys(PERIODOS_VISITAS) as ClavePeriodo[];

function Seccion({ titulo, children }: { titulo: string; children?: ReactNode }) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.seccion}>
      <Text style={styles.tituloSeccion}>{titulo.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.vacio}>
      <Text style={styles.vacioTexto}>{children}</Text>
    </View>
  );
}

function FilaPais({ f }: { f: VisitasPais }) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.tarjeta}>
      <Text style={styles.titulo} numberOfLines={1}>
        {etiquetaPais(f.pais)}
      </Text>
      <Text style={styles.textoChico}>
        {[
          plural(f.visitantes, 'visitante', 'visitantes'),
          plural(f.visitas, 'visita', 'visitas'),
          `${f.visitantesConSesion} con cuenta`,
        ].join(' · ')}
      </Text>
    </View>
  );
}

// Un `useState` por fila: React Native no tiene `<details>`, y abrir y cerrar en la
// lista es más rápido que entrar y volver (Decisión 5).
function FilaVisitante({ v }: { v: Visitante }) {
  const styles = useEstilos(crearEstilos);
  const [abierto, setAbierto] = useState(false);
  const titulo = v.nombre || v.email || 'Anónimo';
  const desde = formatearMomento(v.primera, v.pais);
  const hasta = formatearMomento(v.ultima, v.pais);
  return (
    <View style={[styles.tarjeta, styles.filaVisitante]}>
      <View style={styles.filaTitulo}>
        <Text style={[styles.titulo, styles.tituloFlexible]} numberOfLines={1}>
          {titulo}
        </Text>
        {v.compras > 0 && (
          <View style={styles.insignia}>
            <Text style={styles.insigniaTexto}>Compró · {plural(v.entradas, 'entrada', 'entradas')}</Text>
          </View>
        )}
      </View>
      {v.nombre && v.email && (
        <Text style={styles.textoChico} numberOfLines={1}>
          {v.email}
        </Text>
      )}
      <Text style={styles.textoChico}>
        {[
          etiquetaPais(v.pais),
          origenDeVisita(v),
          plural(v.visitas, 'página', 'páginas'),
          desde === hasta ? desde : `${desde} → ${hasta}`,
        ].join(' · ')}
      </Text>
      <TouchableOpacity onPress={() => setAbierto((a) => !a)} hitSlop={8}>
        <Text style={styles.enlace}>{abierto ? 'Ocultar recorrido' : 'Ver recorrido'}</Text>
      </TouchableOpacity>
      {/* El hook ya trae el recorrido viejas primero (spec 171, Decisión 6). */}
      {abierto &&
        v.recorrido.map((paso, i) => (
          <Text key={i} style={styles.paso}>
            <Text style={styles.textoChico}>{formatearMomento(paso.at, v.pais)}</Text> — {etiquetaDeRuta(paso)}
          </Text>
        ))}
    </View>
  );
}

export default function AdminVisitasScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  // En la app no hay URL que compartir: el período vive en el estado (Decisión 4).
  const [periodo, setPeriodo] = useState<ClavePeriodo>(PERIODO_POR_DEFECTO);
  const v = useAdminVisitas(periodo);
  const { total, compraron, entradas, primero } = resumirVisitas(v.porPais, v.visitantes);
  const n = v.visitantes.length;

  if (v.cargando && v.porPais.length === 0 && v.visitantes.length === 0 && !v.error) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colores.accent} />
      </View>
    );
  }

  // Un elemento y no un componente: uno creado en cada render remontaría el
  // encabezado entero (Decisión 3, el cuidado de AdminTenantScreen).
  const encabezado = (
    <View>
      {v.error && <Text style={styles.error}>{v.error}</Text>}
      <Text style={styles.bajada}>
        Quién entró a la web, según la cartelera de país que vio. {total} {total === 1 ? 'visitante' : 'visitantes'} en
        los últimos {PERIODOS_VISITAS[periodo]} días.
      </Text>

      <View style={styles.explicacion}>
        <Text style={styles.texto}>
          <Text style={styles.negrita}>Visita:</Text> cada página que alguien abre.{' '}
          <Text style={styles.negrita}>Visitante:</Text> un navegador — el mismo celular o computador. Si vuelve otro día
          sigue siendo un visitante con más visitas; desde otro dispositivo o en modo incógnito cuenta como otro.
        </Text>
        <Text style={styles.textoSecundario}>
          Tus visitas como admin no se cuentan. Las compras hechas en la app no pasan por la web y no aparecen acá.
          «Directo» incluye los links abiertos desde WhatsApp, que no avisan de dónde vienen.
        </Text>
      </View>

      <View style={styles.periodos}>
        {CLAVES.map((clave) => {
          const activo = clave === periodo;
          return (
            <TouchableOpacity
              key={clave}
              style={[styles.botonPeriodo, activo && styles.botonPeriodoActivo]}
              onPress={() => setPeriodo(clave)}
              accessibilityState={{ selected: activo }}
            >
              <Text style={[styles.textoPeriodo, activo && styles.textoPeriodoActivo]}>
                {PERIODOS_VISITAS[clave]} días
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Seccion titulo={`Por cartelera · ${v.porPais.length}`}>
        {v.porPais.length === 0 ? (
          <Vacio>Nadie visitó la web en este período.</Vacio>
        ) : (
          v.porPais.map((f) => <FilaPais key={f.pais} f={f} />)
        )}
      </Seccion>

      <View style={styles.compras}>
        <Text style={styles.negrita}>
          {compraron} de {plural(n, 'visitante', 'visitantes')} {compraron === 1 ? 'compró' : 'compraron'} ·{' '}
          {plural(entradas, 'entrada', 'entradas')}
        </Text>
        {primero && (
          <Text style={styles.textoChico}>
            Primera visita del período: {formatearMomento(primero.primera, primero.pais)}
          </Text>
        )}
      </View>

      <Seccion titulo={`Visitantes · ${n}`}>
        {n >= MAX_VISITANTES && (
          <Text style={styles.textoChico}>Se muestran los {MAX_VISITANTES} visitantes más recientes.</Text>
        )}
      </Seccion>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.contenido}
      data={v.visitantes}
      keyExtractor={(item) => item.visitante}
      renderItem={({ item }) => <FilaVisitante v={item} />}
      ListHeaderComponent={encabezado}
      ListEmptyComponent={
        <View style={styles.filaVisitante}>
          <Vacio>Nadie visitó la web en este período.</Vacio>
        </View>
      }
      refreshControl={<RefreshControl refreshing={v.cargando} onRefresh={v.recargar} tintColor={colores.accent} />}
    />
  );
}

const crearEstilos = (c: Paleta) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    contenido: { padding: spacing.md, paddingBottom: spacing.xl },
    centrado: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center' },
    error: { fontSize: fontSize.sm, color: c.danger, marginBottom: spacing.sm },
    bajada: { fontSize: fontSize.md, color: c.secondary, marginBottom: spacing.md },
    explicacion: {
      backgroundColor: c.cardBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    texto: { fontSize: fontSize.sm, color: c.primary },
    textoSecundario: { fontSize: fontSize.sm, color: c.secondary },
    negrita: { fontSize: fontSize.sm, fontWeight: 'bold', color: c.primary },
    textoChico: { fontSize: fontSize.xs, color: c.secondary },
    periodos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    botonPeriodo: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    botonPeriodoActivo: { backgroundColor: c.primary, borderColor: c.primary },
    textoPeriodo: { fontSize: fontSize.sm, color: c.primary },
    textoPeriodoActivo: { color: c.onPrimary, fontWeight: 'bold' },
    seccion: { marginTop: spacing.lg, gap: spacing.sm },
    tituloSeccion: { fontSize: fontSize.xs, fontWeight: 'bold', letterSpacing: 0.6, color: c.accent },
    tarjeta: {
      backgroundColor: c.cardBackground,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    filaVisitante: { marginTop: spacing.sm },
    filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    titulo: { fontSize: fontSize.sm, fontWeight: 'bold', color: c.primary },
    tituloFlexible: { flexShrink: 1 },
    insignia: {
      backgroundColor: c.successBg,
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    insigniaTexto: { fontSize: fontSize.xs, fontWeight: 'bold', color: c.success },
    enlace: { fontSize: fontSize.xs, color: c.accent, marginTop: spacing.xs },
    paso: { fontSize: fontSize.xs, color: c.primary },
    compras: { marginTop: spacing.lg, gap: 2 },
    vacio: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      borderRadius: borderRadius.md,
      padding: spacing.lg,
      alignItems: 'center',
    },
    vacioTexto: { fontSize: fontSize.sm, color: c.secondary, textAlign: 'center' },
  });
