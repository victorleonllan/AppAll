import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { VenueType } from '../types';
import { venueEmoji, venueLabel } from '../lib/venues';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { colors, spacing, borderRadius, fontSize } from '../theme';
import GeneroPicker from '../components/GeneroPicker';
import PaisPicker from '../components/PaisPicker';
import CampoImagen from '../components/CampoImagen';
import GestionDirecciones from '../components/GestionDirecciones';
import { crearDireccion } from '../hooks/useDireccionesVenue';
import { PAIS_POR_DEFECTO, etiquetaPais } from '../constants/paises';

const TIPOS: VenueType[] = ['cafe', 'bar', 'sala', 'centro_cultural'];

export default function EditarLocalScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { allVenues, createVenue, updateVenue, refresh } = useVenues();

  const miVenue = user ? allVenues.find((v) => v.ownerId === user.id) : null;

  const [type, setType] = useState<VenueType>('sala');
  const [name, setName] = useState('');
  const [pais, setPais] = useState(PAIS_POR_DEFECTO);
  const [pickerPaisVisible, setPickerPaisVisible] = useState(false);
  const [address, setAddress] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [comuna, setComuna] = useState('');
  const [aforo, setAforo] = useState('');
  const [description, setDescription] = useState('');
  const [estilos, setEstilos] = useState<string[]>([]);
  const [pickerGeneroVisible, setPickerGeneroVisible] = useState(false);
  const [horarios, setHorarios] = useState('');
  const [tieneEscenario, setTieneEscenario] = useState(false);
  const [tieneSonido, setTieneSonido] = useState(false);
  const [tieneBackline, setTieneBackline] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [emailContacto, setEmailContacto] = useState('');
  const [instagram, setInstagram] = useState('');
  const [sitioWeb, setSitioWeb] = useState('');
  const [image, setImage] = useState('');
  const [avatar, setAvatar] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Precarga si el usuario ya tiene un local — de lo contrario el formulario
  // queda en blanco y el guardado crea uno nuevo.
  useEffect(() => {
    if (!miVenue) return;
    setType(miVenue.type);
    setName(miVenue.name ?? '');
    setPais(miVenue.pais ?? PAIS_POR_DEFECTO);
    setAforo(miVenue.aforo != null ? String(miVenue.aforo) : '');
    setDescription(miVenue.description ?? '');
    // Spec 134 — mismo separador que la web: venues.estilo es texto "A, B".
    setEstilos(miVenue.estilo ? miVenue.estilo.split(', ').filter(Boolean) : []);
    setHorarios(miVenue.horarios ?? '');
    setTieneEscenario(!!miVenue.tieneEscenario);
    setTieneSonido(!!miVenue.tieneSonido);
    setTieneBackline(!!miVenue.tieneBackline);
    setTelefono(miVenue.telefono ?? '');
    setEmailContacto(miVenue.emailContacto ?? '');
    setInstagram(miVenue.instagram ?? '');
    setSitioWeb(miVenue.sitioWeb ?? '');
    setImage(miVenue.image ?? '');
    setAvatar(miVenue.avatar ?? '');
  }, [miVenue?.id]);

  const handleGuardar = async () => {
    if (!user) {
      Alert.alert('Error', 'Debes iniciar sesión para editar tu local');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Falta el nombre', 'El local necesita un nombre');
      return;
    }
    const aforoNum = aforo.trim() ? parseInt(aforo, 10) : undefined;
    if (aforo.trim() && (Number.isNaN(aforoNum) || (aforoNum as number) < 1 || (aforoNum as number) > 100000)) {
      Alert.alert('Aforo inválido', 'El aforo debe ser un número entre 1 y 100.000');
      return;
    }

    // Spec 134 — sin address/ciudad/comuna: venues.address es una copia que
    // mantiene el trigger desde la fila activa de venue_addresses.
    const campos = {
      name: name.trim(),
      type,
      pais,
      aforo: aforoNum,
      description: description.trim() || undefined,
      estilo: estilos.length ? estilos.join(', ') : undefined,
      horarios: horarios.trim() || undefined,
      tieneEscenario,
      tieneSonido,
      tieneBackline,
      telefono: telefono.trim() || undefined,
      emailContacto: emailContacto.trim() || undefined,
      instagram: instagram.trim() || undefined,
      sitioWeb: sitioWeb.trim() || undefined,
      image: image.trim() || undefined,
      avatar: avatar.trim() || undefined,
    };

    setGuardando(true);
    try {
      if (miVenue) {
        await updateVenue(miVenue.id, campos);
      } else {
        const nuevo = await createVenue({ ...campos, ownerId: user.id });
        if (address.trim()) {
          // La primera dirección nace activa y el trigger escribe venues.address.
          try {
            await crearDireccion(nuevo.id, {
              address,
              comuna: comuna.trim() || null,
              ciudad: ciudad.trim() || null,
            });
          } catch (err: any) {
            // El local ya quedó creado: no se borra, se avisa y se vuelve atrás.
            await refresh();
            Alert.alert(
              'Local creado sin dirección',
              'Tu local se guardó, pero la dirección no: agrégala desde Editar local. (' + (err?.message ?? 'Error desconocido') + ')',
              [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
            return;
          }
        }
        await refresh();
      }
      // Éxito y error dicen cosas distintas (mismo antídoto que el problema
      // del catch vacío que este spec cierra en VenuesContext).
      Alert.alert('Guardado', 'Los datos de tu local se guardaron', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo guardar el local');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.titulo}>{miVenue ? 'Editar local' : 'Registrar local'}</Text>

        <Text style={styles.label}>Tipo de local *</Text>
        <View style={styles.tiposRow}>
          {TIPOS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tipoChip, type === t && styles.tipoChipActivo]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.tipoChipTexto, type === t && styles.tipoChipTextoActivo]}>
                {venueEmoji(t)} {venueLabel(t)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Nombre *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej: Café La Palma" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>País *</Text>
        {/* Spec 095 — dónde está el local, no desde dónde se carga: decide en
            qué cartelera aparecen sus eventos. */}
        <TouchableOpacity style={styles.input} onPress={() => setPickerPaisVisible(true)}>
          <Text style={styles.inputTexto}>{etiquetaPais(pais)}</Text>
        </TouchableOpacity>
        <PaisPicker
          visible={pickerPaisVisible}
          onClose={() => setPickerPaisVisible(false)}
          seleccionado={pais}
          onCambiar={setPais}
          titulo="País del local"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.tituloSeccion}>Foto</Text>

        <Text style={styles.label}>Avatar (logo)</Text>
        {/* Al crear, el venue aún no tiene id: se sube a pendientes/<user.id>/
            (spec 062), igual que la web. */}
        <CampoImagen
          carpeta={miVenue ? 'locales' : 'pendientes'}
          id={miVenue ? miVenue.id : user?.id}
          valor={avatar}
          onCambiar={setAvatar}
          aspecto={[1, 1]}
          ayuda="Aparece en el feed de tus seguidores — sube tu logo o algo cuadrado."
        />

        <Text style={styles.label}>Foto del local</Text>
        <CampoImagen
          carpeta={miVenue ? 'locales' : 'pendientes'}
          id={miVenue ? miVenue.id : user?.id}
          valor={image}
          onCambiar={setImage}
          ayuda="Es lo primero que ve un músico en tu ficha."
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.tituloSeccion}>Dirección</Text>
        {miVenue ? (
          <GestionDirecciones venueId={miVenue.id} onCambio={refresh} />
        ) : (
          <>
            <Text style={styles.ayuda}>
              Esta primera dirección queda activa sola. De la segunda en adelante, activar es un paso aparte.
            </Text>
            <Text style={styles.label}>Dirección</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Ej: Av. Italia 890" placeholderTextColor={colors.muted} />

            <View style={styles.filaDoble}>
              <View style={styles.mitad}>
                <Text style={styles.label}>Ciudad</Text>
                <TextInput style={styles.input} value={ciudad} onChangeText={setCiudad} placeholder="Santiago" placeholderTextColor={colors.muted} />
              </View>
              <View style={styles.mitad}>
                <Text style={styles.label}>Comuna</Text>
                <TextInput style={styles.input} value={comuna} onChangeText={setComuna} placeholder="Ñuñoa" placeholderTextColor={colors.muted} />
              </View>
            </View>
          </>
        )}
      </View>

      <View style={styles.card}>

        <Text style={styles.label}>Aforo</Text>
        <TextInput
          style={styles.input}
          value={aforo}
          onChangeText={(t) => setAforo(t.replace(/\D/g, ''))}
          placeholder="Ej: 40"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Descripción</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Estilo musical</Text>
        {/* Vocabulario cerrado (spec 054), no texto libre — mismo componente
            que CrearEventoScreen (spec 059 AppAll / W-065 sonopolisWeb). */}
        <TouchableOpacity style={styles.input} onPress={() => setPickerGeneroVisible(true)}>
          <Text style={estilos.length ? styles.inputTexto : styles.inputPlaceholder}>
            {estilos.length ? estilos.join(', ') : 'Seleccionar géneros'}
          </Text>
        </TouchableOpacity>
        <GeneroPicker
          visible={pickerGeneroVisible}
          onClose={() => setPickerGeneroVisible(false)}
          multiple
          seleccionados={estilos}
          onCambiar={setEstilos}
          titulo="Estilo musical"
        />

        <Text style={styles.label}>Horarios</Text>
        <TextInput style={styles.input} value={horarios} onChangeText={setHorarios} placeholder="Ej: Jue-Sáb 21:00-01:00" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Equipamiento</Text>
        <View style={styles.tiposRow}>
          <TouchableOpacity style={[styles.tipoChip, tieneEscenario && styles.tipoChipActivo]} onPress={() => setTieneEscenario((v) => !v)}>
            <Text style={[styles.tipoChipTexto, tieneEscenario && styles.tipoChipTextoActivo]}>🎭 Escenario</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tipoChip, tieneSonido && styles.tipoChipActivo]} onPress={() => setTieneSonido((v) => !v)}>
            <Text style={[styles.tipoChipTexto, tieneSonido && styles.tipoChipTextoActivo]}>🎤 Sonido</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tipoChip, tieneBackline && styles.tipoChipActivo]} onPress={() => setTieneBackline((v) => !v)}>
            <Text style={[styles.tipoChipTexto, tieneBackline && styles.tipoChipTextoActivo]}>🎸 Backline</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Teléfono</Text>
        <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} placeholder="+56 9 ..." placeholderTextColor={colors.muted} keyboardType="phone-pad" />

        <Text style={styles.label}>Email de contacto</Text>
        <TextInput style={styles.input} value={emailContacto} onChangeText={setEmailContacto} placeholder="contacto@local.cl" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" />

        <Text style={styles.label}>Instagram</Text>
        <TextInput style={styles.input} value={instagram} onChangeText={setInstagram} placeholder="@millocal" placeholderTextColor={colors.muted} autoCapitalize="none" />

        <Text style={styles.label}>Sitio web</Text>
        <TextInput style={styles.input} value={sitioWeb} onChangeText={setSitioWeb} placeholder="https://..." placeholderTextColor={colors.muted} autoCapitalize="none" />

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 60 },
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
  tituloSeccion: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  ayuda: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.xs },
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
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMultiline: { minHeight: 80 },
  inputTexto: { fontSize: fontSize.md, color: colors.primary },
  inputPlaceholder: { fontSize: fontSize.md, color: colors.muted },
  filaDoble: { flexDirection: 'row', gap: spacing.sm },
  mitad: { flex: 1 },
  tiposRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tipoChip: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
  },
  tipoChipActivo: { backgroundColor: colors.accent },
  tipoChipTexto: { fontSize: fontSize.sm, color: colors.secondary, fontWeight: '600' },
  tipoChipTextoActivo: { color: colors.white },
  boton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  botonDesactivado: { opacity: 0.6 },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
});
