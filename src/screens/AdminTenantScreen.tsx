// Spec 159 — el CRM de un local o banda desde el admin, como lo ve ese tenant con Pro.
// Port de `admin/crm/[tipo]/[id]/page.js` y `CodigoSuscripcionPro.js` de la web
// (W-193, W-216, W-218, W-220). La lógica vive en `useTenantAdmin` (spec 153). Correo
// y WhatsApp van en modo vista: desde el admin no se envía nada.

import { useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTenantAdmin, type ContactoCrm, type SuscripcionPro } from '../hooks/useTenantAdmin';
import type { EventoDeTenant } from '../hooks/useAdminCrm';
import { SEGMENTOS_BROADCAST } from '../hooks/useAvisoWhatsApp';
import BotonesPro, { EtiquetaPro, fechaCorta } from '../components/BotonesPro';
import { generarCodigoPro, type TipoTenant } from '../lib/adminPro';
import { etiquetaPais } from '../constants/paises';
import { formatearMonto } from '../lib/precio';
import { formatearFechaEs, separarFechaHora } from '../lib/fecha';
import { formatearDiaLargo } from '../lib/fechaCartelera';
import { confirmar } from '../lib/confirm';
import type { AdminParamList } from '../navigation/pantallasAdmin';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type TenantRoute = RouteProp<AdminParamList, 'AdminTenant'>;
type NavProp = NativeStackNavigationProp<AdminParamList, 'AdminTenant'>;

// Fondo amarillo claro de la nota de admin: sin token propio en el tema.
const AMARILLO_FONDO = '#FFF8E1';
const AMARILLO_BORDE = '#F5D77A';

const ORIGEN_LABEL: Record<string, string> = { comprador: 'Comprador', seguidor: 'Seguidor', whatsapp: 'WhatsApp' };

// `CodigoSuscripcionPro.js:19-30`. «Abrió el pago» no es un estado de la base: es
// `esperando` con el link ya pedido.
const ESTADOS: Record<string, { texto: string; color: string }> = {
  esperando: { texto: 'Esperando', color: colors.muted },
  abrio: { texto: 'Abrió el pago', color: colors.accent },
  activa: { texto: 'Activa', color: colors.success },
  pausada: { texto: 'Pausada', color: colors.muted },
  cancelada: { texto: 'Cancelada', color: colors.muted },
  anulado: { texto: 'Anulado', color: colors.danger },
};
const estadoDe = (s: SuscripcionPro) => (s.estado === 'esperando' && s.linkPedidoAt ? 'abrio' : s.estado);

const fechaEs = (iso: string) => formatearFechaEs(separarFechaHora(iso).fechaISO);
const fechaConAnio = (iso: string) => `${fechaCorta(iso)} ${new Date(iso).getFullYear()}`;

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={styles.seccion}>
      <Text style={styles.tituloSeccion}>{titulo.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return (
    <View style={styles.vacio}>
      <Text style={styles.vacioTexto}>{children}</Text>
    </View>
  );
}

interface PropsSuscripcion {
  tipo: TipoTenant;
  id: string;
  nombre: string;
  cuenta: { cuentaId: string; correo: string } | null;
  suscripciones: SuscripcionPro[];
  moneda: string | null;
  precioSugerido: number | null;
  errorSuscripcion: string | null;
  recargar: () => Promise<void>;
}

