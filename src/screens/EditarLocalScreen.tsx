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

const TIPOS: VenueType[] = ['cafe', 'bar', 'sala', 'centro_cultural'];

export default function EditarLocalScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { allVenues, createVenue, updateVenue } = useVenues();

  const miVenue = user ? allVenues.find((v) => v.ownerId === user.id) : null;

  const [type, setType] = useState<VenueType>('sala');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [comuna, setComuna] = useState('');
  const [aforo, setAforo] = useState('');
  const [description, setDescription] = useState('');
  const [estilo, setEstilo] = useState('');
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
  const [guardando, setGuardando] = useState(false);

  // Precarga si el usuario ya tiene un local — de lo contrario el formulario
  // queda en blanco y el guardado crea uno nuevo.
  useEffect(() => {
    if (!miVenue) return;
    setType(miVenue.type);
    setName(miVenue.name ?? '');
    setAddress(miVenue.address ?? '');
    setCiudad(miVenue.ciudad ?? '');
    setComuna(miVenue.comuna ?? '');
    setAforo(miVenue.aforo != null ? String(miVenue.aforo) : '');
    setDescription(miVenue.description ?? '');
    setEstilo(miVenue.estilo ?? '');
    setHorarios(miVenue.horarios ?? '');
    setTieneEscenario(!!miVenue.tieneEscenario);
    setTieneSonido(!!miVenue.tieneSonido);
    setTieneBackline(!!miVenue.tieneBackline);
    setTelefono(miVenue.telefono ?? '');
    setEmailContacto(miVenue.emailContacto ?? '');
    setInstagram(miVenue.instagram ?? '');
    setSitioWeb(miVenue.sitioWeb ?? '');
    setImage(miVenue.image ?? '');
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

    const campos = {
      name: name.trim(),
      type,
      address: address.trim() || undefined,
      ciudad: ciudad.trim() || undefined,
      comuna: comuna.trim() || undefined,
      aforo: aforoNum,
      description: description.trim() || undefined,
      estilo: estilo.trim() || undefined,
      horarios: horarios.trim() || undefined,
      tieneEscenario,
      tieneSonido,
      tieneBackline,
      telefono: telefono.trim() || undefined,
      emailContacto: emailContacto.trim() || undefined,
      instagram: instagram.trim() || undefined,
      sitioWeb: sitioWeb.trim() || undefined,
      image: image.trim() || undefined,
    };

    setGuardando(true);
    try {
      if (miVenue) {
        await updateVenue(miVenue.id, campos);
      } else {
        await createVenue({ ...campos, ownerId: user.id });
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
          <Text style={estilo ? styles.inputTexto : styles.inputPlaceholder}>
            {estilo || 'Seleccionar género'}
          </Text>
        </TouchableOpacity>
        <GeneroPicker
          visible={pickerGeneroVisible}
          onClose={() => setPickerGeneroVisible(false)}
          seleccionados={estilo ? [estilo] : []}
          onCambiar={(gs) => setEstilo(gs[0] ?? '')}
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

        <Text style={styles.label}>Imagen (URL)</Text>
        <TextInput style={styles.input} value={image} onChangeText={setImage} placeholder="https://..." placeholderTextColor={colors.muted} autoCapitalize="none" />

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
