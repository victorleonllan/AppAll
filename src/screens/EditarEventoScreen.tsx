import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { ParamListBase, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TipoPrecio } from '../types';
import { useEventos } from '../context/EventosContext';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useEventoPermisos } from '../hooks/useEventoPermisos';
import { armarFechaHora, fechaHoraValidas, separarFechaHora } from '../lib/fecha';
import { montoDesdePrecio } from '../lib/precio';
import { listarEspeciales } from '../lib/especiales';
import { DatosPago, datosPagoCompletos, getPayout, guardarDatosPago, hayAlgunDatoPago } from '../lib/datosPago';
import GeneroPicker from '../components/GeneroPicker';
import PaisPicker from '../components/PaisPicker';
import PreventasEvento from '../components/PreventasEvento';
import TicketsEspecialesEvento from '../components/TicketsEspecialesEvento';
import DatosPagoEvento, { DATOS_PAGO_VACIOS } from '../components/DatosPagoEvento';
import CampoImagen from '../components/CampoImagen';
import { CampoFecha, CampoHora } from '../components/CampoFecha';
import AccionesEvento from '../components/AccionesEvento';
import InvitarBandasDelEvento from '../components/InvitarBandasDelEvento';
import InvitarLocalDelEvento from '../components/InvitarLocalDelEvento';
import AvisoEdicionAdmin from '../components/AvisoEdicionAdmin';
import BandasYLocalAdmin from '../components/BandasYLocalAdmin';
import { PAIS_POR_DEFECTO, etiquetaPais } from '../constants/paises';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

const MAX_DESCRIPCION = 900;

/**
 * Spec 034 — formulario igual al de CrearEventoScreen pero precargado y sin
 * selector de venue/artista: cambiar venueId o artistId reabre la pregunta de
 * a quién agregar al equipo, que events_claim_owner_trg solo resuelve en el
 * INSERT. Está fuera de alcance a propósito.
 *
 * Spec 136 — corrige además fecha exacta (`comienza_at`), país, descripción,
 * tipo de precio y preventas, flyer y, solo para el owner, los datos para el
 * pago. Los errores van en un `Text` rojo: `Alert.alert` no hace nada en el
 * build web de Expo (`src/lib/confirm.ts`).
 *
 * Registrada en las tres stacks (Cartelera/Musico/MiLocal) porque
 * DetalleEventoScreen, que abre esta pantalla, vive en CarteleraStack — mismo
 * patrón que EquipoEvento. El cast de `route.params` sigue el mismo estilo
 * que EquipoEventoScreen: no vale la pena tipar contra las tres ParamList a
 * la vez para un solo campo.
 *
 * Spec 137 — debajo del formulario, `AccionesEvento`: visible en la cartelera,
 * cancelar con motivo y borrar, como `/eventos/<id>/editar` en la web. Por
 * eso la navegación se tipa como stack genérica: tras borrar hace
 * `popToTop()`, porque el detalle del que se vino ya no existe.
 */
