import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Banda, BorradorPreventa, TipoPrecio, Venue, VenueType } from '../types';
import { BorradorEspecial, crearEspecialesDeBorrador } from '../lib/especiales';
import { VENUE_LABEL, venueEmoji, venueLabel } from '../lib/venues';
import { mismaBanda, tituloDelLineup } from '../lib/lineup';
import { agregarBandasAdicionales } from '../hooks/useBandasDelEvento';
import { usePerfilMusico } from '../hooks/useMusicos';
import { armarFechaHora, fechaHoraValidas } from '../lib/fecha';
import { montoDesdePrecio } from '../lib/precio';
import { Punto, puntoDeVenue } from '../lib/ubicacion';
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
import TicketsEspecialesEvento from '../components/TicketsEspecialesEvento';
import DatosPagoEvento, { DATOS_PAGO_VACIOS } from '../components/DatosPagoEvento';
import CampoImagen from '../components/CampoImagen';
import UbicacionLocal from '../components/UbicacionLocal';
import { CampoFecha, CampoHora } from '../components/CampoFecha';
import { PAIS_POR_DEFECTO, etiquetaPais } from '../constants/paises';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

const TIPOS_VENUE = Object.keys(VENUE_LABEL) as VenueType[];
const MAX_DESCRIPCION = 900;
const FALTA_UBICACION = 'Confirma la ubicación del local para crear el evento';

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
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation();
  const { user, role } = useAuth();
  const { allVenues, createVenue, guardarUbicacionLocal } = useVenues();
  const { createEvento } = useEventos();

  const [artista, setArtista] = useState<Banda | null>(null);
  const [otrasBandas, setOtrasBandas] = useState<Banda[]>([]);
  // `key` del segundo selector: cambiarla lo vacía tras cada banda agregada.
  const [selectorOtra, setSelectorOtra] = useState(0);
  // Spec 198 — «Soy yo» (W-338): un músico puede ser la principal o una adicional.
  const { musico: miPerfil } = usePerfilMusico(role === 'musician' && user ? user.id : null);
  const yo = role === 'musician' ? { nombre: miPerfil?.nombre ?? '', foto: miPerfil?.foto ?? null } : null;

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
  // Spec 200 — pin del local nuevo. `ubicacionResuelta` sin pin es «Continuar sin
  // ubicación», solo donde no hay mapa.
  const [ubicacion, setUbicacion] = useState<Punto | null>(null);
  const [ubicacionResuelta, setUbicacionResuelta] = useState(false);
  const [buscarUbicacionAl, setBuscarUbicacionAl] = useState(0);
  const direccionRef = useRef<TextInput>(null);

  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [hoy] = useState(() => new Date());
  const [genero, setGenero] = useState('');
  const [pickerGeneroVisible, setPickerGeneroVisible] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  // Spec 165 — dos interruptores apagados por defecto (W-256). Preventa encendida
  // es lo que antes era el chip «Puerta»: `tipoPrecio` se deriva y la base no cambia.
  const [preventaOn, setPreventaOn] = useState(false);
  const [especialOn, setEspecialOn] = useState(false);
  const tipoPrecio: TipoPrecio = preventaOn ? 'puerta' : 'general';
  const [preventas, setPreventas] = useState<BorradorPreventa[]>([]);
  const [especiales, setEspeciales] = useState<BorradorEspecial[]>([]);
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

  const agregarOtraBanda = (banda: Banda | null) => {
    if (!banda) return;
    // Actualizador funcional: «Crear … como artista nuevo» llega después de un await.
    if (!mismaBanda(banda, artista)) {
      setOtrasBandas((lista) => (lista.some((b) => mismaBanda(b, banda)) ? lista : [...lista, banda]));
    }
    setSelectorOtra((n) => n + 1);
  };

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
    olvidarUbicacion();
  };

  // Spec 200 — cambiar dirección, comuna o país borra la confirmación del pin.
  const olvidarUbicacion = () => {
    setUbicacion(null);
    setUbicacionResuelta(false);
  };

  const localNuevoCompleto = creandoLocal && nuevoNombre.trim() !== '' && nuevaDireccion.trim() !== '';

  const validar = (): string | null => {
    if (!artista) return 'Elige un artista o crea uno nuevo';
    if (!selectedVenue && !localNuevoCompleto) return 'Elige un local o crea uno nuevo';
    if (!selectedVenue && !ubicacionResuelta) return FALTA_UBICACION;
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
            ...(ubicacion ? { lat: ubicacion.lat, lng: ubicacion.lng } : {}),
          });
          setLocalCreado(venue);
        }
        if (!direccionCreada) {
          await crearDireccion(venue.id, {
            address: nuevaDireccion,
            comuna: nuevaComuna.trim() || null,
            lat: ubicacion?.lat,
            lng: ubicacion?.lng,
          });
          setDireccionCreada(true);
        }
      }

      const { fecha: fechaTexto, hora: horaTexto, comienzaAt } = armarFechaHora(fecha.trim(), hora.trim());
      const titulo = tituloDelLineup([artista.nombre, ...otrasBandas.map((b) => b.nombre)]);
      const creado = await createEvento({
        artista: titulo,
        // Una cuenta va a `musico_id` y una ficha a `artist_id`, nunca los dos.
        ...(artista.tipo === 'cuenta' ? { musicoId: artista.id } : { artistId: artista.id }),
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
      // Spec 198 — después de crear: `event_artists` exige `can_edit_event`.
      try {
        await agregarBandasAdicionales(creado.id, artista, otrasBandas);
      } catch (err: any) {
        fallos.push(`El evento se publicó, pero no se guardaron las otras bandas: ${err?.message ?? 'error desconocido'}.`);
      }
      if (preventaOn && preventas.length > 0) {
        try {
          await crearPreventasDeBorrador(creado.id, preventas);
        } catch (err: any) {
          fallos.push(`El evento se publicó, pero no se guardaron las preventas: ${err?.message ?? 'error desconocido'}. Complétalo desde Editar.`);
        }
      }
      // Spec 165 — con el interruptor apagado no se guardan los packs, aunque se
      // hayan confirmado antes de apagarlo (W-256 §4).
      if (especialOn && especiales.length > 0) {
        try {
          await crearEspecialesDeBorrador(creado.id, especiales);
        } catch (err: any) {
          fallos.push(`El evento se publicó, pero no se guardaron los packs del ticket especial: ${err?.message ?? 'error desconocido'}. Complétalo desde Editar.`);
        }
      }
      if (fallos.length > 0) setError(fallos.join('\n'));

      // Spec 039 — un evento recién publicado tiene 0 entradas, y eso es justo
      // lo que hay que mostrar: le dice al organizador dónde está el dashboard.
      Alert.alert(
        'Evento publicado',
        `"${titulo}" en ${venue.name} el ${fechaTexto}`,
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
        {user && <ArtistaSelector userId={user.id} value={artista} onChange={setArtista} yo={yo} />}
        <Text style={styles.ayuda}>
          Si la banda está en Sonópolis, elígela de la lista: entra al equipo del evento.
        </Text>

        <Text style={styles.label}>Otras bandas (opcional)</Text>
        {otrasBandas.map((b) => (
          <View key={`${b.tipo}:${b.id}`} style={styles.otraBanda}>
            <View style={styles.otraBandaDatos}>
              <Text style={styles.otraBandaNombre}>{b.nombre}</Text>
              {b.tipo === 'cuenta' && <Text style={styles.enSonopolis}>En Sonópolis</Text>}
            </View>
            <TouchableOpacity
              onPress={() => setOtrasBandas((lista) => lista.filter((x) => !mismaBanda(x, b)))}
            >
              <Text style={styles.enlace}>Quitar</Text>
            </TouchableOpacity>
          </View>
        ))}
        {user && (
          <ArtistaSelector
            key={selectorOtra}
            userId={user.id}
            value={null}
            onChange={agregarOtraBanda}
            yo={yo}
          />
        )}
        <Text style={styles.ayuda}>Si tocan dos o más bandas, agrégalas aquí.</Text>

        <Text style={styles.label}>Local (venue) *</Text>
        {!creandoLocal ? (
          <>
            <TextInput
              style={styles.input}
              value={venueQuery}
              onChangeText={(t) => { setVenueQuery(t); setSelectedVenue(null); }}
              placeholder="Buscar o escribir nuevo local..."
              placeholderTextColor={colores.muted}
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
            {selectedVenue && (puntoDeVenue(selectedVenue) || selectedVenue.ownerId === user?.id) && (
              <UbicacionLocal
                key={selectedVenue.id}
                direccion={selectedVenue.address ?? ''}
                comuna={selectedVenue.comuna}
                pais={selectedVenue.pais}
                nombre={selectedVenue.name}
                tipo={selectedVenue.type}
                valor={puntoDeVenue(selectedVenue)}
                puedeMover={selectedVenue.ownerId === user?.id}
                modo="crear"
                onConfirmar={async (p) => {
                  if (!p) return;
                  const guardado = await guardarUbicacionLocal(selectedVenue.id, p);
                  setSelectedVenue((v) => (v?.id === guardado.id ? guardado : v));
                }}
              />
            )}
          </>
        ) : (
          <View style={styles.subform}>
            <Text style={styles.sublabel}>Nombre *</Text>
            <TextInput
              style={styles.input}
              value={nuevoNombre}
              onChangeText={setNuevoNombre}
              placeholderTextColor={colores.muted}
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
              ref={direccionRef}
              style={styles.input}
              value={nuevaDireccion}
              onChangeText={(t) => { setNuevaDireccion(t); olvidarUbicacion(); }}
              onBlur={() => setBuscarUbicacionAl((n) => n + 1)}
              placeholder="Ej: Av. Italia 1234"
              placeholderTextColor={colores.muted}
            />

            <Text style={styles.sublabel}>País *</Text>
            <TouchableOpacity style={styles.input} onPress={() => setPickerPaisVisible(true)}>
              <Text style={styles.inputTexto}>{etiquetaPais(paisNuevoVenue)}</Text>
            </TouchableOpacity>

            <Text style={styles.sublabel}>Comuna</Text>
            <TextInput
              style={styles.input}
              value={nuevaComuna}
              onChangeText={(t) => { setNuevaComuna(t); olvidarUbicacion(); }}
              onBlur={() => setBuscarUbicacionAl((n) => n + 1)}
              placeholder="Ej: Providencia"
              placeholderTextColor={colores.muted}
            />

            <Text style={styles.sublabel}>Teléfono (opcional)</Text>
            <TextInput
              style={styles.input}
              value={nuevoTelefono}
              onChangeText={setNuevoTelefono}
              placeholder="+56 9 1234 5678"
              placeholderTextColor={colores.muted}
              keyboardType="phone-pad"
            />

            <Text style={styles.sublabel}>Instagram (opcional)</Text>
            <TextInput
              style={styles.input}
              value={nuevoInstagram}
              onChangeText={setNuevoInstagram}
              placeholder="@local"
              placeholderTextColor={colores.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <UbicacionLocal
              direccion={nuevaDireccion}
              comuna={nuevaComuna}
              pais={paisNuevoVenue}
              nombre={nuevoNombre}
              tipo={nuevoTipo}
              valor={ubicacion}
              puedeMover
              modo="crear"
              buscarAl={buscarUbicacionAl}
              onCorregir={() => direccionRef.current?.focus()}
              onConfirmar={(p) => { setUbicacion(p); setUbicacionResuelta(true); }}
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
          onCambiar={(p) => {
            if (p === paisNuevoVenue) return;
            setPaisNuevoVenue(p);
            olvidarUbicacion();
          }}
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
          placeholderTextColor={colores.muted}
          multiline
          maxLength={MAX_DESCRIPCION}
        />
        <Text style={styles.ayuda}>{MAX_DESCRIPCION - descripcion.length} caracteres disponibles</Text>

        <Text style={styles.label}>Precio puerta/General *</Text>
        <TextInput
          style={styles.input}
          value={precio}
          onChangeText={setPrecio}
          placeholder="Ej: $5.000"
          placeholderTextColor={colores.muted}
        />
        {sinMonto && (
          <Text style={styles.aviso}>Sin un número en el precio, el evento no se puede comprar</Text>
        )}

        {/* Spec 165 — los dos a la vista y apagados hasta encenderlos a mano (W-256). */}
        <View style={styles.interruptor}>
          <Switch
            value={preventaOn}
            onValueChange={setPreventaOn}
            trackColor={{ true: colores.accent, false: colores.border }}
          />
          <View style={styles.interruptorTextos}>
            <Text style={styles.interruptorTitulo}>Preventa</Text>
            <Text style={styles.interruptorAyuda}>
              Entradas más baratas antes del día, por tramos. El precio de arriba pasa a ser el de puerta.
            </Text>
          </View>
        </View>
        {preventaOn && (
          <PreventasEvento modo="borrador" value={preventas} onChange={setPreventas} />
        )}

        <View style={styles.interruptor}>
          <Switch
            value={especialOn}
            onValueChange={setEspecialOn}
            trackColor={{ true: colores.especial, false: colores.border }}
          />
          <View style={styles.interruptorTextos}>
            <Text style={[styles.interruptorTitulo, styles.interruptorTituloEspecial]}>🎟 Ticket especial</Text>
            <Text style={styles.interruptorAyuda}>
              Packs 2x1 a 5x1 con unidades limitadas, en rojo junto a la entrada normal.
            </Text>
          </View>
        </View>
        {especialOn && (
          <TicketsEspecialesEvento modo="borrador" value={especiales} onChange={setEspeciales} />
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
            <ActivityIndicator color={colores.onAccent} />
          ) : (
            <Text style={styles.textoBoton}>{eventoCreadoId ? 'Evento publicado' : 'Publicar evento'}</Text>
          )}
        </TouchableOpacity>
        {creandoLocal && !ubicacionResuelta && <Text style={styles.ayuda}>{FALTA_UBICACION}</Text>}
      </View>
    </ScrollView>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md },
  card: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  titulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: c.primary,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: c.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sublabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: c.secondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: c.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: c.primary,
    borderWidth: 1,
    borderColor: c.border,
  },
  multilinea: { minHeight: 96, textAlignVertical: 'top' },
  // Spec 056 — el campo de género es un TouchableOpacity, no un TextInput: el
  // texto interno necesita su propio estilo (fontSize/color no le llegan al Text hijo).
  inputTexto: { fontSize: fontSize.md, color: c.primary },
  inputPlaceholder: { fontSize: fontSize.md, color: c.muted },
  ayuda: { fontSize: fontSize.xs, color: c.muted, marginTop: spacing.xs },
  aviso: { fontSize: fontSize.xs, color: c.warning, marginTop: spacing.xs },
  otraBanda: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  otraBandaDatos: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  otraBandaNombre: { fontSize: fontSize.md, color: c.primary, flexShrink: 1 },
  enSonopolis: { fontSize: fontSize.xs, color: c.success, fontWeight: '600' },
  enlace: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600', marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.md },
  subform: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  interruptorTextos: { flex: 1 },
  interruptorTitulo: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary },
  interruptorTituloEspecial: { color: c.especial },
  interruptorAyuda: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipActivo: { backgroundColor: c.accent, borderColor: c.accent },
  chipTexto: { fontSize: fontSize.sm, color: c.primary },
  chipTextoActivo: { color: c.onAccent, fontWeight: '600' },
  suggestions: {
    backgroundColor: c.cardBackground,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  suggestionNew: {
    backgroundColor: c.accentLight,
  },
  suggestionText: {
    fontSize: fontSize.md,
    color: c.primary,
    fontWeight: '500',
  },
  suggestionSub: {
    fontSize: fontSize.sm,
    color: c.muted,
    marginTop: 2,
  },
  selectedVenue: {
    fontSize: fontSize.sm,
    color: c.success,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  boton: {
    backgroundColor: c.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  botonDesactivado: {
    opacity: 0.6,
  },
  textoBoton: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.md },
});
