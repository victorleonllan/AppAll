// Spec 154 — Tarjeta informativa de Sonópolis Pro en los paneles de local y de músico.
// Hermana de `components/CardSonopolisPro.js` de la web, sin precio, sin botón de compra
// y sin ningún llamado a pagar por fuera: Pro no se vende en la app.
// Spec 169 — con suscripción dice cuándo se renueva y deja cancelar; sigue sin precio ni
// nombre del medio de pago externo (Decisión 2).

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  esPro,
  esProSinVencimiento,
  diasRestantesPro,
  fechaHastaPro,
  fechaLargaPro,
  fechaFinSiCancela,
  MiSuscripcionPro,
} from '../lib/pro';
import { TipoTenant } from '../lib/adminPro';
import BotonCancelarSuscripcionPro from './BotonCancelarSuscripcionPro';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

interface Props {
  tenant: { id?: string; sonopolisProHasta?: string | null };
  tipo?: TipoTenant; // para cancelar; sin él no se dibuja el botón
  etiqueta: string; // «tu local» | «tu banda», igual que `tenantLabel` de la web
  onVerContactos?: () => void; // el 155 lo pasa; sin él no se dibuja el enlace
  suscripcion?: MiSuscripcionPro | null; // de useMiSuscripcionPro (spec 168)
  onCambio?: () => void; // la pantalla recarga la suscripción después de cancelar
}

const ESTADOS_SUSCRIPCION = ['activa', 'pausada', 'cancelada'];

export default function TarjetaPro({ tenant, tipo, etiqueta, onVerContactos, suscripcion, onCambio }: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const activo = esPro(tenant);
  const sinVencimiento = esProSinVencimiento(tenant);
  const dias = diasRestantesPro(tenant);
  const fecha = fechaHastaPro(tenant);
  // Misma regla que `CardSonopolisPro.js:34`: sin Pro vigente, la suscripción no se muestra.
  const sus = activo && suscripcion && ESTADOS_SUSCRIPCION.includes(suscripcion.estado) ? suscripcion : null;
  // Misma regla de la web: vence pronto a 7 días o menos. Con cobro automático no
  // «vence»: se renueva sola.
  const porVencer = activo && !sinVencimiento && dias !== null && dias <= 7 && sus?.estado !== 'activa';
  // Sin fecha en la fila de la suscripción, la del tenant (la misma que dice hoy la tarjeta).
  const larga = (iso: string | null) => (iso ? fechaLargaPro(iso) : fecha);

  return (
    <View style={styles.card}>
      <View style={styles.filaTitulo}>
        <Text style={styles.titulo}>Sonópolis Pro</Text>
        {porVencer && (
          <View style={styles.etiquetaVence}>
            <Text style={styles.etiquetaVenceTexto}>VENCE PRONTO</Text>
          </View>
        )}
      </View>

      {activo ? (
        <>
          {sus ? (
            <TextoSuscripcion sus={sus} larga={larga} />
          ) : (
            <Text style={styles.texto}>
              {sinVencimiento
                ? 'Activo, sin fecha de vencimiento.'
                : porVencer
                  ? `Activo hasta el ${fecha} — quedan ${dias} ${dias === 1 ? 'día' : 'días'}.`
                  : `Activo hasta el ${fecha}.`}
            </Text>
          )}
          {sus && sus.estado !== 'cancelada' && tipo && tenant.id && (
            <BotonCancelarSuscripcionPro
              tipo={tipo}
              id={tenant.id}
              finTexto={finTexto(sus, larga)}
              onCancelada={onCambio}
            />
          )}
          {onVerContactos && (
            <TouchableOpacity onPress={onVerContactos} style={styles.enlace}>
              <Text style={styles.enlaceTexto}>Ver tus contactos →</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.texto}>Avisa a tus seguidores por WhatsApp desde la ficha de cada evento.</Text>
        </>
      ) : (
        <>
          <Text style={styles.texto}>
            Con Sonópolis Pro ves en un solo lugar a tu público: quienes compran entradas para {etiqueta}, quienes
            te siguen y quienes dejan su WhatsApp.
          </Text>
          <Text style={[styles.texto, { color: colores.muted }]}>Tu cuenta no tiene Sonópolis Pro activo.</Text>
        </>
      )}
    </View>
  );
}

// Textos de W-265 sin precio ni el nombre del medio de pago (Decisión 2): no se muestra
// cuánto cuesta ni se nombra el medio de pago externo, y «revisa tu medio de pago»
// sería mandar a pagar por fuera.
function TextoSuscripcion({ sus, larga }: { sus: MiSuscripcionPro; larga: (iso: string | null) => string | null }) {
  const styles = useEstilos(crearEstilos);
  if (sus.estado === 'activa') {
    return (
      <Text style={styles.texto}>
        Activo. Se renueva solo el <Text style={styles.negrita}>{larga(sus.proximoCobroAt ?? sus.proHasta)}</Text>.
      </Text>
    );
  }
  if (sus.estado === 'pausada') {
    return (
      <Text style={styles.texto}>
        No se pudo cobrar la renovación. Pro sigue activo hasta el{' '}
        <Text style={styles.negrita}>{larga(sus.proHasta)}</Text>.
      </Text>
    );
  }
  return (
    <Text style={styles.texto}>
      Cancelaste tu suscripción. Puedes seguir usando Sonópolis Pro hasta el{' '}
      <Text style={styles.negrita}>{larga(sus.proHasta)}</Text>. No se te va a cobrar de nuevo.
    </Text>
  );
}

// La fecha que va a quedar al cancelar, para el diálogo (copias de `CardSonopolisPro.js`).
function finTexto(sus: MiSuscripcionPro, larga: (iso: string | null) => string | null): string {
  const fin = fechaFinSiCancela(sus);
  return fin
    ? `Puedes seguir usando Pro hasta el ${larga(fin)}.`
    : 'Pro termina hoy, porque el último mes no se pudo cobrar.';
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  card: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.md,
  },
  filaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  etiquetaVence: {
    backgroundColor: c.warning,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  etiquetaVenceTexto: { color: c.white, fontSize: fontSize.xs, fontWeight: 'bold' },
  texto: { fontSize: fontSize.sm, color: c.secondary, marginTop: spacing.xs },
  negrita: { fontWeight: 'bold' },
  enlace: { marginTop: spacing.sm },
  enlaceTexto: { fontSize: fontSize.sm, color: c.accent, fontWeight: 'bold' },
});