export default function EditarEventoScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const route = useRoute();
  const { eventoId } = route.params as { eventoId: string };
  const { eventos, updateEvento, refresh } = useEventos();
  const permisos = useEventoPermisos(eventoId);
  const { esOwner } = permisos;
  const { user, role } = useAuth();
  const { allVenues } = useVenues();

  const evento = eventos.find((e) => e.id === eventoId);
  const inicial = separarFechaHora(evento?.comienzaAt);

  const [artista, setArtista] = useState(evento?.artista ?? '');
  const [fecha, setFecha] = useState(inicial.fechaISO);
  const [hora, setHora] = useState(inicial.horaISO);
  const [pais, setPais] = useState(evento?.pais || PAIS_POR_DEFECTO);
  const [pickerPaisVisible, setPickerPaisVisible] = useState(false);
  const [genero, setGenero] = useState(evento?.genero ?? '');
  const [pickerGeneroVisible, setPickerGeneroVisible] = useState(false);
  const [descripcion, setDescripcion] = useState(evento?.descripcion ?? '');
  const [precio, setPrecio] = useState(evento?.precio ?? '');
  // Spec 165 — Preventa encendida es lo que antes era el chip «Puerta» (W-256):
  // `tipoPrecio` se deriva y `updateEvento` recibe lo mismo que antes.
  const [preventaOn, setPreventaOn] = useState(evento?.tipoPrecio === 'puerta');
  const tipoPrecio: TipoPrecio = preventaOn ? 'puerta' : 'general';
  // El interruptor del pack arranca encendido si el evento tiene algún pack y queda
  // bloqueado mientras alguno esté activo: apagarlo no debe cerrar packs que ya se
  // venden, cerrar es una acción explícita por pack (W-256 §3).
  const [especialOn, setEspecialOn] = useState(false);
  const [especialesCargados, setEspecialesCargados] = useState(false);
  const [hayEspecialesActivos, setHayEspecialesActivos] = useState(false);
  const [flyer, setFlyer] = useState(evento?.imagen ?? '');
  const [datosPago, setDatosPago] = useState<DatosPago>(DATOS_PAGO_VACIOS);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La RLS de `event_payouts` solo le da la fila al owner: para el resto
  // `getPayout` devuelve null, así que solo se pide si se va a mostrar.
  useEffect(() => {
    if (!esOwner) return;
    let cancelado = false;
    getPayout(eventoId)
      .then((p) => {
        if (cancelado || !p) return;
        setDatosPago({
          banco: p.banco ?? '',
          tipoCuenta: p.tipoCuenta || 'corriente',
          numeroCuenta: p.numeroCuenta ?? '',
          titular: p.titular ?? '',
          rut: p.rut ?? '',
          emailContacto: p.emailContacto,
        });
      })
      .catch((err: any) => {
        if (!cancelado) setError(`No se pudieron cargar los datos para el pago: ${err?.message ?? 'error desconocido'}`);
      });
    return () => { cancelado = true; };
  }, [eventoId, esOwner]);

  const eventoIdCargado = evento?.id;
  useEffect(() => {
    if (!eventoIdCargado) return;
    let cancelado = false;
    listarEspeciales(eventoIdCargado)
      .then((lista) => {
        if (cancelado) return;
        setEspecialOn(lista.length > 0);
        setHayEspecialesActivos(lista.some((e) => e.activa));
      })
      .catch((err) => console.error(`[evento ${eventoIdCargado}] no se pudieron leer los packs:`, err))
      .finally(() => {
        if (!cancelado) setEspecialesCargados(true);
      });
    return () => { cancelado = true; };
  }, [eventoIdCargado]);

  if (!evento) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>Evento no encontrado</Text>
      </View>
    );
  }

  const handleGuardar = async () => {
    if (!artista.trim()) {
      setError('Falta el artista');
      return;
    }
    if (!fechaHoraValidas(fecha.trim(), hora.trim())) {
      setError('La fecha va como AAAA-MM-DD y la hora como HH:MM');
      return;
    }
    if (!precio.trim()) {
      setError('Falta el precio');
      return;
    }
    // Opcionales al editar: vacíos no se guardan, a medias es un error.
    const guardarPago = esOwner && datosPagoCompletos(datosPago);
    if (esOwner && !guardarPago && hayAlgunDatoPago(datosPago)) {
      setError('Completa todos los datos para el pago, o déjalos todos vacíos');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const { fecha: fechaTexto, hora: horaTexto, comienzaAt } = armarFechaHora(fecha.trim(), hora.trim());
      // `precio` solo viaja si cambió: `updateEvento` recalcula `monto` cuando
      // viene, y editar solo la hora no debe tocarlo.
      await updateEvento(evento.id, {
        artista,
        fecha: fechaTexto,
        hora: horaTexto,
        comienzaAt,
        genero,
        descripcion,
        ...(precio !== evento.precio ? { precio } : {}),
        tipoPrecio,
        imagen: flyer.trim() || null,
        pais,
      });
      if (guardarPago) await guardarDatosPago(evento.id, datosPago);
      Alert.alert('Cambios guardados', undefined, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      // Sin catch{} silencioso — mismo criterio que cancelEvento/deleteEvento
      // tras el spec 033: si RLS rechaza el UPDATE, el mensaje llega tal cual.
      setError(`No se pudo guardar: ${err?.message ?? 'error desconocido'}`);
    } finally {
      setGuardando(false);
    }
  };

  const sinMonto = precio.trim() !== '' && montoDesdePrecio(precio) <= 0;
  const local = allVenues.find((v) => v.id === evento.venueId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Spec 206 (W-352, W-355) */}
      {permisos.comoAdmin && (
        <AvisoEdicionAdmin
          tipo="evento"
          nombre={evento.venueName ? `${artista} en ${evento.venueName}` : artista}
          onVerFicha={() =>
            (navigation as any).navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId: evento.id } })
          }
        />
      )}
      {permisos.esAdmin && (
        <BandasYLocalAdmin
          eventoId={evento.id}
          local={evento.venueId ? { id: evento.venueId, nombre: evento.venueName } : null}
          onCambio={refresh}
          // Sin esto, guardar el formulario pisaría el nombre nuevo con el viejo.
          onCambioPrincipal={setArtista}
        />
      )}

      <View style={styles.card}>
        <Text style={styles.titulo}>Editar evento</Text>

        <Text style={styles.label}>Artista *</Text>
        <TextInput
          style={styles.input}
          value={artista}
          onChangeText={setArtista}
          placeholder="Ej: Juana Fe"
          placeholderTextColor={colores.muted}
        />

        <Text style={styles.label}>Fecha *</Text>
        {!evento.comienzaAt && (
          <Text style={styles.ayuda}>Este evento no tiene fecha exacta: complétala</Text>
        )}
        <CampoFecha
          style={styles.input}
          value={fecha}
          onChange={setFecha}
          placeholder="2026-11-28"
        />

        <Text style={styles.label}>Hora *</Text>
        <CampoHora
          style={styles.input}
          value={hora}
          onChange={setHora}
          placeholder="21:00"
        />

        <Text style={styles.label}>País *</Text>
        <Text style={styles.ayuda}>Dónde ocurre el evento — decide en qué cartelera aparece</Text>
        <TouchableOpacity style={styles.input} onPress={() => setPickerPaisVisible(true)}>
          <Text style={styles.inputTexto}>{etiquetaPais(pais)}</Text>
        </TouchableOpacity>
        <PaisPicker
          visible={pickerPaisVisible}
          onClose={() => setPickerPaisVisible(false)}
          seleccionado={pais}
          onCambiar={setPais}
          titulo="País del evento"
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

        {/* Spec 165 — los dos a la vista; Preventa sale de `tipo_precio` y el pack de
            si el evento ya tiene alguno (W-256). */}
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
        {preventaOn && <PreventasEvento modo="enVivo" eventoId={evento.id} />}

        <View style={styles.interruptor}>
          <Switch
            value={especialOn}
            onValueChange={setEspecialOn}
            disabled={!especialesCargados || hayEspecialesActivos}
            trackColor={{ true: colores.especial, false: colores.border }}
          />
          <View style={styles.interruptorTextos}>
            <Text style={[styles.interruptorTitulo, styles.interruptorTituloEspecial]}>🎟 Ticket especial</Text>
            <Text style={styles.interruptorAyuda}>
              Packs 2x1 a 5x1 con unidades limitadas, en rojo junto a la entrada normal.
            </Text>
            {hayEspecialesActivos && (
              <Text style={styles.interruptorBloqueado}>Cierra los packs para apagarlo</Text>
            )}
          </View>
        </View>
        {especialOn && (
          <TicketsEspecialesEvento
            modo="enVivo"
            eventoId={evento.id}
            moneda={evento.moneda}
            onCambio={(l) => setHayEspecialesActivos(l.some((e) => e.activa))}
          />
        )}

        <Text style={styles.label}>Flyer</Text>
        {/* Con el evento ya creado, la policy de `eventos/<id>/` exige
            `can_edit_event`, que quien edita ya tiene. */}
        <CampoImagen carpeta="eventos" id={evento.id} valor={flyer} onCambiar={setFlyer} />
        {flyer ? (
          <TouchableOpacity onPress={() => setFlyer('')}>
            <Text style={styles.enlace}>Quitar flyer</Text>
          </TouchableOpacity>
        ) : null}

        {esOwner && (
          <>
            <Text style={styles.label}>Datos para el pago</Text>
            <DatosPagoEvento value={datosPago} onChange={setDatosPago} obligatorio={false} />
          </>
        )}

        <Text style={styles.aviso}>
          El local ({evento.venueName}) y el artista vinculado no se pueden cambiar desde acá.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
      </View>

      {/* Spec 199 — el equipo invita a las bandas sin cuenta; el músico, además, al
          dueño del local que él registró (W-306, W-338). */}
      {evento && permisos.puedeEditar && <InvitarBandasDelEvento evento={evento} />}
      {role === 'musician' && user && local && local.ownerId === user.id && (
        <InvitarLocalDelEvento venueId={local.id} nombre={local.name} />
      )}

      <AccionesEvento
        evento={evento}
        permisos={permisos}
        onBorrado={() => navigation.popToTop()}
      />
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
  // Spec 056 — igual que en CrearEventoScreen: el campo de género es un
  // TouchableOpacity, el texto interno necesita su propio estilo.
  inputTexto: { fontSize: fontSize.md, color: c.primary },
  inputPlaceholder: { fontSize: fontSize.md, color: c.muted },
  ayuda: { fontSize: fontSize.xs, color: c.muted, marginBottom: spacing.xs },
  aviso: {
    fontSize: fontSize.xs,
    color: c.muted,
    marginTop: spacing.md,
  },
  enlace: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600', marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.md },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  interruptorTextos: { flex: 1 },
  interruptorTitulo: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary },
  interruptorTituloEspecial: { color: c.especial },
  interruptorAyuda: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
  interruptorBloqueado: { fontSize: fontSize.xs, color: c.especial, marginTop: 2 },
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
  errorTexto: {
    fontSize: fontSize.md,
    color: c.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
