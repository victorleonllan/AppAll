// Spec 157 — el redactor de una publicación en redes: post libre o anuncio de un
// evento (`eventoId`). Hermano de `/local/redes/publicar` y `RedactorPublicacion.js` de
// la web (W-238), en el mismo orden de arriba abajo.
//
// Vive en MiLocalStack, MusicoStack y CarteleraStack (desde la ficha del evento): al
// publicar, «Volver» hace `goBack()` y regresa a donde se entró.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useEventos } from '../context/EventosContext';
import { useTenantRedes } from '../hooks/useTenantRedes';
import { useConexionesRedes } from '../hooks/useConexionesRedes';
import { useSubirMediosRedes } from '../hooks/useSubirMediosRedes';
import { IconoRed, AvisoRedes, hayAvisoRedes, abrirPanelRedesWeb } from '../components/redes/ComunRedes';
import MediosRedes from '../components/redes/MediosRedes';
import { CampoFecha, CampoHora } from '../components/CampoFecha';
import { ORDEN_REDES, REDES, Red } from '../lib/redes/catalogo';
import { largoParaRed, validarEnApp, ValidacionPublicacion } from '../lib/redes/reglas';
import { textoDelEvento } from '../lib/redes/textos';
import { aISOEnZona, formatearProgramada, minimoProgramable } from '../lib/redes/horario';
import {
  crearPublicacionRed,
  esSinPro,
  mensajeRedes,
  PrivacidadTikTok,
  PublicacionRed,
} from '../lib/redes/api';
import { ErrorApiWeb } from '../lib/apiWeb';
import { PAISES } from '../constants/paises';
import type { Evento } from '../types';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type PublicarRoute = RouteProp<{ PublicarRedes: { eventoId?: string } | undefined }, 'PublicarRedes'>;

const PRIVACIDADES: { value: PrivacidadTikTok; label: string }[] = [
  { value: 'PUBLIC_TO_EVERYONE', label: 'Público' },
  { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Amigos' },
  { value: 'SELF_ONLY', label: 'Solo yo' },
];

/** «Sábado 24 de octubre» en la zona del país del evento, como el anuncio (`textos.ts`). */
function fechaLarga(evento: Evento): string {
  if (!evento.comienzaAt) return evento.fecha ?? '';
  const zona = (evento.pais && PAISES[evento.pais]?.zonaHoraria) || 'America/Santiago';
  const texto = new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(evento.comienzaAt));
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace(',', '');
}

/** Un 400 de la API con `generales`/`porRed`; `null` si el cuerpo no los trae. */
function validacionDelServidor(e: unknown): ValidacionPublicacion | null {
  if (!(e instanceof ErrorApiWeb) || e.status !== 400) return null;
  const { generales, porRed } = e.cuerpo as { generales?: unknown; porRed?: unknown };
  if (!Array.isArray(generales) && (porRed == null || typeof porRed !== 'object')) return null;
  return {
    ok: false,
    generales: Array.isArray(generales) ? (generales as string[]) : [],
    porRed: (porRed as ValidacionPublicacion['porRed']) ?? {},
  };
}

function Contador({ red, texto }: { red: Red; texto: string }) {
  const { nombre, maxTexto } = REDES[red];
  const largo = largoParaRed(texto, red);
  const pasado = largo > maxTexto;
  return (
    <Text style={[styles.contador, pasado && styles.contadorPasado]}>
      {nombre} {largo}/{maxTexto}
    </Text>
  );
}

function Errores({ lista }: { lista: string[] | undefined }) {
  if (!lista || lista.length === 0) return null;
  return (
    <>
      {lista.map((m) => (
        <Text key={m} style={styles.error}>
          {m}
        </Text>
      ))}
    </>
  );
}

