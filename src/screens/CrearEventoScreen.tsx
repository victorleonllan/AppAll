import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BorradorPreventa, TipoPrecio, Venue, VenueType } from '../types';
import { VENUE_LABEL, venueEmoji, venueLabel } from '../lib/venues';
import { ArtistaBreve } from '../lib/artistas';
import { armarFechaHora, fechaHoraValidas } from '../lib/fecha';
import { montoDesdePrecio } from '../lib/precio';
import { DatosPago, datosPagoCompletos, guardarDatosPago } from '../lib/datosPago';
import { crearPreventasDeBorrador } from '../hooks/usePreventas';
import { crearDireccion } from '../hooks/useDireccionesVenue';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useEventos } from '../context/EventosContext';
import GeneroPicker from '../components/GeneroPicker';
import PaisPicker from '../components/PaisPicker';
import ArtistaSelector from '../components/ArtistaSelector';
import PreventasEvento from '../components/PreventasEvento';
import DatosPagoEvento, { DATOS_PAGO_VACIOS } from '../components/DatosPagoEvento';
import CampoImagen from '../components/CampoImagen';
import { CampoFecha, CampoHora } from '../components/CampoFecha';
import { PAIS_POR_DEFECTO, etiquetaPais } from '../constants/paises';
import { colors, spacing, borderRadius, fontSize } from '../theme';

const TIPOS_VENUE = Object.keys(VENUE_LABEL) as VenueType[];
const MAX_DESCRIPCION = 900;

/**
 * Spec 136 — pide lo mismo que `FormEvento.js` de la web, en el mismo orden de
 * escritura (`FormEvento.js:194-322`): local nuevo y su dirección, evento,
 * datos bancarios y preventas. La lógica es del spec 135; acá solo se arma la
 * pantalla.
 *
 * Los errores van en un `Text` rojo sobre el botón y no en `Alert.alert`: en el
 * build web de Expo `Alert.alert` no hace nada (`src/lib/confirm.ts`).
 */
