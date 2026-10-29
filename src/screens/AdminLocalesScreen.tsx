// Spec 159 — Locales del admin de Sonópolis: buscar un local e invitar o cancelar a su
// dueño real. Port de `admin/locales/BuscadorLocales.js` de la web (W-232). La lógica
// vive en `useAdminLocales` (spec 153). Invitar y cancelar van por la ruta de la web:
// sin el W-249 y el W-250 en producción, su error aparece en rojo en la tarjeta.

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useAdminLocales, filtrarLocales, type LocalAdmin } from '../hooks/useAdminLocales';
import { fechaCorta } from '../components/BotonesPro';
import { venueLabel } from '../lib/venues';
import { etiquetaPais } from '../constants/paises';
import { confirmar } from '../lib/confirm';
import type { VenueType } from '../types';
import { colors, spacing, borderRadius, fontSize } from '../theme';

const ROLES: Record<string, string> = { musician: 'músico', local: 'local', fan: 'fan' };

// Amarillo de «No está a nombre del local»: sin token propio en el tema.
const AMARILLO_FONDO = '#FFF8E1';
const AMARILLO_BORDE = '#F5D77A';
const AMARILLO_TEXTO = '#8D6E00';

type Aviso = { tono: 'ok' | 'warn' | 'error'; texto: string };

const COLOR_AVISO: Record<Aviso['tono'], string> = {
  ok: colors.success,
  warn: colors.warning,
  error: colors.danger,
};

const lugarDe = (l: LocalAdmin) => [l.direccion, l.comuna].filter(Boolean).join(', ');

