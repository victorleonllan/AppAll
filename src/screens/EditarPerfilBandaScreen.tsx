import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { TipoProyecto } from '../types';
import { mapProfileFromDB, mapProfileToDB, TIPO_PROYECTO_LABEL, TIPOS_PROYECTO } from '../lib/profiles';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function EditarPerfilBandaScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [cargaFallida, setCargaFallida] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [tipoProyecto, setTipoProyecto] = useState<TipoProyecto | ''>('');
  const [generosTexto, setGenerosTexto] = useState('');
  const [bio, setBio] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [integrantes, setIntegrantes] = useState('');
  const [duracionShow, setDuracionShow] = useState('');
  const [riderTecnico, setRiderTecnico] = useState('');
  const [telefono, setTelefono] = useState('');
  const [emailContacto, setEmailContacto] = useState('');
  const [instagram, setInstagram] = useState('');
  const [spotify, setSpotify] = useState('');
  const [youtube, setYoutube] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [sitioWeb, setSitioWeb] = useState('');
  const [foto, setFoto] = useState('');

  const cargarPerfil = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    setCargaFallida(false);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      const p = mapProfileFromDB(data);
      setNombre(p.nombre);
      setTipoProyecto(p.tipoProyecto);
      setGenerosTexto((p.generos ?? []).join(', '));
      setBio(p.bio);
      setCiudad(p.ciudad ?? '');
      setIntegrantes(p.integrantes != null ? String(p.integrantes) : '');
      setDuracionShow(p.duracionShow != null ? String(p.duracionShow) : '');
      setRiderTecnico(p.riderTecnico ?? '');
      setTelefono(p.telefono ?? '');
      setEmailContacto(p.emailContacto ?? '');
      setInstagram(p.instagram ?? '');
      setSpotify(p.spotify ?? '');
      setYoutube(p.youtube ?? '');
      setTiktok(p.tiktok ?? '');
      setSitioWeb(p.sitioWeb ?? '');
      setFoto(p.foto ?? '');
    } catch (err: any) {
      if (err?.code === 'PGRST116') {
        // .single() sin filas: perfil todavía no existe. Formulario en
        // blanco a propósito — el guardado hace upsert y lo crea.
      } else {
        // Falla real (red, RLS, etc.): NO dejar el formulario en blanco
        // como si fuera un perfil nuevo. Antes esto caía al mismo catch
        // silencioso y "Guardar" mandaba un upsert con todo en null,
        // pisando el perfil real guardado en Supabase con una falla
        // transitoria de carga. Se bloquea el guardado hasta reintentar.
        setCargaFallida(true);
      }
    } finally {
      setCargando(false);
    }
  }, [user]);

  useEffect(() => {
    cargarPerfil();
  }, [cargarPerfil]);

  const handleGuardar = async () => {
    if (!user) return;

    // Antes: `integrantes ? parseInt(integrantes, 10) : undefined` mandaba
    // NaN al upsert si el texto no era numérico (ej. pegado o dictado).
    // `JSON.stringify({x: NaN})` serializa NaN como null sin avisar, así
    // que el dato se perdía en silencio. Ahora se valida antes de guardar.
    const integrantesNum = integrantes.trim() ? parseInt(integrantes, 10) : undefined;
    if (integrantesNum !== undefined && (Number.isNaN(integrantesNum) || integrantesNum < 1 || integrantesNum > 50)) {
      Alert.alert('Revisa el formulario', 'Integrantes debe ser un número entre 1 y 50.');
      return;
    }
    const duracionNum = duracionShow.trim() ? parseInt(duracionShow, 10) : undefined;
    if (duracionNum !== undefined && (Number.isNaN(duracionNum) || duracionNum < 0)) {
      Alert.alert('Revisa el formulario', 'Duración del show debe ser un número igual o mayor a 0.');
      return;
    }

    setGuardando(true);
    try {
      const generos = generosTexto
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      const { error } = await supabase.from('profiles').upsert(
        mapProfileToDB({
          userId: user.id,
          nombre,
          tipoProyecto,
          generos,
          bio,
          ciudad,
          integrantes: integrantesNum,
          duracionShow: duracionNum,
          riderTecnico,
          telefono,
          emailContacto,
          instagram,
          spotify,
          youtube,
          tiktok,
          sitioWeb,
          foto,
        })
      );
      if (error) throw error;
      navigation.goBack();
    } catch (err: any) {
      // Antes las dos ramas del try/catch decían "Guardado" (spec 030,
      // problema 2). Acá el error se muestra con el mensaje real de Supabase.
      Alert.alert('No se pudo guardar', err?.message ?? 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  };

  if (!user || cargando) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (cargaFallida) {
    return (
      <View style={styles.container}>
        <Text style={styles.aviso}>
          No se pudo cargar tu perfil. Reintenta antes de guardar — hacerlo ahora
          borraría tus datos guardados con un formulario en blanco.
        </Text>
        <TouchableOpacity style={styles.boton} onPress={cargarPerfil}>
          <Text style={styles.textoBoton}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.tituloSeccion}>Identidad</Text>

        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} />

        <Text style={styles.label}>Tipo de proyecto</Text>
        <View style={styles.chips}>
          {TIPOS_PROYECTO.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, tipoProyecto === t && styles.chipActivo]}
              onPress={() => setTipoProyecto(t)}
            >
              <Text style={[styles.chipTexto, tipoProyecto === t && styles.chipTextoActivo]}>
                {TIPO_PROYECTO_LABEL[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Géneros musicales (separados por coma)</Text>
        <TextInput
          style={styles.input}
          value={generosTexto}
          onChangeText={setGenerosTexto}
          placeholder="jazz, bossa, fusión"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Foto (URL)</Text>
        <TextInput style={styles.input} value={foto} onChangeText={setFoto} autoCapitalize="none" />
      </View>

      <View style={styles.card}>
        <Text style={styles.tituloSeccion}>Con qué decide un local</Text>

        <Text style={styles.label}>Ciudad</Text>
        <TextInput style={styles.input} value={ciudad} onChangeText={setCiudad} />

        <Text style={styles.label}>Integrantes</Text>
        <TextInput
          style={styles.input}
          value={integrantes}
          onChangeText={setIntegrantes}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Duración del show (minutos)</Text>
        <TextInput
          style={styles.input}
          value={duracionShow}
          onChangeText={setDuracionShow}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Rider técnico</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={riderTecnico}
          onChangeText={setRiderTecnico}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          placeholder="Qué necesitan de sonido y backline"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.tituloSeccion}>Contacto</Text>

        <Text style={styles.label}>Teléfono</Text>
        <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />

        <Text style={styles.label}>Email de contacto</Text>
        <TextInput
          style={styles.input}
          value={emailContacto}
          onChangeText={setEmailContacto}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.tituloSeccion}>Redes</Text>

        <Text style={styles.label}>Instagram</Text>
        <TextInput style={styles.input} value={instagram} onChangeText={setInstagram} autoCapitalize="none" />

        <Text style={styles.label}>Spotify</Text>
        <TextInput style={styles.input} value={spotify} onChangeText={setSpotify} autoCapitalize="none" />

        <Text style={styles.label}>YouTube</Text>
        <TextInput style={styles.input} value={youtube} onChangeText={setYoutube} autoCapitalize="none" />

        <Text style={styles.label}>TikTok</Text>
        <TextInput style={styles.input} value={tiktok} onChangeText={setTiktok} autoCapitalize="none" />

        <Text style={styles.label}>Sitio web</Text>
        <TextInput style={styles.input} value={sitioWeb} onChangeText={setSitioWeb} autoCapitalize="none" />
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },
  aviso: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tituloSeccion: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.sm,
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
  inputMultiline: { minHeight: 90 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  chipActivo: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipTexto: { fontSize: fontSize.sm, color: colors.secondary },
  chipTextoActivo: { color: colors.white, fontWeight: '600' },
  boton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  botonDesactivado: { opacity: 0.6 },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
});
