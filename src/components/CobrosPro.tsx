// Spec 170 — los cobros de Pro de un tenant en la ficha del admin: por suscripción, una
// línea con cómo está y cada cobro de Mercado Pago con fecha, monto, medio y qué pasó.
// Port de `app/(private)/admin/crm/CobrosPro.js` de la web (W-271) sin su `Seccion`: la
// pantalla lo envuelve y resuelve cargando, error y vacío. Las traducciones viven en
// `src/lib/cobrosPro.ts` (spec 168).

import { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import {
  diagnosticoCobro,
  fechaCobro,
  medioDePago,
  resumenSuscripcion,
  type SuscripcionConCobros,
  type TonoCobro,
} from '../lib/cobrosPro';
import { formatearMonto } from '../lib/precio';
import { useEstilos } from '../hooks/useEstilos';
import { spacing, borderRadius, fontSize, type Paleta } from '../theme';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Insignia con el tono del diagnóstico. El texto largo salta de línea (Decisión 4). */
function Insignia({ texto, tono }: { texto: string; tono: TonoCobro }) {
  const styles = useEstilos(crearEstilos);
  const fondo = tono === 'success' ? styles.insigniaSuccess : tono === 'danger' ? styles.insigniaDanger : styles.insigniaNeutral;
  const color =
    tono === 'success' ? styles.insigniaTextoSuccess : tono === 'danger' ? styles.insigniaTextoDanger : styles.insigniaTextoNeutral;
  return (
    <View style={[styles.insignia, fondo]}>
      <Text style={[styles.insigniaTexto, color]}>{texto}</Text>
    </View>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.filaDato}>
      <Text style={styles.datoEtiqueta} selectable>
        {k}
      </Text>
      <Text style={styles.datoValor} selectable>
        {v}
      </Text>
    </View>
  );
}

// Lo que se le pasa a soporte de Mercado Pago o a quien revise el webhook. Cerrado al
// abrir la ficha (Decisión 3: React Native no tiene `<details>`).
function DatosMP({ s }: { s: SuscripcionConCobros }) {
  const styles = useEstilos(crearEstilos);
  const [abierto, setAbierto] = useState(false);
  return (
    <View style={styles.datosMP}>
      <TouchableOpacity onPress={() => setAbierto((a) => !a)} accessibilityRole="button">
        <Text style={styles.datosMPTitulo}>Datos de Mercado Pago {abierto ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {abierto && (
        <View style={styles.datosMPLista}>
          {s.cobros.map((c) => (
            <Fila key={`op-${c.id}`} k={`Operación ${c.id}`} v={`${c.status ?? '—'} · ${c.status_detail ?? '—'}`} />
          ))}
          {s.suscripciones_mp.length ? (
            s.suscripciones_mp.map((x) => (
              <Fila key={`mp-${x.id}`} k={`Suscripción ${x.id}`} v={`${x.status ?? '—'} · ${fechaCobro(x.last_modified)}`} />
            ))
          ) : (
            <Fila k="Suscripción en MP" v="ninguna" />
          )}
          {s.pagos_sonopolis.length ? (
            s.pagos_sonopolis.map((p) => (
              <Fila
                key={`pp-${p.mp_pago_id}`}
                k={`pro_pagos ${p.mp_pago_id}`}
                v={`${fechaCobro(p.pagado_at)} → Pro hasta ${fechaCobro(p.hasta_despues)}`}
              />
            ))
          ) : (
            <Fila k="pro_pagos" v="ninguno" />
          )}
          <Fila k="Plan" v={s.mp_plan_id ?? '—'} />
        </View>
      )}
    </View>
  );
}

function TarjetaSuscripcion({ s }: { s: SuscripcionConCobros }) {
  const styles = useEstilos(crearEstilos);
  const resumen = resumenSuscripcion(s);
  return (
    <View style={styles.tarjeta}>
      <Text style={styles.cabecera}>
        <Text style={styles.codigo}>{s.codigo}</Text> · creada el {fechaCobro(s.created_at)}
      </Text>
      <Insignia texto={resumen.texto} tono={resumen.tone} />

      {s.cobros.map((c, i) => {
        const d = diagnosticoCobro(c);
        return (
          <View key={c.id} style={[styles.cobro, i === 0 && styles.cobroPrimero]}>
            <View style={styles.cobroArriba}>
              <Text style={styles.negrita}>{fechaCobro(c.date_approved ?? c.date_created)}</Text>
              <Insignia texto={d.texto} tono={d.tone} />
            </View>
            <Text style={styles.texto}>
              <Text style={styles.negrita}>{formatearMonto(c.transaction_amount, c.currency_id)}</Text> · {medioDePago(c)}
            </Text>
            <Text style={styles.detalle}>{d.detalle}</Text>
          </View>
        );
      })}

      <DatosMP s={s} />
    </View>
  );
}

export default function CobrosPro({ suscripciones }: { suscripciones: SuscripcionConCobros[] }) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.lista}>
      {suscripciones.map((s) => (
        <TarjetaSuscripcion key={s.id} s={s} />
      ))}
    </View>
  );
}

const crearEstilos = (c: Paleta) =>
  StyleSheet.create({
    lista: { gap: spacing.sm },
    tarjeta: {
      backgroundColor: c.cardBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cabecera: { fontSize: fontSize.sm, color: c.primary, flexShrink: 1 },
    codigo: { fontWeight: '700', fontFamily: MONO },
    negrita: { fontSize: fontSize.sm, fontWeight: '700', color: c.primary },
    texto: { fontSize: fontSize.sm, color: c.primary, flexShrink: 1 },
    detalle: { fontSize: fontSize.sm, color: c.secondary, flexShrink: 1 },
    cobro: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm, gap: 2 },
    cobroPrimero: { marginTop: spacing.xs },
    cobroArriba: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
    insignia: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    insigniaSuccess: { backgroundColor: c.successBg },
    insigniaDanger: { backgroundColor: c.dangerBg },
    insigniaNeutral: { backgroundColor: c.border },
    insigniaTexto: { fontSize: fontSize.xs, fontWeight: '600', flexShrink: 1 },
    insigniaTextoSuccess: { color: c.success },
    insigniaTextoDanger: { color: c.danger },
    insigniaTextoNeutral: { color: c.muted },
    datosMP: { marginTop: spacing.xs },
    datosMPTitulo: { fontSize: fontSize.sm, fontWeight: '600', color: c.accent },
    datosMPLista: { marginTop: spacing.xs, gap: spacing.xs },
    filaDato: { gap: 1 },
    datoEtiqueta: { fontSize: fontSize.xs, color: c.secondary, fontFamily: MONO },
    datoValor: { fontSize: fontSize.xs, color: c.primary, fontFamily: MONO },
  });
