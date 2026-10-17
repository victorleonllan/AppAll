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
import GeneroPicker from '../components/GeneroPicker';
import CampoImagen from '../components/CampoImagen';
import { etiquetaPais, nombrePais } from '../constants/paises';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function EditarPerfilBandaScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [cargaFallida, setCargaFallida] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [tipoProyecto, setTipoProyecto] = useState<TipoProyecto | ''>('');
  const [generos, setGeneros] = useState<string[]>([]);
  const [pickerGenerosVisible, setPickerGenerosVisible] = useState(false);
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
  // Spec 130 — país (de `paises_cobro`) y avatar (logo cuadrado).
  const [pais, setPais] = useState('');
  const [avatar, setAvatar] = useState('');
  const [paises, setPaises] = useState<string[]>([]);

  const cargarPerfil = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    setCargaFallida(false);
    // Spec 130 — el catálogo de países se pide junto al perfil, no después:
    // si el perfil todavía no existe, el `throw` de abajo dejaría los chips vacíos.
    const consultaPaises = supabase.from('paises_cobro').select('pais');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      const { data: filasPaises, error: errorPaises } = await consultaPaises;
      // Si el catálogo falla, queda solo el país actual: el músico guarda el
      // resto sin perder su país. No es `cargaFallida` porque no arriesga
      // pisar el perfil (mismo respaldo que `perfil/editar/page.js`).
      const paisActual: string | undefined = data?.pais ?? undefined;
      if (errorPaises || !filasPaises) {
        setPaises(paisActual ? [paisActual] : []);
      } else {
        setPaises(
          filasPaises
            .map((f: { pais: string }) => f.pais)
            .sort((a, b) => nombrePais(a).localeCompare(nombrePais(b), 'es'))
        );
      }
      if (error) throw error;
      const p = mapProfileFromDB(data);
      setNombre(p.nombre);
      setTipoProyecto(p.tipoProyecto);
      setGeneros(p.generos ?? []);
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
      setPais(p.pais ?? '');
      setAvatar(p.avatar ?? '');
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
          avatar,
          // Vacío → el mapper no manda `pais` y la fila conserva el suyo.
          pais: pais || undefined,
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

        <Text style={styles.label}>Avatar (logo)</Text>
        <CampoImagen
          carpeta="perfiles"
          id={user.id}
          valor={avatar}
          onCambiar={setAvatar}
          aspecto={[1, 1]}
          ayuda="Aparece en el feed y donde se te vea en miniatura — sube tu logo o algo cuadrado."
        />

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

        <Text style={styles.label}>Géneros musicales</Text>
        <TouchableOpacity style={styles.input} onPress={() => setPickerGenerosVisible(true)}>
          <Text style={generos.length > 0 ? styles.inputTexto : styles.inputPlaceholder}>
            {generos.length > 0 ? generos.join(', ') : 'Seleccionar géneros'}
          </Text>
        </TouchableOpacity>
        <GeneroPicker
          visible={pickerGenerosVisible}
          onClose={() => setPickerGenerosVisible(false)}
          seleccionados={generos}
          onCambiar={setGeneros}
          multiple
          titulo="Géneros musicales"
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

        <Text style={styles.label}>Foto</Text>
        <CampoImagen
          carpeta="perfiles"
          id={user.id}
          valor={foto}
          onCambiar={setFoto}
          ayuda="La foto grande de tu ficha pública — banda, escenario, lo que quieras mostrar en tamaño completo."
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.tituloSeccion}>Con qué decide un local</Text>

        <Text style={styles.label}>País</Text>
        <View style={styles.chips}>
          {paises.map((codigo) => (
            <TouchableOpacity
              key={codigo}
              style={[styles.chip, pais === codigo && styles.chipActivo]}
              onPress={() => setPais(codigo)}
            >
              <Text style={[styles.chipTexto, pais === codigo && styles.chipTextoActivo]}>
                {etiquetaPais(codigo)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
  // Spec 056 — el campo de géneros es un TouchableOpacity, no un TextInput: el
  // texto interno necesita su propio estilo (fontSize/color no le llegan al Text hijo).
  inputTexto: { fontSize: fontSize.md, color: colors.secondary },
  inputPlaceholder: { fontSize: fontSize.md, color: colors.muted },
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
