import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Image,
} from 'react-native';
import { useNavigation, useFocusEffect, NavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useSeguidos } from '../hooks/useSeguidos';
import { useFeedFan } from '../hooks/useFeedFan';
import { useMisEntradas, EventoDeEntrada } from '../hooks/useMisEntradas';
import TarjetaEvento from '../components/TarjetaEvento';
import BotonSeguir from '../components/BotonSeguir';
import { TIPO_PROYECTO_LABEL } from '../lib/profiles';
import { venueLabel } from '../lib/venues';
import { PerfilStackParamList } from '../navigation/PerfilStack';
import { RootTabParamList } from '../navigation/linking';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type NavProp = NativeStackNavigationProp<PerfilStackParamList, 'PanelFan'>;

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ESTA_SEMANA = 10;

function primerNombre(user: { email?: string; user_metadata?: Record<string, any> }): string {
  const meta = user.user_metadata ?? {};
  const completo: string = meta.nombre || meta.full_name || meta.name || '';
  const nombre = completo.trim().split(/\s+/)[0];
  if (nombre) return nombre;
  return (user.email ?? '').split('@')[0];
}

// Minutos, horas, días; pasado un mes, fecha corta.
function haceCuanto(iso: string | undefined, ahora: number): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const min = Math.max(0, Math.floor((ahora - ms) / 60000));
  if (min < 60) return min <= 1 ? 'hace un momento' : `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
  return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

// Spec 124 — hermano de /fan de la web (W-042, W-075, W-194, W-195).
export default function PanelFanScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuth();
  const seguidos = useSeguidos();
  const feed = useFeedFan(seguidos.musicos, seguidos.venues);
  const entradas = useMisEntradas();
  const { eventos } = useEventos();
  const [refrescando, setRefrescando] = useState(false);

  const refrescarSeguidos = seguidos.refrescar;
  const refrescarEntradas = entradas.refrescar;
  // Seguir o dejar de seguir desde otra pantalla no avisa a esta. El primer
  // foco se salta: los hooks ya cargan al montar.
  const primerFoco = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primerFoco.current) {
        primerFoco.current = false;
        return;
      }
      refrescarSeguidos();
      refrescarEntradas();
    }, [refrescarSeguidos, refrescarEntradas]),
  );

  const onRefresh = async () => {
    setRefrescando(true);
    try {
      await Promise.all([seguidos.refrescar(), entradas.refrescar(), feed.refrescar()]);
    } finally {
      setRefrescando(false);
    }
  };

  // Se vuelve a filtrar con «≥ ahora» (criterio de la web): `proximas` del 125
  // incluye eventos que empezaron hasta 12 h antes y los de comienzaAt nulo.
  const proximaEntrada = useMemo<EventoDeEntrada | null>(() => {
    const ahora = Date.now();
    const candidatos = [
      ...entradas.proximas.map((e) => e.evento),
      ...entradas.comprasEnEmision.map((c) => c.evento),
    ].filter((ev): ev is EventoDeEntrada => {
      if (!ev || !ev.comienzaAt || ev.status === 'cancelled') return false;
      const ms = Date.parse(ev.comienzaAt);
      return !Number.isNaN(ms) && ms >= ahora;
    });
    candidatos.sort((a, b) => Date.parse(a.comienzaAt!) - Date.parse(b.comienzaAt!));
    return candidatos[0] ?? null;
  }, [entradas.proximas, entradas.comprasEnEmision]);

  const estaSemana = useMemo(() => {
    const ahora = Date.now();
    const limite = ahora + SEMANA_MS;
    return eventos
      .filter((e) => {
        if (e.status !== 'published' || !e.comienzaAt) return false;
        const ms = Date.parse(e.comienzaAt);
        return !Number.isNaN(ms) && ms >= ahora && ms <= limite;
      })
      .sort((a, b) => Date.parse(a.comienzaAt!) - Date.parse(b.comienzaAt!))
      .slice(0, MAX_ESTA_SEMANA);
  }, [eventos]);

  // Las pantallas destino viven en otras pestañas: se sube al Tab (spec 114).
  const tabs = () => navigation.getParent<NavigationProp<RootTabParamList>>();
  const verEvento = (eventoId: string) =>
    tabs()?.navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId } });
  const verMusico = (musicoId: string) =>
    tabs()?.navigate('Locales', { screen: 'VerMusico', params: { musicoId } });
  const verLocal = (venueId: string) =>
    tabs()?.navigate('Locales', { screen: 'DetalleLocal', params: { venueId } });
  const descubrir = () => tabs()?.navigate('Locales', { screen: 'DirectorioMusicos' });

  if (!user) {
    return (
      <View style={styles.centro}>
        <Text style={styles.aviso}>Inicia sesión para ver tu feed.</Text>
      </View>
    );
  }

  const ahora = Date.now();
  const haySeguidos = seguidos.musicos.length > 0 || seguidos.venues.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
    >
      {/* 1. Saludo */}
      <View>
        <Text style={styles.saludo}>Hola, {primerNombre(user)}</Text>
        <Text style={styles.subtitulo}>
          {feed.feed.length === 0
            ? 'Sigue a quien te guste y sus fechas aparecen acá.'
            : 'Lo que anunciaron los que sigues.'}
        </Text>
      </View>

      {/* 2. Tu próxima entrada — no depende del feed (W-075). */}
      {proximaEntrada && (
        <View style={styles.proxima}>
          <Text style={styles.proximaRotulo}>TU PRÓXIMA ENTRADA</Text>
          <Text style={styles.proximaArtista}>{proximaEntrada.artista}</Text>
          <Text style={styles.proximaDetalle}>
            {proximaEntrada.venueName} · {proximaEntrada.fecha} · {proximaEntrada.hora}
          </Text>
          <TouchableOpacity style={styles.proximaBoton} onPress={() => navigation.navigate('MisEntradas')}>
            <Text style={styles.proximaBotonTexto}>Ver entrada</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. Tu feed */}
      {feed.error ? (
        <Text style={styles.aviso}>No se pudo cargar tu feed.</Text>
      ) : (
        feed.feed.length > 0 && (
          <View style={styles.seccion}>
            <Text style={styles.tituloSeccion}>Tu feed</Text>
            {feed.feed.map((item) => (
              <View key={item.evento.id} style={styles.itemFeed}>
                <View style={styles.filaAutor}>
                  <Text style={styles.autor} numberOfLines={1}>
                    {item.autor.nombre} {item.autor.tipo === 'musico' ? 'publicó una fecha' : 'programó una fecha'}
                  </Text>
                  <Text style={styles.hace}>{haceCuanto(item.evento.createdAt, ahora)}</Text>
                </View>
                <TarjetaEvento evento={item.evento} onPress={() => verEvento(item.evento.id)} />
              </View>
            ))}
          </View>
        )
      )}

      {/* 4. Esta semana — arranque en frío de quien no sigue a nadie. */}
      {estaSemana.length > 0 && (
        <View style={styles.seccion}>
          <Text style={styles.tituloSeccion}>Esta semana</Text>
          {estaSemana.map((e) => (
            <TarjetaEvento key={e.id} evento={e} onPress={() => verEvento(e.id)} />
          ))}
        </View>
      )}

      {/* 5. Sigues a */}
      <View style={styles.seccion}>
        <Text style={styles.tituloSeccion}>Sigues a</Text>
        {!haySeguidos && !seguidos.loading && (
          <Text style={styles.avisoIzq}>Todavía no sigues a nadie.</Text>
        )}
        {seguidos.musicos.map((m) => {
          const imagen = m.avatar ?? m.foto;
          const contexto = [m.tipoProyecto ? TIPO_PROYECTO_LABEL[m.tipoProyecto] : null, m.ciudad]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={`m-${m.id}`} style={styles.fila}>
              <TouchableOpacity style={styles.filaCuerpo} onPress={() => verMusico(m.id)}>
                {imagen ? (
                  <Image source={{ uri: imagen }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarVacio]}>
                    <Text>👤</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.filaNombre} numberOfLines={1}>{m.nombre}</Text>
                  {!!contexto && <Text style={styles.filaContexto} numberOfLines={1}>{contexto}</Text>}
                </View>
              </TouchableOpacity>
              <BotonSeguir tipo="musico" targetId={m.id} onCambio={() => seguidos.refrescar()} />
            </View>
          );
        })}
        {seguidos.venues.map((v) => (
          <View key={`v-${v.id}`} style={styles.fila}>
            <TouchableOpacity style={styles.filaCuerpo} onPress={() => verLocal(v.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filaNombre} numberOfLines={1}>{v.name}</Text>
                <Text style={styles.filaContexto} numberOfLines={1}>
                  {[venueLabel(v.type), v.comuna].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </TouchableOpacity>
            <BotonSeguir tipo="venue" targetId={v.id} onCambio={() => seguidos.refrescar()} />
          </View>
        ))}
        <TouchableOpacity onPress={descubrir}>
          <Text style={styles.enlace}>Descubrir músicos →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.lg },
  centro: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  saludo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary },
  subtitulo: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.xs },
  proxima: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md },
  proximaRotulo: { fontSize: fontSize.xs, fontWeight: 'bold', color: colors.white, letterSpacing: 1, opacity: 0.8 },
  proximaArtista: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.white, marginTop: spacing.xs },
  proximaDetalle: { fontSize: fontSize.sm, color: colors.white, marginTop: spacing.xs },
  proximaBoton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.white,
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: spacing.md,
  },
  proximaBotonTexto: { color: colors.white, fontWeight: '600', fontSize: fontSize.sm },
  seccion: { gap: spacing.sm },
  tituloSeccion: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  itemFeed: { gap: spacing.xs },
  filaAutor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  autor: { flex: 1, fontSize: fontSize.sm, color: colors.secondary, fontWeight: '600' },
  hace: { fontSize: fontSize.xs, color: colors.muted },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  filaCuerpo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarVacio: { backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  filaNombre: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  filaContexto: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  enlace: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600', marginTop: spacing.xs },
  aviso: { fontSize: fontSize.md, color: colors.muted, textAlign: 'center' },
  avisoIzq: { fontSize: fontSize.md, color: colors.muted },
});
