// Spec 157 — Redes del local o del músico: las cinco cuentas y el historial de
// publicaciones. Hermana de `/local/redes` y `/musico/redes` de la web (W-237, W-239).
//
// Una sola pantalla para MiLocalStack y MusicoStack, como `Contactos` (spec 155): el
// tenant sale de `useTenantRedes`, no de la ruta. Conectar una cuenta abre el panel web
// (ver Contexto del spec); la lista se vuelve a leer al regresar.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  AppState,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTenantRedes } from '../hooks/useTenantRedes';
import { useConexionesRedes } from '../hooks/useConexionesRedes';
import { usePublicacionesRedes } from '../hooks/usePublicacionesRedes';
import { IconoRed, AvisoRedes, hayAvisoRedes, abrirPanelRedesWeb } from '../components/redes/ComunRedes';
import { ORDEN_REDES, REDES, TOPES_REDES, Red } from '../lib/redes/catalogo';
import { mensajeRedes, ConexionRed, DestinoRed, PublicacionRed } from '../lib/redes/api';
import type { MedioRed } from '../lib/redes/reglas';
import { formatearFechaHoraCorta } from '../lib/redes/horario';
import { confirmar } from '../lib/confirm';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type RedesNav = NativeStackNavigationProp<{
  Redes: undefined;
  PublicarRedes: { eventoId?: string } | undefined;
}>;

/** Igual que `textoFecha` de `ListaPublicaciones.js`. */
function textoFecha(p: PublicacionRed, zona: string): string {
  if (p.estado === 'programada' && p.programadaPara) {
    return `Programada para el ${formatearFechaHoraCorta(p.programadaPara, zona)}`;
  }
  const publicada = p.destinos
    .map((d) => d.publicadoAt)
    .filter((f): f is string => Boolean(f))
    .sort()[0];
  if (publicada) return `Publicada el ${formatearFechaHoraCorta(publicada, zona)}`;
  return `Creada el ${formatearFechaHoraCorta(p.createdAt, zona)}`;
}

/** El bucket se limpia a los 30 días: un medio borrado muestra el recuadro gris. */
function Miniatura({ medio }: { medio: MedioRed | undefined }) {
  const [roto, setRoto] = useState(false);
  if (!medio?.url || roto) return <View style={styles.miniatura} />;
  if (medio.tipo === 'video') {
    return (
      <View style={[styles.miniatura, styles.centrado]}>
        <Ionicons name="videocam" size={24} color={colors.muted} />
      </View>
    );
  }
  return <Image source={{ uri: medio.url }} style={styles.miniatura} onError={() => setRoto(true)} />;
}

function Avatar({ uri }: { uri: string | null }) {
  const [roto, setRoto] = useState(false);
  if (!uri || roto) return <View style={styles.avatar} />;
  return <Image source={{ uri }} style={styles.avatar} onError={() => setRoto(true)} />;
}

const COLOR_DESTINO: Record<DestinoRed['estado'], string> = {
  pendiente: colors.primary,
  publicando: colors.warning,
  esperando: colors.warning,
  publicada: colors.success,
  fallida: colors.danger,
  cancelada: colors.muted,
};

function Pastilla({
  destino: d,
  ocupado,
  onReintentar,
}: {
  destino: DestinoRed;
  ocupado: boolean;
  onReintentar: () => void;
}) {
  const color = COLOR_DESTINO[d.estado];
  const sufijo =
    d.estado === 'pendiente'
      ? ' · Programada'
      : d.estado === 'publicando' || d.estado === 'esperando'
        ? ' · Publicando…'
        : '';
  return (
    <View style={styles.destino}>
      <View style={[styles.pastilla, { borderColor: color }]}>
        <IconoRed red={d.red} size={14} color={color} />
        <Text
          style={[
            styles.textoPastilla,
            { color },
            d.estado === 'cancelada' && styles.tachado,
          ]}
        >
          {REDES[d.red].nombre}
          {sufijo}
        </Text>
        {d.estado === 'publicada' && d.urlExterna && (
          <TouchableOpacity onPress={() => Linking.openURL(d.urlExterna!)} disabled={ocupado}>
            <Text style={styles.linkPastilla}>Ver</Text>
          </TouchableOpacity>
        )}
        {d.estado === 'fallida' && (
          <TouchableOpacity onPress={onReintentar} disabled={ocupado}>
            <Text style={[styles.linkPastilla, ocupado && styles.apagado]}>Reintentar</Text>
          </TouchableOpacity>
        )}
      </View>
      {d.estado === 'fallida' && d.error && <Text style={styles.errorChico}>{d.error}</Text>}
    </View>
  );
}

