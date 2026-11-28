import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTema } from '../context/TemaContext';
import { useEstilos } from '../hooks/useEstilos';
import { usePanel } from '../hooks/usePanel';
import type { SolicitudBolo } from '../hooks/useSolicitudes';
import { armarNumerosPanel, etiquetaEstadoVenta, tonoEstadoVenta, haceTiempo, VentaPanel } from '../lib/panel';
import { formatearFechaHoraCorta } from '../lib/redes/horario';
import { formatearMonto } from '../lib/precio';
import { PAISES, PAIS_POR_DEFECTO } from '../constants/paises';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import type { Evento } from '../types';

interface Props {
  tipo: 'venue' | 'musician';
  tenantId: string;            // venue.id o el id del perfil (= user.id)
  pais: string;                // país del tenant
  eventos: Evento[];           // los «mis eventos» que la pantalla ya calcula
  onVerSolicitudes: () => void;
  onVerContactos: () => void;
  onVerVentas: () => void;
}

interface KpiProps {
  etiqueta: string;
  valor: number | string | null; // null = sin dato: «—» y sin nota
  nota?: string;
  destacado?: boolean;
  onPress?: () => void;
}

function Kpi({ etiqueta, valor, nota, destacado, onPress }: KpiProps) {
  const styles = useEstilos(crearEstilos);
  const estiloTarjeta = [styles.kpi, destacado && styles.kpiDestacado];
  const contenido = (
    <>
      <Text style={styles.kpiEtiqueta}>{etiqueta}</Text>
      <Text style={[styles.kpiValor, destacado && styles.kpiValorDestacado]}>{valor ?? '—'}</Text>
      {valor !== null && !!nota && <Text style={styles.kpiNota}>{nota}</Text>}
    </>
  );
  if (!onPress) return <View style={estiloTarjeta}>{contenido}</View>;
  return (
    <TouchableOpacity style={estiloTarjeta} onPress={onPress} accessibilityRole="button">
      {contenido}
    </TouchableOpacity>
  );
}

/** «1 vendida» / «3 vendidas», como `plural` de la web. */
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Spec 204 — los números del panel (W-329 §1 en el músico, W-330 §1 en el local).
 * Las cuentas son de `armarNumerosPanel` (spec 195); acá solo se dibujan.
 */
