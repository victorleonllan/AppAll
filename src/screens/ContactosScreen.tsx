// Spec 155 — Contactos del local o del músico. Hermana de `/local/contactos` y
// `/musico/contactos` de la web (W-101, W-177, W-187, W-197, W-200): sin Pro, cuántas
// personas hay en su público y la tarjeta Pro; con Pro, el redactor de correo, el
// resumen, la búsqueda, los filtros y la lista agrupada.
//
// Una sola pantalla para MiLocalStack y MusicoStack, como `Escaner` (spec 041): lo que
// cambia es el tenant (`route.params.tipo`), no el código.

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTenantPropio, TipoTenant } from '../hooks/useTenantCrm';
import {
  useContactosCrm,
  resumirContactos,
  filtrarContactos,
  agruparContactos,
  ContactoCrm,
  FiltroContactos,
  OrigenContacto,
} from '../hooks/useContactosCrm';
import RedactarCorreo from '../components/RedactarCorreo';
import TarjetaPro from '../components/TarjetaPro';
import { esPro } from '../lib/pro';
import { formatearMonto } from '../lib/precio';
import { formatearFechaEs, separarFechaHora } from '../lib/fecha';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type ContactosRoute = RouteProp<{ Contactos: { tipo: TipoTenant } }, 'Contactos'>;

const FILTROS: { value: FiltroContactos; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'comprador', label: 'Compradores' },
  { value: 'seguidor', label: 'Seguidores' },
  { value: 'whatsapp', label: 'Con WhatsApp' },
];

const ORIGEN_LABEL: Record<OrigenContacto, string> = {
  comprador: 'Comprador',
  seguidor: 'Seguidor',
  whatsapp: 'WhatsApp',
};

function AvisoSinWhatsapp() {
  return (
    <View style={styles.aviso}>
      <Text style={styles.avisoTexto}>
        <Text style={styles.negrita}>Todavía nadie dejó su WhatsApp.</Text> Las personas lo dejan por decisión
        propia, marcando la casilla en tu perfil público o al comprar una entrada. Cuando alguien lo haga, su número
        va a aparecer en la lista.
      </Text>
    </View>
  );
}

