import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useEventoPermisos } from '../hooks/useEventoPermisos';
import { useInvitacionesEquipo, PARECE_CORREO, RolInvitacion, InvitacionPendiente } from '../hooks/useInvitacionesEquipo';
import { confirmar } from '../lib/confirm';
import { Colaborador, ColaboradorSource, EventRole } from '../types';
import { colors, spacing, borderRadius, fontSize } from '../theme';

const SOURCE_LABEL: Record<ColaboradorSource, string> = {
  claim: 'Creador',
  venue_owner: 'Dueño del local',
  artist: 'Artista vinculado',
  invited: 'Invitado',
  backfill: 'Creador',
};

const ROLE_LABEL: Record<EventRole, string> = {
  owner: 'Dueño', admin: 'Administrador', editor: 'Editor',
};

export default function EquipoEventoScreen() {
  const route = useRoute();
  const { eventoId } = route.params as { eventoId: string };
  const { user } = useAuth();
  const { eventos, getColaboradores, invitarColaborador, cambiarPermisoBorrado, quitarColaborador, transferirPropiedad, buscarCandidatos } = useEventos();
  const permisos = useEventoPermisos(eventoId);
  const { pendientes, emailsEquipo, errorEmails, invitarPorCorreo, revocar, recargar } =
    useInvitacionesEquipo(eventoId, { esOwner: permisos.esOwner, puedeInvitar: permisos.puedeInvitar });

  const evento = eventos.find((e) => e.id === eventoId);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<{ id: string; nombre: string; role: string }[]>([]);
  const [buscando, setBuscando] = useState(false);
  // En el build web `Alert.alert` no hace nada (src/lib/confirm.ts), así que lo de
  // invitar por correo y revocar se avisa con un Text dentro de la tarjeta.
  const [avisoInvitar, setAvisoInvitar] = useState<string | null>(null);
  const [errorInvitar, setErrorInvitar] = useState<string | null>(null);
  const [errorRevocar, setErrorRevocar] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const rows = await getColaboradores(eventoId);
      setColaboradores(rows);
    } catch (err: any) {
      Alert.alert('No se pudo cargar el equipo', err?.message ?? 'Error desconocido');
    } finally {
      setCargando(false);
    }
  }, [eventoId, getColaboradores]);

  useFocusEffect(useCallback(() => {
    cargar();
    // El error ya quedó en consola dentro del hook; la pantalla se muestra igual.
    recargar().catch(() => undefined);
  }, [cargar, recargar]));

  const handleBuscar = async (texto: string) => {
    setQuery(texto);
    setAvisoInvitar(null);
    setErrorInvitar(null);
    if (!texto.trim()) { setResultados([]); return; }
    setBuscando(true);
    try {
      const encontrados = await buscarCandidatos(texto);
      const yaEnEquipo = new Set(colaboradores.map((c) => c.userId));
      setResultados(encontrados.filter((c) => !yaEnEquipo.has(c.id) && c.id !== user?.id));
    } catch (err: any) {
      Alert.alert('No se pudo buscar', err?.message ?? 'Error desconocido');
    } finally {
      setBuscando(false);
    }
  };

  const handleInvitar = async (candidatoId: string, role: EventRole) => {
    setBusy(true);
    try {
      await invitarColaborador(eventoId, candidatoId, role);
      setQuery('');
      setResultados([]);
      await cargar();
    } catch (err: any) {
      Alert.alert('No se pudo invitar', err?.message ?? 'Error desconocido');
    } finally {
      setBusy(false);
    }
  };

  const handleInvitarPorCorreo = async (role: RolInvitacion) => {
    setBusy(true);
    setAvisoInvitar(null);
    setErrorInvitar(null);
    try {
      const { emailError } = await invitarPorCorreo(query, role);
      setAvisoInvitar(
        emailError
          ? `Invitación creada, pero el correo no salió: ${emailError}`
          : 'Invitación mandada por correo'
      );
      setQuery('');
      setResultados([]);
    } catch (err: any) {
      const mensaje = err?.message ?? 'Error desconocido';
      setErrorInvitar(mensaje === 'no_autenticado' ? 'Tu sesión venció: vuelve a entrar.' : mensaje);
    } finally {
      setBusy(false);
    }
  };

  const handleRevocar = (invitacion: InvitacionPendiente) => {
    confirmar(
      {
        title: 'Revocar invitación',
        message: `¿Revocar la invitación a ${invitacion.email}?`,
        confirmText: 'Revocar',
        destructive: true,
      },
      async () => {
        setBusy(true);
        setErrorRevocar(null);
        try {
          await revocar(invitacion.id);
        } catch (err: any) {
          setErrorRevocar(err?.message ?? 'Error desconocido');
        } finally {
          setBusy(false);
        }
      }
    );
  };

  const handleToggleCanDelete = async (colaborador: Colaborador) => {
    setBusy(true);
    try {
      await cambiarPermisoBorrado(eventoId, colaborador.userId, !colaborador.canDelete);
      await cargar();
    } catch (err: any) {
      Alert.alert('No se pudo cambiar el permiso', err?.message ?? 'Error desconocido');
    } finally {
      setBusy(false);
    }
  };

  const handleQuitar = (colaborador: Colaborador) => {
    confirmar(
      {
        title: 'Quitar del equipo',
        message: `¿Quitar a ${colaborador.nombre ?? 'este colaborador'} del evento?`,
        confirmText: 'Quitar',
        destructive: true,
      },
      async () => {
        setBusy(true);
        try {
          await quitarColaborador(eventoId, colaborador.userId);
          await cargar();
        } catch (err: any) {
          Alert.alert('No se pudo quitar', err?.message ?? 'Error desconocido');
        } finally {
          setBusy(false);
        }
      }
    );
  };

  const handleTransferir = (colaborador: Colaborador) => {
    confirmar(
      {
        title: 'Transferir propiedad',
        message: `${colaborador.nombre ?? 'Este colaborador'} pasará a ser el dueño del evento. Tú quedas como administrador. ¿Continuar?`,
        confirmText: 'Transferir',
        destructive: true,
      },
      async () => {
        setBusy(true);
        try {
          await transferirPropiedad(eventoId, colaborador.userId);
          await cargar();
        } catch (err: any) {
          Alert.alert('No se pudo transferir', err?.message ?? 'Error desconocido');
        } finally {
          setBusy(false);
        }
      }
    );
  };

  if (cargando) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {evento && (
        <View style={styles.card}>
          <Text style={styles.tituloEvento}>{evento.artista}</Text>
          <Text style={styles.subtituloEvento}>{evento.venueName} · {evento.fecha}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.titulo}>Equipo</Text>
        {colaboradores.length === 0 && (
          <Text style={styles.vacio}>Sin colaboradores todavía.</Text>
        )}
        {colaboradores.map((c) => {
          const correo = emailsEquipo[c.userId] ?? null;
          return (
            <View key={c.userId} style={styles.filaColaborador}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombreColaborador}>
                  {c.nombre ?? correo ?? (c.userId === user?.id ? 'Tú' : SOURCE_LABEL[c.source])}
                </Text>
                {c.nombre && correo && <Text style={styles.correoColaborador}>{correo}</Text>}
                <Text style={styles.metaColaborador}>
                  {ROLE_LABEL[c.role]} · {SOURCE_LABEL[c.source]}
                  {c.role !== 'owner' && (c.canDelete ? ' · puede borrar' : '')}
                </Text>
              </View>
              {permisos.esOwner && c.role !== 'owner' && (
                <View style={styles.accionesColaborador}>
                  <TouchableOpacity
                    style={styles.botonChico}
                    onPress={() => handleToggleCanDelete(c)}
                    disabled={busy}
                  >
                    <Text style={styles.textoBotonChico}>
                      {c.canDelete ? 'Quitar borrado' : 'Dar borrado'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.botonChico}
                    onPress={() => handleTransferir(c)}
                    disabled={busy}
                  >
                    <Text style={styles.textoBotonChico}>Hacer dueño</Text>
                  </TouchableOpacity>
                </View>
              )}
              {permisos.puedeInvitar && c.role !== 'owner' && (
                <TouchableOpacity
                  style={styles.botonQuitar}
                  onPress={() => handleQuitar(c)}
                  disabled={busy}
                >
                  <Text style={styles.textoBotonQuitar}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {errorEmails && (
          <Text style={styles.pieTarjeta}>No se pudieron cargar los correos del equipo.</Text>
        )}
      </View>

      {permisos.puedeInvitar && (
        <View style={styles.card}>
          <Text style={styles.titulo}>Invitar</Text>
          <Text style={styles.ayuda}>
            Busca por nombre, o escribe un correo para invitar a alguien que todavía no tiene cuenta.
          </Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={handleBuscar}
            placeholder="Nombre o correo…"
            placeholderTextColor={colors.muted}
          />
          {buscando && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.sm }} />}
          {resultados.map((r) => (
            <View key={r.id} style={styles.filaResultado}>
              <Text style={styles.nombreColaborador}>{r.nombre}</Text>
              <View style={styles.accionesColaborador}>
                <TouchableOpacity
                  style={styles.botonChico}
                  onPress={() => handleInvitar(r.id, 'editor')}
                  disabled={busy}
                >
                  <Text style={styles.textoBotonChico}>+ Editor</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.botonChico}
                  onPress={() => handleInvitar(r.id, 'admin')}
                  disabled={busy}
                >
                  <Text style={styles.textoBotonChico}>+ Admin</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {!buscando && resultados.length === 0 && PARECE_CORREO.test(query) && (
            <View style={styles.filaResultado}>
              <Text style={[styles.nombreColaborador, { flex: 1 }]}>
                Invitar a {query.trim()} por correo
              </Text>
              <View style={styles.accionesColaborador}>
                <TouchableOpacity
                  style={styles.botonChico}
                  onPress={() => handleInvitarPorCorreo('editor')}
                  disabled={busy}
                >
                  <Text style={styles.textoBotonChico}>+ Editor</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.botonChico}
                  onPress={() => handleInvitarPorCorreo('admin')}
                  disabled={busy}
                >
                  <Text style={styles.textoBotonChico}>+ Admin</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {errorInvitar && <Text style={styles.textoError}>{errorInvitar}</Text>}
          {avisoInvitar && <Text style={styles.textoAviso}>{avisoInvitar}</Text>}
        </View>
      )}

      {permisos.puedeInvitar && pendientes.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.titulo}>Invitaciones pendientes</Text>
          {pendientes.map((p) => (
            <View key={p.id} style={styles.filaResultado}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombreColaborador}>{p.email}</Text>
                <Text style={styles.metaColaborador}>{ROLE_LABEL[p.role]}</Text>
              </View>
              <TouchableOpacity
                style={styles.botonChico}
                onPress={() => handleRevocar(p)}
                disabled={busy}
              >
                <Text style={styles.textoBotonChico}>Revocar</Text>
              </TouchableOpacity>
            </View>
          ))}
          {errorRevocar && <Text style={styles.textoError}>{errorRevocar}</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tituloEvento: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  subtituloEvento: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginBottom: spacing.md },
  vacio: { fontSize: fontSize.sm, color: colors.muted, fontStyle: 'italic' },
  ayuda: { fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing.sm },
  filaColaborador: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filaResultado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nombreColaborador: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  correoColaborador: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  metaColaborador: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  pieTarjeta: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm },
  textoError: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.sm },
  textoAviso: { fontSize: fontSize.sm, color: colors.success, marginTop: spacing.sm },
  accionesColaborador: { flexDirection: 'row', gap: 6 },
  botonChico: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    marginLeft: 6,
  },
  textoBotonChico: { color: colors.accent, fontWeight: '600', fontSize: fontSize.xs },
  botonQuitar: {
    marginLeft: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  textoBotonQuitar: { color: colors.muted, fontSize: fontSize.md, fontWeight: 'bold' },
  input: {
    backgroundColor: colors.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
