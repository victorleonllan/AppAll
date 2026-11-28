import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { invitarDuenoLocalDelEvento } from '../lib/invitacionLocal';
import { mensajeErrorInvitacion } from '../lib/invitacionesSonopolis';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

/**
 * Spec 199 (W-338) — el músico que registró el local (queda a su nombre como
 * placeholder) invita por correo a su dueño real. Mandar de nuevo al mismo correo
 * reenvía; a otro, reemplaza la invitación (lo decide la base).
 */
export default function InvitarLocalDelEvento({ venueId, nombre }: { venueId: string; nombre: string }) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [correo, setCorreo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);

  const enviar = async () => {
    const email = correo.trim();
    if (!email) return;
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await invitarDuenoLocalDelEvento({ venueId, email });
      setMensaje(
        r.emailError
          ? { texto: `La invitación quedó creada, pero el correo falló: ${r.emailError}`, ok: false }
          : { texto: `✓ Invitación enviada a ${email}`, ok: true }
      );
      setCorreo('');
    } catch (err) {
      setMensaje({ texto: mensajeErrorInvitacion(err), ok: false });
    } finally {
      setEnviando(false);
    }
  };

  const sinEnviar = enviando || !correo.trim();

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>Invita a {nombre} a Sonópolis</Text>
      <Text style={styles.texto}>
        Registraste este local tú. Con el correo de su dueño, el local pasa a su cuenta y queda como admin del evento.
      </Text>
      <TextInput
        style={styles.input}
        value={correo}
        onChangeText={setCorreo}
        placeholder={`Correo de ${nombre}`}
        accessibilityLabel={`Correo de ${nombre}`}
        placeholderTextColor={colores.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={[styles.boton, sinEnviar && styles.desactivado]}
        onPress={enviar}
        disabled={sinEnviar}
      >
        <Text style={styles.textoBoton}>{enviando ? 'Enviando…' : 'Enviar invitación'}</Text>
      </TouchableOpacity>
      {mensaje && <Text style={mensaje.ok ? styles.exito : styles.error}>{mensaje.texto}</Text>}
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
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  texto: { fontSize: fontSize.sm, color: c.secondary, marginTop: spacing.xs },
  input: {
    backgroundColor: c.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: c.primary,
    borderWidth: 1,
    borderColor: c.border,
    marginTop: spacing.sm,
  },
  boton: {
    backgroundColor: c.accent,
    padding: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  textoBoton: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.sm },
  desactivado: { opacity: 0.6 },
  exito: { fontSize: fontSize.sm, color: c.success, marginTop: spacing.xs },
  error: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.xs },
});
