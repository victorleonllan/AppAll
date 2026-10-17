import { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { CampoFecha, CampoHora } from './CampoFecha';
import { colors, spacing, borderRadius, fontSize } from '../theme';

interface ModalSolicitudProps {
  visible: boolean;
  destino: string;                  // nombre que va en el título
  mensajeInicial: string;
  titulo?: string;                  // default 'Solicitar a'
  subtitulo?: string;
  mostrarFecha?: boolean;           // false para conectar entre músicos (W-060)
  onCancelar: () => void;
  onEnviar: (datos: { note: string | null; proposedAt: string | null }) => Promise<void>;
}

const SUBTITULO_DEFAULT = 'Le llega a su panel de Solicitudes, donde puede aceptar o rechazar.';

/**
 * AAAA-MM-DD + HH:MM → ISO, o `undefined` si el formato o la fecha no existe.
 * Hora local del teléfono: es la que la persona escribió. `new Date` acepta
 * 2026-02-31 y lo corre a marzo; comparar los campos de vuelta lo detecta.
 */
function armarFecha(fecha: string, hora: string): string | null | undefined {
  const f = fecha.trim();
  const h = hora.trim();
  if (!f && !h) return null;
  if (!f) return undefined;
  const mf = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  const mh = /^(\d{1,2}):(\d{2})$/.exec(h || '20:00');
  if (!mf || !mh) return undefined;
  const [anio, mes, dia] = [Number(mf[1]), Number(mf[2]), Number(mf[3])];
  const [hh, mm] = [Number(mh[1]), Number(mh[2])];
  if (hh > 23 || mm > 59) return undefined;
  const d = new Date(anio, mes - 1, dia, hh, mm);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return undefined;
  return d.toISOString();
}

// Spec 132 — equivalente a ModalSolicitud.js de la web. La fecha es opcional:
// el primer contacto no debe convertirse en una negociación. Spec 144 — en el
// teléfono se elige con el selector del sistema (`CampoFecha`), que deja el
// mismo texto AAAA-MM-DD / HH:MM; en web se sigue escribiendo, por eso el
// `Alert` de formato inválido se queda.
export default function ModalSolicitud({
  visible,
  destino,
  mensajeInicial,
  titulo = 'Solicitar a',
  subtitulo = SUBTITULO_DEFAULT,
  mostrarFecha = true,
  onCancelar,
  onEnviar,
}: ModalSolicitudProps) {
  const [mensaje, setMensaje] = useState(mensajeInicial);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hoy] = useState(() => new Date());

  // Cada apertura parte limpia, con el mensaje del destino actual.
  useEffect(() => {
    if (visible) {
      setMensaje(mensajeInicial);
      setFecha('');
      setHora('');
      setEnviando(false);
    }
  }, [visible, mensajeInicial]);

  const enviar = async () => {
    const proposedAt = mostrarFecha ? armarFecha(fecha, hora) : null;
    if (proposedAt === undefined) {
      Alert.alert('Revisa la fecha', 'Usa el formato AAAA-MM-DD y HH:MM.');
      return;
    }
    const note = mensaje.trim() || null;
    setEnviando(true);
    try {
      await onEnviar({ note, proposedAt });
    } catch {
      // Quien llama ya mostró la alerta; el modal queda abierto para reintentar.
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <KeyboardAvoidingView
        style={styles.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.centro} keyboardShouldPersistTaps="handled">
          <View style={styles.caja}>
            <Text style={styles.titulo}>{`${titulo} ${destino}`}</Text>
            <Text style={styles.subtitulo}>{subtitulo}</Text>

            <Text style={styles.label}>Mensaje</Text>
            <TextInput
              style={[styles.input, styles.inputMensaje]}
              value={mensaje}
              onChangeText={setMensaje}
              multiline
              textAlignVertical="top"
              editable={!enviando}
            />

            {mostrarFecha && (
              <>
                <Text style={styles.label}>Fecha propuesta (opcional)</Text>
                <View style={styles.filaFecha}>
                  <CampoFecha
                    style={styles.input}
                    value={fecha}
                    onChange={setFecha}
                    placeholder="AAAA-MM-DD"
                    minimo={hoy}
                    opcional
                    disabled={enviando}
                  />
                  <CampoHora
                    style={styles.input}
                    value={hora}
                    onChange={setHora}
                    placeholder="HH:MM"
                    opcional
                    disabled={enviando}
                  />
                </View>
              </>
            )}

            <View style={styles.botones}>
              <TouchableOpacity
                style={[styles.boton, styles.botonCancelar]}
                onPress={onCancelar}
                disabled={enviando}
              >
                <Text style={styles.textoCancelar}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.boton, styles.botonEnviar, enviando && styles.deshabilitado]}
                onPress={enviar}
                disabled={enviando}
              >
                {enviando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.textoEnviar}>Enviar solicitud</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  centro: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  caja: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  subtitulo: { fontSize: fontSize.sm, color: colors.secondary, marginTop: spacing.xs, marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    backgroundColor: colors.background,
  },
  inputMensaje: { minHeight: 90 },
  // Uno bajo el otro: en iOS el calendario se abre debajo del campo y en media
  // fila no cabe.
  filaFecha: { gap: spacing.sm },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  boton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    minWidth: 100,
    alignItems: 'center',
  },
  botonCancelar: { borderWidth: 1, borderColor: colors.border },
  botonEnviar: { backgroundColor: colors.accent },
  deshabilitado: { opacity: 0.6 },
  textoCancelar: { color: colors.secondary, fontWeight: '600' },
  textoEnviar: { color: colors.white, fontWeight: '600' },
});
