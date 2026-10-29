// Spec 158 — Pagos del admin de Sonópolis: port de `admin/sonopolis/page.js` y
// `FilaPago.js` de la web (W-083, W-172, W-175). La lógica vive en `useAdminPagos`
// (spec 152); acá solo se pinta, con las copias de la web.

import { ReactNode } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useAdminPagos, FilaPagoAdmin } from '../hooks/useAdminPagos';
import BotonCerrarEvento from '../components/BotonCerrarEvento';
import { formatearMonto } from '../lib/precio';
import { formatearDiaLargo } from '../lib/fechaCartelera';
import { TIPOS_CUENTA } from '../lib/datosPago';
import { colors, spacing, borderRadius, fontSize } from '../theme';

// Fondo y borde del aviso «Ya pasó»: el amarillo claro de la web, sin token propio en
// el tema (que comparten otros specs).
const AMARILLO_FONDO = '#FFF8E1';
const AMARILLO_BORDE = '#FFE082';

function textoFecha(comienzaAt: string | null, fecha: string): string {
  return comienzaAt ? formatearDiaLargo(comienzaAt) : fecha;
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={styles.seccion}>
      <Text style={styles.tituloSeccion}>{titulo}</Text>
      <View style={styles.lista}>{children}</View>
    </View>
  );
}

/**
 * Un dato bancario de a uno. El valor es `selectable`: se copia con una pulsación
 * larga en iOS y Android y seleccionando en web. En la web cada dato es un botón
 * «copiar» porque retipear un número de cuenta termina en una transferencia a la
 * cuenta equivocada; acá se cubre lo mismo sin sumar `expo-clipboard`, que es un
 * módulo nativo y obliga a un build nuevo.
 */
function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.etiquetaDato}>{label}</Text>
      <Text selectable style={styles.valorDato}>
        {valor}
      </Text>
    </View>
  );
}

/**
 * `soloLectura` para los eventos que todavía no ocurren: se muestra cuánto se está
 * juntando y la cuenta a la que irá, pero sin botón. No se paga algo que no pasó.
 */
function FilaPago({
  fila,
  soloLectura = false,
  nota,
  onCerrado,
}: {
  fila: FilaPagoAdmin;
  soloLectura?: boolean;
  nota?: string;
  onCerrado: () => void;
}) {
  const tipo = TIPOS_CUENTA.find((t) => t.valor === fila.tipoCuenta)?.etiqueta ?? fila.tipoCuenta;

  return (
    <View style={styles.tarjeta}>
      <View style={styles.filaArriba}>
        <View style={styles.flex}>
          <Text style={styles.artista}>{fila.evento.artista}</Text>
          <Text style={styles.detalle}>
            {fila.evento.venueName} · {textoFecha(fila.evento.comienzaAt, fila.evento.fecha)}
          </Text>
        </View>
        <View style={styles.montoCaja}>
          <Text style={styles.monto}>{formatearMonto(fila.monto, fila.moneda)}</Text>
          {/* Lo que el número significa depende de si el show pasó, no de si hay botón. */}
          <Text style={styles.montoBajada}>
            {fila.cancelado ? 'vendido' : fila.yaPaso ? 'le corresponde' : 'va acumulado'}
          </Text>
        </View>
      </View>

      {/* W-175: en un cancelado la nota de reclamo no aplica. */}
      {(fila.cancelado || nota) && (
        <Text style={[styles.nota, { color: fila.cancelado ? colors.danger : colors.warning }]}>
          {fila.cancelado ? 'Cancelado — la plata es de los compradores' : nota}
        </Text>
      )}

      <View style={styles.datos}>
        <Dato label="Banco" valor={fila.banco} />
        <Dato label="Tipo" valor={tipo} />
        <Dato label="N° de cuenta" valor={fila.numeroCuenta} />
        <Dato label="Titular" valor={fila.titular} />
        <Dato label="RUT" valor={fila.rut} />
        {fila.emailContacto ? <Dato label="Email" valor={fila.emailContacto} /> : null}
      </View>

      {!soloLectura && (
        <View style={styles.accion}>
          <BotonCerrarEvento
            eventoId={fila.eventoId}
            monto={fila.monto}
            moneda={fila.moneda}
            titular={fila.titular}
            artista={fila.evento.artista}
            cancelado={fila.cancelado}
            onCerrado={onCerrado}
          />
        </View>
      )}
    </View>
  );
}