export default function CrearEventoScreen() {
  const navigation = useNavigation();
  const { user, role } = useAuth();
  const { allVenues, createVenue } = useVenues();
  const { createEvento } = useEventos();

  const [artista, setArtista] = useState<ArtistaBreve | null>(null);

  const [venueQuery, setVenueQuery] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [suggestions, setSuggestions] = useState<Venue[]>([]);
  // Subformulario de local nuevo: «+ Agregar» ya no crea el local al tocarlo.
  const [creandoLocal, setCreandoLocal] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<VenueType>('sala');
  const [nuevaDireccion, setNuevaDireccion] = useState('');
  const [nuevaComuna, setNuevaComuna] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoInstagram, setNuevoInstagram] = useState('');
  // Spec 095 — país del local nuevo. El evento hereda `venue.pais` (Decisión 4).
  const [paisNuevoVenue, setPaisNuevoVenue] = useState(PAIS_POR_DEFECTO);
  const [pickerPaisVisible, setPickerPaisVisible] = useState(false);
  // Si el local nuevo se creó pero un paso posterior falló, reintentar no debe
  // crear un segundo local ni una segunda dirección.
  const [localCreado, setLocalCreado] = useState<Venue | null>(null);
  const [direccionCreada, setDireccionCreada] = useState(false);

  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [hoy] = useState(() => new Date());
  const [genero, setGenero] = useState('');
  const [pickerGeneroVisible, setPickerGeneroVisible] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>('general');
  const [preventas, setPreventas] = useState<BorradorPreventa[]>([]);
  const [flyer, setFlyer] = useState('');
  const [datosPago, setDatosPago] = useState<DatosPago>(DATOS_PAGO_VACIOS);

  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Con el evento ya insertado, volver a tocar «Publicar» lo duplicaría.
  const [eventoCreadoId, setEventoCreadoId] = useState<string | null>(null);

  useEffect(() => {
    if (venueQuery.length > 0 && !selectedVenue && !creandoLocal) {
      const filtrados = allVenues.filter(v =>
        v.name.toLowerCase().includes(venueQuery.toLowerCase())
      );
      setSuggestions(filtrados);
    } else {
      setSuggestions([]);
    }
  }, [venueQuery, selectedVenue, creandoLocal, allVenues]);

  // Un local que publica su propio evento no debería tener que buscarse a
  // sí mismo en la lista — se preselecciona su venue (spec 031).
  useEffect(() => {
    if (role === 'local' && user && !selectedVenue) {
      const miVenue = allVenues.find((v) => v.ownerId === user.id);
      if (miVenue) {
        setSelectedVenue(miVenue);
        setVenueQuery(miVenue.name);
      }
    }
  }, [role, user, allVenues, selectedVenue]);

  const handleSelectVenue = (venue: Venue) => {
    setSelectedVenue(venue);
    setVenueQuery(venue.name);
    setSuggestions([]);
  };

  const handleAbrirLocalNuevo = () => {
    setNuevoNombre(venueQuery.trim());
    setCreandoLocal(true);
    setSuggestions([]);
  };

  const handleCancelarLocalNuevo = () => {
    setCreandoLocal(false);
    setLocalCreado(null);
    setDireccionCreada(false);
  };

  const localNuevoCompleto = creandoLocal && nuevoNombre.trim() !== '' && nuevaDireccion.trim() !== '';

  const validar = (): string | null => {
    if (!artista) return 'Elige un artista o crea uno nuevo';
    if (!selectedVenue && !localNuevoCompleto) return 'Elige un local o crea uno nuevo';
    if (!fechaHoraValidas(fecha.trim(), hora.trim())) {
      return 'La fecha va como AAAA-MM-DD y la hora como HH:MM';
    }
    if (!precio.trim()) return 'Falta el precio';
    if (!datosPagoCompletos(datosPago)) {
      return 'Completa los datos para el pago: banco, tipo de cuenta, número, titular y RUT';
    }
    return null;
  };

  const handlePublicar = async () => {
    if (!user) {
      setError('Debes iniciar sesión para publicar');
      return;
    }
    const invalido = validar();
    if (invalido || !artista) {
      setError(invalido);
      return;
    }
    setError(null);
    setPublicando(true);

    let creadoId: string | null = null;
    try {
      // Paso 2 — local nuevo y su dirección. `address` no va a `createVenue`:
      // entra por `venue_addresses` y el trigger de W-062 escribe `venues.address`.
      let venue = selectedVenue;
      if (!venue) {
        venue = localCreado;
        if (!venue) {
          venue = await createVenue({
            name: nuevoNombre.trim(),
            type: nuevoTipo,
            pais: paisNuevoVenue,
            telefono: nuevoTelefono.trim() || undefined,
            instagram: nuevoInstagram.trim() || undefined,
            ownerId: user.id,
          });
          setLocalCreado(venue);
        }
        if (!direccionCreada) {
          await crearDireccion(venue.id, { address: nuevaDireccion, comuna: nuevaComuna.trim() || null });
          setDireccionCreada(true);
        }
      }

      const { fecha: fechaTexto, hora: horaTexto, comienzaAt } = armarFechaHora(fecha.trim(), hora.trim());
      const creado = await createEvento({
        artista: artista.nombre,
        artistId: artista.id,
        venueId: venue.id,
        venueName: venue.name,
        pais: venue.pais,
        fecha: fechaTexto,
        hora: horaTexto,
        comienzaAt,
        genero,
        descripcion,
        precio,
        tipoPrecio,
        imagen: flyer.trim() || null,
        createdBy: user.id,
      });
      creadoId = creado.id;
      setEventoCreadoId(creado.id);

      // Pasos 5 y 6 — el evento ya existe: un fallo acá no lo deshace.
      // Datos de pago después del evento: `event_payouts_insert` exige
      // `event_role_of = 'owner'`, que recién existe cuando corrió
      // `events_claim_owner_trg`.
      const fallos: string[] = [];
      try {
        await guardarDatosPago(creado.id, datosPago);
      } catch (err: any) {
        fallos.push(`El evento se publicó, pero no se guardaron los datos bancarios: ${err?.message ?? 'error desconocido'}. Complétalo desde Editar.`);
      }
      if (tipoPrecio === 'puerta' && preventas.length > 0) {
        try {
          await crearPreventasDeBorrador(creado.id, preventas);
        } catch (err: any) {
          fallos.push(`El evento se publicó, pero no se guardaron las preventas: ${err?.message ?? 'error desconocido'}. Complétalo desde Editar.`);
        }
      }
      if (fallos.length > 0) setError(fallos.join('\n'));

      // Spec 039 — un evento recién publicado tiene 0 entradas, y eso es justo
      // lo que hay que mostrar: le dice al organizador dónde está el dashboard.
      Alert.alert(
        'Evento publicado',
        `"${artista.nombre}" en ${venue.name} el ${fechaTexto}`,
        [
          { text: 'Editar evento', onPress: () =>
              (navigation as any).navigate('EditarEvento', { eventoId: creado.id }) },
          { text: 'Ver entradas', onPress: () =>
              (navigation as any).navigate('EntradasEvento', { eventoId: creado.id }) },
        ]
      );
    } catch (err: any) {
      // Paso 4 o antes: no se creó el evento, el formulario sigue lleno.
      if (!creadoId) setError(`No se pudo publicar el evento: ${err?.message ?? 'error desconocido'}`);
    } finally {
      setPublicando(false);
    }
  };

  const sinMonto = precio.trim() !== '' && montoDesdePrecio(precio) <= 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.titulo}>Nuevo Evento</Text>

        <Text style={styles.label}>Artista *</Text>
        {user && <ArtistaSelector userId={user.id} value={artista} onChange={setArtista} />}
        <Text style={styles.ayuda}>
          Si el artista tiene cuenta en Sonópolis y ya reclamó su perfil, entra al equipo del evento
        </Text>

        <Text style={styles.label}>Local (venue) *</Text>
        {!creandoLocal ? (
          <>
            <TextInput
              style={styles.input}
              value={venueQuery}
              onChangeText={(t) => { setVenueQuery(t); setSelectedVenue(null); }}
              placeholder="Buscar o escribir nuevo local..."
              placeholderTextColor={colors.muted}
            />
            {(suggestions.length > 0 || (venueQuery.trim().length > 0 && !selectedVenue)) && (
              <View style={styles.suggestions}>
                {suggestions.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.suggestionItem}
                    onPress={() => handleSelectVenue(v)}
                  >
                    <Text style={styles.suggestionText}>
                      {venueEmoji(v.type)} {v.name}
                    </Text>
                    <Text style={styles.suggestionSub}>{v.address}</Text>
                  </TouchableOpacity>
                ))}
                {venueQuery.trim().length > 0 && !allVenues.some(v => v.name.toLowerCase() === venueQuery.trim().toLowerCase()) && (
                  <TouchableOpacity
                    style={[styles.suggestionItem, styles.suggestionNew]}
                    onPress={handleAbrirLocalNuevo}
                  >
                    <Text style={styles.suggestionText}>+ Agregar "{venueQuery.trim()}" como nuevo local</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {selectedVenue && (
              <Text style={styles.selectedVenue}>
                ✅ {venueEmoji(selectedVenue.type)} {selectedVenue.name}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.subform}>
            <Text style={styles.sublabel}>Nombre *</Text>
            <TextInput
              style={styles.input}
              value={nuevoNombre}
              onChangeText={setNuevoNombre}
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.sublabel}>Tipo *</Text>
            <View style={styles.chips}>
              {TIPOS_VENUE.map((t) => {
                const activo = nuevoTipo === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, activo && styles.chipActivo]}
                    onPress={() => setNuevoTipo(t)}
                  >
                    <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>
                      {venueEmoji(t)} {venueLabel(t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sublabel}>Dirección *</Text>
            <TextInput
              style={styles.input}
              value={nuevaDireccion}
              onChangeText={setNuevaDireccion}
              placeholder="Ej: Av. Italia 1234"
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.sublabel}>País *</Text>
            <TouchableOpacity style={styles.input} onPress={() => setPickerPaisVisible(true)}>
              <Text style={styles.inputTexto}>{etiquetaPais(paisNuevoVenue)}</Text>
            </TouchableOpacity>

            <Text style={styles.sublabel}>Comuna</Text>
            <TextInput
              style={styles.input}
              value={nuevaComuna}
              onChangeText={setNuevaComuna}
              placeholder="Ej: Providencia"
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.sublabel}>Teléfono (opcional)</Text>
            <TextInput
              style={styles.input}
              value={nuevoTelefono}
              onChangeText={setNuevoTelefono}
              placeholder="+56 9 1234 5678"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
            />

            <Text style={styles.sublabel}>Instagram (opcional)</Text>
            <TextInput
              style={styles.input}
              value={nuevoInstagram}
              onChangeText={setNuevoInstagram}
              placeholder="@local"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity onPress={handleCancelarLocalNuevo}>
              <Text style={styles.enlace}>Cancelar, elegir de la lista</Text>
            </TouchableOpacity>
          </View>
        )}
        <PaisPicker
          visible={pickerPaisVisible}
          onClose={() => setPickerPaisVisible(false)}
          seleccionado={paisNuevoVenue}
          onCambiar={setPaisNuevoVenue}
          titulo="País del local"
        />

        <Text style={styles.label}>Fecha *</Text>
        <CampoFecha
          style={styles.input}
          value={fecha}
          onChange={setFecha}
          placeholder="2026-11-28"
          minimo={hoy}
        />

        <Text style={styles.label}>Hora *</Text>
        <CampoHora
          style={styles.input}
          value={hora}
          onChange={setHora}
          placeholder="21:00"
        />

        <Text style={styles.label}>Género</Text>
        <TouchableOpacity style={styles.input} onPress={() => setPickerGeneroVisible(true)}>
          <Text style={genero ? styles.inputTexto : styles.inputPlaceholder}>
            {genero || 'Seleccionar género'}
          </Text>
        </TouchableOpacity>
        <GeneroPicker
          visible={pickerGeneroVisible}
          onClose={() => setPickerGeneroVisible(false)}
          seleccionados={genero ? [genero] : []}
          onCambiar={(gs) => setGenero(gs[0] ?? '')}
        />

        <Text style={styles.label}>Descripción</Text>
        <TextInput
          style={[styles.input, styles.multilinea]}
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="De qué va el show, qué esperar, quién toca..."
          placeholderTextColor={colors.muted}
          multiline
          maxLength={MAX_DESCRIPCION}
        />
        <Text style={styles.ayuda}>{MAX_DESCRIPCION - descripcion.length} caracteres disponibles</Text>

        <Text style={styles.label}>Precio *</Text>
        <TextInput
          style={styles.input}
          value={precio}
          onChangeText={setPrecio}
          placeholder="Ej: $5.000"
          placeholderTextColor={colors.muted}
        />
        <View style={[styles.chips, styles.chipsPrecio]}>
          {([['general', 'General'], ['puerta', 'Puerta']] as [TipoPrecio, string][]).map(([t, etiqueta]) => {
            const activo = tipoPrecio === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.chip, activo && styles.chipActivo]}
                onPress={() => setTipoPrecio(t)}
              >
                <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{etiqueta}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {sinMonto && (
          <Text style={styles.aviso}>Sin un número en el precio, el evento no se puede comprar</Text>
        )}

        {tipoPrecio === 'puerta' && (
          <>
            <Text style={styles.label}>Preventas</Text>
            <PreventasEvento modo="borrador" value={preventas} onChange={setPreventas} />
          </>
        )}

        <Text style={styles.label}>Flyer</Text>
        {/* Spec 062 — antes de que el evento exista, la única carpeta que
            `media_insert_pendientes` deja escribir es `pendientes/<user.id>/`. */}
        <CampoImagen carpeta="pendientes" id={user?.id} valor={flyer} onCambiar={setFlyer} />
        {flyer ? (
          <TouchableOpacity onPress={() => setFlyer('')}>
            <Text style={styles.enlace}>Quitar flyer</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.label}>Datos para el pago *</Text>
        <DatosPagoEvento value={datosPago} onChange={setDatosPago} obligatorio />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.boton, (publicando || eventoCreadoId) && styles.botonDesactivado]}
          onPress={handlePublicar}
          disabled={publicando || Boolean(eventoCreadoId)}
        >
          {publicando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.textoBoton}>{eventoCreadoId ? 'Evento publicado' : 'Publicar evento'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
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
  sublabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.secondary,
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
  multilinea: { minHeight: 96, textAlignVertical: 'top' },
  // Spec 056 — el campo de género es un TouchableOpacity, no un TextInput: el
  // texto interno necesita su propio estilo (fontSize/color no le llegan al Text hijo).
  inputTexto: { fontSize: fontSize.md, color: colors.primary },
  inputPlaceholder: { fontSize: fontSize.md, color: colors.muted },
  ayuda: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs },
  aviso: { fontSize: fontSize.xs, color: colors.warning, marginTop: spacing.xs },
  enlace: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600', marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.md },
  subform: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chipsPrecio: { marginTop: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActivo: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipTexto: { fontSize: fontSize.sm, color: colors.primary },
  chipTextoActivo: { color: colors.white, fontWeight: '600' },
  suggestions: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionNew: {
    backgroundColor: colors.accentLight,
  },
  suggestionText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '500',
  },
  suggestionSub: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
  },
  selectedVenue: {
    fontSize: fontSize.sm,
    color: colors.success,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
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
});