export default function NumerosPanel({
  tipo, tenantId, pais, eventos, onVerSolicitudes, onVerContactos, onVerVentas,
}: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const { user } = useAuth();
  const { cargando, ventas, cerrados, solicitudes, contactos, aceptarSolicitud } = usePanel(
    { tipo, id: tenantId },
    eventos.map((e) => e.id),
  );
  const [aceptando, setAceptando] = useState<string | null>(null);
  const [errorAceptar, setErrorAceptar] = useState<{ id: string; mensaje: string } | null>(null);

  const ahora = new Date().toISOString();
  const n = armarNumerosPanel<SolicitudBolo>({
    eventos, cerrados, ventas, solicitudes, contactos, miUserId: user?.id ?? '', pais, ahora,
  });
  const zona = PAISES[pais]?.zonaHoraria ?? PAISES[PAIS_POR_DEFECTO].zonaHoraria;
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  // `activos` viene tipado como `EventoPanel`: para el artista se vuelve al `Evento`.
  const activos = n.activos.map((a) => eventoPorId.get(a.id)!);
  const esLocal = tipo === 'venue';
  const notaContactos = n.contactosNuevosMes ? `+${n.contactosNuevosMes} este mes` : undefined;

  const aceptar = async (id: string) => {
    setAceptando(id);
    setErrorAceptar(null);
    const resultado = await aceptarSolicitud(id);
    if (!resultado.ok) setErrorAceptar({ id, mensaje: resultado.mensaje });
    setAceptando(null);
  };

  const encabezado = (titulo: string, accion: string, onPress: () => void) => (
    <View style={styles.encabezado}>
      <Text style={styles.subtitulo}>{titulo}</Text>
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text style={styles.enlace}>{accion}</Text>
      </TouchableOpacity>
    </View>
  );

  const insignia = (status: VentaPanel['status']) => {
    const tono = {
      success: { fondo: colores.successBg, texto: colores.success },
      warning: { fondo: colores.warningBg, texto: colores.warningText },
      danger: { fondo: colores.dangerBg, texto: colores.dangerText },
      neutral: { fondo: colores.accentLight, texto: colores.secondary },
    }[tonoEstadoVenta(status)];
    return (
      <View style={[styles.insignia, { backgroundColor: tono.fondo }]}>
        <Text style={[styles.insigniaTexto, { color: tono.texto }]}>{etiquetaEstadoVenta(status)}</Text>
      </View>
    );
  };

  return (
    // En el músico el margen lateral ya lo pone el contenedor del ScrollView.
    <View style={esLocal ? styles.bloqueLocal : styles.bloqueMusico}>
      <Text style={styles.titulo}>Resumen</Text>

      {cargando ? (
        <ActivityIndicator color={colores.accent} />
      ) : (
        <>
          <View style={styles.grilla}>
            {esLocal ? (
              <>
                <Kpi
                  etiqueta={`Cobrado en ${n.nombreMes}`}
                  valor={n.cobradoMes}
                  nota={`De ${plural(n.entradasPagadasMes ?? 0, 'entrada pagada', 'entradas pagadas')}`}
                  onPress={onVerVentas}
                />
                <Kpi
                  etiqueta="Entradas vendidas"
                  valor={n.vendidasActivas}
                  nota={`En ${plural(
                    activos.filter((e) => e.status !== 'cancelled').length,
                    'evento activo',
                    'eventos activos',
                  )}`}
                />
                <Kpi
                  etiqueta="Por responder"
                  valor={n.porResponder?.length ?? null}
                  nota={n.masAntiguaPorResponder
                    ? `La más antigua, ${haceTiempo(n.masAntiguaPorResponder, ahora)}`
                    : undefined}
                  destacado={!!n.porResponder?.length}
                  onPress={onVerSolicitudes}
                />
                <Kpi etiqueta="Tu público" valor={n.contactos} nota={notaContactos} onPress={onVerContactos} />
              </>
            ) : (
              <>
                <Kpi etiqueta="Próximos shows" valor={n.proximosShows} nota={n.notaProximoShow} />
                <Kpi
                  etiqueta="Entradas vendidas"
                  valor={n.vendidasActivas}
                  nota="En tus eventos activos"
                  onPress={onVerVentas}
                />
                <Kpi etiqueta="Contactos" valor={n.contactos} nota={notaContactos} onPress={onVerContactos} />
                <Kpi
                  etiqueta="Solicitudes"
                  valor={n.porResponder?.length ?? null}
                  nota="De locales, por responder"
                  onPress={onVerSolicitudes}
                />
              </>
            )}
          </View>

          {activos.length > 0 && (
            <>
              <Text style={[styles.subtitulo, styles.subtituloSolo]}>Vendidas por evento</Text>
              {activos.slice(0, 4).map((evento) => (
                <View key={evento.id} style={[styles.fila, styles.filaEntre]}>
                  <Text style={styles.nombre} numberOfLines={1}>{evento.artista}</Text>
                  {evento.status === 'cancelled' ? (
                    <Text style={styles.cancelado}>Cancelado</Text>
                  ) : !evento.monto ? (
                    <Text style={styles.sinVenta}>Sin venta de entradas</Text>
                  ) : (
                    <Text style={styles.detalle}>
                      {n.vendidasPorEvento
                        ? plural(n.vendidasPorEvento[evento.id] ?? 0, 'vendida', 'vendidas')
                        : '—'}
                    </Text>
                  )}
                </View>
              ))}
            </>
          )}

          {esLocal && !!n.porResponder?.length && (
            <>
              {encabezado('Solicitudes de bandas', 'Ver todas', onVerSolicitudes)}
              {n.porResponder.slice(0, 3).map((s) => (
                <View key={s.id} style={styles.fila}>
                  <Text style={styles.nombre}>{s.musicoNombre ?? 'Banda'}</Text>
                  {!!(s.genre || s.proposedAt) && (
                    <Text style={styles.detalle}>
                      {[
                        s.genre,
                        s.proposedAt ? `propone ${formatearFechaHoraCorta(s.proposedAt, zona)}` : null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  <Text style={styles.llego}>Llegó {haceTiempo(s.createdAt, ahora)}</Text>
                  <View style={styles.botones}>
                    <TouchableOpacity
                      style={styles.botonAceptar}
                      onPress={() => aceptar(s.id)}
                      disabled={aceptando !== null}
                      accessibilityRole="button"
                    >
                      {aceptando === s.id ? (
                        <ActivityIndicator color={colores.onAccent} />
                      ) : (
                        <Text style={styles.botonAceptarTexto}>Aceptar</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.botonVer} onPress={onVerSolicitudes} accessibilityRole="button">
                      <Text style={styles.botonVerTexto}>Ver propuesta</Text>
                    </TouchableOpacity>
                  </View>
                  {errorAceptar?.id === s.id && <Text style={styles.error}>{errorAceptar.mensaje}</Text>}
                </View>
              ))}
            </>
          )}

          {esLocal && (
            <>
              {encabezado('Ventas recientes', 'Ver ventas', onVerVentas)}
              {n.ventasRecientes === null ? (
                <Text style={styles.error}>
                  No pudimos leer las ventas. Vuelve a intentarlo en un momento.
                </Text>
              ) : n.ventasRecientes.length === 0 ? (
                <Text style={styles.sinVenta}>Todavía no hay compras.</Text>
              ) : (
                n.ventasRecientes.map((v) => (
                  <View key={v.id} style={styles.fila}>
                    <View style={styles.filaEntre}>
                      <Text style={styles.nombre} numberOfLines={1}>
                        {eventoPorId.get(v.eventoId)?.artista ?? 'Evento'}
                      </Text>
                      <Text style={styles.nombreMonto}>{formatearMonto(v.monto, v.moneda)}</Text>
                    </View>
                    <View style={styles.filaEntre}>
                      <Text style={[styles.detalle, styles.crece]}>
                        {[
                          v.compradorEmail ?? 'Sin correo',
                          `${v.cantidad ?? 1} ent.`,
                          formatearFechaHoraCorta(v.createdAt, zona),
                        ].join(' · ')}
                      </Text>
                      {insignia(v.status)}
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  bloqueLocal: { marginHorizontal: spacing.md, marginTop: spacing.lg },
  bloqueMusico: { marginBottom: spacing.md },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: c.primary, marginBottom: spacing.sm },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpi: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: c.cardBackground,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  kpiDestacado: { backgroundColor: c.highlightBg, borderColor: c.highlightBorder },
  kpiEtiqueta: { fontSize: fontSize.sm, fontWeight: '600', color: c.secondary },
  kpiValor: { fontSize: fontSize.xl, fontWeight: 'bold', color: c.primary, marginTop: spacing.xs },
  kpiValorDestacado: { color: c.highlightText },
  kpiNota: { fontSize: fontSize.xs, color: c.muted, marginTop: spacing.xs },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitulo: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  subtituloSolo: { marginTop: spacing.md, marginBottom: spacing.sm },
  enlace: { fontSize: fontSize.sm, fontWeight: 'bold', color: c.accent },
  fila: {
    backgroundColor: c.cardBackground,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  filaEntre: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nombre: { flexShrink: 1, fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  nombreMonto: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  detalle: { fontSize: fontSize.sm, color: c.secondary, marginTop: 2 },
  crece: { flex: 1 },
  llego: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
  cancelado: { fontSize: fontSize.sm, color: c.dangerText },
  sinVenta: { fontSize: fontSize.sm, color: c.muted, fontStyle: 'italic' },
  botones: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  botonAceptar: {
    flex: 1,
    backgroundColor: c.accent,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonAceptarTexto: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.sm },
  botonVer: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
  },
  botonVerTexto: { color: c.secondary, fontWeight: 'bold', fontSize: fontSize.sm },
  error: { fontSize: fontSize.sm, color: c.dangerText, marginTop: spacing.xs },
  insignia: { borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  insigniaTexto: { fontSize: fontSize.xs, fontWeight: 'bold' },
});