export default function RedesScreen() {
  const navigation = useNavigation<RedesNav>();
  const tenant = useTenantRedes();
  const enFoco = useIsFocused();
  const habilitado = tenant.estado === 'listo' && tenant.esPro;
  const cuentas = useConexionesRedes(tenant.tenantType, habilitado);
  const historial = usePublicacionesRedes(
    tenant.tenantType,
    habilitado && cuentas.disponibles.length > 0,
    enFoco
  );

  const [errorCuentas, setErrorCuentas] = useState<string | null>(null);
  const [desconectando, setDesconectando] = useState<Red | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const { recargar } = cuentas;

  // Las cuentas se recargan en tres momentos porque cada plataforma vuelve de la web de
  // forma distinta. 1) Al entrar a la pantalla; la primera vez ya cargó el hook.
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) {
        primeraVez.current = false;
        return;
      }
      recargar();
    }, [recargar])
  );

  // 3) Al volver la app al frente: en Android el Custom Tab manda la app al fondo y la
  // promesa de `openBrowserAsync` se resuelve antes de que el usuario termine; en el
  // build web, volver a la pestaña dispara lo mismo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recargar();
    });
    return () => sub.remove();
  }, [recargar]);

  // 2) Al cerrarse el navegador (iOS).
  const conectar = async () => {
    if (!tenant.panelWeb) return;
    setErrorCuentas(null);
    try {
      await abrirPanelRedesWeb(tenant.panelWeb);
    } catch (e) {
      setErrorCuentas(mensajeRedes(e));
    }
    recargar();
  };

  const desconectar = (c: ConexionRed) => {
    const nombre = REDES[c.red].nombre;
    confirmar(
      {
        title: `Desconectar ${nombre}`,
        message: `Sonópolis deja de publicar en ${c.cuentaNombre ?? 'esta cuenta'}. Las publicaciones programadas para ${nombre} se cancelan. Lo ya publicado sigue en tu cuenta.`,
        confirmText: 'Desconectar',
        destructive: true,
      },
      async () => {
        setDesconectando(c.red);
        setErrorCuentas(null);
        try {
          await cuentas.desconectar(c.red);
          // La API canceló los destinos pendientes de esa red.
          await historial.recargar();
        } catch (e) {
          setErrorCuentas(mensajeRedes(e));
        } finally {
          setDesconectando(null);
        }
      }
    );
  };

  const cancelar = (p: PublicacionRed) => {
    confirmar(
      {
        title: 'Cancelar publicación',
        message: 'No se publica en ninguna red que siga pendiente. Lo que ya se publicó sigue en tu cuenta.',
        confirmText: 'Cancelar publicación',
        cancelText: 'Volver',
        destructive: true,
      },
      async () => {
        setErrorAccion(null);
        try {
          await historial.cancelar(p.id);
        } catch (e) {
          setErrorAccion(mensajeRedes(e));
        }
      }
    );
  };

  const reintentar = async (id: string, red: Red) => {
    setErrorAccion(null);
    try {
      await historial.reintentar(id, red);
    } catch (e) {
      setErrorAccion(mensajeRedes(e));
    }
  };

  const propsAviso = {
    tenant,
    disponibles: cuentas.disponibles,
    sinPro: historial.sinPro,
    cargando: cuentas.cargando,
    error: cuentas.error,
  };
  if (hayAvisoRedes(propsAviso)) return <AvisoRedes {...propsAviso} />;

  const sinActivas = cuentas.activas.length === 0;
  const ocupado = historial.ocupado;

  const filaCuenta = (red: Red) => {
    const reglas = REDES[red];
    const disponible = cuentas.disponibles.includes(red);
    const conexion = cuentas.conexiones.find((c) => c.red === red) ?? null;
    const esteDesconectando = desconectando === red;

    let detalle;
    if (!disponible) {
      detalle = <Text style={styles.gris}>Pronto</Text>;
    } else if (!conexion) {
      detalle = (
        <>
          {reglas.ayuda && <Text style={styles.gris}>{reglas.ayuda}</Text>}
          <TouchableOpacity style={styles.botonChico} onPress={conectar}>
            <Text style={styles.textoBotonChico}>Conectar en la web</Text>
          </TouchableOpacity>
        </>
      );
    } else if (conexion.estado === 'activa') {
      detalle = (
        <>
          <View style={styles.filaCuenta}>
            <Avatar uri={conexion.cuentaAvatar} />
            <Text style={styles.cuenta}>{conexion.cuentaNombre}</Text>
          </View>
          <Text style={styles.conectada}>Conectada</Text>
          <TouchableOpacity
            style={styles.botonChico}
            onPress={() => desconectar(conexion)}
            disabled={desconectando != null}
          >
            <Text style={styles.textoBotonChico}>{esteDesconectando ? 'Desconectando…' : 'Desconectar'}</Text>
          </TouchableOpacity>
        </>
      );
    } else {
      detalle = (
        <>
          <Text style={styles.cuenta}>{conexion.cuentaNombre}</Text>
          {conexion.error && <Text style={styles.advertencia}>{conexion.error}</Text>}
          <View style={styles.filaBotones}>
            <TouchableOpacity style={styles.botonChico} onPress={conectar}>
              <Text style={styles.textoBotonChico}>Reconectar en la web</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.botonChico}
              onPress={() => desconectar(conexion)}
              disabled={desconectando != null}
            >
              <Text style={styles.textoBotonChico}>{esteDesconectando ? 'Desconectando…' : 'Desconectar'}</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    return (
      <View key={red} style={styles.red}>
        <IconoRed red={red} apagado={!disponible} />
        <View style={styles.cuerpoRed}>
          <Text style={[styles.nombreRed, !disponible && styles.apagado]}>{reglas.nombre}</Text>
          {detalle}
          {red === 'x' && disponible && (
            <Text style={styles.gris}>Hasta {TOPES_REDES.maxPostsXMes} publicaciones en X al mes.</Text>
          )}
        </View>
      </View>
    );
  };

  const lista = historial.publicaciones;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <TouchableOpacity
        style={[styles.botonPrimario, sinActivas && styles.botonApagado]}
        onPress={() => navigation.navigate('PublicarRedes')}
        disabled={sinActivas}
      >
        <Text style={styles.textoBotonPrimario}>Nueva publicación</Text>
      </TouchableOpacity>
      {sinActivas && <Text style={styles.grisCentro}>Conecta al menos una red</Text>}

      <View style={styles.card}>
        <Text style={styles.titulo}>Cuentas</Text>
        {cuentas.error && <Text style={styles.error}>{cuentas.error}</Text>}
        {errorCuentas && <Text style={styles.error}>{errorCuentas}</Text>}
        {ORDEN_REDES.map(filaCuenta)}
        <Text style={styles.gris}>
          Las cuentas se conectan en sonopolis.org. Al volver, esta lista se actualiza sola.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.titulo}>Publicaciones</Text>
        {errorAccion && <Text style={styles.error}>{errorAccion}</Text>}
        {lista === null && !historial.error && <ActivityIndicator color={colors.accent} />}
        {historial.error && <Text style={styles.error}>{historial.error}</Text>}
        {lista && lista.length === 0 && (
          <Text style={styles.gris}>Todavía no publicas nada desde Sonópolis.</Text>
        )}
        {lista?.map((p) => (
          <View key={p.id} style={styles.tarjeta}>
            <Miniatura medio={p.medios[0]} />
            <View style={styles.cuerpoTarjeta}>
              <Text style={styles.textoPublicacion} numberOfLines={2}>
                {p.texto}
              </Text>
              <Text style={styles.gris}>{textoFecha(p, tenant.zonaHoraria)}</Text>
              <View style={styles.destinos}>
                {p.destinos.map((d) => (
                  <Pastilla
                    key={d.id ?? d.red}
                    destino={d}
                    ocupado={ocupado}
                    onReintentar={() => reintentar(p.id, d.red)}
                  />
                ))}
              </View>
              {p.estado === 'programada' && (
                <TouchableOpacity onPress={() => cancelar(p)} disabled={ocupado}>
                  <Text style={[styles.linkCancelar, ocupado && styles.apagado]}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  centrado: { alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  botonPrimario: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  botonApagado: { opacity: 0.5 },
  textoBotonPrimario: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  red: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cuerpoRed: { flex: 1, gap: spacing.xs },
  nombreRed: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  filaCuenta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border },
  cuenta: { fontSize: fontSize.sm, color: colors.primary },
  conectada: { fontSize: fontSize.sm, color: colors.success, fontWeight: 'bold' },
  advertencia: { fontSize: fontSize.sm, color: colors.warning },
  filaBotones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  botonChico: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  textoBotonChico: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  gris: { fontSize: fontSize.xs, color: colors.muted },
  grisCentro: { fontSize: fontSize.xs, color: colors.muted, textAlign: 'center', marginTop: spacing.xs },
  error: { fontSize: fontSize.sm, color: colors.danger },
  errorChico: { fontSize: fontSize.xs, color: colors.danger, marginTop: 2 },
  apagado: { color: colors.muted },
  tarjeta: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  miniatura: { width: 64, height: 64, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  cuerpoTarjeta: { flex: 1, gap: spacing.xs },
  textoPublicacion: { fontSize: fontSize.sm, color: colors.primary },
  destinos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  destino: { maxWidth: '100%' },
  pastilla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  textoPastilla: { fontSize: fontSize.xs, fontWeight: 'bold' },
  tachado: { textDecorationLine: 'line-through' },
  linkPastilla: { fontSize: fontSize.xs, color: colors.accent, fontWeight: 'bold', marginLeft: 4 },
  linkCancelar: { fontSize: fontSize.sm, color: colors.accent, fontWeight: 'bold' },
});