function CodigoSuscripcionPro({
  tipo, id, nombre, cuenta, suscripciones, moneda, precioSugerido, errorSuscripcion, recargar,
}: PropsSuscripcion) {
  const [monto, setMonto] = useState(precioSugerido != null ? String(precioSugerido) : '');
  const [tocado, setTocado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [generado, setGenerado] = useState<{ codigo: string; url: string } | null>(null);
  const [errorGenerar, setErrorGenerar] = useState<string | null>(null);

  // El precio llega después del primer render: se precarga mientras nadie haya escrito.
  useEffect(() => {
    if (!tocado) setMonto(precioSugerido != null ? String(precioSugerido) : '');
  }, [precioSugerido, tocado]);

  const etiqueta = tipo === 'venue' ? 'Este local' : 'Esta banda';
  const montoNum = Number(monto);
  const montoValido = monto.trim() !== '' && Number.isFinite(montoNum) && montoNum > 0;

  const generar = () => {
    if (!cuenta || !montoValido) return;
    confirmar(
      {
        title: `¿Generar un código para ${nombre}? Pro se activa en la cuenta ${cuenta.correo}. Son ${formatearMonto(montoNum, moneda)} al mes.`,
      },
      async () => {
        setOcupado(true);
        setErrorGenerar(null);
        try {
          setGenerado(await generarCodigoPro(tipo, id, montoNum));
          recargar();
        } catch (e: any) {
          setErrorGenerar(e?.message ?? 'No se pudo generar el código');
        } finally {
          setOcupado(false);
        }
      }
    );
  };

  return (
    <Seccion titulo="Suscripción a Pro con Mercado Pago">
      {errorSuscripcion ? (
        <Vacio>No se pudo leer la suscripción: {errorSuscripcion}</Vacio>
      ) : !cuenta ? (
        <Vacio>
          {etiqueta} no tiene cuenta en Sonópolis. Para suscribirlo, primero tiene que reclamarlo o crear una.
        </Vacio>
      ) : (
        <View style={styles.tarjeta}>
          <Text style={styles.texto}>
            Pro se activa en la cuenta <Text style={styles.negrita}>{cuenta.correo}</Text>
          </Text>
          <Text style={styles.etiquetaCampo}>Monto mensual</Text>
          <View style={styles.filaMonto}>
            <TextInput
              style={styles.inputMonto}
              value={monto}
              onChangeText={(v) => {
                setTocado(true);
                setMonto(v);
              }}
              keyboardType="numeric"
            />
            {moneda && <Text style={styles.moneda}>{moneda}</Text>}
          </View>
          <TouchableOpacity
            style={[styles.botonPrimario, (ocupado || !montoValido) && styles.deshabilitado]}
            disabled={ocupado || !montoValido}
            onPress={generar}
          >
            <Text style={styles.botonPrimarioTexto}>{ocupado ? 'Generando…' : 'Generar código de suscripción'}</Text>
          </TouchableOpacity>
          {errorGenerar && <Text style={styles.error}>{errorGenerar}</Text>}
          {generado && (
            <View style={styles.generado}>
              <Text style={styles.codigo} selectable>
                {generado.codigo}
              </Text>
              <Text style={styles.url} selectable>
                {generado.url}
              </Text>
            </View>
          )}
        </View>
      )}

      {!errorSuscripcion && suscripciones.length > 0 && (
        <View style={styles.anteriores}>
          <Text style={styles.subtitulo}>Códigos anteriores</Text>
          {suscripciones.map((s) => {
            const estado = ESTADOS[estadoDe(s)] ?? { texto: s.estado, color: colors.muted };
            return (
              <View key={s.codigo} style={styles.filaCodigo}>
                <Text style={styles.codigoChico}>{s.codigo}</Text>
                {s.correoCuenta && (
                  <Text style={styles.textoSecundario} numberOfLines={1}>
                    {s.correoCuenta}
                  </Text>
                )}
                <Text style={styles.textoChico}>{formatearMonto(s.monto, s.moneda)}</Text>
                <Text style={styles.textoSecundario}>{fechaConAnio(s.createdAt)}</Text>
                <Text style={[styles.estado, { color: estado.color }]}>{estado.texto}</Text>
              </View>
            );
          })}
        </View>
      )}
    </Seccion>
  );
}

function TarjetaContacto({ c, moneda }: { c: ContactoCrm; moneda: string | null }) {
  return (
    <View style={styles.contacto}>
      <Text style={c.email ? styles.contactoEmail : styles.textoSecundario}>{c.email ?? 'Sin correo'}</Text>
      {c.telefono && <Text style={styles.textoChico}>{c.telefono}</Text>}
      <View style={styles.insignias}>
        {c.origenes.map((o) => (
          <View key={o} style={styles.insignia}>
            <Text style={styles.insigniaTexto}>{ORIGEN_LABEL[o] ?? o}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.textoSecundario}>
        {c.entradas} {c.entradas === 1 ? 'entrada' : 'entradas'} · {formatearMonto(c.totalGastado, moneda)}
      </Text>
    </View>
  );
}

export default function AdminTenantScreen() {
  const route = useRoute<TenantRoute>();
  const navigation = useNavigation<NavProp>();
  const { tipo, id } = route.params;
  const t = useTenantAdmin(tipo, id);

  if (t.cargando && !t.tenant && !t.error) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Con error principal (p. ej. «No existe») no hay nada más que mostrar.
  if (t.error || !t.tenant) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.error}>{t.error ?? 'No existe'}</Text>
      </View>
    );
  }

  const { tenant } = t;
  const etiqueta = tipo === 'venue' ? 'Este local' : 'Esta banda';
  const n = t.contactos.length;

  // DetalleEvento vive en CarteleraStack: `navigate` sube hasta el Tab que la tiene.
  const verEvento = (eventoId: string) =>
    (navigation as any).navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId } });

  // Un elemento y no un componente: uno creado en cada render remontaría el encabezado
  // y el TextInput del monto perdería el foco a cada tecla.
  const encabezado = (
    <View>
      <View style={styles.cabecera}>
        <View style={styles.filaNombre}>
          <Text style={styles.nombre}>{tenant.nombre}</Text>
          <EtiquetaPro proHasta={tenant.proHasta} />
        </View>
        {tenant.pais && <Text style={styles.textoSecundario}>{etiquetaPais(tenant.pais)}</Text>}
        <BotonesPro tipo={tipo} id={id} nombre={tenant.nombre} proHasta={tenant.proHasta} onCambio={t.recargar} />
        <Text style={styles.texto}>
          {tenant.esPro
            ? `${etiqueta} ve esta misma lista en su panel de contactos.`
            : `Sin Pro: ${etiqueta.toLowerCase()} solo ve el conteo (${n} ${n === 1 ? 'persona' : 'personas'}) y la invitación a Pro.`}
        </Text>
        <View style={styles.notaAdmin}>
          <Text style={styles.textoChico}>
            <Text style={styles.negrita}>Vista de admin:</Text> así ve {tenant.nombre} su CRM con Pro. Desde aquí no se
            envía nada.
          </Text>
        </View>
      </View>

      <CodigoSuscripcionPro
        tipo={tipo}
        id={id}
        nombre={tenant.nombre}
        cuenta={t.cuenta}
        suscripciones={t.suscripciones}
        moneda={t.moneda}
        precioSugerido={t.precioSugerido}
        errorSuscripcion={t.errorSuscripcion}
        recargar={t.recargar}
      />

      <Seccion titulo={`Eventos activos · ${t.eventosActivos.length}`}>
        {t.eventosActivos.length === 0 ? (
          <Vacio>Sin eventos activos.</Vacio>
        ) : (
          t.eventosActivos.map((e: EventoDeTenant) => (
            <TouchableOpacity key={e.id} style={styles.tarjeta} onPress={() => verEvento(e.id)}>
              <Text style={styles.negrita} numberOfLines={1}>
                {e.artista}
              </Text>
              <Text style={styles.textoSecundario} numberOfLines={1}>
                {[e.comienzaAt ? formatearDiaLargo(e.comienzaAt) : e.fecha, e.venueName].filter(Boolean).join(' · ')}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </Seccion>

      <Seccion titulo="Correo">
        <View style={styles.tarjeta}>
          {t.errorCorreo ? (
            <Text style={styles.error}>No pudimos leer tus listas: {t.errorCorreo}</Text>
          ) : t.correo ? (
            <>
              <Text style={styles.texto}>
                {t.correo.conteos.compradores} compradores · {t.correo.conteos.seguidores} seguidores
              </Text>
              <Text style={styles.textoSecundario}>
                {t.correo.ultimoEnvio
                  ? `Último envío: ${fechaEs(t.correo.ultimoEnvio.createdAt)}, a ${t.correo.ultimoEnvio.destinatarios} personas`
                  : 'Todavía no ha enviado correos'}
              </Text>
            </>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
      </Seccion>

      <Seccion titulo="Avisar por WhatsApp">
        <View style={styles.tarjeta}>
          <Text style={styles.textoSecundario}>
            {etiqueta} lo usa desde la ficha de cada evento activo: un aviso por evento, a quienes dejaron su WhatsApp.
          </Text>
          {SEGMENTOS_BROADCAST.map((s) => (
            <View key={s.value} style={styles.filaSegmento}>
              <Text style={styles.textoChico}>{s.label}</Text>
              <Text style={styles.negrita}>{t.whatsapp[s.value]}</Text>
            </View>
          ))}
        </View>
      </Seccion>

      <View style={styles.resumenFila}>
        {[
          { label: 'Contactos', n: t.resumen.total },
          { label: 'Compradores', n: t.resumen.compradores },
          { label: 'Con WhatsApp', n: t.resumen.conWhatsapp },
        ].map((r) => (
          <View key={r.label} style={styles.resumenCard}>
            <Text style={styles.resumenNumero}>{r.n}</Text>
            <Text style={styles.resumenLabel}>{r.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.contenido}
      data={t.contactos}
      keyExtractor={(c) => c.clave}
      renderItem={({ item }) => <TarjetaContacto c={item} moneda={t.moneda} />}
      ListHeaderComponent={encabezado}
      ListEmptyComponent={<Vacio>Todavía no tiene contactos.</Vacio>}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={t.cargando} onRefresh={t.recargar} tintColor={colors.accent} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  centrado: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  cabecera: { gap: spacing.sm },
  filaNombre: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  nombre: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary },
  texto: { fontSize: fontSize.sm, color: colors.primary },
  textoChico: { fontSize: fontSize.sm, color: colors.primary },
  textoSecundario: { fontSize: fontSize.xs, color: colors.secondary },
  negrita: { fontWeight: 'bold', color: colors.primary },
  error: { fontSize: fontSize.sm, color: colors.danger },
  notaAdmin: {
    backgroundColor: AMARILLO_FONDO,
    borderWidth: 1,
    borderColor: AMARILLO_BORDE,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  seccion: { marginTop: spacing.lg, gap: spacing.sm },
  tituloSeccion: { fontSize: fontSize.xs, fontWeight: 'bold', letterSpacing: 0.6, color: colors.accent },
  subtitulo: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  tarjeta: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  vacio: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  vacioTexto: { fontSize: fontSize.sm, color: colors.secondary, textAlign: 'center' },
  etiquetaCampo: { fontSize: fontSize.sm, color: colors.secondary, marginTop: spacing.xs },
  filaMonto: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inputMonto: {
    width: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: fontSize.md,
    color: colors.primary,
    backgroundColor: colors.white,
  },
  moneda: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  botonPrimario: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  botonPrimarioTexto: { fontSize: fontSize.sm, fontWeight: '600', color: colors.white },
  deshabilitado: { opacity: 0.5 },
  generado: {
    backgroundColor: AMARILLO_FONDO,
    borderWidth: 1,
    borderColor: AMARILLO_BORDE,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  codigo: { fontFamily: 'monospace', fontSize: fontSize.xl, fontWeight: '600', letterSpacing: 3, color: colors.primary },
  url: { fontSize: fontSize.sm, color: colors.primary },
  anteriores: { gap: spacing.xs },
  filaCodigo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.sm,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  codigoChico: { fontFamily: 'monospace', fontWeight: '600', fontSize: fontSize.sm, color: colors.primary },
  estado: { fontSize: fontSize.xs, fontWeight: '600', marginLeft: 'auto' },
  filaSegmento: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resumenFila: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  resumenCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: 'center',
  },
  resumenNumero: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  resumenLabel: { fontSize: fontSize.xs, color: colors.secondary },
  contacto: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  contactoEmail: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  insignia: { backgroundColor: colors.accentLight, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  insigniaTexto: { fontSize: fontSize.xs, color: colors.secondary },
});
