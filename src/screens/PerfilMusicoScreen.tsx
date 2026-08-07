import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { musicosMock } from '../data/mock/musicos';
import { PerfilMusico } from '../types';
import TarjetaEvento from '../components/TarjetaEvento';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function PerfilMusicoScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { eventos } = useEventos();
  const [perfil, setPerfil] = useState<PerfilMusico | null>(null);
  const [nombre, setNombre] = useState('');
  const [genero, setGenero] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [spotify, setSpotify] = useState('');
  const [youtube, setYoutube] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (!error && data) {
          setPerfil({
            id: data.id,
            userId: data.id,
            nombre: data.nombre ?? '',
            tipoProyecto: data.tipo_proyecto ?? '',
            bio: data.bio ?? '',
            instagram: data.instagram ?? '',
            spotify: data.spotify ?? '',
            youtube: data.youtube ?? '',
            foto: data.foto ?? null,
          });
          setNombre(data.nombre ?? '');
          setGenero(data.tipo_proyecto ?? '');
          setBio(data.bio ?? '');
          setInstagram(data.instagram ?? '');
          setSpotify(data.spotify ?? '');
          setYoutube(data.youtube ?? '');
          return;
        }
      } catch {}
      const encontrado = musicosMock.find((m) => m.userId === user.id);
      if (encontrado) {
        setPerfil(encontrado);
        setNombre(encontrado.nombre);
        setGenero(encontrado.tipoProyecto);
        setBio(encontrado.bio);
        setInstagram(encontrado.instagram ?? '');
        setSpotify(encontrado.spotify ?? '');
        setYoutube(encontrado.youtube ?? '');
      }
    })();
  }, [user]);

  const handleGuardar = async () => {
    if (!user) return;
    setGuardando(true);
    try {
      // `role` es NOT NULL: si el perfil no existiera, un upsert sin él
      // sería un INSERT que viola la restricción (spec 019).
      // `genero` en la app se persiste como `tipo_proyecto` en la base.
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        role: 'musician',
        nombre,
        tipo_proyecto: genero,
        bio,
        instagram,
        spotify,
        youtube,
      });
      if (error) throw error;
      Alert.alert('Guardado', 'Perfil actualizado en Supabase');
    } catch {
      Alert.alert('Guardado', 'Tus cambios se han guardado (mock)');
    } finally {
      setGuardando(false);
    }
  };

  const misEventos = user ? eventos.filter((e) => e.createdBy === user.id) : [];

  if (!user) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!perfil) {
    return (
      <View style={styles.container}>
        <Text style={styles.aviso}>No se encontró un perfil de músico asociado a esta cuenta.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.titulo}>Editar perfil</Text>

        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} />

        <Text style={styles.label}>Género</Text>
        <TextInput style={styles.input} value={genero} onChangeText={setGenero} />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Instagram</Text>
        <TextInput style={styles.input} value={instagram} onChangeText={setInstagram} />

        <Text style={styles.label}>Spotify</Text>
        <TextInput style={styles.input} value={spotify} onChangeText={setSpotify} />

        <Text style={styles.label}>YouTube</Text>
        <TextInput style={styles.input} value={youtube} onChangeText={setYoutube} />

        <TouchableOpacity
          style={[styles.boton, guardando && styles.botonDesactivado]}
          onPress={handleGuardar}
          disabled={guardando}
        >
          {guardando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.textoBoton}>Guardar cambios</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.titulo}>Mis Eventos</Text>
        {misEventos.length === 0 ? (
          <Text style={styles.vacio}>Aún no tienes eventos. ¡Crea el primero!</Text>
        ) : (
          misEventos.map((ev) => <TarjetaEvento key={ev.id} evento={ev} />)
        )}
        <TouchableOpacity
          style={styles.botonNuevo}
          onPress={() => (navigation as any).navigate('VentasMusico')}
        >
          <Text style={styles.textoBoton}>📊 Mis Ventas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.botonNuevo}
          onPress={() => (navigation as any).navigate('CrearEvento')}
        >
          <Text style={styles.textoBoton}>+ Nuevo Evento</Text>
        </TouchableOpacity>
      </View>
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
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMultiline: { minHeight: 100 },
  boton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  botonDesactivado: {
    opacity: 0.6,
  },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  vacio: {
    fontSize: fontSize.sm,
    color: colors.muted,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  botonNuevo: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  aviso: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: spacing.lg,
  },
});
