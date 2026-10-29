// Spec 155 — «Escribir a tu público»: elegir la lista, escribir y ver el texto del
// correo antes de mandarlo. Hermano de `components/RedactarCorreo.js` de la web (W-200).
//
// La vista previa es de texto, no el HTML real: la plantilla vive en la web
// (`libs/emails/correoCrm.js`) y mostrar HTML pediría `react-native-webview`. El correo
// lleva una parte de texto armada con las mismas piezas, así que lo que se ve acá es
// lo que dice el correo; solo faltan el logo, los colores y la tipografía.
//
// Solo se monta con Pro: sin Pro `/api/crm/correo` responde 402.

import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useCorreoCrm, MAX_ASUNTO_CORREO, MAX_CUERPO_CORREO, MOTIVOS_CORREO } from '../hooks/useCorreoCrm';
import type { SegmentoCorreo } from '../hooks/useCorreoCrm';
import type { TipoTenant } from '../hooks/useTenantCrm';
import { confirmar } from '../lib/confirm';
import { formatearFechaEs, separarFechaHora } from '../lib/fecha';
import { colors, spacing, borderRadius, fontSize } from '../theme';

interface Props {
  tipo: TipoTenant;
  nombreTenant: string;
}

const LISTAS: { value: SegmentoCorreo; label: string }[] = [
  { value: 'compradores', label: 'Compradores' },
  { value: 'seguidores', label: 'Seguidores' },
  { value: 'ambos', label: 'Ambos' },
];

function personas(n: number): string {
  return `${n} persona${n === 1 ? '' : 's'}`;
}

/** Fecha y hora locales sin `toLocaleString` (Hermes, spec 148). */
function fechaYHora(iso: string): { fecha: string; hora: string } {
  const { fechaISO, horaISO } = separarFechaHora(iso);
  return { fecha: fechaISO ? formatearFechaEs(fechaISO) : '', hora: horaISO };
}