export default function AdminPagosScreen() {
  const { cargando, error, porPagar, sinReclamar, acumulando, sinDatos, totalPorPagar, totalAcumulando, recargar } =
    useAdminPagos();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} />}
    >
      {error && <Text style={styles.error}>{error}</Text>}

      <Seccion titulo={`Por pagar${porPagar.length > 0 ? ` · ${totalPorPagar} en total` : ''}`}>
        {porPagar.length === 0 ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioTitulo}>No debes nada</Text>
            <Text style={styles.vacioTexto}>Acá aparece un evento cuando su organizador reclama el pago.</Text>
          </View>
        ) : (
          porPagar.map((fila) => <FilaPago key={fila.eventoId} fila={fila} onCerrado={recargar} />)
        )}
      </Seccion>

      {sinReclamar.length > 0 && (
        <Seccion titulo={`Terminaron y no han reclamado · ${sinReclamar.length}`}>
          {sinReclamar.map((fila) => (
            <FilaPago key={fila.eventoId} fila={fila} nota="No ha reclamado el pago" onCerrado={recargar} />
          ))}
        </Seccion>
      )}

      {acumulando.length > 0 && (
        <Seccion titulo={`Se está juntando · ${totalAcumulando}`}>
          {acumulando.map((fila) => (
            <FilaPago key={fila.eventoId} fila={fila} soloLectura onCerrado={recargar} />
          ))}
        </Seccion>
      )}

      {sinDatos.length > 0 && (
        <Seccion titulo={`Sin datos bancarios · ${sinDatos.length}`}>
          {/* El hook ya los ordena: primero los que pasaron (plata cobrada que no se
              puede transferir), después por fecha. */}
          {sinDatos.map((e) => (
            <View key={e.id} style={[styles.filaSinDatos, e.yaPaso && styles.filaSinDatosPasada]}>
              <View style={styles.flex}>
                <Text style={styles.artistaChico}>{e.artista}</Text>
                <Text style={styles.detalle}>
                  {e.venueName} · {textoFecha(e.comienzaAt, e.fecha)}
                </Text>
              </View>
              <Text style={[styles.estadoSinDatos, { color: e.yaPaso ? colors.warning : colors.muted }]}>
                {e.yaPaso ? 'Ya pasó — hay que pedirle la cuenta' : 'Próximo'}
              </Text>
            </View>
          ))}
        </Seccion>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  error: { color: colors.danger, fontSize: fontSize.sm, marginBottom: spacing.md },
  seccion: { marginBottom: spacing.xl },
  tituloSeccion: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  lista: { gap: spacing.sm },
  vacio: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  vacioTitulo: { fontWeight: '600', color: colors.primary, fontSize: fontSize.md },
  vacioTexto: { marginTop: spacing.xs, fontSize: fontSize.sm, color: colors.secondary, textAlign: 'center' },
  tarjeta: { backgroundColor: colors.cardBackground, borderRadius: borderRadius.md, padding: spacing.md },
  filaArriba: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  artista: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  artistaChico: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  detalle: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  montoCaja: { alignItems: 'flex-end' },
  monto: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  montoBajada: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs },
  nota: { marginTop: spacing.sm, fontSize: fontSize.sm, fontWeight: '600' },
  datos: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dato: { minWidth: 120, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  etiquetaDato: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.muted },
  valorDato: { fontSize: fontSize.sm, color: colors.primary, fontFamily: 'monospace' },
  accion: { marginTop: spacing.md },
  filaSinDatos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  filaSinDatosPasada: { backgroundColor: AMARILLO_FONDO, borderColor: AMARILLO_BORDE },
  estadoSinDatos: { fontSize: fontSize.sm, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
