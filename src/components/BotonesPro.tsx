// Spec 159 — Sonópolis Pro a mano desde el admin de la app. Port de `BotonesPro.js` y
// de `EtiquetaPro` (`piezas.js`) de la web (W-212, W-243). Solo se dibuja dentro de
// Administración, y el RPC vuelve a comprobar que sea admin (`es_admin_sonopolis()`).

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { darPro, darProSinVencimiento, PLAZOS_PRO, PRO_PRECIO_USD, type TipoTenant } from '../lib/adminPro';
import { esPro, esProSinVencimiento } from '../lib/pro';
import { confirmar } from '../lib/confirm';
import { colors, spacing, borderRadius, fontSize } from '../theme';

// Abreviaturas de `Intl` es-CL («31 oct», «5 sept»).
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** «31 oct» en la hora del dispositivo. A mano y sin `Intl`, por la misma razón que
 * `formatearMonto` (`src/lib/precio.ts`): el soporte de locales de Hermes no está
 * garantizado en todos los builds. */
export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

/** «Pro hasta 31 oct», «Pro sin vencimiento» (W-243) o «Sin Pro». Un Pro vencido
 * cuenta como sin Pro: el gate es la fecha. */
export function EtiquetaPro({ proHasta }: { proHasta: string | null }) {
  const conPro = { sonopolisProHasta: proHasta };
  if (!esPro(conPro)) {
    return (
      <View style={[styles.insignia, styles.insigniaGris]}>
        <Text style={[styles.insigniaTexto, styles.insigniaTextoGris]}>Sin Pro</Text>
      </View>
    );
  }
  return (
    <View style={[styles.insignia, styles.insigniaVerde]}>
      <Text style={[styles.insigniaTexto, styles.insigniaTextoVerde]}>
        {esProSinVencimiento(conPro) ? 'Pro sin vencimiento' : `Pro hasta ${fechaCorta(proHasta!)}`}
      </Text>
    </View>
  );
}

interface Props {
  tipo: TipoTenant;
  id: string;
  nombre: string;
  proHasta: string | null;
  compacto?: boolean;
  onCambio: () => void;
}

const meses = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`;

/** Con Pro sin vencimiento no se ofrece sumar meses: solo «Quitar Pro» (W-243). */
export default function BotonesPro({ tipo, id, nombre, proHasta, compacto = false, onCambio }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const conPro = esPro({ sonopolisProHasta: proHasta });
  const sinVencimiento = esProSinVencimiento({ sonopolisProHasta: proHasta });

  /** `dias` null es «Sin vencimiento»; 0 apaga Pro. */
  const cambiar = (dias: number | null, pregunta: string, ok: string, destructivo = false) => {
    confirmar({ title: pregunta, destructive: destructivo }, async () => {
      setOcupado(true);
      setResultado(null);
      try {
        if (dias === null) await darProSinVencimiento(tipo, id);
        else await darPro(tipo, id, dias);
        setResultado({ ok: true, texto: ok });
        onCambio();
      } catch (e: any) {
        setResultado({ ok: false, texto: e?.message ?? 'No se pudo cambiar Pro' });
      } finally {
        setOcupado(false);
      }
    });
  };

  const boton = [styles.boton, compacto && styles.botonCompacto, ocupado && styles.deshabilitado];
  const texto = [styles.botonTexto, compacto && styles.botonTextoCompacto];

  return (
    <View>
      <View style={styles.fila}>
        {!sinVencimiento &&
          PLAZOS_PRO.map(({ meses: n, dias }) => (
            <TouchableOpacity
              key={n}
              style={[...boton, !conPro && styles.botonAcento]}
              disabled={ocupado}
              onPress={() =>
                cambiar(
                  dias,
                  `¿${conPro ? 'Sumar' : 'Activar'} Pro ${meses(n)} a ${nombre}? Son US$${PRO_PRECIO_USD * n}.`,
                  `Pro ${conPro ? 'extendido' : 'activado'}: ${nombre}`
                )
              }
            >
              <Text style={[...texto, !conPro && styles.botonTextoAcento]}>
                {conPro ? `+${meses(n)}` : `Activar ${meses(n)}`}
              </Text>
            </TouchableOpacity>
          ))}
        {!sinVencimiento && (
          <TouchableOpacity
            style={[...boton, styles.botonFantasma]}
            disabled={ocupado}
            onPress={() =>
              cambiar(
                null,
                `¿Activar Pro sin vencimiento y sin costo a ${nombre}? Queda activo hasta que lo quites.`,
                `Pro sin vencimiento: ${nombre}`
              )
            }
          >
            <Text style={texto}>Sin vencimiento</Text>
          </TouchableOpacity>
        )}
        {conPro && (
          <TouchableOpacity
            style={[...boton, styles.botonFantasma]}
            disabled={ocupado}
            onPress={() =>
              cambiar(
                0,
                `¿Quitar Pro a ${nombre}? Pierde el acceso a su lista de contactos al instante.`,
                `Pro quitado: ${nombre}`,
                true
              )
            }
          >
            <Text style={[...texto, styles.textoPeligro]}>Quitar Pro</Text>
          </TouchableOpacity>
        )}
      </View>
      {resultado && (
        <Text style={[styles.resultado, { color: resultado.ok ? colors.success : colors.danger }]}>
          {resultado.texto}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  insignia: { alignSelf: 'flex-start', borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  insigniaVerde: { backgroundColor: '#E8F5E9' },
  insigniaGris: { backgroundColor: colors.accentLight },
  insigniaTexto: { fontSize: fontSize.xs, fontWeight: '600' },
  insigniaTextoVerde: { color: colors.success },
  insigniaTextoGris: { color: colors.muted },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  boton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardBackground,
  },
  botonCompacto: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  botonAcento: { backgroundColor: colors.accent, borderColor: colors.accent },
  botonFantasma: { borderColor: 'transparent', backgroundColor: 'transparent' },
  deshabilitado: { opacity: 0.5 },
  botonTexto: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  botonTextoCompacto: { fontSize: fontSize.xs },
  botonTextoAcento: { color: colors.white },
  textoPeligro: { color: colors.danger },
  resultado: { fontSize: fontSize.sm, marginTop: spacing.xs },
});