export default function PublicarRedesScreen() {
  const navigation = useNavigation();
  const route = useRoute<PublicarRoute>();
  const eventoId = route.params?.eventoId ?? null;

  const tenant = useTenantRedes();
  const habilitado = tenant.estado === 'listo' && tenant.esPro;
  const cuentas = useConexionesRedes(tenant.tenantType, habilitado);
  const medios = useSubirMediosRedes(tenant.tenantType);
  const { eventos } = useEventos();
  // La misma fuente que la ficha. Si no aparece, abre como post libre, sin error.
  const evento = eventoId ? eventos.find((e) => e.id === eventoId) ?? null : null;
  const zona = tenant.zonaHoraria;

  const [elegidas, setElegidas] = useState<Red[]>([]);
  const [texto, setTexto] = useState('');
  const [personalizar, setPersonalizar] = useState(false);
  // Una red sin entrada sigue al texto principal.
  const [textosPorRed, setTextosPorRed] = useState<Partial<Record<Red, string>>>({});
  const [pestana, setPestana] = useState<Red | null>(null);
  const [opcionesTikTok, setOpcionesTikTok] = useState<{ privacidad: PrivacidadTikTok; comentarios: boolean }>({
    privacidad: 'PUBLIC_TO_EVERYONE',
    comentarios: true,
  });
  const [programar, setProgramar] = useState(false);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorServidor, setErrorServidor] = useState<ValidacionPublicacion | null>(null);
  const [sinPro, setSinPro] = useState(false);
  const [creada, setCreada] = useState<PublicacionRed | null>(null);

  const { activas, recargar } = cuentas;
  const { agregarFlyer } = medios;

  // Punto de partida, una sola vez cuando llegan las cuentas: una recarga no pisa lo escrito.
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current || activas.length === 0) return;
    iniciado.current = true;
    setElegidas(activas.map((c) => c.red));
    if (evento) {
      const textos: Partial<Record<Red, string>> = {};
      for (const red of ORDEN_REDES) textos[red] = textoDelEvento(evento, red);
      setTextosPorRed(textos);
      setTexto(textos.facebook ?? '');
      // Instagram y TikTok no llevan link y las demás sí: cada red parte con el suyo.
      setPersonalizar(true);
      if (evento.imagen) agregarFlyer(evento.imagen);
    }
  }, [activas, evento, agregarFlyer]);

  // Volver de conectar una cuenta en la web (Android: el Custom Tab manda la app al fondo).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recargar();
    });
    return () => sub.remove();
  }, [recargar]);

  // En el orden de las casillas, no en el que se marcaron.
  const redes = activas.map((c) => c.red).filter((red) => elegidas.includes(red));
  const activa = pestana && redes.includes(pestana) ? pestana : redes[0] ?? null;

  // Solo las versiones que difieren del texto principal.
  const textosEnviados = useMemo(() => {
    const out: Partial<Record<Red, string>> = {};
    if (!personalizar) return out;
    for (const red of redes) {
      const t = textosPorRed[red];
      if (t !== undefined && t !== texto) out[red] = t;
    }
    return out;
    // `redes` sale de `activas` y `elegidas` en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalizar, textosPorRed, texto, elegidas, activas]);

  // Programar con la fecha vacía o a medio escribir da '' → «La fecha programada no es válida».
  const programadaPara = programar ? aISOEnZona(fecha, hora, zona) ?? '' : null;
  const validacion = validarEnApp({
    texto,
    textosPorRed: textosEnviados,
    medios: medios.medios,
    redes,
    programadaPara,
  });
  // Un 400 del servidor se pinta igual que la validación local, hasta el próximo cambio.
  const errores = errorServidor ?? validacion;

  useEffect(() => {
    setErrorServidor(null);
  }, [texto, textosPorRed, medios.items, elegidas, programar, fecha, hora, personalizar]);

  const conectar = async () => {
    if (!tenant.panelWeb) return;
    try {
      await abrirPanelRedesWeb(tenant.panelWeb);
    } catch (e) {
      setErrorEnvio(mensajeRedes(e));
    }
    recargar();
  };

  const alternarRed = (red: Red) =>
    setElegidas((prev) => (prev.includes(red) ? prev.filter((r) => r !== red) : [...prev, red]));

  const elegirCuando = (valor: boolean) => {
    setProgramar(valor);
    if (valor && !fecha && !hora) {
      const minimo = minimoProgramable(zona);
      setFecha(minimo.fecha);
      setHora(minimo.hora);
    }
  };

  const enviar = async () => {
    if (!tenant.tenantType || !errores.ok || medios.subiendo || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    const opcionesPorRed = redes.includes('tiktok')
      ? {
          tiktok: {
            privacidad: medios.tieneVideo ? ('PUBLIC_TO_EVERYONE' as const) : opcionesTikTok.privacidad,
            comentarios: opcionesTikTok.comentarios,
          },
        }
      : {};
    try {
      const publicacion = await crearPublicacionRed(tenant.tenantType, {
        texto,
        textosPorRed: textosEnviados,
        medios: medios.medios,
        redes,
        opcionesPorRed,
        programadaPara,
        eventoId: evento ? evento.id : null,
      });
      setCreada(publicacion);
    } catch (e) {
      if (esSinPro(e)) {
        setSinPro(true);
      } else {
        const delServidor = validacionDelServidor(e);
        if (delServidor) setErrorServidor(delServidor);
        else setErrorEnvio(mensajeRedes(e));
      }
    } finally {
      setEnviando(false);
    }
  };

  // ── Guardas (todos los hooks ya corrieron) ────────────────────────────────

  const propsAviso = {
    tenant,
    disponibles: cuentas.disponibles,
    sinPro,
    cargando: cuentas.cargando,
    error: cuentas.error,
  };
  if (hayAvisoRedes(propsAviso)) return <AvisoRedes {...propsAviso} />;

  if (activas.length === 0) {
    if (cuentas.cargando) {
      return (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }
    return (
      <View style={styles.centro}>
        <Text style={styles.textoCentro}>Conecta al menos una red para publicar.</Text>
        <TouchableOpacity style={styles.botonChico} onPress={conectar}>
          <Text style={styles.textoBotonChico}>Conectar en la web</Text>
        </TouchableOpacity>
        {errorEnvio && <Text style={styles.error}>{errorEnvio}</Text>}
      </View>
    );
  }

  if (creada) {
    return (
      <View style={styles.centro}>
        <Ionicons name="checkmark-circle" size={48} color={colors.success} />
        <Text style={styles.textoCentro}>
          {creada.programadaPara && creada.estado === 'programada'
            ? `Programada para el ${formatearProgramada(creada.programadaPara, zona)}`
            : 'Publicando… El resultado de cada red aparece en Redes.'}
        </Text>
        <TouchableOpacity style={styles.botonPrimario} onPress={() => navigation.goBack()}>
          <Text style={styles.textoBotonPrimario}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Formulario ────────────────────────────────────────────────────────────

  const sinConectar = cuentas.disponibles.filter((red) => !activas.some((c) => c.red === red));
  const nombrePais = Object.values(PAISES).find((p) => p.zonaHoraria === zona)?.nombre;
  const n = redes.length;
  const textoBoton = enviando
    ? 'Enviando…'
    : `${programar ? 'Programar' : 'Publicar'} en ${n} ${n === 1 ? 'red' : 'redes'}`;
  const deshabilitado = !errores.ok || medios.subiendo || enviando;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        {evento && (
          <Text style={styles.anunciar}>
            Anunciar: {evento.artista} · {fechaLarga(evento)}
          </Text>
        )}

        {/* 1. ¿Dónde publicas? */}
        <View style={styles.card}>
          <Text style={styles.titulo}>¿Dónde publicas?</Text>
          {activas.map((c) => {
            const marcada = elegidas.includes(c.red);
            return (
              <View key={c.red}>
                <TouchableOpacity style={styles.filaRed} onPress={() => alternarRed(c.red)}>
                  <Ionicons
                    name={marcada ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={marcada ? colors.accent : colors.muted}
                  />
                  <IconoRed red={c.red} />
                  <Text style={styles.nombreRed}>{REDES[c.red].nombre}</Text>
                  {c.cuentaNombre && <Text style={styles.gris}>{c.cuentaNombre}</Text>}
                </TouchableOpacity>
                {!personalizar && marcada && <Errores lista={errores.porRed[c.red]} />}
              </View>
            );
          })}
          {sinConectar.map((red) => (
            <View key={red} style={styles.filaRed}>
              <Ionicons name="square-outline" size={22} color={colors.border} />
              <IconoRed red={red} apagado />
              <Text style={[styles.nombreRed, styles.apagado]}>{REDES[red].nombre}</Text>
              <TouchableOpacity onPress={conectar}>
                <Text style={styles.link}>Conectar en la web</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* 2. Texto */}
        <View style={styles.card}>
          <Text style={styles.titulo}>Texto</Text>
          <TextInput
            style={styles.input}
            value={texto}
            onChangeText={setTexto}
            multiline
            placeholder="¿Qué quieres contar?"
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
          />
          <View style={styles.contadores}>
            {redes.map((red) => (
              <Contador key={red} red={red} texto={texto} />
            ))}
          </View>

          {/* 3. Personalizar por red */}
          <View style={styles.filaSwitch}>
            <Text style={styles.etiqueta}>Personalizar por red</Text>
            <Switch value={personalizar} onValueChange={setPersonalizar} />
          </View>
          {personalizar && activa && (
            <>
              <View style={styles.chips}>
                {redes.map((red) => {
                  const conErrores = (errores.porRed[red]?.length ?? 0) > 0;
                  return (
                    <TouchableOpacity
                      key={red}
                      style={[styles.chip, red === activa && styles.chipActivo]}
                      onPress={() => setPestana(red)}
                    >
                      <Text style={[styles.textoChip, red === activa && styles.textoChipActivo]}>
                        {REDES[red].nombre}
                      </Text>
                      {conErrores && <View style={styles.punto} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={styles.input}
                value={textosPorRed[activa] ?? texto}
                onChangeText={(t) => setTextosPorRed((prev) => ({ ...prev, [activa]: t }))}
                multiline
                textAlignVertical="top"
              />
              <Contador red={activa} texto={textosPorRed[activa] ?? texto} />
              {REDES[activa].ayuda && <Text style={styles.gris}>{REDES[activa].ayuda}</Text>}
              <Errores lista={errores.porRed[activa]} />
            </>
          )}
        </View>

        {/* 4. Fotos o video */}
        <View style={styles.card}>
          <Text style={styles.titulo}>Fotos o video</Text>
          <MediosRedes medios={medios} />
        </View>

        {/* 5. Opciones de TikTok: TikTok exige mostrarlas antes de publicar por su API. */}
        {redes.includes('tiktok') && (
          <View style={styles.card}>
            <Text style={styles.titulo}>Opciones de TikTok</Text>
            <Text style={styles.etiqueta}>Quién puede verlo</Text>
            <View style={styles.chips}>
              {(medios.tieneVideo ? PRIVACIDADES.slice(0, 1) : PRIVACIDADES).map((p) => {
                const elegida = medios.tieneVideo
                  ? p.value === 'PUBLIC_TO_EVERYONE'
                  : opcionesTikTok.privacidad === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    style={[styles.chip, elegida && styles.chipActivo]}
                    onPress={() => setOpcionesTikTok((o) => ({ ...o, privacidad: p.value }))}
                    disabled={medios.tieneVideo}
                  >
                    <Text style={[styles.textoChip, elegida && styles.textoChipActivo]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {medios.tieneVideo && (
              <Text style={styles.gris}>En TikTok los videos de cuentas de empresa se publican como públicos.</Text>
            )}
            <View style={styles.filaSwitch}>
              <Text style={styles.etiqueta}>Permitir comentarios</Text>
              <Switch
                value={opcionesTikTok.comentarios}
                onValueChange={(v) => setOpcionesTikTok((o) => ({ ...o, comentarios: v }))}
              />
            </View>
            {/* El adaptador manda siempre el contenido de marca: va marcado y fijo. */}
            <View style={styles.filaRed}>
              <Ionicons name="checkbox" size={22} color={colors.muted} />
              <Text style={styles.gris}>Este contenido promociona mi banda o local</Text>
            </View>
          </View>
        )}

        {/* 6. ¿Cuándo? */}
        <View style={styles.card}>
          <Text style={styles.titulo}>¿Cuándo?</Text>
          <View style={styles.chips}>
            <TouchableOpacity style={[styles.chip, !programar && styles.chipActivo]} onPress={() => elegirCuando(false)}>
              <Text style={[styles.textoChip, !programar && styles.textoChipActivo]}>Ahora</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, programar && styles.chipActivo]} onPress={() => elegirCuando(true)}>
              <Text style={[styles.textoChip, programar && styles.textoChipActivo]}>Programar</Text>
            </TouchableOpacity>
          </View>
          {programar && (
            <>
              <CampoFecha value={fecha} onChange={setFecha} placeholder="AAAA-MM-DD" minimo={new Date()} style={styles.campo} />
              <CampoHora value={hora} onChange={setHora} placeholder="HH:MM" style={styles.campo} />
              {nombrePais && <Text style={styles.gris}>Hora de {nombrePais}</Text>}
            </>
          )}
        </View>

        {/* 7. Errores generales y envío */}
        <Errores lista={errores.generales} />
        {medios.subiendo && <Text style={styles.gris}>Esperando que terminen de subir los archivos…</Text>}
        {errorEnvio && <Text style={styles.error}>{errorEnvio}</Text>}
        <TouchableOpacity
          style={[styles.botonPrimario, deshabilitado && styles.botonApagado]}
          onPress={enviar}
          disabled={deshabilitado}
        >
          <Text style={styles.textoBotonPrimario}>{textoBoton}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  textoCentro: { fontSize: fontSize.md, color: colors.primary, textAlign: 'center' },
  anunciar: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.accent },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  etiqueta: { fontSize: fontSize.sm, fontWeight: 'bold', color: colors.primary },
  filaRed: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4, flexWrap: 'wrap' },
  nombreRed: { fontSize: fontSize.md, color: colors.primary },
  apagado: { color: colors.muted },
  gris: { fontSize: fontSize.xs, color: colors.muted },
  link: { fontSize: fontSize.sm, color: colors.accent, fontWeight: 'bold' },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    backgroundColor: colors.white,
  },
  campo: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    backgroundColor: colors.white,
  },
  contadores: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  contador: { fontSize: fontSize.xs, color: colors.muted },
  contadorPasado: { color: colors.danger, fontWeight: 'bold' },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipActivo: { backgroundColor: colors.accent, borderColor: colors.accent },
  textoChip: { fontSize: fontSize.sm, color: colors.primary },
  textoChipActivo: { color: colors.white, fontWeight: 'bold' },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger },
  error: { fontSize: fontSize.sm, color: colors.danger },
  botonChico: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
  },
  textoBotonChico: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  botonPrimario: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  botonApagado: { opacity: 0.5 },
  textoBotonPrimario: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
});
