import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { ErrorApiWeb } from '../lib/apiWeb';
import { borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

interface Props {
  ticketId: string;
  cantidadEnCompra: number;
  enviadoAt: string | null;
  onReenviar: (ticketId: string) => Promise<string>;
}

type Estado = 'idle' | 'enviando' | 'error';

function textoError(codigo: string | null): string {
  if (codigo === 'sin_email') return 'Esa compra no tiene correo';
  if (codigo === 'no_autenticado') return 'Tu sesión venció: vuelve a entrar.';
  return 'No se pudo enviar';
}

// Spec 139 — hermano de app/(private)/eventos/[id]/entradas/BotonReenviar.js de la
// web. Nunca queda en un "Enviado" fijo: que el correo salió no quiere decir que
// llegó (spam, buzón lleno), y reenviar tiene que seguir disponible. El error va en
// la fila y no en Alert.alert: en web Alert.alert no hace nada.
export default function BotonReenviarEntrada({ ticketId, cantidadEnCompra, enviadoAt, onReenviar }: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [estado, setEstado] = useState<Estado>('idle');
  const [recienEnviado, setRecienEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const tocar = async () => {
    setEstado('enviando');
    setError(null);
    try {
      await onReenviar(ticketId);
      setEstado('idle');
      setRecienEnviado(true);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setRecienEnviado(false), 2500);
    } catch (e) {
      setRecienEnviado(false);
      setError(e instanceof ErrorApiWeb ? e.codigo : null);
      setEstado('error');
    }
  };

  const etiqueta =
    estado === 'enviando'
      ? 'Enviando…'
      : !enviadoAt
        ? 'Enviar correo'
        : cantidadEnCompra > 1
          ? `Reenviar las ${cantidadEnCompra}`
          : 'Reenviar correo';

  let linea: { texto: string; color: string };
  if (estado === 'error') {
    linea = { texto: textoError(error), color: colores.danger };
  } else if (recienEnviado) {
    linea = { texto: 'Enviado ahora', color: colores.success };
  } else if (!enviadoAt) {
    // Ámbar y no gris: alguien pagó y no tiene su entrada en el buzón.
    linea = { texto: 'Nunca se envió', color: colores.warning };
  } else {
    const fecha = new Date(enviadoAt).toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    linea = { texto: `Enviado ${fecha}`, color: colores.muted };
  }

  return (
    <View style={styles.contenedor}>
      <TouchableOpacity style={styles.boton} onPress={tocar} disabled={estado === 'enviando'}>
        <Text style={styles.texto}>{etiqueta}</Text>
      </TouchableOpacity>
      <Text style={[styles.linea, { color: linea.color }]}>{linea.texto}</Text>
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  contenedor: { alignItems: 'flex-end', marginTop: 6 },
  boton: {
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  texto: { color: c.accent, fontWeight: '600', fontSize: fontSize.xs },
  linea: { fontSize: fontSize.xs, marginTop: 2 },
});