export default function RedactarCorreo({ tipo, nombreTenant }: Props) {
  const { estado, cargando, error, enviando, enviar } = useCorreoCrm(tipo);
  const [lista, setLista] = useState<SegmentoCorreo | null>(null);
  const [asunto, setAsunto] = useState(`Gracias por estar, de parte de ${nombreTenant}`);
  const [cuerpo, setCuerpo] = useState(
    '¡Gracias por venir! Fue increíble tocar para ustedes.\n\nSi quieres enterarte del próximo show, síguenos en Sonópolis.'
  );
  const [pestana, setPestana] = useState<'escribir' | 'vista'>('escribir');
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  // La lista inicial, como la web: ambos si hay de los dos, si no la que tenga gente.
  const conteosCargados = estado?.conteos;
  useEffect(() => {
    if (!conteosCargados || lista !== null) return;
    const { compradores, seguidores } = conteosCargados;
    setLista(compradores && seguidores ? 'ambos' : compradores ? 'compradores' : seguidores ? 'seguidores' : 'ambos');
  }, [conteosCargados, lista]);

  const conteos = estado?.conteos ?? { compradores: 0, seguidores: 0 };
  const cuantos = (v: SegmentoCorreo) =>
    v === 'ambos' ? conteos.compradores + conteos.seguidores : conteos[v] ?? 0;
  const destinatarios = lista ? cuantos(lista) : 0;
  const etiquetaLista = LISTAS.find((l) => l.value === lista)?.label.toLowerCase() ?? '';
  // «Ambos» lleva el motivo de compradores, como la web: es el primero de la lista.
  const motivo = (lista === 'seguidores' ? MOTIVOS_CORREO.seguidores : MOTIVOS_CORREO.compradores)(nombreTenant);
  const parrafos = cuerpo
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim());

  const proximoEnvio = estado?.proximoEnvio ?? null;
  const ultimoEnvio = estado?.ultimoEnvio ?? null;
  const puedeEnviar =
    !cargando && !error && lista !== null && destinatarios > 0 && Boolean(asunto.trim()) &&
    Boolean(cuerpo.trim()) && !proximoEnvio && !enviando;

  const alEnviar = () => {
    if (!puedeEnviar || !lista) return;
    confirmar(
      {
        title: '¿Mandar este correo?',
        message: `Vas a mandar «${asunto}» a ${personas(destinatarios)} (${etiquetaLista}). No se puede deshacer.`,
        confirmText: 'Mandar',
      },
      async () => {
        setResultado(null);
        const r = await enviar({ segmento: lista, asunto, cuerpo });
        setResultado(
          r.ok ? { ok: true, texto: `Correo enviado a ${personas(r.enviados)}.` } : { ok: false, texto: r.mensaje }
        );
      }
    );
  };

  let lineaEstado = 'Puedes mandar un correo cada 24 horas.';
  if (proximoEnvio) {
    const { fecha, hora } = fechaYHora(proximoEnvio);
    lineaEstado = `Puedes volver a escribir el ${fecha} a las ${hora}. Un correo cada 24 horas cuida que tus correos no terminen en spam.`;
  } else if (ultimoEnvio) {
    const { fecha } = fechaYHora(ultimoEnvio.createdAt);
    lineaEstado = `Último envío: ${fecha}, a ${ultimoEnvio.destinatarios} personas.`;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>✉️ Escribir a tu público</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.etiqueta}>¿A quién le escribes?</Text>
      <View style={styles.filaChips}>
        {LISTAS.map((l) => {
          const n = cuantos(l.value);
          const deshabilitado = !cargando && n === 0;
          const elegido = lista === l.value;
          return (
            <TouchableOpacity
              key={l.value}
              style={[styles.chip, elegido && styles.chipElegido, deshabilitado && styles.chipDeshabilitado]}
              onPress={() => setLista(l.value)}
              disabled={cargando || deshabilitado}
            >
              <Text style={[styles.chipTexto, elegido && styles.chipTextoElegido]}>
                {l.label} · {cargando ? '…' : n}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.pestanas}>
        <TouchableOpacity
          style={[styles.pestana, pestana === 'escribir' && styles.pestanaActiva]}
          onPress={() => setPestana('escribir')}
        >
          <Text style={[styles.pestanaTexto, pestana === 'escribir' && styles.pestanaTextoActivo]}>Escribir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pestana, pestana === 'vista' && styles.pestanaActiva]}
          onPress={() => setPestana('vista')}
        >
          <Text style={[styles.pestanaTexto, pestana === 'vista' && styles.pestanaTextoActivo]}>Vista previa</Text>
        </TouchableOpacity>
      </View>

      {pestana === 'escribir' ? (
        <View>
          <Text style={styles.etiqueta}>Asunto</Text>
          <TextInput
            style={styles.input}
            value={asunto}
            onChangeText={setAsunto}
            maxLength={MAX_ASUNTO_CORREO}
          />
          <View style={styles.filaMensaje}>
            <Text style={styles.etiqueta}>Mensaje</Text>
            <Text style={styles.contador}>
              {cuerpo.length}/{MAX_CUERPO_CORREO}
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.inputMensaje]}
            value={cuerpo}
            onChangeText={setCuerpo}
            maxLength={MAX_CUERPO_CORREO}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.ayuda}>
            Una línea en blanco separa párrafos. La firma de Sonópolis y el link para darse de baja se agregan solos.
          </Text>
        </View>
      ) : (
        <View>
          <Text style={styles.cabecera}>De: {nombreTenant} vía Sonópolis</Text>
          <Text style={styles.cabecera}>Asunto: {asunto || '(sin asunto)'}</Text>
          <Text style={styles.cabecera}>
            Para: {personas(destinatarios)} ({etiquetaLista})
          </Text>
          <View style={styles.vista}>
            <Text style={styles.vistaNombre}>{nombreTenant.toUpperCase()}</Text>
            <Text style={styles.vistaAsunto}>{asunto || '(sin asunto)'}</Text>
            {parrafos.map((p, i) => (
              <Text key={i} style={styles.vistaParrafo}>
                {p.trim()}
              </Text>
            ))}
            <View style={styles.separador} />
            <Text style={styles.vistaFirma}>Sonópolis · Música en vivo, cerca de ti</Text>
            <Text style={styles.vistaPie}>
              Te escribe {nombreTenant} a través de Sonópolis porque {motivo}. Darte de baja
            </Text>
          </View>
          <Text style={styles.ayuda}>
            Así se lee el texto del correo. El correo que llega lleva además el logo y los colores de Sonópolis.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.botonEnviar, !puedeEnviar && styles.botonDeshabilitado]}
        onPress={alEnviar}
        disabled={!puedeEnviar}
      >
        <Text style={styles.botonEnviarTexto}>{enviando ? 'Enviando…' : `Enviar a ${personas(destinatarios)}`}</Text>
      </TouchableOpacity>
      {resultado && <Text style={resultado.ok ? styles.exito : styles.error}>{resultado.texto}</Text>}
      <Text style={styles.ayuda}>{lineaEstado}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary, marginBottom: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.xs },
  exito: { color: colors.success, fontSize: fontSize.sm, marginTop: spacing.sm },
  etiqueta: { fontSize: fontSize.sm, fontWeight: 'bold', color: colors.secondary, marginTop: spacing.sm },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.cardBackground,
  },
  chipElegido: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipDeshabilitado: { opacity: 0.4 },
  chipTexto: { fontSize: fontSize.sm, color: colors.secondary },
  chipTextoElegido: { color: colors.white, fontWeight: 'bold' },
  pestanas: { flexDirection: 'row', marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  pestana: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  pestanaActiva: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  pestanaTexto: { fontSize: fontSize.sm, color: colors.muted },
  pestanaTextoActivo: { color: colors.accent, fontWeight: 'bold' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.primary,
    backgroundColor: colors.cardBackground,
    marginTop: spacing.xs,
  },
  inputMensaje: { minHeight: 180 },
  filaMensaje: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  contador: { fontSize: fontSize.xs, color: colors.muted },
  ayuda: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.sm },
  cabecera: { fontSize: fontSize.sm, color: colors.secondary, marginTop: spacing.xs },
  vista: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  vistaNombre: { fontSize: fontSize.xs, color: colors.muted, letterSpacing: 1 },
  vistaAsunto: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary, marginTop: spacing.xs },
  vistaParrafo: { fontSize: fontSize.sm, color: colors.primary, marginTop: spacing.sm },
  separador: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  vistaFirma: { fontSize: fontSize.sm, color: colors.secondary },
  vistaPie: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.sm },
  botonEnviar: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  botonDeshabilitado: { opacity: 0.5 },
  botonEnviarTexto: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.sm },
});
