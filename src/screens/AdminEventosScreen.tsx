// Spec 158 — Eventos del admin de Sonópolis: port de `admin/eventos/page.js` de la web
// (W-092, W-172, W-175). La lógica vive en `useAdminEventos` (spec 152). «Editar» y
// «Entradas» de cada fila quedan fuera (ver el spec): `useEventoPermisos` todavía no
// reconoce al admin de plataforma.

import { ReactNode } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useAdminEventos, EventoAdmin } from '../hooks/useAdminEventos';
import BotonCerrarEvento from '../components/BotonCerrarEvento';
import { formatearDiaLargo } from '../lib/fechaCartelera';
import { colors, spacing, borderRadius, fontSize } from '../theme';

// Gris de un evento cerrado: sin token propio en el tema (que comparten otros specs).
const CERRADO_FONDO = '#EFEAE5';

function textoFecha(e: EventoAdmin): string {
  return e.comienzaAt ? formatearDiaLargo(e.comienzaAt) : e.fecha;
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={styles.seccion}>
      <Text style={styles.tituloSeccion}>{titulo}</Text>
      <View style={styles.lista}>{children}</View>
    </View>
  );
}

function Vacio({ children }: { children: string }) {
  return (
    <View style={styles.vacio}>
      <Text style={styles.vacioTexto}>{children}</Text>
    </View>
  );
}

/** Solo se marca la excepción: etiquetar lo normal (`published`) es ruido. Sin
 * `status` cuenta como publicado, que es el default de la base. */
function EtiquetaEstado({ status }: { status: EventoAdmin['status'] }) {
  if (!status || status === 'published') return null;
  const esCancelado = status === 'cancelled';
  return (
    <Text style={[styles.etiqueta, { color: esCancelado ? colors.danger : colors.secondary }]}>
      {esCancelado ? 'Cancelado' : 'Borrador'}
    </Text>
  );
}

/** `conBoton` solo para los pasados sin cerrar (cancelados incluidos). Un cerrado se
 * pinta en gris con la fecha en pasado para no confundirlo con uno activo. */
function Fila({ evento, conBoton, onCerrado }: { evento: EventoAdmin; conBoton?: boolean; onCerrado: () => void }) {
  const cerrado = Boolean(evento.cerradoAt);

  return (
    <View style={[styles.fila, cerrado && styles.filaCerrada]}>
      <View style={styles.encabezado}>
        <Text style={[styles.artista, cerrado && styles.artistaCerrado]} numberOfLines={1}>
          {evento.artista}
        </Text>
        <EtiquetaEstado status={evento.status} />
      </View>
      {cerrado ? (
        <>
          <Text style={styles.detalle}>Fue el {textoFecha(evento)} · Cerrado</Text>
          {evento.venueName ? (
            <Text style={styles.detalle} numberOfLines={1}>
              {evento.venueName}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.detalle} numberOfLines={1}>
          {[textoFecha(evento), evento.venueName].filter(Boolean).join(' · ')}
        </Text>
      )}
      {conBoton && (
        <View style={styles.accion}>
          <BotonCerrarEvento
            eventoId={evento.id}
            monto={evento.montoATransferir ?? 0}
            moneda={evento.moneda ?? null}
            artista={evento.artista}
            cancelado={evento.status === 'cancelled'}
            onCerrado={onCerrado}
          />
        </View>
      )}
    </View>
  );
}

export default function AdminEventosScreen() {
  const { cargando, error, proximos, porCerrar, cerrados, hayPasados, recargar } = useAdminEventos();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} />}
    >
      {error && <Text style={styles.error}>{error}</Text>}

      <Seccion titulo={`Próximos${proximos.length ? ` · ${proximos.length}` : ''}`}>
        {proximos.length === 0 ? (
          <Vacio>No hay eventos próximos.</Vacio>
        ) : (
          proximos.map((e) => <Fila key={e.id} evento={e} onCerrado={recargar} />)
        )}
      </Seccion>

      <Seccion titulo={`Por cerrar${porCerrar.length ? ` · ${porCerrar.length}` : ''}`}>
        {porCerrar.length === 0 ? (
          <Vacio>{!hayPasados ? 'Todavía no pasó ningún evento.' : 'Todos los eventos pasados están cerrados.'}</Vacio>
        ) : (
          porCerrar.map((e) => <Fila key={e.id} evento={e} conBoton onCerrado={recargar} />)
        )}
      </Seccion>

      {cerrados.length > 0 && (
        <Seccion titulo={`Cerrados · ${cerrados.length}`}>
          {cerrados.map((e) => (
            <Fila key={e.id} evento={e} onCerrado={recargar} />
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
  vacioTexto: { fontSize: fontSize.sm, color: colors.secondary, textAlign: 'center' },
  fila: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  filaCerrada: { backgroundColor: CERRADO_FONDO },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  artista: { flexShrink: 1, fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.primary },
  artistaCerrado: { color: colors.secondary },
  etiqueta: { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.7 },
  detalle: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  accion: { marginTop: spacing.sm },
});
