// Spec 206 — ventana «Músicos» del admin: cuentas de músico, fichas sueltas y sugerencias
// de conexión (W-343, W-349).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SectionList, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  adminVincularBanda,
  listarCuentasMusico,
  listarFichasSueltas,
  type CuentaMusicoAdmin,
  type FichaSueltaAdmin,
} from '../lib/adminEdicion';
import { sugerirCoincidencias } from '../lib/bandas';
import { confirmar } from '../lib/confirm';
import type { AdminParamList } from '../navigation/pantallasAdmin';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

type NavProp = NativeStackNavigationProp<AdminParamList, 'AdminMusicos'>;

const FILTROS = [
  { clave: 'todas', texto: 'Todas' },
  { clave: 'cuentas', texto: 'Cuentas' },
  { clave: 'fichas', texto: 'Fichas sueltas' },
] as const;
type Filtro = (typeof FILTROS)[number]['clave'];

type Item = { tipo: 'cuenta'; c: CuentaMusicoAdmin } | { tipo: 'ficha'; f: FichaSueltaAdmin };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function AdminMusicosScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation<NavProp>();
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [cuentas, setCuentas] = useState<CuentaMusicoAdmin[]>([]);
  const [fichas, setFichas] = useState<FichaSueltaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // «No es» oculta la sugerencia hasta recargar.
  const [descartadas, setDescartadas] = useState<string[]>([]);
  // Una respuesta vieja (otro texto del buscador) no pisa la última.
  const pedido = useRef(0);

  useEffect(() => {
    const espera = setTimeout(() => setQ(texto.trim()), 300);
    return () => clearTimeout(espera);
  }, [texto]);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const [c, f] = await Promise.all([listarCuentasMusico(q), listarFichasSueltas(q)]);
      if (n !== pedido.current) return;
      setCuentas(c);
      setFichas(f);
    } catch (e: any) {
      if (n === pedido.current) setError(e?.message ?? 'error desconocido');
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [q]);

  // Al volver de una ficha conectada o unida la lista ya no la trae.
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const recargar = () => {
    setDescartadas([]);
    cargar();
  };

  // Solo sin buscador: con texto las listas no están completas.
  const sugerencias =
    filtro !== 'cuentas' && !q && !texto.trim()
      ? sugerirCoincidencias(fichas, cuentas).filter((s) => !descartadas.includes(`${s.fichaId}:${s.cuentaId}`))
      : [];
  const totalSugeridas = new Set(sugerencias.map((s) => s.fichaId)).size;

  const conectar = (ficha: FichaSueltaAdmin, cuenta: CuentaMusicoAdmin) =>
    confirmar(
      {
        title: 'Conectar con una cuenta',
        message: `Los ${plural(ficha.eventos, 'evento', 'eventos')} de «${ficha.name}» pasan a la cuenta de ${cuenta.nombre} y la ficha desaparece. No se puede deshacer.`,
        confirmText: 'Conectar',
        destructive: true,
      },
      async () => {
        setOcupado(true);
        setAviso(null);
        try {
          await adminVincularBanda(ficha.id, cuenta.id);
          setAviso({ ok: true, texto: `Conectada con ${cuenta.nombre}` });
          await cargar();
        } catch (e: any) {
          setAviso({ ok: false, texto: e?.message ?? 'No se pudo conectar' });
        } finally {
          setOcupado(false);
        }
      },
    );

  const sections: { titulo: string; vacio: string; data: Item[] }[] = [];
  if (filtro !== 'fichas') {
    sections.push({
      titulo: `Cuentas de músico · ${cuentas.length}`,
      vacio: 'No hay cuentas con ese nombre.',
      data: cuentas.map((c) => ({ tipo: 'cuenta', c })),
    });
  }
  if (filtro !== 'cuentas') {
    sections.push({
      titulo: `Fichas sueltas · ${fichas.length}`,
      vacio: 'No hay fichas sueltas con ese nombre.',
      data: fichas.map((f) => ({ tipo: 'ficha', f })),
    });
  }

  const renderFila = ({ item }: { item: Item }) => {
    const esCuenta = item.tipo === 'cuenta';
    const nombre = item.tipo === 'cuenta' ? item.c.nombre || 'Sin nombre' : item.f.name;
    const detalle =
      item.tipo === 'cuenta'
        ? [item.c.ciudad, plural(item.c.eventos, 'evento', 'eventos')].filter(Boolean).join(' · ')
        : [
            item.f.eventos === 0 ? 'Sin eventos' : item.f.primerLocal && `Creada en un evento de ${item.f.primerLocal}`,
            plural(item.f.eventos, 'evento', 'eventos'),
          ]
            .filter(Boolean)
            .join(' · ');
    const abrir = () => {
      if (item.tipo === 'cuenta') {
        navigation.navigate('AdminTenant', { tipo: 'musician', id: item.c.id, nombre });
      } else {
        navigation.navigate('AdminFichaBanda', { fichaId: item.f.id, nombre });
      }
    };
    return (
      <TouchableOpacity style={styles.fila} onPress={abrir}>
        <View style={styles.encabezado}>
          <Text style={styles.nombre} numberOfLines={1}>
            {nombre}
          </Text>
          <Text style={[styles.etiqueta, esCuenta ? styles.etiquetaCuenta : styles.etiquetaFicha]}>
            {esCuenta ? 'Cuenta' : 'Ficha suelta'}
          </Text>
        </View>
        <Text style={styles.detalle}>{detalle}</Text>
      </TouchableOpacity>
    );
  };

  // Un elemento y no un componente: uno creado en cada render remontaría el buscador
  // y perdería el foco a cada letra.
  const cabecera = (
    <View style={styles.cabecera}>
      <TextInput
        style={styles.input}
        value={texto}
        onChangeText={setTexto}
        placeholder="Buscar banda o cuenta"
        placeholderTextColor={colores.muted}
        autoCorrect={false}
      />
      <View style={styles.chips}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.clave}
            style={[styles.chip, filtro === f.clave && styles.chipActivo]}
            onPress={() => setFiltro(f.clave)}
          >
            <Text style={[styles.chipTexto, filtro === f.clave && styles.chipTextoActivo]}>{f.texto}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {cargando && <ActivityIndicator color={colores.accent} />}
      {error && <Text style={styles.error}>No se pudo cargar: {error}</Text>}
      {aviso && <Text style={aviso.ok ? styles.ok : styles.error}>{aviso.texto}</Text>}
      {sugerencias.length > 0 && (
        <View style={styles.sugerencias}>
          <Text style={styles.nombre}>
            {totalSugeridas === 1
              ? '1 ficha parece ser de una cuenta'
              : `${totalSugeridas} fichas parecen ser de una cuenta`}
          </Text>
          <Text style={styles.detalle}>
            Se llaman igual o parecido que una cuenta de músico. Revísalas y conéctalas para que sus eventos aparezcan en
            el perfil y el CRM de la banda.
          </Text>
          {sugerencias.map((s) => {
            const ficha = fichas.find((f) => f.id === s.fichaId);
            const cuenta = cuentas.find((c) => c.id === s.cuentaId);
            if (!ficha || !cuenta) return null;
            const clave = `${s.fichaId}:${s.cuentaId}`;
            return (
              <View key={clave} style={styles.sugerencia}>
                <Text style={styles.detalle}>
                  Ficha <Text style={styles.negrita}>{ficha.name}</Text> → Cuenta{' '}
                  <Text style={styles.negrita}>{cuenta.nombre}</Text>
                </Text>
                <View style={styles.acciones}>
                  <TouchableOpacity style={styles.boton} onPress={() => setDescartadas((d) => [...d, clave])}>
                    <Text style={styles.botonTexto}>No es</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.boton, styles.botonPrincipal, ocupado && styles.deshabilitado]}
                    disabled={ocupado}
                    onPress={() => conectar(ficha, cuenta)}
                  >
                    <Text style={[styles.botonTexto, styles.botonPrincipalTexto]}>Conectar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.contenido}
      sections={sections}
      keyExtractor={(i) => (i.tipo === 'cuenta' ? `c:${i.c.id}` : `f:${i.f.id}`)}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={cabecera}
      renderSectionHeader={({ section }) => <Text style={styles.tituloSeccion}>{section.titulo}</Text>}
      renderSectionFooter={({ section }) =>
        section.data.length === 0 && !cargando && !error ? <Text style={styles.vacio}>{section.vacio}</Text> : null
      }
      renderItem={renderFila}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={colores.accent} />}
    />
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  cabecera: { gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: c.primary,
    backgroundColor: c.cardBackground,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: c.cardBackground,
  },
  chipActivo: { backgroundColor: c.accent, borderColor: c.accent },
  chipTexto: { fontSize: fontSize.sm, color: c.secondary },
  chipTextoActivo: { color: c.onAccent, fontWeight: '600' },
  error: { fontSize: fontSize.sm, color: c.danger },
  ok: { fontSize: fontSize.sm, color: c.success },
  sugerencias: { backgroundColor: c.warningBg, borderRadius: borderRadius.md, padding: spacing.md, gap: spacing.sm },
  sugerencia: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm, gap: spacing.xs },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  boton: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: c.cardBackground,
  },
  botonTexto: { fontSize: fontSize.xs, fontWeight: '600', color: c.primary },
  botonPrincipal: { backgroundColor: c.accent, borderColor: c.accent },
  botonPrincipalTexto: { color: c.onAccent },
  deshabilitado: { opacity: 0.5 },
  tituloSeccion: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: c.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  vacio: { fontSize: fontSize.sm, color: c.secondary },
  fila: {
    backgroundColor: c.cardBackground,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nombre: { flexShrink: 1, fontSize: fontSize.md, fontWeight: '600', color: c.primary },
  negrita: { fontWeight: 'bold', color: c.primary },
  detalle: { fontSize: fontSize.sm, color: c.secondary, marginTop: 2 },
  etiqueta: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  etiquetaCuenta: { backgroundColor: c.successBg, color: c.success },
  etiquetaFicha: { backgroundColor: c.warningBg, color: c.warningText },
});
