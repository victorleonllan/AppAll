import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { musicosMock } from '../data/mock/musicos';
import { eventos } from '../data/mock/eventos';
import { PerfilMusico } from '../types';
import TarjetaEvento from '../components/TarjetaEvento';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function PerfilMusicoScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilMusico | null>(null);
  const [nombre, setNombre] = useState('');
  const [genero, setGenero] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [spotify, setSpotify] = useState('');
  const [youtube, setYoutube] = useState('');

  useEffect(() => {
    if (!user) return;
    const encontrado = musicosMock.find((m) => m.userId === user.id);
    if (encontrado) {
      setPerfil(encontrado);
      setNombre(encontrado.nombre);
      setGenero(encontrado.genero);
      setBio(encontrado.bio);
      setInstagram(encontrado.instagram ?? '');
      setSpotify(encontrado.spotify ?? '');
      setYoutube(encontrado.youtube ?? '');
    }
  }, [user]);

  const handleGuardar = () => {
    Alert.alert('Guardado', 'Tus cambios se han guardado (mock)');
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

        <TouchableOpacity style={styles.boton} onPress={handleGuardar}>
          <Text style={styles.textoBoton}>Guardar cambios</Text>
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
