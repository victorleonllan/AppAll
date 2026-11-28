import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapaPin from './MapaPin';
import { buscarUbicacion } from '../lib/geocodificar';
import {
  Punto, ResultadoBusqueda, MARGEN_PIN_METROS, CENTRO_PAIS,
  distanciaMetros, limitarAlMargen, mensajeErrorBusqueda,
} from '../lib/ubicacion';
import { mapaDisponible } from '../lib/mapa';
import type { VenueType } from '../types';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

// Spec 200 — confirmar y ajustar el pin de un local. Hermano de
// sonopolisWeb/components/UbicacionLocal.js (W-340). El mapa vive en MapaPin; donde
// no se puede dibujar (web, Android sin clave) se confirma sin mapa.

interface Props {
  direccion: string;
  comuna?: string | null;
  pais?: string | null;
  nombre: string;                     // del local, para el aviso de solo lectura
  tipo?: VenueType | null;
  valor: Punto | null;                // la ubicación confirmada (local nuevo) o guardada
  puedeMover: boolean;
  modo: 'crear' | 'editar';
  onConfirmar: (punto: Punto | null) => void | Promise<void>;  // null solo «sin pin»
  buscarAl?: number;                  // local NUEVO: cada cambio de este número busca
  onCorregir?: () => void;            // en crear, lleva el foco al campo Dirección
}

type Busqueda =
  | { estado: 'ninguna' }
  | { estado: 'buscando' }
  | { estado: 'lista'; resultado: ResultadoBusqueda }
  | { estado: 'error'; mensaje: string };

type TipoAviso = 'pregunta' | 'error' | 'exito' | 'info';

const SIN_BUSCAR: Busqueda = { estado: 'ninguna' };

/** Espera a que el Modal termine de cerrarse antes de pedir el foco del campo. */
const ESPERA_CIERRE_MS = 400;

