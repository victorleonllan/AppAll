import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { musicosMock } from '../data/mock/musicos';
import { PerfilMusico } from '../types';
import { mapProfileFromDB, mapProfileToDB, TIPO_PROYECTO_LABEL, perfilCompletitud } from '../lib/profiles';
import { confirmar } from '../lib/confirm';
import TarjetaEvento from '../components/TarjetaEvento';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function PerfilMusicoScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const { eventos, misColaboraciones } = useEventos();
  const [perfil, setPerfil] = useState<PerfilMusico | null>(null);
  const [esMock, setEsMock] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [ventas, setVentas] = useState({ entradas: 0, monto: 0 });

  const cargarPerfil = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (!error && data) {
        setPerfil(mapProfileFromDB(data));
        setEsMock(false);
        return;
      }
      // Sin fila en Supabase: cae a mock. Se marca como tal — un dato de
      // muestra indistinguible de uno real es la trampa que confunde más
      // (spec 030, problema 3).
      const encontrado = musicosMock.find((m) => m.userId === user.id);
      setPerfil(encontrado ?? null);
      setEsMock(Boolean(encontrado));
    } catch {
      const encontrado = musicosMock.find((m) => m.userId === user.id);
      setPerfil(encontrado ?? null);
      setEsMock(Boolean(encontrado));
    } finally {
      setCargando(false);
    }
  }, [user]);

  // useFocusEffect ya cubre la carga inicial (se dispara al montar) y,
  // además, la recarga al volver de EditarPerfilBanda — sin esto, guardar
  // y volver deja el dashboard mostrando los datos viejos.
  useFocusEffect(
    useCallback(() => {
      cargarPerfil();
    }, [cargarPerfil])
  );

  // Spec 033 — "mis eventos" ya no es solo "los que creé": incluye los que
  // administro por ser dueño del local o artista vinculado. createdBy queda
  // como fallback para cuando la migración todavía no aplicó o el evento es
  // anterior a ella.
  const misEventoIds = new Set(misColaboraciones.map((c) => c.eventId));
  const misEventos = user
    ? eventos.filter((e) => e.createdBy === user.id || misEventoIds.has(e.id))
    : [];
  // Clave estable por contenido, no por tamaño: dependían de `.length`, así
  // que borrar un evento y crear otro en la misma sesión dejaba el mismo
  // conteo pero IDs distintos, y el efecto no volvía a correr — la consulta
  // de abajo quedaba pegada a los eventos viejos.
  const idsEventos = misEventos.map((e) => e.id).join(',');

  useEffect(() => {
    if (misEventos.length === 0) {
      setVentas({ entradas: 0, monto: 0 });
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('tickets')
          .select('cantidad, monto, status, evento_id')
          .in('evento_id', misEventos.map((e) => e.id))
          .eq('status', 'completed');
        if (error) throw error;
        const pagados = data ?? [];
        setVentas({
          entradas: pagados.reduce((sum: number, t: any) => sum + (t.cantidad ?? 1), 0),
          monto: pagados.reduce((sum: number, t: any) => sum + (t.monto ?? 0), 0),
        });
      } catch {
        setVentas({ entradas: 0, monto: 0 });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsEventos]);

  const handleSignOut = () => {
    confirmar(
      { title: 'Cerrar sesión', message: '¿Seguro que quieres cerrar sesión?', confirmText: 'Cerrar sesión', destructive: true },
      signOut
    );
  };

  const handleCrearPerfil = async () => {
    if (!user) return;
    setCreando(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert(mapProfileToDB({ userId: user.id, nombre: '', tipoProyecto: '', bio: '' }));
      if (error) throw error;
      await cargarPerfil();
    } catch (err: any) {
      Alert.alert('No se pudo crear el perfil', err?.message ?? 'Error desconocido');
    } finally {
      setCreando(false);
    }
  };

  if (!user || cargando) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Problema 3 del spec 030: antes esta pantalla era un callejón sin salida.
  if (!perfil) {
    return (
      <View style={styles.container}>
        <Text style={styles.aviso}>No se encontró un perfil de músico asociado a esta cuenta.</Text>
        <TouchableOpacity
          style={[styles.boton, creando && styles.botonDesactivado]}
          onPress={handleCrearPerfil}
          disabled={creando}
        >
          {creando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.textoBoton}>Crear mi perfil</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonSalir} onPress={handleSignOut}>
          <Text style={styles.textoBotonSalir}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { completos, total } = perfilCompletitud(perfil);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {esMock && (
        <View style={styles.avisoMock}>
          <Text style={styles.avisoMockTexto}>⚠️ Mostrando datos de muestra, no tu perfil real</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.filaBanda}>
          {perfil.foto ? (
            <Image source={{ uri: perfil.foto }} style={styles.foto} />
          ) : (
            <View style={[styles.foto, styles.fotoPlaceholder]}>
              <Text style={styles.fotoPlaceholderTexto}>🎵</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.nombreBanda}>{perfil.nombre || 'Sin nombre'}</Text>
            <Text style={styles.subtituloBanda}>
              {[
                perfil.tipoProyecto ? TIPO_PROYECTO_LABEL[perfil.tipoProyecto] : null,
                perfil.ciudad,
              ].filter(Boolean).join(' · ') || 'Perfil sin completar'}
            </Text>
          </View>
        </View>
        <View style={styles.completitud}>
          <View style={styles.completitudBarraFondo}>
            <View style={[styles.completitudBarra, { width: `${(completos / total) * 100}%` }]} />
          </View>
          <Text style={styles.completitudTexto}>Perfil completo {completos}/{total}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.titulo}>Resumen</Text>
        <View style={styles.resumenFila}>
          <Text style={styles.resumenLabel}>Eventos publicados</Text>
          <Text style={styles.resumenValor}>{misEventos.length}</Text>
        </View>
        <View style={styles.resumenFila}>
          <Text style={styles.resumenLabel}>Entradas vendidas</Text>
          <Text style={styles.resumenValor}>{ventas.entradas} · ${ventas.monto.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.titulo}>Acciones</Text>
        <TouchableOpacity
          style={styles.botonPrimario}
          onPress={() => (navigation as any).navigate('CrearEvento')}
        >
          <Text style={styles.textoBoton}>+ Crear evento</Text>
        </TouchableOpacity>
        <View style={styles.filaAccionesSecundarias}>
          <TouchableOpacity
            style={[styles.botonSecundario, { marginRight: spacing.sm }]}
            onPress={() => (navigation as any).navigate('VentasMusico')}
          >
            <Text style={styles.textoBotonSecundario}>📊 Mis ventas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.botonSecundario}
            onPress={() => (navigation as any).navigate('EditarPerfilBanda')}
          >
            <Text style={styles.textoBotonSecundario}>✏️ Editar perfil</Text>
          </TouchableOpacity>
        </View>
        {/* Spec 041 — sin evento en los params: la pantalla pide cuál antes de
            abrir la cámara. Es la misma pantalla que monta el dashboard de local. */}
        <TouchableOpacity
          style={styles.botonEscaner}
          onPress={() => (navigation as any).navigate('Escaner')}
        >
          <Text style={styles.textoBotonSecundario}>📷 Escanear entradas</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.titulo}>Mis eventos</Text>
        {misEventos.length === 0 ? (
          <Text style={styles.vacio}>Aún no tienes eventos. ¡Crea el primero!</Text>
        ) : (
          misEventos.map((ev) => <TarjetaEvento key={ev.id} evento={ev} />)
        )}
      </View>

      <TouchableOpacity style={styles.botonSalir} onPress={handleSignOut}>
        <Text style={styles.textoBotonSalir}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  titulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  avisoMock: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  avisoMockTexto: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  filaBanda: { flexDirection: 'row', alignItems: 'center' },
  foto: { width: 56, height: 56, borderRadius: borderRadius.md, marginRight: spacing.md },
  fotoPlaceholder: { backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  fotoPlaceholderTexto: { fontSize: fontSize.lg },
  nombreBanda: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  subtituloBanda: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  completitud: { marginTop: spacing.md },
  completitudBarraFondo: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  completitudBarra: { height: '100%', backgroundColor: colors.accent },
  completitudTexto: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs },
  resumenFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  resumenLabel: { fontSize: fontSize.md, color: colors.secondary },
  resumenValor: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  botonPrimario: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  filaAccionesSecundarias: { flexDirection: 'row', marginTop: spacing.sm },
  botonSecundario: {
    flex: 1,
    backgroundColor: colors.accentLight,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonSecundario: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  botonEscaner: {
    backgroundColor: colors.accentLight,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  boton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  botonDesactivado: { opacity: 0.6 },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  vacio: {
    fontSize: fontSize.sm,
    color: colors.muted,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  aviso: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: spacing.lg,
  },
  botonSalir: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.lg },
  textoBotonSalir: { color: colors.danger, fontWeight: '600', fontSize: fontSize.sm },
});
