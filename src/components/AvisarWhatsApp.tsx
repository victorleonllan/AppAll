import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import {
  useAvisoWhatsApp, SEGMENTOS_BROADCAST, SEGMENTO_BROADCAST_DEFAULT, SegmentoBroadcast,
} from '../hooks/useAvisoWhatsApp';
import type { TenantCrm } from '../hooks/useTenantCrm';
import { formatearFechaEs, separarFechaHora } from '../lib/fecha';
import { colors, spacing, borderRadius, fontSize } from '../theme';

interface Props {
  eventoId: string;
  tenant: TenantCrm;
}

const personas = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;

// Spec 156 — hermano de cartelera/[id]/BotonAvisarWhatsApp.js (W-054, W-108). La
// pantalla solo lo monta para el owner con el evento no cancelado: no se repite aquí.
export default function AvisarWhatsApp({ eventoId, tenant }: Props) {
  const aviso = useAvisoWhatsApp({ eventoId, tenant, habilitado: true });
  const [abierto, setAbierto] = useState(false);
  const [segmento, setSegmento] = useState<SegmentoBroadcast>(SEGMENTO_BROADCAST_DEFAULT);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ texto: string; tono: 'ok' | 'info' } | null>(null);

  // La app no vende Pro (spec 154): ni enlace ni botón, solo el aviso.
  if (!aviso.tienePro) {
    return <Text style={styles.sinPro}>Avisar por WhatsApp a tu público es parte de Sonópolis Pro.</Text>;
  }

  const textoResultado = resultado && (
    <Text style={resultado.tono === 'ok' ? styles.resultadoOk : styles.resultadoInfo}>{resultado.texto}</Text>
  );

  // La idempotencia es por evento, no por segmento (W-107).
  if (aviso.ultimoEnvioAt) {
    const fecha = formatearFechaEs(separarFechaHora(aviso.ultimoEnvioAt).fechaISO);
    return (
      <View style={styles.bloque}>
        <View style={[styles.botonGestion, styles.botonDeshabilitado]}>
          <Text style={styles.textoBotonGestion}>💬 Avisado el {fecha}</Text>
        </View>
        {textoResultado}
      </View>
    );
  }

  const conteo = (s: SegmentoBroadcast) => aviso.conteos?.[s] ?? 0;
  const n = conteo(segmento);

  const abrir = () => {
    setErrorModal(null);
    setResultado(null);
    setSegmento(SEGMENTO_BROADCAST_DEFAULT);
    setAbierto(true);
  };

  const enviar = async () => {
    setErrorModal(null);
    const r = await aviso.avisar(segmento);
    if (r.tipo === 'error') {
      setErrorModal(r.mensaje);
      return;
    }
    setAbierto(false);
    if (r.tipo === 'enviado') {
      setResultado({
        texto: r.recipientsCount > 0
          ? `Aviso mandado a ${personas(r.recipientsCount)}.`
          : 'Todavía nadie de ese grupo aceptó recibir WhatsApp.',
        tono: 'ok',
      });
    } else {
      // Kapso sin conectar (503): no es un error de quien usa la app, va en gris y
      // el botón queda disponible para cuando esté activo.
      setResultado({ texto: r.mensaje, tono: 'info' });
    }
  };

  return (
    <View style={styles.bloque}>
      <TouchableOpacity
        style={[styles.botonGestion, aviso.cargando && styles.botonDeshabilitado]}
        onPress={abrir}
        disabled={aviso.cargando}
      >
        <Text style={styles.textoBotonGestion}>💬 Avisar por WhatsApp</Text>
      </TouchableOpacity>
      {textoResultado}

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.titulo}>Avisar por WhatsApp</Text>
            <Text style={styles.subtitulo}>
              Se manda un WhatsApp con el aviso del evento. No se puede deshacer.
            </Text>

            {/* El envío se cobra por mensaje: el conteo se ve antes de confirmar (W-108).
                Un segmento en 0 se muestra igual, atenuado: también es información. */}
            {SEGMENTOS_BROADCAST.map((s) => {
              const c = conteo(s.value);
              const elegido = s.value === segmento;
              return (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.opcion, c === 0 && styles.opcionAtenuada]}
                  onPress={() => setSegmento(s.value)}
                  disabled={c === 0 || aviso.enviando}
                >
                  <View style={styles.radio}>{elegido && <View style={styles.radioLleno} />}</View>
                  <Text style={styles.opcionTexto}>{s.label}</Text>
                  <Text style={styles.opcionConteo}>{c}</Text>
                </TouchableOpacity>
              );
            })}

            {errorModal && <Text style={styles.error}>{errorModal}</Text>}

            <View style={styles.acciones}>
              <TouchableOpacity
                style={styles.botonSecundario}
                onPress={() => setAbierto(false)}
                disabled={aviso.enviando}
              >
                <Text style={styles.textoBotonGestion}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.botonPrimario, (n === 0 || aviso.enviando) && styles.botonPrimarioDeshabilitado]}
                onPress={enviar}
                disabled={n === 0 || aviso.enviando}
              >
                <Text style={styles.textoBotonPrimario}>
                  {aviso.enviando ? 'Enviando…' : `Enviar a ${personas(n)}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { marginTop: spacing.sm, gap: spacing.xs, alignItems: 'flex-start' },
  sinPro: { marginTop: spacing.sm, fontSize: fontSize.sm, color: colors.secondary },
  // Mismo estilo que botonGestion de DetalleEventoScreen.
  botonGestion: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
  },
  botonDeshabilitado: { opacity: 0.5 },
  textoBotonGestion: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  resultadoOk: { fontSize: fontSize.sm, color: colors.success },
  resultadoInfo: { fontSize: fontSize.sm, color: colors.secondary },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modal: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  subtitulo: { fontSize: fontSize.sm, color: colors.secondary, marginBottom: spacing.xs },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  opcionAtenuada: { opacity: 0.4 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioLleno: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  opcionTexto: { flex: 1, fontSize: fontSize.sm, color: colors.primary },
  opcionConteo: { fontSize: fontSize.sm, fontWeight: 'bold', color: colors.primary },
  error: { fontSize: fontSize.sm, color: colors.danger },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  botonSecundario: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.accentLight,
  },
  botonPrimario: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.accent,
  },
  botonPrimarioDeshabilitado: { backgroundColor: colors.muted },
  textoBotonPrimario: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.sm },
});
