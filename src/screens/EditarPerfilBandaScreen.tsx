import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { TipoProyecto } from '../types';
import { mapProfileFromDB, mapProfileToDB, TIPO_PROYECTO_LABEL, TIPOS_PROYECTO } from '../lib/profiles';
import GeneroPicker from '../components/GeneroPicker';
import CampoImagen from '../components/CampoImagen';
import AvisoEdicionAdmin from '../components/AvisoEdicionAdmin';
import { useEsAdmin } from '../hooks/useEsAdmin';
import { decidirEdicion } from '../lib/edicionAdmin';
import { guardarPerfilMusicoComoAdmin } from '../lib/adminEdicion';
import AjustarPortada from '../components/AjustarPortada';
import { PUNTO_CENTRO, puntoDeFila } from '../lib/portada';
import { guardarPuntoPortadaMusico } from '../lib/portadaDatos';
import { etiquetaPais, nombrePais } from '../constants/paises';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

export default function EditarPerfilBandaScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation();
  const { user, role } = useAuth();
  // Spec 206 (W-352) — con `cuentaId` es el admin abriendo el perfil de otra cuenta.
  const params = useRoute().params as { cuentaId?: string; nombre?: string } | undefined;
  const cuentaId = params?.cuentaId;
  const { esAdmin, cargando: cargandoAdmin } = useEsAdmin();
  const { permitido, comoAdmin } = decidirEdicion({
    userId: user?.id,
    rol: role,
    esAdmin,
    rolDueno: 'musician',
    objetivoId: cuentaId,
    duenoId: cuentaId,
  });
  const objetivoId = cuentaId ?? user?.id;
  // Con `cuentaId` no se lee nada hasta saber si se puede: leer antes dejaría dos cargas
  // cruzadas, la primera sin la regla del admin.
  const esperandoPermiso = Boolean(cuentaId) && (cargandoAdmin || !permitido);
  const [noEsMusico, setNoEsMusico] = useState(false);
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
  // Spec 201 — el punto de la portada se guarda aparte del formulario.
  const [fotoGuardada, setFotoGuardada] = useState('');
  const [puntoPortada, setPuntoPortada] = useState(PUNTO_CENTRO);
  const [ajustando, setAjustando] = useState(false);
  const [portadaGuardada, setPortadaGuardada] = useState(false);

  const cargarPerfil = useCallback(async () => {
    if (!objetivoId || esperandoPermiso) return;
    setCargando(true);
    setCargaFallida(false);
    setNoEsMusico(false);
    // Spec 130 — el catálogo de países se pide junto al perfil, no después:
    // si el perfil todavía no existe, el `throw` de abajo dejaría los chips vacíos.
    const consultaPaises = supabase.from('paises_cobro').select('pais');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', objetivoId)
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
      // El admin no crea perfiles ni convierte en músico una cuenta que no lo es.
      if (comoAdmin && data?.role !== 'musician') {
        setNoEsMusico(true);
        return;
      }
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
      setFotoGuardada(p.foto ?? '');
      setPuntoPortada(puntoDeFila(data));
      setPais(p.pais ?? '');
      setAvatar(p.avatar ?? '');
    } catch (err: any) {
      if (err?.code === 'PGRST116' && comoAdmin) {
        setNoEsMusico(true);
      } else if (err?.code === 'PGRST116') {
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
  }, [user, objetivoId, comoAdmin, esperandoPermiso]);

  useEffect(() => {
    cargarPerfil();
  }, [cargarPerfil]);

  const handleGuardar = async () => {
    if (!objetivoId || (cuentaId && !permitido)) return;

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
      const fila = mapProfileToDB({
          userId: objetivoId,
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
        });
      if (comoAdmin) {
        await guardarPerfilMusicoComoAdmin(objetivoId, fila);
      } else {
        const { error } = await supabase.from('profiles').upsert(fila);
        if (error) throw error;
      }
      navigation.goBack();
    } catch (err: any) {
      // Antes las dos ramas del try/catch decían "Guardado" (spec 030,
      // problema 2). Acá el error se muestra con el mensaje real de Supabase.
      Alert.alert('No se pudo guardar', err?.message ?? 'Error desconocido');
    } finally {
      setGuardando(false);
    }
  };

  if (cuentaId && !cargandoAdmin && !permitido) {
    return (
      <View style={styles.container}>
        <Text style={styles.aviso}>No puedes editar este perfil.</Text>
        <TouchableOpacity style={styles.boton} onPress={() => navigation.goBack()}>
          <Text style={styles.textoBoton}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!user || !objetivoId || cargando || (cuentaId && cargandoAdmin)) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colores.accent} />
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

  if (noEsMusico) {
    return (
      <View style={styles.container}>
        <Text style={styles.aviso}>Esa cuenta no es de músico.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {comoAdmin && (
        <AvisoEdicionAdmin
          tipo="musico"
          nombre={nombre || params?.nombre || ''}
          onVerFicha={() =>
            (navigation as any).navigate('Locales', { screen: 'VerMusico', params: { musicoId: objetivoId } })
          }
        />
      )}

      <View style={styles.card}>
        <Text style={styles.tituloSeccion}>Identidad</Text>

        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} />

        <Text style={styles.label}>Avatar (logo)</Text>
        <CampoImagen
          carpeta="perfiles"
          id={objetivoId}
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
          id={objetivoId}
          valor={foto}
          onCambiar={setFoto}
          ayuda="La foto grande de tu ficha pública — banda, escenario, lo que quieras mostrar en tamaño completo."
        />
        {/* Spec 201 — con la foto sin guardar no se ajusta: el trigger de W-344 vuelve el
            punto al centro cuando cambia la foto. */}
        {!!foto && (foto === fotoGuardada ? (
          <>
            <TouchableOpacity
              style={styles.botonPortada}
              onPress={() => {
                setPortadaGuardada(false);
                setAjustando(true);
              }}
            >
              <Text style={styles.textoBotonPortada}>Ajustar portada</Text>
            </TouchableOpacity>
            {portadaGuardada && <Text style={styles.portadaGuardada}>Portada guardada</Text>}
            <AjustarPortada
              visible={ajustando}
              uri={foto}
              puntoInicial={puntoPortada}
              proporcion={4 / 3} // el marco de VerMusicoScreen
              onGuardar={async (punto) => {
                setPuntoPortada(await guardarPuntoPortadaMusico(objetivoId, punto));
                setPortadaGuardada(true);
              }}
              onCerrar={() => setAjustando(false)}
            />
          </>
        ) : (
          <Text style={styles.avisoPortada}>Guarda la foto nueva para ajustar su encuadre.</Text>
        ))}
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
          placeholderTextColor={colores.muted}
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
          <ActivityIndicator color={colores.onAccent} />
        ) : (
          <Text style={styles.textoBoton}>Guardar cambios</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md, paddingBottom: 100 },
  aviso: {
    fontSize: fontSize.md,
    color: c.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tituloSeccion: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: c.primary,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: c.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: c.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: c.secondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  // Spec 056 — el campo de géneros es un TouchableOpacity, no un TextInput: el
  // texto interno necesita su propio estilo (fontSize/color no le llegan al Text hijo).
  inputTexto: { fontSize: fontSize.md, color: c.secondary },
  inputPlaceholder: { fontSize: fontSize.md, color: c.muted },
  inputMultiline: { minHeight: 90 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.cardBackground,
  },
  chipActivo: { backgroundColor: c.accent, borderColor: c.accent },
  chipTexto: { fontSize: fontSize.sm, color: c.secondary },
  chipTextoActivo: { color: c.onAccent, fontWeight: '600' },
  boton: {
    backgroundColor: c.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  botonPortada: {
    backgroundColor: c.accentLight,
    padding: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  textoBotonPortada: { color: c.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  portadaGuardada: { fontSize: fontSize.sm, color: c.success, marginTop: spacing.xs },
  avisoPortada: { fontSize: fontSize.sm, color: c.muted, marginTop: spacing.sm },
  botonDesactivado: { opacity: 0.6 },
  textoBoton: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.md },
});