export default function UbicacionLocal({
  direccion, comuna, pais, nombre, tipo, valor, puedeMover, modo, onConfirmar, buscarAl, onCorregir,
}: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const hayMapa = mapaDisponible();
  const esNuevo = buscarAl !== undefined;
  const calleEscrita = direccion.trim();
  const puedeCorregir = modo === 'crear' && Boolean(onCorregir);
  const claveDireccion = `${direccion}|${comuna ?? ''}|${pais ?? ''}`;

  const [busqueda, setBusqueda] = useState<Busqueda>(SIN_BUSCAR);
  const [confirmada, setConfirmada] = useState<'pin' | 'sinPin' | null>(null);
  // 'ajustar' tiene el círculo del margen; 'mano' no.
  const [ajuste, setAjuste] = useState<'ajustar' | 'mano' | null>(null);
  const [centro, setCentro] = useState<Punto | null>(null);
  const [pin, setPin] = useState<Punto | null>(null);
  const [fuera, setFuera] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  // Una respuesta que llega tarde se descarta.
  const ticketRef = useRef(0);
  const centroTicketRef = useRef(0);
  const claveRef = useRef(claveDireccion);
  const buscarAlRef = useRef(buscarAl);

  const puntoMapa =
    busqueda.estado === 'lista' && busqueda.resultado.encontrado ? busqueda.resultado.punto : null;
  const puntoQueCoincide =
    busqueda.estado === 'lista' && busqueda.resultado.encontrado && busqueda.resultado.coincide
      ? busqueda.resultado.punto
      : null;

  const cerrarAjuste = () => {
    centroTicketRef.current++;
    setAjuste(null);
    setFuera(false);
    setErrorGuardar(null);
  };

  const buscar = async (): Promise<ResultadoBusqueda | null> => {
    const ticket = ++ticketRef.current;
    setConfirmada(null);
    setErrorGuardar(null);
    setBusqueda({ estado: 'buscando' });
    try {
      const resultado = await buscarUbicacion({ direccion, comuna, pais });
      if (ticket !== ticketRef.current) return null;
      setBusqueda({ estado: 'lista', resultado });
      return resultado;
    } catch (error: any) {
      if (ticket !== ticketRef.current) return null;
      setBusqueda({ estado: 'error', mensaje: mensajeErrorBusqueda(error) });
      return null;
    }
  };

  // La dirección cambió: lo encontrado y lo confirmado ya no son de esta dirección.
  useEffect(() => {
    if (claveRef.current === claveDireccion) return;
    claveRef.current = claveDireccion;
    ticketRef.current++;
    setBusqueda(SIN_BUSCAR);
    setConfirmada(null);
    cerrarAjuste();
  }, [claveDireccion]);

  // Local nuevo: busca cuando el formulario lo pide (al salir del campo). Salir sin
  // haber cambiado nada no repite la consulta (Nominatim: 1 por segundo).
  useEffect(() => {
    if (buscarAlRef.current === buscarAl) return;
    buscarAlRef.current = buscarAl;
    if (!calleEscrita) return;
    if (busqueda.estado === 'ninguna' || busqueda.estado === 'error') buscar();
  }, [buscarAl]);

  useEffect(
    () => () => {
      ticketRef.current++;
      centroTicketRef.current++;
    },
    []
  );

  /** El pin parte donde ya estaba si cae dentro del margen; si no, en el punto del mapa. */
  const abrirAjuste = (punto: Punto) => {
    setCentro(punto);
    setPin(valor && distanciaMetros(punto, valor) <= MARGEN_PIN_METROS ? valor : punto);
    setFuera(false);
    setErrorGuardar(null);
    setAjuste('ajustar');
  };

  const abrirAMano = async () => {
    const ticket = ++centroTicketRef.current;
    setPin(valor);
    setFuera(false);
    setErrorGuardar(null);
    setCentro(valor ?? puntoMapa);
    setAjuste('mano');
    if (valor ?? puntoMapa) return;

    // Sin ningún punto: el centro de la comuna o, si no se puede, el del país.
    let respaldo = CENTRO_PAIS[pais ?? 'CL'] ?? CENTRO_PAIS.CL;
    const nombreComuna = comuna?.trim();
    if (nombreComuna) {
      try {
        const r = await buscarUbicacion({ direccion: nombreComuna, pais });
        if (r.encontrado) respaldo = r.punto;
      } catch {
        // Queda el centro del país: el mapa se puede mover.
      }
    }
    if (ticket === centroTicketRef.current) setCentro(respaldo);
  };

  /** Local que ya existe: busca recién al pedir el ajuste. */
  const pedirAjuste = async () => {
    const resultado = await buscar();
    if (resultado?.encontrado && resultado.coincide) abrirAjuste(resultado.punto);
  };

  const cancelarAjuste = () => {
    cerrarAjuste();
    // En un local que ya existe, cerrar vuelve a «Ajustar pin», no a «¿Es aquí?».
    if (!esNuevo && puntoQueCoincide) setBusqueda(SIN_BUSCAR);
  };

  const corregir = () => {
    cerrarAjuste();
    setTimeout(() => onCorregir?.(), ESPERA_CIERRE_MS);
  };

  const moverPin = (punto: Punto) => {
    if (ajuste === 'ajustar' && puntoMapa) {
      setFuera(distanciaMetros(puntoMapa, punto) > MARGEN_PIN_METROS);
      setPin(limitarAlMargen(puntoMapa, punto));
      return;
    }
    setPin(punto);
  };

  const confirmar = async (punto: Punto | null) => {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      await onConfirmar(punto);
      setConfirmada(punto ? 'pin' : 'sinPin');
      cerrarAjuste();
    } catch (error: any) {
      setErrorGuardar(error?.message ?? 'No se pudo guardar la ubicación');
    } finally {
      setGuardando(false);
    }
  };

  /* ---------- piezas ---------- */

  const aviso = (tipoAviso: TipoAviso, titulo: string, texto?: string) => (
    <View
      style={[
        styles.aviso,
        tipoAviso === 'pregunta' && styles.avisoPregunta,
        tipoAviso === 'error' && styles.avisoError,
        tipoAviso === 'exito' && styles.avisoExito,
      ]}
    >
      <Text
        style={[
          styles.avisoTitulo,
          tipoAviso === 'pregunta' && styles.textoPregunta,
          tipoAviso === 'error' && styles.textoError,
          tipoAviso === 'exito' && styles.textoExito,
        ]}
      >
        {titulo}
      </Text>
      {texto ? <Text style={styles.avisoTexto}>{texto}</Text> : null}
    </View>
  );

  const boton = (texto: string, onPress: () => void, secundario = false, desactivado = false) => (
    <TouchableOpacity
      style={[styles.boton, secundario && styles.botonSecundario, desactivado && styles.desactivado]}
      onPress={onPress}
      disabled={desactivado}
    >
      <Text style={[styles.botonTexto, secundario && styles.botonSecundarioTexto]}>{texto}</Text>
    </TouchableOpacity>
  );

  const enlace = (texto: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress}>
      <Text style={styles.enlace}>{texto}</Text>
    </TouchableOpacity>
  );

  const vacio = (texto: string) => (
    <View style={styles.vacio}>
      <Text style={styles.vacioTexto}>{texto}</Text>
    </View>
  );

  /** Mapa quieto. La `key` lo vuelve a encuadrar cuando cambia el punto. */
  const mapa = (punto: Punto) => (
    <View style={styles.mapa}>
      <MapaPin key={`${punto.lat},${punto.lng}`} centro={punto} pin={punto} tipo={tipo} />
    </View>
  );

  const mapaGuardado = () => (valor ? mapa(valor) : vacio('Sin ubicación todavía'));

  const errorDeGuardado = errorGuardar ? <Text style={styles.errorGuardar}>{errorGuardar}</Text> : null;

  const textoSinPin =
    'El local se crea sin pin. Su dueño lo puede ubicar después desde Editar local en el celular.';

  /** «Ubicar a mano», o «Continuar sin ubicación» donde no hay mapa. */
  const salidaSinCoincidencia = () =>
    hayMapa
      ? boton('Ubicar a mano', abrirAMano)
      : boton('Continuar sin ubicación', () => confirmar(null), false, guardando);

  /* ---------- estados ---------- */

  const contenido = () => {
    if (!puedeMover) {
      return (
        <>
          {(hayMapa || !valor) && mapaGuardado()}
          {aviso(
            'info',
            'La ubicación la confirma el local',
            `Si el pin está mal, avísale a ${nombre}: lo puede mover desde la edición del evento o su perfil.`
          )}
        </>
      );
    }

    if (!hayMapa && !esNuevo) return vacio('Para mover el pin, abre Sonópolis en el celular.');

    if (confirmada) {
      return (
        <>
          {confirmada === 'sinPin' ? (
            aviso('info', 'Sin ubicación', textoSinPin)
          ) : (
            aviso('exito', modo === 'editar' ? 'Ubicación guardada' : '✓ Ubicación confirmada')
          )}
          {enlace('Cambiar', () => setConfirmada(null))}
        </>
      );
    }

    if (!esNuevo && busqueda.estado === 'ninguna') {
      return (
        <>
          {mapaGuardado()}
          {boton('Ajustar pin', pedirAjuste, true)}
        </>
      );
    }

    if (esNuevo && !calleEscrita) return vacio('Escribe la dirección para ubicar el local');

    if (busqueda.estado === 'ninguna') {
      return (
        <>
          {vacio('Sal del campo para ubicar la dirección en el mapa')}
          {boton('Buscar en el mapa', buscar, true)}
        </>
      );
    }

    if (busqueda.estado === 'buscando') {
      return (
        <View style={styles.vacio}>
          <ActivityIndicator color={colores.accent} />
          <Text style={styles.vacioTexto}>Buscando la dirección en el mapa…</Text>
        </View>
      );
    }

    if (busqueda.estado === 'error' || !busqueda.resultado.encontrado) {
      const nombreComuna = comuna?.trim();
      return (
        <>
          {!esNuevo && mapaGuardado()}
          {busqueda.estado === 'error'
            ? aviso(
                'error',
                busqueda.mensaje,
                hayMapa ? 'Intenta de nuevo o ubica el pin a mano.' : 'Intenta de nuevo.'
              )
            : calleEscrita
              ? aviso(
                  'error',
                  `No encontramos «${calleEscrita}»${nombreComuna ? ` en ${nombreComuna}` : ''}`,
                  'Revisa la calle y el número. Escribe la calle completa (por ejemplo «Calle 124») o una esquina cercana.'
                )
              : aviso('error', 'El local no tiene dirección escrita', 'Ubica el pin a mano.')}
          {!hayMapa && <Text style={styles.ayuda}>{textoSinPin}</Text>}
          <View style={styles.fila}>
            {calleEscrita ? boton('Buscar de nuevo', esNuevo ? buscar : pedirAjuste, true) : null}
            {salidaSinCoincidencia()}
          </View>
        </>
      );
    }

    const { punto, calle, coincide } = busqueda.resultado;

    if (!coincide) {
      return (
        <>
          {hayMapa && mapa(punto)}
          {aviso(
            'error',
            `Buscamos «${calleEscrita}» y el mapa encontró «${calle}»`,
            hayMapa
              ? 'El mapa no conoce esa calle. Pon el pin tú: arrástralo hasta la entrada del local.'
              : textoSinPin
          )}
          <View style={styles.fila}>
            {salidaSinCoincidencia()}
            {puedeCorregir && boton('Corregir', () => onCorregir?.(), true)}
          </View>
        </>
      );
    }

    return (
      <>
        {hayMapa && mapa(punto)}
        {aviso(
          'pregunta',
          '¿Es aquí?',
          hayMapa
            ? 'Así va a aparecer en el mapa de Sonópolis. Si el pin no quedó en la entrada, ajústalo.'
            : `El mapa ubicó «${calle ?? calleEscrita}». Así va a aparecer en el mapa de Sonópolis.`
        )}
        <View style={styles.fila}>
          {boton('Sí, es aquí', () => confirmar(punto), false, guardando)}
          {hayMapa && boton('Ajustar pin', () => abrirAjuste(punto), true)}
        </View>
      </>
    );
  };

  /* ---------- ajustando / a mano ---------- */

  const aMano = ajuste === 'mano';

  return (
    <View style={styles.bloque}>
      {contenido()}
      {!ajuste && errorDeGuardado}

      {/* Modal: arrastrar un marcador dentro del ScrollView del formulario pelea con
          el gesto de desplazamiento. */}
      <Modal visible={ajuste !== null} animationType="slide" onRequestClose={cancelarAjuste}>
        <SafeAreaView style={styles.hoja}>
          <View style={styles.encabezado}>
            <TouchableOpacity onPress={cancelarAjuste} accessibilityLabel="Cerrar" hitSlop={12}>
              <Text style={styles.cerrar}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.titulo}>Ajustar pin</Text>
            <View style={styles.hueco} />
          </View>

          <View style={styles.margen}>
            {aviso(
              'pregunta',
              'Mueve el pin a la entrada',
              aMano
                ? 'Toca el mapa para poner el pin y arrástralo hasta la entrada. Aquí no hay margen. La dirección no cambia.'
                : `Arrástralo dentro del círculo: hasta ${MARGEN_PIN_METROS} m del punto que encontró el mapa. La dirección no cambia.`
            )}
          </View>

          <View style={styles.mapaGrande}>
            {ajuste && centro ? (
              <MapaPin
                key={ajuste}
                centro={centro}
                pin={pin}
                tipo={tipo}
                circulo={!aMano && puntoMapa ? { centro: puntoMapa, metros: MARGEN_PIN_METROS } : null}
                puntoDelMapa={aMano ? null : puntoMapa}
                editable
                onCambiarPin={moverPin}
              />
            ) : (
              <ActivityIndicator color={colores.accent} style={styles.cargando} />
            )}
          </View>

          <View style={styles.pie}>
            {fuera && (
              <>
                {aviso(
                  'error',
                  `El pin solo se mueve hasta ${MARGEN_PIN_METROS} m`,
                  `Si el local está más lejos, el mapa se equivocó de lugar:${
                    puedeCorregir ? ' corrige la dirección o' : ''
                  } ubica el pin a mano.`
                )}
                <View style={styles.enlaces}>
                  {puedeCorregir && enlace('Corregir dirección', corregir)}
                  {enlace('Ubicar a mano', abrirAMano)}
                </View>
              </>
            )}
            <Text style={styles.ayuda}>
              {!aMano && pin && puntoMapa
                ? `Pin a ${Math.round(distanciaMetros(puntoMapa, pin))} m del punto del mapa · la dirección no cambia`
                : pin
                  ? 'Ubicado a mano · la dirección no cambia'
                  : 'Todavía no hay pin'}
            </Text>
            {!aMano && !fuera && enlace('¿Quedó muy lejos? Ubícalo a mano', abrirAMano)}
            {errorDeGuardado}
            <View style={styles.fila}>
              {puntoQueCoincide &&
                boton('Volver al punto', () => { setPin(puntoQueCoincide); setFuera(false); }, true)}
              {boton(
                guardando ? 'Guardando…' : 'Listo',
                () => { if (pin) confirmar(pin); },
                false,
                !pin || guardando
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  bloque: { marginTop: spacing.sm, gap: spacing.sm },
  mapa: { height: 190, borderRadius: borderRadius.sm, overflow: 'hidden' },
  vacio: {
    minHeight: 96,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  vacioTexto: { fontSize: fontSize.sm, color: c.muted, textAlign: 'center' },
  aviso: { borderRadius: borderRadius.sm, padding: spacing.sm, backgroundColor: c.accentLight },
  avisoPregunta: { backgroundColor: c.highlightBg, borderWidth: 1, borderColor: c.highlightBorder },
  avisoError: { backgroundColor: c.dangerBg },
  avisoExito: { backgroundColor: c.successBg },
  avisoTitulo: { fontSize: fontSize.sm, fontWeight: 'bold', color: c.primary },
  avisoTexto: { fontSize: fontSize.sm, color: c.secondary, marginTop: 2 },
  textoPregunta: { color: c.highlightText },
  textoError: { color: c.dangerText },
  textoExito: { color: c.success },
  fila: { flexDirection: 'row', gap: spacing.sm },
  boton: {
    flex: 1,
    backgroundColor: c.accent,
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: borderRadius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonSecundario: { backgroundColor: c.cardBackground, borderColor: c.border },
  botonTexto: { fontSize: fontSize.sm, fontWeight: 'bold', color: c.onAccent, textAlign: 'center' },
  botonSecundarioTexto: { color: c.primary },
  desactivado: { opacity: 0.6 },
  enlace: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600' },
  enlaces: { flexDirection: 'row', gap: spacing.md },
  ayuda: { fontSize: fontSize.xs, color: c.muted },
  errorGuardar: { fontSize: fontSize.sm, color: c.dangerText },
  hoja: { flex: 1, backgroundColor: c.cardBackground },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  cerrar: { fontSize: fontSize.lg, color: c.primary, width: 24 },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  hueco: { width: 24 },
  margen: { padding: spacing.sm },
  mapaGrande: { flex: 1 },
  cargando: { flex: 1 },
  pie: { padding: spacing.md, gap: spacing.sm },
});
