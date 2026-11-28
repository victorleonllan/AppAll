// Spec 206 — buscador de cuentas de músico y fichas sueltas para el admin (W-343, W-355).
// No crea fichas: el admin elige entre las que existen.

import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { buscarBandasAdmin, type BandaEncontrada } from '../lib/adminEdicion';
import type { TipoBanda } from '../lib/bandas';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

/** «En Sonópolis» o «Sin cuenta» (W-349). */
export function EtiquetaBanda({ tipo }: { tipo: TipoBanda }) {
  const styles = useEstilos(crearEstilos);
  const esCuenta = tipo === 'cuenta';
  return (
    <Text style={[styles.etiqueta, esCuenta ? styles.etiquetaCuenta : styles.etiquetaFicha]}>
      {esCuenta ? 'En Sonópolis' : 'Sin cuenta'}
    </Text>
  );
}

interface Props {
  tipos: TipoBanda[];
  excluir?: string[];
  placeholder: string;
  textoAccion: string;
  textoVacio: string;
  deshabilitado?: boolean;
  onElegir: (banda: BandaEncontrada) => void;
}

export default function SelectorBandaAdmin({
  tipos, excluir, placeholder, textoAccion, textoVacio, deshabilitado, onElegir,
}: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [texto, setTexto] = useState('');
  // `q` es el texto al que pertenece la respuesta: mientras no coincida con lo escrito,
  // no se muestra ni la lista ni el vacío.
  const [respuesta, setRespuesta] = useState<{ q: string; bandas: BandaEncontrada[]; error: string | null }>({
    q: '',
    bandas: [],
    error: null,
  });
  const q = texto.trim();
  // `tipos` llega como literal en cada render: la dependencia es su contenido.
  const claveTipos = tipos.join(',');

  useEffect(() => {
    if (q.length < 2) return;
    let vigente = true;
    const espera = setTimeout(() => {
      buscarBandasAdmin(q, claveTipos.split(',') as TipoBanda[])
        .then((bandas) => {
          if (vigente) setRespuesta({ q, bandas, error: null });
        })
        .catch((e: any) => {
          if (vigente) setRespuesta({ q, bandas: [], error: e?.message ?? 'No se pudo buscar' });
        });
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [q, claveTipos]);

  const lista = q.length >= 2 && respuesta.q === q;
  const resultados = lista ? respuesta.bandas.filter((b) => !excluir?.includes(b.id)) : [];

  return (
    <View style={styles.contenedor}>
      <TextInput
        style={styles.input}
        value={texto}
        onChangeText={setTexto}
        placeholder={placeholder}
        placeholderTextColor={colores.muted}
        autoCorrect={false}
      />
      {lista && respuesta.error && <Text style={styles.error}>{respuesta.error}</Text>}
      {resultados.map((b) => (
        <View key={`${b.tipo}:${b.id}`} style={styles.fila}>
          <View style={styles.datos}>
            <Text style={styles.nombre}>{b.nombre || 'Sin nombre'}</Text>
            <EtiquetaBanda tipo={b.tipo} />
          </View>
          <TouchableOpacity
            style={[styles.boton, deshabilitado && styles.deshabilitado]}
            disabled={deshabilitado}
            onPress={() => {
              setTexto('');
              onElegir(b);
            }}
          >
            <Text style={styles.botonTexto}>{textoAccion}</Text>
          </TouchableOpacity>
        </View>
      ))}
      {lista && !respuesta.error && resultados.length === 0 && <Text style={styles.vacio}>{textoVacio}</Text>}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  contenedor: { gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: c.primary,
    backgroundColor: c.cardBackground,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: spacing.xs,
  },
  datos: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  nombre: { fontSize: fontSize.sm, color: c.primary },
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
  boton: {
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  botonTexto: { fontSize: fontSize.xs, fontWeight: '600', color: c.accent },
  deshabilitado: { opacity: 0.5 },
  vacio: { fontSize: fontSize.sm, color: c.secondary },
  error: { fontSize: fontSize.sm, color: c.danger },
});
