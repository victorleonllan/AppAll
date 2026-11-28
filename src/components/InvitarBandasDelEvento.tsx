import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useBandasDelEvento } from '../hooks/useBandasDelEvento';
import {
  InvitacionSonopolis,
  cancelarInvitacionSonopolis,
  enviarInvitacionSonopolis,
  getMisInvitacionesSonopolis,
  mensajeErrorInvitacion,
} from '../lib/invitacionesSonopolis';
import type { Banda, Evento } from '../types';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

type Mensaje = { texto: string; ok: boolean };

/**
 * Spec 199 (W-306) — en la edición del evento, cada banda sin cuenta se invita a
 * Sonópolis con su correo. Una cuenta se muestra como «En Sonópolis» (W-349).
 *
 * `sonopolis_invites` solo deja ver las invitaciones propias: si otra persona del
 * equipo ya invitó a una banda, la fila ofrece el campo de correo.
 */
export default function InvitarBandasDelEvento({ evento }: { evento: Evento }) {
  const styles = useEstilos(crearEstilos);
  const { bandas } = useBandasDelEvento(evento);
  const [invitaciones, setInvitaciones] = useState<InvitacionSonopolis[]>([]);
  // Solo la última lectura escribe el estado: dos filas pueden recargar a la vez.
  const lectura = useRef(0);

  const cargar = useCallback(async () => {
    const turno = ++lectura.current;
    let leidas: InvitacionSonopolis[] = [];
    try {
      leidas = await getMisInvitacionesSonopolis({ eventId: evento.id });
    } catch (err) {
      console.error(`[evento ${evento.id}] no se pudieron leer las invitaciones:`, err);
    }
    if (turno === lectura.current) setInvitaciones(leidas);
  }, [evento.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!bandas || bandas.length === 0) return null;
  const haySueltas = bandas.some((b) => b.tipo === 'ficha');

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>Invita a las bandas a Sonópolis</Text>
      <Text style={styles.texto}>
        {haySueltas
          ? 'Con su perfil, cada banda suma a su propia base los correos de quienes compren entradas de este show (y de los que vengan).'
          : 'Todas las bandas de este evento ya tienen perfil en Sonópolis.'}
      </Text>
      {bandas.map((b) => (
        <FilaBanda
          key={`${b.tipo}:${b.id}`}
          banda={b}
          eventId={evento.id}
          invitacion={invitaciones.find((i) => i.artistId === b.id && i.estado === 'pending')}
          onCambio={cargar}
        />
      ))}
    </View>
  );
}

function FilaBanda({
  banda, eventId, invitacion, onCambio,
}: {
  banda: Banda;
  eventId: string;
  invitacion: InvitacionSonopolis | undefined;
  onCambio: () => Promise<void>;
}) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [correo, setCorreo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  const enviar = async (email: string) => {
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await enviarInvitacionSonopolis({ email, artistId: banda.id, eventId });
      setMensaje(
        r.emailError
          ? { texto: `La invitación quedó creada, pero el correo falló: ${r.emailError}`, ok: false }
          : { texto: `Invitación enviada a ${email}`, ok: true }
      );
      await onCambio();
      setCorreo('');
      setCambiando(false);
    } catch (err) {
      setMensaje({ texto: mensajeErrorInvitacion(err), ok: false });
      await onCambio();
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async (token: string) => {
    setEnviando(true);
    setMensaje(null);
    try {
      await cancelarInvitacionSonopolis(token);
      setMensaje({ texto: 'Invitación cancelada', ok: true });
    } catch (err) {
      setMensaje({ texto: mensajeErrorInvitacion(err), ok: false });
    } finally {
      await onCambio();
      setEnviando(false);
    }
  };

  const resultado = mensaje ? (
    <Text style={mensaje.ok ? styles.exito : styles.error}>{mensaje.texto}</Text>
  ) : null;

  if (banda.tipo === 'cuenta') {
    return (
      <View style={[styles.fila, styles.filaCuenta]}>
        <Text style={styles.nombre}>{banda.nombre}</Text>
        <Text style={styles.enSonopolis}>✓ En Sonópolis</Text>
      </View>
    );
  }

  if (invitacion && !cambiando) {
    return (
      <View style={styles.fila}>
        <Text style={styles.nombre}>{banda.nombre}</Text>
        <Text style={styles.invitada}>
          Invitada: {invitacion.correo}
          {invitacion.enviadaAt ? '' : ' (correo sin enviar)'}
        </Text>
        <View style={styles.acciones}>
          <TouchableOpacity onPress={() => enviar(invitacion.correo)} disabled={enviando}>
            <Text style={[styles.accion, enviando && styles.desactivado]}>Reenviar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setMensaje(null); setCambiando(true); }} disabled={enviando}>
            <Text style={[styles.accion, enviando && styles.desactivado]}>Cambiar correo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => cancelar(invitacion.token)} disabled={enviando}>
            <Text style={[styles.accion, enviando && styles.desactivado]}>Cancelar</Text>
          </TouchableOpacity>
        </View>
        {resultado}
      </View>
    );
  }

  const sinEnviar = enviando || !correo.trim();
  return (
    <View style={styles.fila}>
      <Text style={styles.nombre}>{banda.nombre}</Text>
      <TextInput
        style={styles.input}
        value={correo}
        onChangeText={setCorreo}
        placeholder={`Correo de ${banda.nombre}`}
        accessibilityLabel={`Correo de ${banda.nombre}`}
        placeholderTextColor={colores.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={[styles.boton, sinEnviar && styles.desactivado]}
        onPress={() => enviar(correo.trim())}
        disabled={sinEnviar}
      >
        <Text style={styles.textoBoton}>{enviando ? 'Enviando…' : 'Enviar invitación'}</Text>
      </TouchableOpacity>
      {resultado}
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
  fila: { marginTop: spacing.md },
  filaCuenta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  nombre: { fontSize: fontSize.md, fontWeight: '600', color: c.primary, flexShrink: 1 },
  enSonopolis: { fontSize: fontSize.sm, color: c.success, fontWeight: '600' },
  invitada: { fontSize: fontSize.sm, color: c.secondary, marginTop: 2 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  accion: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600' },
  input: {
    backgroundColor: c.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: c.primary,
    borderWidth: 1,
    borderColor: c.border,
    marginTop: spacing.xs,
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
