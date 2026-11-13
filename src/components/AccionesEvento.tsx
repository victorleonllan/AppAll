import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Evento } from '../types';
import { useEventos } from '../context/EventosContext';
import { EventoPermisos } from '../hooks/useEventoPermisos';
import { confirmar } from '../lib/confirm';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

interface Props {
  evento: Evento;
  permisos: EventoPermisos;
  onBorrado: () => void;
}

type Accion = 'visible' | 'cancelar' | 'borrar';

/**
 * Spec 137 — los tres controles de `AccionesEvento.js` de la web, cada uno con
 * el permiso que le pide la base:
 * - Ocultar (spec 079): no destructivo, `can_edit_event()` → `puedeEditar`.
 * - Cancelar: deja el evento visible como cancelado; el UPDATE de `status`
 *   dispara `events_guard_protected_columns_trg`, que exige
 *   `can_delete_event()` → `puedeBorrar`.
 * - Borrar: la policy `events_delete` solo acepta al `owner` (spec 059) y
 *   `events_block_delete_with_tickets_trg` lo rechaza si hay ventas.
 *
 * Los errores van en un `Text` rojo con el mensaje de la base: `Alert.alert`
 * no hace nada en el build web (`src/lib/confirm.ts`).
 */
export default function AccionesEvento({ evento, permisos, onBorrado }: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation();
  const { updateEvento, cancelEvento, deleteEvento } = useEventos();
  const [motivo, setMotivo] = useState('');
  const [corriendo, setCorriendo] = useState<Accion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  if (!permisos.puedeEditar && !permisos.puedeBorrar) return null;

  const visible = evento.visibleEnCartelera !== false;
  const cancelado = evento.status === 'cancelled';
  const ocupado = corriendo !== null;

  const handleVisible = async (valor: boolean) => {
    setError(null);
    setConfirmacion(null);
    setCorriendo('visible');
    try {
      await updateEvento(evento.id, { visibleEnCartelera: valor });
      setConfirmacion(valor ? 'Visible en la cartelera' : 'Sacado de la cartelera');
    } catch (err: any) {
      setError(`No se pudo cambiar la visibilidad: ${err?.message ?? 'error desconocido'}`);
    } finally {
      setCorriendo(null);
    }
  };

  const handleCancelar = () => {
    confirmar(
      {
        title: 'Cancelar evento',
        message: '¿Cancelar este evento? Sigue visible, pero marcado como cancelado.',
        confirmText: 'Cancelar evento',
        cancelText: 'Volver',
        destructive: true,
      },
      async () => {
        setError(null);
        setConfirmacion(null);
        setCorriendo('cancelar');
        try {
          await cancelEvento(evento.id, motivo.trim() || undefined);
          navigation.goBack();
        } catch (err: any) {
          setError(`No se pudo cancelar: ${err?.message ?? 'error desconocido'}`);
        } finally {
          setCorriendo(null);
        }
      },
    );
  };

  const handleBorrar = () => {
    confirmar(
      {
        title: 'Borrar evento',
        message:
          'Esta acción es definitiva. Si el evento tiene entradas vendidas o en proceso, la base lo va a rechazar — cancélalo en su lugar.',
        confirmText: 'Borrar',
        cancelText: 'Volver',
        destructive: true,
      },
      async () => {
        setError(null);
        setConfirmacion(null);
        setCorriendo('borrar');
        try {
          await deleteEvento(evento.id);
          onBorrado();
        } catch (err: any) {
          // Por ejemplo, el mensaje de events_block_delete_with_tickets_trg.
          setError(`No se pudo borrar: ${err?.message ?? 'error desconocido'}`);
          setCorriendo(null);
        }
      },
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>Más acciones</Text>

      {permisos.puedeEditar && (
        <View style={styles.seccion}>
          <View style={styles.fila}>
            <Text style={styles.label}>Visible en la cartelera</Text>
            <Switch
              value={visible}
              onValueChange={handleVisible}
              disabled={ocupado}
              trackColor={{ true: colores.accent, false: colores.border }}
            />
          </View>
          <Text style={styles.ayuda}>
            Para un show que ya pasó: deja de listarse, pero quien tenga el enlace lo sigue viendo.
          </Text>
          {confirmacion ? <Text style={styles.confirmacion}>{confirmacion}</Text> : null}
        </View>
      )}

      {cancelado ? (
        <View style={styles.seccion}>
          <Text style={styles.cancelado}>Este evento está cancelado</Text>
          {evento.cancelReason ? (
            <Text style={styles.ayuda}>Motivo: {evento.cancelReason}</Text>
          ) : null}
        </View>
      ) : permisos.puedeBorrar ? (
        <View style={styles.seccion}>
          <TextInput
            style={styles.input}
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Motivo de la cancelación (opcional)"
            placeholderTextColor={colores.muted}
            editable={!ocupado}
          />
          <TouchableOpacity
            style={[styles.botonCancelar, ocupado && styles.botonDesactivado]}
            onPress={handleCancelar}
            disabled={ocupado}
          >
            {corriendo === 'cancelar' ? (
              <ActivityIndicator color={colores.danger} />
            ) : (
              <Text style={styles.textoCancelar}>Cancelar evento</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {permisos.rol === 'owner' && (
        <TouchableOpacity
          style={[styles.botonBorrar, ocupado && styles.botonDesactivado]}
          onPress={handleBorrar}
          disabled={ocupado}
        >
          {corriendo === 'borrar' ? (
            <ActivityIndicator color={colores.white} />
          ) : (
            <Text style={styles.textoBorrar}>Borrar evento</Text>
          )}
        </TouchableOpacity>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  card: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  titulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: c.primary,
    marginBottom: spacing.sm,
  },
  seccion: { marginTop: spacing.sm },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary },
  ayuda: { fontSize: fontSize.xs, color: c.muted, marginTop: spacing.xs },
  confirmacion: { fontSize: fontSize.xs, color: c.success, marginTop: spacing.xs },
  cancelado: { fontSize: fontSize.sm, fontWeight: '600', color: c.danger },
  input: {
    backgroundColor: c.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: c.primary,
    borderWidth: 1,
    borderColor: c.border,
  },
  botonCancelar: {
    borderWidth: 1,
    borderColor: c.danger,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  textoCancelar: { color: c.danger, fontWeight: 'bold', fontSize: fontSize.md },
  botonBorrar: {
    backgroundColor: c.danger,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  textoBorrar: { color: c.white, fontWeight: 'bold', fontSize: fontSize.md },
  botonDesactivado: { opacity: 0.6 },
  error: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.md },
});
