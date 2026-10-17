import { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { PAISES_ISO, PAIS_POR_DEFECTO, nombrePais, etiquetaPais } from '../constants/paises';
import { colors, spacing, borderRadius, fontSize } from '../theme';

interface PaisPickerProps {
  visible: boolean;
  onClose: () => void;
  seleccionado: string;
  onCambiar: (codigo: string) => void;
  titulo?: string;
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Spec 095 — modal de búsqueda + lista sobre el catálogo ISO (mismo patrón que
 * GeneroPicker). `PAIS_POR_DEFECTO` va primero para que el caso frecuente quede
 * a un toque; el resto, por nombre. Se busca por nombre o por código ("AR").
 */
export default function PaisPicker({
  visible,
  onClose,
  seleccionado,
  onCambiar,
  titulo = 'País',
}: PaisPickerProps) {
  const [query, setQuery] = useState('');

  const ordenados = useMemo(() => {
    const resto = PAISES_ISO.filter((c) => c !== PAIS_POR_DEFECTO).sort((a, b) =>
      nombrePais(a).localeCompare(nombrePais(b), 'es')
    );
    return [PAIS_POR_DEFECTO, ...resto];
  }, []);

  const q = sinAcentos(query.trim());
  const items = q
    ? ordenados.filter((c) => sinAcentos(nombrePais(c)).includes(q) || c.toLowerCase() === q)
    : ordenados;

  const cerrar = () => {
    setQuery('');
    onClose();
  };

  const elegir = (codigo: string) => {
    onCambiar(codigo);
    cerrar();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cerrar}>
      <View style={styles.overlay}>
        <View style={styles.hoja}>
          <View style={styles.encabezado}>
            <Text style={styles.titulo}>{titulo}</Text>
            <TouchableOpacity onPress={cerrar}>
              <Text style={styles.cerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.buscador}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar país…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />

          <FlatList
            data={items}
            keyExtractor={(c) => c}
            style={styles.lista}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const activo = item === seleccionado;
              return (
                <TouchableOpacity style={styles.item} onPress={() => elegir(item)}>
                  <Text style={[styles.itemTexto, activo && styles.itemTextoActivo]}>
                    {etiquetaPais(item)}
                  </Text>
                  {activo && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.vacio}>Sin resultados para "{query}"</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '80%',
    paddingTop: spacing.md,
  },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  cerrar: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  buscador: {
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  lista: { paddingHorizontal: spacing.md },
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
  vacio: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.lg },
});
