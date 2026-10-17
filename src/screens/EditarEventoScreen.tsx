import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { ParamListBase, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TipoPrecio } from '../types';
import { useEventos } from '../context/EventosContext';
import { useEventoPermisos } from '../hooks/useEventoPermisos';
import { armarFechaHora, fechaHoraValidas, separarFechaHora } from '../lib/fecha';
import { montoDesdePrecio } from '../lib/precio';
import { DatosPago, datosPagoCompletos, getPayout, guardarDatosPago, hayAlgunDatoPago } from '../lib/datosPago';
import GeneroPicker from '../components/GeneroPicker';
import PaisPicker from '../components/PaisPicker';
import PreventasEvento from '../components/PreventasEvento';
import DatosPagoEvento, { DATOS_PAGO_VACIOS } from '../components/DatosPagoEvento';
import CampoImagen from '../components/CampoImagen';
import { CampoFecha, CampoHora } from '../components/CampoFecha';
import AccionesEvento from '../components/AccionesEvento';
import { PAIS_POR_DEFECTO, etiquetaPais } from '../constants/paises';
import { colors, spacing, borderRadius, fontSize } from '../theme';

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
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const route = useRoute();
  const { eventoId } = route.params as { eventoId: string };
  const { eventos, updateEvento } = useEventos();
  const permisos = useEventoPermisos(eventoId);
  const { esOwner } = permisos;

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
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>(evento?.tipoPrecio ?? 'general');
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.titulo}>Editar evento</Text>

        <Text style={styles.label}>Artista *</Text>
        <TextInput
          style={styles.input}
          value={artista}
          onChangeText={setArtista}
          placeholder="Ej: Juana Fe"
          placeholderTextColor={colors.muted}
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
            <PreventasEvento modo="enVivo" eventoId={evento.id} />
          </>
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
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.textoBoton}>Guardar cambios</Text>
          )}
        </TouchableOpacity>
      </View>

      <AccionesEvento
        evento={evento}
        permisos={permisos}
        onBorrado={() => navigation.popToTop()}
      />
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
  // Spec 056 — igual que en CrearEventoScreen: el campo de género es un
  // TouchableOpacity, el texto interno necesita su propio estilo.
  inputTexto: { fontSize: fontSize.md, color: colors.primary },
  inputPlaceholder: { fontSize: fontSize.md, color: colors.muted },
  ayuda: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.xs },
  aviso: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: spacing.md,
  },
  enlace: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600', marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.md },
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
  errorTexto: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
