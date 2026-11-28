import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  ESTADO_INVITACION,
  InvitacionSonopolis,
  cancelarInvitacionSonopolis,
  enviarInvitacionSonopolis,
  getMisInvitacionesSonopolis,
  mensajeErrorInvitacion,
} from '../lib/invitacionesSonopolis';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

/**
 * Spec 199 (W-306) — «Enviar invitación a Sonópolis» en el panel del local: invita
 * a una banda por correo sin pasar por un evento. Abajo, las invitaciones propias.
 */
export default function BotonInvitarASonopolis() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);
  const [lista, setLista] = useState<InvitacionSonopolis[]>([]);
  // Solo la última lectura escribe el estado.
  const lectura = useRef(0);

  const cargar = useCallback(async () => {
    const turno = ++lectura.current;
    let leidas: InvitacionSonopolis[] = [];
    try {
      leidas = await getMisInvitacionesSonopolis({ limite: 20 });
    } catch (err) {
      console.error('[BotonInvitarASonopolis] no se pudieron leer las invitaciones:', err);
    }
    if (turno === lectura.current) setLista(leidas);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = () => {
    setAviso(null);
    setError(null);
    setAbierto(true);
  };
  const cerrar = () => setAbierto(false);

  const enviar = async () => {
    const email = correo.trim();
    setEnviando(true);
    setError(null);
    try {
      const r = await enviarInvitacionSonopolis({ email, nombre: nombre.trim() });
      setNombre('');
      setCorreo('');
      setAbierto(false);
      setAviso(
        r.emailError
          ? { texto: `La invitación quedó creada, pero el correo falló: ${r.emailError}`, ok: false }
          : { texto: `Invitación enviada a ${email}`, ok: true }
      );
    } catch (err) {
      setError(mensajeErrorInvitacion(err));
    } finally {
      await cargar();
      setEnviando(false);
    }
  };

  const cancelar = async (token: string) => {
    setCancelando(token);
    setError(null);
    try {
      await cancelarInvitacionSonopolis(token);
    } catch (err) {
      setError(mensajeErrorInvitacion(err));
    } finally {
      await cargar();
      setCancelando(null);
    }
  };

  const sinEnviar = enviando || !nombre.trim() || !correo.trim();

  return (
    <View style={styles.contenedor}>
      <TouchableOpacity style={styles.disparador} onPress={abrir}>
        <Text style={styles.textoDisparador}>Enviar invitación a Sonópolis</Text>
      </TouchableOpacity>
      {aviso && <Text style={aviso.ok ? styles.exito : styles.error}>{aviso.texto}</Text>}

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={cerrar}>
        <KeyboardAvoidingView
          style={styles.fondo}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.centro} keyboardShouldPersistTaps="handled">
            <View style={styles.caja}>
              <Text style={styles.titulo}>Invitar a una banda a Sonópolis</Text>
              <Text style={styles.texto}>
                Le llega un correo para crear el perfil de su banda. Con su perfil podrás sumarla a tus eventos, y
                cada uno suma a su base a quienes compren entradas de los shows que hagan juntos.
              </Text>
              <TextInput
                style={styles.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre de la banda"
                accessibilityLabel="Nombre de la banda"
                placeholderTextColor={colores.muted}
                maxLength={120}
              />
              <TextInput
                style={styles.input}
                value={correo}
                onChangeText={setCorreo}
                placeholder="Correo de la banda"
                accessibilityLabel="Correo de la banda"
                placeholderTextColor={colores.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {error && <Text style={styles.error}>{error}</Text>}

              <View style={styles.botones}>
                <TouchableOpacity style={styles.botonCerrar} onPress={cerrar}>
                  <Text style={styles.textoDisparador}>Cerrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.botonEnviar, sinEnviar && styles.desactivado]}
                  onPress={enviar}
                  disabled={sinEnviar}
                >
                  <Text style={styles.textoEnviar}>{enviando ? 'Enviando…' : 'Enviar invitación'}</Text>
                </TouchableOpacity>
              </View>

              {lista.length > 0 && (
                <View style={styles.seccion}>
                  <Text style={styles.subtitulo}>Tus invitaciones</Text>
                  <ScrollView style={styles.lista} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {lista.map((i) => (
                      <View key={i.token} style={styles.fila}>
                        <Text style={styles.datos} numberOfLines={1}>
                          <Text style={styles.datosNombre}>{i.nombre}</Text> · {i.correo}
                        </Text>
                        <Text style={styles.estado}>{ESTADO_INVITACION[i.estado] ?? i.estado}</Text>
                        {i.estado === 'pending' && (
                          <TouchableOpacity onPress={() => cancelar(i.token)} disabled={cancelando !== null}>
                            <Text style={[styles.accion, cancelando !== null && styles.desactivado]}>
                              Cancelar
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  contenedor: { marginHorizontal: spacing.md, marginTop: spacing.sm },
  disparador: {
    backgroundColor: c.accentLight,
    padding: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoDisparador: { color: c.secondary, fontWeight: 'bold', fontSize: fontSize.sm },
  // Mismo fondo que `ModalSolicitud` y `AvisarWhatsApp`.
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  centro: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  caja: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: c.primary },
  texto: { fontSize: fontSize.sm, color: c.secondary, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: c.primary,
    backgroundColor: c.background,
    marginTop: spacing.sm,
  },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  botonCerrar: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: c.accentLight,
  },
  botonEnviar: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: c.accent,
  },
  textoEnviar: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.sm },
  desactivado: { opacity: 0.6 },
  seccion: { marginTop: spacing.lg },
  subtitulo: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary, marginBottom: spacing.xs },
  lista: { maxHeight: 220 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  datos: { flex: 1, fontSize: fontSize.sm, color: c.primary },
  datosNombre: { fontWeight: 'bold' },
  estado: { fontSize: fontSize.xs, color: c.secondary },
  accion: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600' },
  exito: { fontSize: fontSize.sm, color: c.success, marginTop: spacing.xs },
  error: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.xs },
});
