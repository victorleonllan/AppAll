import { useState } from 'react';
import { Modal, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { buscarGeneros } from '../lib/generos';
import { colors, spacing, borderRadius, fontSize } from '../theme';

const TODOS = '__todos__';

interface GeneroPickerProps {
  visible: boolean;
  onClose: () => void;
  /** 0 o 1 elemento en modo single, N en modo multiple. */
  seleccionados: string[];
  onCambiar: (generos: string[]) => void;
  /** default false — single: elegir cierra el modal. multiple: togglea, cierra con "Listo". */
  multiple?: boolean;
  titulo?: string;
  /** Solo tiene efecto en modo single — agrega un ítem "Todos los géneros" al principio
   * que limpia la selección (spec 056, filtro de Cartelera). */
  permitirTodos?: boolean;
}

/** Spec 056 — modal de búsqueda + lista sobre el listado cerrado del spec 054. */
export default function GeneroPicker({
  visible,
  onClose,
  seleccionados,
  onCambiar,
  multiple = false,
  titulo = 'Género',
  permitirTodos = false,
}: GeneroPickerProps) {
  const [query, setQuery] = useState('');
  const resultados = buscarGeneros(query);
  const items = permitirTodos && !multiple ? [TODOS, ...resultados] : resultados;

  const elegir = (g: string) => {
    if (multiple) {
      const yaEsta = seleccionados.includes(g);
      onCambiar(yaEsta ? seleccionados.filter((x) => x !== g) : [...seleccionados, g]);
      return;
    }
    onCambiar(g === TODOS ? [] : [g]);
    setQuery('');
    onClose();
  };

  const cerrar = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cerrar}>
      <View style={styles.overlay}>
        <View style={styles.hoja}>
          <View style={styles.encabezado}>
            <Text style={styles.titulo}>{titulo}</Text>
            <TouchableOpacity onPress={cerrar}>
              <Text style={styles.cerrar}>{multiple ? 'Listo' : 'Cancelar'}</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.buscador}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar género…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />

          <FlatList
            data={items}
            keyExtractor={(g) => g}
            style={styles.lista}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const esTodos = item === TODOS;
              const activo = esTodos ? seleccionados.length === 0 : seleccionados.includes(item);
              return (
                <TouchableOpacity style={styles.item} onPress={() => elegir(item)}>
                  <Text style={[styles.itemTexto, activo && styles.itemTextoActivo]}>
                    {esTodos ? 'Todos los géneros' : item}
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