function TarjetaContacto({ c }: { c: ContactoCrm }) {
  const fechaISO = separarFechaHora(c.primerContacto).fechaISO;
  return (
    <View style={styles.contacto}>
      {!c.email && !c.telefono ? (
        <Text style={styles.sinDatos}>Seguidor sin datos de contacto</Text>
      ) : c.email ? (
        <Text style={styles.contactoEmail}>{c.email}</Text>
      ) : null}
      <Text style={styles.contactoLinea}>{c.telefono ? `WhatsApp: ${c.telefono}` : 'Sin WhatsApp'}</Text>
      <View style={styles.insignias}>
        {c.origenes.map((o) => (
          <View key={o} style={[styles.insignia, o === 'comprador' && styles.insigniaComprador]}>
            <Text style={[styles.insigniaTexto, o === 'comprador' && styles.insigniaTextoComprador]}>
              {ORIGEN_LABEL[o] ?? o}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.contactoLinea}>
        {c.entradas} entrada{c.entradas === 1 ? '' : 's'} · {formatearMonto(c.totalGastado, null)} · desde el{' '}
        {fechaISO ? formatearFechaEs(fechaISO) : ''}
      </Text>
    </View>
  );
}

export default function ContactosScreen() {
  const route = useRoute<ContactosRoute>();
  const { tipo } = route.params;
  const { tenant, cargando: cargandoTenant, error: errorTenant } = useTenantPropio(tipo);
  const { contactos, cargando, refrescar } = useContactosCrm(tenant);
  const etiqueta = tipo === 'venue' ? 'tu local' : 'tu banda';
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroContactos>('todos');

  // 1. Cargando: el tenant o la primera carga. Al refrescar se queda la lista.
  if (cargandoTenant || (cargando && contactos === null)) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // 2. Sin tenant.
  if (!tenant) {
    return (
      <View style={styles.centro}>
        <Text style={errorTenant ? styles.error : styles.mensaje}>
          {errorTenant ??
            (tipo === 'venue'
              ? 'Primero crea tu local: los contactos salen de las compras y de quienes lo siguen.'
              : 'No encontramos tu perfil de músico.')}
        </Text>
      </View>
    );
  }

  // 3. Error de lectura: nunca una lista vacía (W-100).
  if (contactos === null) {
    return (
      <View style={styles.centro}>
        <Text style={styles.error}>No pudimos leer tus contactos. Vuelve a intentarlo en un momento.</Text>
      </View>
    );
  }

  // 4. Sin Pro: el número hace visible el valor de Pro; el gate es de producto.
  if (!esPro(tenant)) {
    const n = contactos.length;
    return (
      <View style={styles.contenedor}>
        <View style={styles.sinPro}>
          <Text style={styles.mensaje}>
            Tienes <Text style={styles.negrita}>{n}</Text> persona{n === 1 ? '' : 's'} en tu público.
          </Text>
          <View style={styles.tarjetaPro}>
            <TarjetaPro tenant={tenant} etiqueta={etiqueta} />
          </View>
        </View>
      </View>
    );
  }

  // 5. Con Pro.
  const resumen = resumirContactos(contactos);
  const sections = agruparContactos(filtrarContactos(contactos, filtro, busqueda)).map((g) => ({
    title: g.titulo,
    data: g.contactos,
  }));

  // Un elemento JSX y no una función componente: una función creada en cada render
  // remontaría el encabezado y los TextInput perderían el foco a cada letra.
  const encabezado = (
    <View>
      <RedactarCorreo tipo={tipo} nombreTenant={tenant.nombre} />

      <View style={styles.resumenFila}>
        <View style={styles.resumenCard}>
          <Text style={styles.resumenNumero}>{resumen.total}</Text>
          <Text style={styles.resumenLabel}>Contactos</Text>
        </View>
        <View style={styles.resumenCard}>
          <Text style={styles.resumenNumero}>{resumen.compradores}</Text>
          <Text style={styles.resumenLabel}>Compradores</Text>
        </View>
        <View style={styles.resumenCard}>
          <Text style={styles.resumenNumero}>{resumen.conWhatsapp}</Text>
          <Text style={styles.resumenLabel}>Con WhatsApp</Text>
        </View>
      </View>

      {resumen.conWhatsapp === 0 && <AvisoSinWhatsapp />}

      <TextInput
        style={styles.buscador}
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por email o teléfono"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.filaChips}>
        {FILTROS.map((f) => {
          const elegido = filtro === f.value;
          return (
            <TouchableOpacity
              key={f.value}
              style={[styles.chip, elegido && styles.chipElegido]}
              onPress={() => setFiltro(f.value)}
            >
              <Text style={[styles.chipTexto, elegido && styles.chipTextoElegido]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const vacio =
    contactos.length === 0 ? (
      <Text style={styles.mensajeVacio}>
        Todavía nadie compró ni te sigue. Esto se llena solo: cada compra deja el correo del comprador, y quien te
        sigue desde tu perfil público aparece acá.
      </Text>
    ) : filtro === 'whatsapp' && resumen.conWhatsapp === 0 ? (
      <AvisoSinWhatsapp />
    ) : (
      <Text style={styles.mensajeVacio}>Ningún contacto calza con esta búsqueda.</Text>
    );

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <SectionList
        sections={sections}
        keyExtractor={(c) => c.clave}
        renderItem={({ item }) => <TarjetaContacto c={item} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.seccion}>
            {section.title.toUpperCase()} · {section.data.length}
          </Text>
        )}
        ListHeaderComponent={encabezado}
        ListEmptyComponent={vacio}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={refrescar} tintColor={colors.accent} />}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.lista}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  centro: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  lista: { padding: spacing.md, paddingBottom: spacing.xl },
  sinPro: { padding: spacing.md },
  tarjetaPro: { marginTop: spacing.md },
  mensaje: { fontSize: fontSize.md, color: colors.primary, textAlign: 'center' },
  error: { fontSize: fontSize.md, color: colors.danger, textAlign: 'center' },
  negrita: { fontWeight: 'bold' },
  resumenFila: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
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
  resumenLabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  aviso: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  avisoTexto: { fontSize: fontSize.sm, color: colors.secondary },
  buscador: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.primary,
    backgroundColor: colors.cardBackground,
    marginTop: spacing.md,
  },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.cardBackground,
  },
  chipElegido: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipTexto: { fontSize: fontSize.sm, color: colors.secondary },
  chipTextoElegido: { color: colors.white, fontWeight: 'bold' },
  seccion: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.accent,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  contacto: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  contactoEmail: { fontSize: 14, fontWeight: '600', color: colors.primary },
  sinDatos: { fontSize: fontSize.sm, fontStyle: 'italic', color: colors.secondary },
  contactoLinea: { fontSize: fontSize.sm, color: colors.secondary },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  insignia: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  insigniaComprador: { backgroundColor: colors.success },
  insigniaTexto: { fontSize: fontSize.xs, color: colors.secondary },
  insigniaTextoComprador: { color: colors.white, fontWeight: 'bold' },
  mensajeVacio: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.md, textAlign: 'center' },
});
