import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useDireccionesVenue, DireccionVenue } from '../hooks/useDireccionesVenue';
import { confirmar } from '../lib/confirm';
import { colors, spacing, borderRadius, fontSize } from '../theme';

interface GestionDireccionesProps {
  venueId: string;
  onCambio?: () => void;
}

/**
 * Spec 134 — equivalente de `GestionDirecciones.js` de la web (W-064). Cada
 * acción se guarda al momento, sin pasar por «Guardar cambios». Crear o
 * activar cambia venues.address por el trigger, así que avisa con onCambio
 * para que la pantalla refresque VenuesContext.
 */
export default function GestionDirecciones({ venueId, onCambio }: GestionDireccionesProps) {
  const { direcciones, cargando, error, refrescar, crear, activar, eliminar, puedeAgregar } =
    useDireccionesVenue(venueId);
  const [ocupado, setOcupado] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [address, setAddress] = useState('');
  const [comuna, setComuna] = useState('');
  const [ciudad, setCiudad] = useState('');

  const cerrarFormulario = () => {
    setAgregando(false);
    setAddress('');
    setComuna('');
    setCiudad('');
  };

  const handleCrear = async () => {
    setOcupado(true);
    try {
      await crear({ address, comuna: comuna.trim() || null, ciudad: ciudad.trim() || null });
      cerrarFormulario();
      onCambio?.();
    } catch (err: any) {
      Alert.alert('No se pudo agregar la dirección', err?.message ?? 'Error desconocido');
    } finally {
      setOcupado(false);
    }
  };

  const handleActivar = async (direccionId: string) => {
    setOcupado(true);
    try {
      await activar(direccionId);
      onCambio?.();
    } catch (err: any) {
      Alert.alert('No se pudo activar la dirección', err?.message ?? 'Error desconocido');
    } finally {
      setOcupado(false);
    }
  };

  const handleBorrar = (direccion: DireccionVenue) => {
    confirmar(
      { title: 'Borrar dirección', message: textoDireccion(direccion), confirmText: 'Borrar', destructive: true },
      async () => {
        setOcupado(true);
        try {
          await eliminar(direccion);
        } catch (err: any) {
          Alert.alert('No se pudo borrar la dirección', err?.message ?? 'Error desconocido');
        } finally {
          setOcupado(false);
        }
      }
    );
  };

  if (cargando) {
    return <ActivityIndicator color={colors.accent} style={styles.cargando} />;
  }

  if (error) {
    return (
      <View>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.botonSecundario} onPress={refrescar}>
          <Text style={styles.textoBotonSecundario}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.aviso}>Se guarda al momento</Text>

      {direcciones.map((d) => (
        <View key={d.id} style={[styles.direccion, d.activa && styles.direccionActiva]}>
          <View style={styles.direccionFila}>
            <Text style={styles.direccionTexto}>{textoDireccion(d)}</Text>
            {d.activa ? <Text style={styles.etiquetaActiva}>Activa</Text> : null}
          </View>
          {d.activa ? (
            <Text style={styles.ayuda}>Es la que se ve en tu ficha, en el mapa y en la cartelera</Text>
          ) : (
            <View style={styles.acciones}>
              <TouchableOpacity
                style={[styles.botonSecundario, ocupado && styles.botonDesactivado]}
                onPress={() => handleActivar(d.id)}
                disabled={ocupado}
              >
                <Text style={styles.textoBotonSecundario}>Usar esta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.botonBorrar, ocupado && styles.botonDesactivado]}
                onPress={() => handleBorrar(d)}
                disabled={ocupado}
              >
                <Text style={styles.textoBotonBorrar}>Borrar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      {!puedeAgregar ? (
        <Text style={styles.ayuda}>Llegaste al máximo de 3 direcciones. Borra una para agregar otra.</Text>
      ) : agregando ? (
        <View style={styles.formulario}>
          {direcciones.length === 0 ? (
            <Text style={styles.ayuda}>
              Esta primera dirección queda activa sola. De la segunda en adelante, activar es un paso aparte.
            </Text>
          ) : null}
          <Text style={styles.label}>Dirección</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Ej: Av. Italia 890" placeholderTextColor={colors.muted} />
          <View style={styles.filaDoble}>
            <View style={styles.mitad}>
              <Text style={styles.label}>Comuna</Text>
              <TextInput style={styles.input} value={comuna} onChangeText={setComuna} placeholder="Ñuñoa" placeholderTextColor={colors.muted} />
            </View>
            <View style={styles.mitad}>
              <Text style={styles.label}>Ciudad</Text>
              <TextInput style={styles.input} value={ciudad} onChangeText={setCiudad} placeholder="Santiago" placeholderTextColor={colors.muted} />
            </View>
          </View>
          <View style={styles.acciones}>
            <TouchableOpacity
              style={[styles.botonPrimario, ocupado && styles.botonDesactivado]}
              onPress={handleCrear}
              disabled={ocupado}
            >
              {ocupado ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.textoBotonPrimario}>Guardar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.botonSecundario, ocupado && styles.botonDesactivado]}
              onPress={cerrarFormulario}
              disabled={ocupado}
            >
              <Text style={styles.textoBotonSecundario}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View>
          {direcciones.length === 0 ? (
            <Text style={styles.ayuda}>
              Esta primera dirección queda activa sola. De la segunda en adelante, activar es un paso aparte.
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.botonSecundario, ocupado && styles.botonDesactivado]}
            onPress={() => setAgregando(true)}
            disabled={ocupado}
          >
            <Text style={styles.textoBotonSecundario}>+ Agregar otra dirección</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function textoDireccion(d: DireccionVenue): string {
  return [d.address, d.comuna, d.ciudad].filter(Boolean).join(', ');
}

const styles = StyleSheet.create({
  cargando: { marginVertical: spacing.md },
  aviso: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.danger, marginBottom: spacing.sm },
  ayuda: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.sm },
  direccion: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  direccionActiva: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  direccionFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  direccionTexto: { flex: 1, fontSize: fontSize.md, color: colors.primary },
  etiquetaActiva: { fontSize: fontSize.xs, fontWeight: 'bold', color: colors.accent },
  acciones: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  formulario: { marginTop: spacing.xs },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filaDoble: { flexDirection: 'row', gap: spacing.sm },
  mitad: { flex: 1 },
  botonPrimario: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonPrimario: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.sm },
  botonSecundario: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  textoBotonSecundario: { color: colors.secondary, fontWeight: '600', fontSize: fontSize.sm },
  botonBorrar: {
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonBorrar: { color: colors.danger, fontWeight: '600', fontSize: fontSize.sm },
  botonDesactivado: { opacity: 0.6 },
});
