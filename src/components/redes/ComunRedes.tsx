// Spec 157 — piezas que comparten Redes y el redactor: el ícono de cada red, el panel
// web donde se conectan las cuentas y el aviso cuando la función no está lista.

import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../context/AuthContext';
import { BASE_WEB } from '../../lib/apiWeb';
import { ORDEN_REDES, Red } from '../../lib/redes/catalogo';
import type { useTenantRedes } from '../../hooks/useTenantRedes';
import { colors, spacing, fontSize } from '../../theme';

type TenantRedes = ReturnType<typeof useTenantRedes>;

const ICONO: Record<Red, keyof typeof Ionicons.glyphMap> = {
  instagram: 'logo-instagram',
  facebook: 'logo-facebook',
  threads: 'logo-threads',
  x: 'logo-x',
  tiktok: 'logo-tiktok',
};

export function IconoRed({
  red,
  size = 22,
  apagado,
  color,
}: {
  red: Red;
  size?: number;
  apagado?: boolean;
  color?: string;
}) {
  return <Ionicons name={ICONO[red]} size={size} color={apagado ? colors.muted : color ?? colors.primary} />;
}

/**
 * Conectar una red pasa por el panel web: el OAuth necesita la cookie firmada, la
 * sesión por cookie y las URLs de callback de sonopolis.org (ver Contexto del spec).
 * La misma base que la API (`BASE_WEB`), para que conectar y publicar vayan al mismo
 * deploy. En iOS la promesa se resuelve al cerrar el navegador; en Android, antes.
 */
export async function abrirPanelRedesWeb(panelWeb: 'local' | 'musico'): Promise<void> {
  await WebBrowser.openBrowserAsync(`${BASE_WEB}/${panelWeb}/redes`);
}

interface AvisoRedesProps {
  tenant: TenantRedes;
  disponibles: Red[];
  /** La API respondió 402: el Pro venció con la pantalla abierta. */
  sinPro?: boolean;
  /** Las cuentas todavía no llegan: sin esto, `disponibles: []` diría «no disponible». */
  cargando?: boolean;
  /** No se pudieron leer las cuentas: tampoco es «no disponible». */
  error?: string | null;
}

/**
 * Si hay que mostrar el aviso en vez de la pantalla normal. Va aparte de `AvisoRedes`
 * para que la pantalla decida sin llamar al componente como función: usa un hook.
 */
export function hayAvisoRedes({ tenant, disponibles, sinPro }: AvisoRedesProps): boolean {
  return tenant.estado !== 'listo' || !tenant.esPro || !!sinPro || disponibles.length === 0;
}

/** Lo que se muestra cuando la función no está lista; `null` si va la pantalla normal. */
export function AvisoRedes(props: AvisoRedesProps) {
  const { tenant, disponibles, sinPro, cargando, error } = props;
  // Sin tenant, `panelWeb` y `tenantType` vienen en null: el texto sale del rol.
  const { role } = useAuth();

  if (!hayAvisoRedes(props)) return null;

  if (tenant.estado === 'cargando') {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (tenant.estado === 'sin_tenant') {
    return (
      <View style={styles.centro}>
        {tenant.error ? (
          <Text style={styles.error}>{tenant.error}</Text>
        ) : (
          <Text style={styles.texto}>
            {role === 'musician'
              ? 'Primero crea tu perfil de músico: las publicaciones salen a nombre de tu banda.'
              : 'Primero crea tu local: las publicaciones salen a nombre de tu local.'}
          </Text>
        )}
      </View>
    );
  }

  // Sin Pro: solo información, sin precio, botón ni link (reglas de las tiendas).
  if (!tenant.esPro || sinPro) {
    return (
      <View style={styles.centro}>
        <Text style={styles.texto}>
          Publica tus eventos en Instagram, Facebook, Threads, X y TikTok desde Sonópolis, al momento o
          programado.
        </Text>
        <View style={styles.iconos}>
          {ORDEN_REDES.map((red) => (
            <IconoRed key={red} red={red} size={28} />
          ))}
        </View>
        <Text style={styles.nota}>Publicar en redes es parte de Sonópolis Pro.</Text>
      </View>
    );
  }

  // Queda `disponibles.length === 0`.
  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centro}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  // Es lo que se ve hoy en producción: la web devuelve `disponibles: []` sin las
  // variables de las redes.
  return (
    <View style={styles.centro}>
      <Text style={styles.texto}>Publicar en redes todavía no está disponible.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  texto: { fontSize: fontSize.md, color: colors.primary, textAlign: 'center', lineHeight: 22 },
  nota: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
  error: { fontSize: fontSize.sm, color: colors.danger, textAlign: 'center' },
  iconos: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