function FormInvitacion({
  local,
  ocupado,
  onEnviar,
}: {
  local: LocalAdmin;
  ocupado: boolean;
  onEnviar: (correo: string) => void;
}) {
  const [email, setEmail] = useState('');
  const correo = email.trim().toLowerCase();
  const lugar = lugarDe(local);
  const desde = local.dueno?.nombre || local.dueno?.correo;

  return (
    <View style={styles.form}>
      <Text style={styles.etiquetaCampo}>Correo oficial del local</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="contacto@local.cl"
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {correo ? (
        <Text style={styles.texto}>
          <Text style={styles.negrita}>{local.nombre}</Text>
          {lugar ? ` (${lugar})` : ''} pasará {desde ? `de ${desde} ` : ''}a{' '}
          <Text style={styles.negrita}>{correo}</Text> cuando esa persona entre a Sonópolis.
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.botonPrimario, (ocupado || !correo) && styles.deshabilitado]}
        disabled={ocupado || !correo}
        onPress={() => onEnviar(correo)}
      >
        <Text style={styles.botonPrimarioTexto}>{ocupado ? 'Enviando…' : 'Enviar invitación'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function TarjetaLocal({
  local,
  invitar,
  cancelar,
}: {
  local: LocalAdmin;
  invitar: (venueId: string, email: string) => Promise<{ token: string; emailError: string | null }>;
  cancelar: (token: string) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const lugar = lugarDe(local);
  const inv = local.invitacion;

  const enviar = async (email: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await invitar(local.venueId, email);
      setAviso(
        r.emailError
          ? { tono: 'warn', texto: `La invitación quedó creada pero el correo no salió: ${r.emailError}. Usa Reenviar.` }
          : { tono: 'ok', texto: `Invitación enviada a ${email.trim().toLowerCase()}.` }
      );
      setAbierto(false);
    } catch (e: any) {
      setAviso({ tono: 'error', texto: e?.message ?? 'No se pudo invitar' });
    } finally {
      setOcupado(false);
    }
  };

  const alCancelar = () => {
    if (!inv) return;
    confirmar(
      { title: `¿Cancelar la invitación a ${inv.correo}? El enlace que le llegó dejará de servir.`, destructive: true },
      async () => {
        setOcupado(true);
        setAviso(null);
        try {
          await cancelar(inv.token);
          setAviso({ tono: 'ok', texto: 'Invitación cancelada.' });
        } catch (e: any) {
          setAviso({ tono: 'error', texto: e?.message ?? 'No se pudo cancelar' });
        } finally {
          setOcupado(false);
        }
      }
    );
  };

  return (
    <View style={styles.tarjeta}>
      <View style={styles.filaNombre}>
        <Text style={styles.nombre}>{local.nombre}</Text>
        {local.dueno?.rol !== 'local' && (
          <View style={styles.insigniaAmarilla}>
            <Text style={styles.insigniaAmarillaTexto}>No está a nombre del local</Text>
          </View>
        )}
      </View>
      <Text style={styles.textoSecundario}>
        {[
          local.tipo && venueLabel(local.tipo as VenueType),
          local.pais && etiquetaPais(local.pais),
          `${local.eventos} ${local.eventos === 1 ? 'evento' : 'eventos'}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Text style={styles.texto}>📍 {lugar || 'Sin dirección'}</Text>
      <Text style={styles.textoSecundario}>
        <Text style={styles.negrita}>Dueño actual:</Text>{' '}
        {local.dueno
          ? [local.dueno.nombre || '(sin nombre)', (local.dueno.rol && ROLES[local.dueno.rol]) ?? local.dueno.rol, local.dueno.correo]
              .filter(Boolean)
              .join(' · ')
          : 'nadie'}
      </Text>
      {inv && (
        <Text style={styles.texto}>
          {inv.enviadaAt
            ? `Invitación enviada a ${inv.correo} · ${fechaCorta(inv.enviadaAt)}`
            : `Invitación a ${inv.correo} creada, sin enviar`}
        </Text>
      )}

      <View style={styles.acciones}>
        {inv ? (
          <>
            <TouchableOpacity
              style={[styles.boton, ocupado && styles.deshabilitado]}
              disabled={ocupado}
              onPress={() => enviar(inv.correo)}
            >
              <Text style={styles.botonTexto}>Reenviar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.boton, styles.botonFantasma, ocupado && styles.deshabilitado]}
              disabled={ocupado}
              onPress={alCancelar}
            >
              <Text style={styles.botonTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.boton, styles.botonFantasma]} onPress={() => setAbierto((v) => !v)}>
              <Text style={styles.botonTexto}>Otro correo</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.boton, styles.botonOscuro]} onPress={() => setAbierto((v) => !v)}>
            <Text style={[styles.botonTexto, styles.botonOscuroTexto]}>{abierto ? 'Cerrar' : 'Invitar dueño'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {aviso && <Text style={[styles.aviso, { color: COLOR_AVISO[aviso.tono] }]}>{aviso.texto}</Text>}

      {abierto && <FormInvitacion local={local} ocupado={ocupado} onEnviar={enviar} />}
    </View>
  );
}

export default function AdminLocalesScreen() {
  const { cargando, error, locales, recargar, invitar, cancelar } = useAdminLocales();
  const [q, setQ] = useState('');
  const visibles = filtrarLocales(locales, q);

  // Un elemento y no un componente: uno creado en cada render remontaría el buscador
  // y perdería el foco a cada letra.
  const encabezado = (
    <View style={styles.cabecera}>
      <Text style={styles.bajada}>
        Busca el local por nombre o dirección e invita a su dueño real con su correo oficial. El local pasa a esa cuenta
        cuando entra a Sonópolis con ese correo.
      </Text>
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder="Nombre, dirección o comuna"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
      />
      <Text style={styles.textoSecundario}>
        {visibles.length} {visibles.length === 1 ? 'local' : 'locales'}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.contenido}
      data={visibles}
      keyExtractor={(l) => l.venueId}
      renderItem={({ item }) => <TarjetaLocal local={item} invitar={invitar} cancelar={cancelar} />}
      ListHeaderComponent={encabezado}
      ListEmptyComponent={
        q.trim() && !cargando ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>Ningún local coincide con «{q}».</Text>
          </View>
        ) : null
      }
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={colors.accent} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  cabecera: { gap: spacing.sm, marginBottom: spacing.sm },
  bajada: { fontSize: fontSize.sm, color: colors.secondary },
  texto: { fontSize: fontSize.sm, color: colors.primary },
  textoSecundario: { fontSize: fontSize.xs, color: colors.secondary },
  negrita: { fontWeight: 'bold', color: colors.primary },
  error: { fontSize: fontSize.sm, color: colors.danger },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    backgroundColor: colors.white,
  },
  tarjeta: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  filaNombre: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  nombre: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  insigniaAmarilla: {
    backgroundColor: AMARILLO_FONDO,
    borderWidth: 1,
    borderColor: AMARILLO_BORDE,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  insigniaAmarillaTexto: { fontSize: fontSize.xs, fontWeight: '600', color: AMARILLO_TEXTO },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  boton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardBackground,
  },
  botonFantasma: { borderColor: 'transparent', backgroundColor: 'transparent' },
  botonOscuro: { backgroundColor: colors.primary, borderColor: colors.primary },
  botonTexto: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primary },
  botonOscuroTexto: { color: colors.white },
  deshabilitado: { opacity: 0.5 },
  aviso: { fontSize: fontSize.sm, marginTop: spacing.xs },
  form: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  etiquetaCampo: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  botonPrimario: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  botonPrimarioTexto: { fontSize: fontSize.sm, fontWeight: '600', color: colors.white },
  vacio: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  vacioTexto: { fontSize: fontSize.sm, color: colors.secondary, textAlign: 'center' },
});
