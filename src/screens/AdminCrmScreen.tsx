// Spec 159 — CRM del admin de Sonópolis: port de `admin/crm/page.js` de la web (W-193,
// W-212). La lógica vive en `useAdminCrm` (spec 153). Son cientos de tenants: van en
// una `SectionList`, que dibuja solo lo que se ve.

import { View, Text, TouchableOpacity, SectionList, RefreshControl, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAdminCrm, type TenantCrm } from '../hooks/useAdminCrm';
import BotonesPro, { EtiquetaPro } from '../components/BotonesPro';
import { etiquetaPais } from '../constants/paises';
import type { AdminParamList } from '../navigation/pantallasAdmin';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

type NavProp = NativeStackNavigationProp<AdminParamList, 'AdminCrm'>;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Fila({ t, onVer, onCambio }: { t: TenantCrm; onVer: () => void; onCambio: () => void }) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.fila}>
      <View style={styles.encabezado}>
        <Text style={styles.nombre} numberOfLines={1}>
          {t.nombre}
        </Text>
        <EtiquetaPro proHasta={t.proHasta} />
      </View>
      <Text style={styles.detalle}>
        {[
          t.pais && etiquetaPais(t.pais),
          plural(t.contactos, 'contacto', 'contactos'),
          plural(t.compradores, 'comprador', 'compradores'),
          `${t.conWhatsapp} con WhatsApp`,
          plural(t.eventosActivos, 'evento activo', 'eventos activos'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <View style={styles.acciones}>
        <TouchableOpacity style={styles.botonVer} onPress={onVer}>
          <Text style={styles.botonVerTexto}>Ver CRM</Text>
        </TouchableOpacity>
        <BotonesPro tipo={t.type} id={t.id} nombre={t.nombre} proHasta={t.proHasta} compacto onCambio={onCambio} />
      </View>
    </View>
  );
}

export default function AdminCrmScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation<NavProp>();
  const { cargando, error, bandas, locales, totalContactos, recargar } = useAdminCrm();

  const sections = [
    { titulo: `Bandas · ${bandas.length}`, vacio: 'No hay bandas.', data: bandas },
    { titulo: `Locales · ${locales.length}`, vacio: 'No hay locales.', data: locales },
  ];

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.contenido}
      sections={sections}
      keyExtractor={(t) => `${t.type}:${t.id}`}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.cabecera}>
          <Text style={styles.bajada}>
            El público de cada local y banda, como lo ve cada uno. {totalContactos}{' '}
            {totalContactos === 1 ? 'contacto' : 'contactos'} en toda la plataforma.
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      }
      renderSectionHeader={({ section }) => <Text style={styles.tituloSeccion}>{section.titulo.toUpperCase()}</Text>}
      renderSectionFooter={({ section }) =>
        section.data.length === 0 && !cargando ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>{section.vacio}</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <Fila
          t={item}
          onVer={() => navigation.navigate('AdminTenant', { tipo: item.type, id: item.id, nombre: item.nombre })}
          onCambio={recargar}
        />
      )}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={colores.accent} />}
    />
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  cabecera: { marginBottom: spacing.sm, gap: spacing.sm },
  bajada: { fontSize: fontSize.sm, color: c.secondary },
  error: { fontSize: fontSize.sm, color: c.danger },
  tituloSeccion: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    letterSpacing: 0.6,
    color: c.accent,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  fila: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nombre: { flexShrink: 1, fontSize: fontSize.md, fontWeight: '600', color: c.primary },
  detalle: { fontSize: fontSize.xs, color: c.secondary },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.xs },
  botonVer: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: c.accentLight,
  },
  botonVerTexto: { fontSize: fontSize.xs, fontWeight: '600', color: c.primary },
  vacio: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  vacioTexto: { fontSize: fontSize.sm, color: c.secondary },
});
