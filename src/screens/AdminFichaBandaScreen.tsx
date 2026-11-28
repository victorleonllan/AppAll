// Spec 206 — una ficha suelta: editar sus datos, conectarla con una cuenta o unirla con
// otra (W-343, W-349). Una ficha no tiene dueño ni formulario propio.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import SelectorBandaAdmin from '../components/SelectorBandaAdmin';
import {
  adminEditarBanda,
  adminUnirBandas,
  adminVincularBanda,
  eventosDeFichas,
  fichaSueltaPorId,
  type BandaEncontrada,
  type EventoDeFicha,
  type FichaSueltaAdmin,
} from '../lib/adminEdicion';
import { soloCambios } from '../lib/bandas';
import { confirmar } from '../lib/confirm';
import type { AdminParamList } from '../navigation/pantallasAdmin';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

type FichaRoute = RouteProp<AdminParamList, 'AdminFichaBanda'>;
type NavProp = NativeStackNavigationProp<AdminParamList, 'AdminFichaBanda'>;

// Las claves son las columnas de `artists`.
const CAMPOS = [
  { clave: 'name', etiqueta: 'Nombre' },
  { clave: 'genero', etiqueta: 'Género' },
  { clave: 'comuna', etiqueta: 'Comuna' },
  { clave: 'instagram', etiqueta: 'Instagram' },
  { clave: 'contacto', etiqueta: 'Contacto' },
] as const;
type Datos = Record<(typeof CAMPOS)[number]['clave'], string>;

const datosDe = (f: FichaSueltaAdmin): Datos => ({
  name: f.name,
  genero: f.genero ?? '',
  comuna: f.comuna ?? '',
  instagram: f.instagram ?? '',
  contacto: f.contacto ?? '',
});

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function AdminFichaBandaScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation<NavProp>();
  const { fichaId } = useRoute<FichaRoute>().params;
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ficha, setFicha] = useState<FichaSueltaAdmin | null>(null);
  const [eventos, setEventos] = useState<EventoDeFicha[]>([]);
  const [inicial, setInicial] = useState<Datos | null>(null);
  const [actual, setActual] = useState<Datos | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [f, porFicha] = await Promise.all([fichaSueltaPorId(fichaId), eventosDeFichas([fichaId])]);
      setFicha(f);
      setEventos(porFicha.get(fichaId) ?? []);
      if (f) {
        setInicial(datosDe(f));
        setActual(datosDe(f));
      }
    } catch (e: any) {
      setErrorCarga(e?.message ?? 'error desconocido');
    } finally {
      setCargando(false);
    }
  }, [fichaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colores.accent} />
      </View>
    );
  }

  if (errorCarga || !ficha || !inicial || !actual) {
    return (
      <View style={styles.centrado}>
        <Text style={errorCarga ? styles.error : styles.texto}>
          {errorCarga
            ? `No se pudo cargar: ${errorCarga}`
            : 'Esta ficha ya no existe: la conectaron con una cuenta o la unieron con otra.'}
        </Text>
        <TouchableOpacity style={styles.boton} onPress={() => navigation.goBack()}>
          <Text style={styles.botonTexto}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cambios = soloCambios(inicial, actual);
  const sinCambios = Object.keys(cambios).length === 0;

  const guardar = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      await adminEditarBanda(fichaId, cambios);
      setInicial(actual);
      setAviso({ ok: true, texto: 'Cambios guardados' });
    } catch (e: any) {
      setAviso({ ok: false, texto: e?.message ?? 'No se pudo guardar' });
    } finally {
      setOcupado(false);
    }
  };

  // Conectar y unir borran la ficha: si salen bien, se vuelve atrás.
  const borrando = async (accion: () => Promise<unknown>) => {
    setOcupado(true);
    setAviso(null);
    try {
      await accion();
      navigation.goBack();
    } catch (e: any) {
      setAviso({ ok: false, texto: e?.message ?? 'No se pudo completar' });
      setOcupado(false);
    }
  };

  const conectar = (cuenta: BandaEncontrada) =>
    confirmar(
      {
        title: 'Conectar con una cuenta',
        message: `Los ${plural(eventos.length, 'evento', 'eventos')} de esta ficha pasan a la cuenta de ${cuenta.nombre} y la ficha desaparece. No se puede deshacer.`,
        confirmText: 'Conectar',
        destructive: true,
      },
      () => borrando(() => adminVincularBanda(fichaId, cuenta.id)),
    );

  const unir = (destino: BandaEncontrada) =>
    confirmar(
      {
        title: 'Unir fichas',
        message: `Los ${plural(eventos.length, 'evento', 'eventos')} de esta ficha pasan a la ficha «${destino.nombre}» y esta ficha desaparece. Los datos vacíos de la otra ficha se completan con los de esta.`,
        confirmText: 'Unir fichas',
      },
      () => borrando(() => adminUnirBandas(fichaId, destino.id)),
    );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Text style={styles.bajada}>Sin cuenta: sus eventos no salen en ningún perfil de músico.</Text>
      {aviso && <Text style={aviso.ok ? styles.ok : styles.error}>{aviso.texto}</Text>}

      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Datos de la ficha</Text>
        {CAMPOS.map((campo) => (
          <View key={campo.clave}>
            <Text style={styles.label}>{campo.etiqueta}</Text>
            <TextInput
              style={styles.input}
              value={actual[campo.clave]}
              onChangeText={(v) => setActual({ ...actual, [campo.clave]: v })}
              autoCapitalize={campo.clave === 'instagram' || campo.clave === 'contacto' ? 'none' : 'sentences'}
            />
          </View>
        ))}
        <TouchableOpacity
          style={[styles.botonPrincipal, (ocupado || sinCambios) && styles.deshabilitado]}
          disabled={ocupado || sinCambios}
          onPress={guardar}
        >
          <Text style={styles.botonPrincipalTexto}>Guardar cambios</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Conectar con una cuenta</Text>
        <SelectorBandaAdmin
          tipos={['cuenta']}
          placeholder="Buscar cuentas de músico"
          textoAccion="Conectar"
          textoVacio="No hay cuentas de músico con ese nombre."
          deshabilitado={ocupado}
          onElegir={conectar}
        />
        <Text style={styles.nota}>Conectar le da a la cuenta los eventos de esta ficha, y la ficha desaparece.</Text>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Unir con otra ficha suelta</Text>
        <SelectorBandaAdmin
          tipos={['ficha']}
          excluir={[fichaId]}
          placeholder="Buscar otras fichas sueltas"
          textoAccion="Unir"
          textoVacio="No hay otras fichas sueltas con ese nombre."
          deshabilitado={ocupado}
          onElegir={unir}
        />
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Eventos de esta ficha</Text>
        {eventos.length === 0 ? (
          <Text style={styles.nota}>Todavía no está en ningún evento.</Text>
        ) : (
          eventos.map((e) => (
            <Text key={e.id} style={styles.texto}>
              {e.nombre} · {e.fecha ?? 'sin fecha'} · {e.local} ({e.principal ? 'principal' : 'invitada'})
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  centrado: {
    flex: 1,
    backgroundColor: c.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  bajada: { fontSize: fontSize.sm, color: c.secondary },
  tarjeta: {
    backgroundColor: c.cardBackground,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: c.primary,
    backgroundColor: c.cardBackground,
  },
  texto: { fontSize: fontSize.sm, color: c.primary },
  nota: { fontSize: fontSize.xs, color: c.secondary },
  ok: { fontSize: fontSize.sm, color: c.success },
  error: { fontSize: fontSize.sm, color: c.danger },
  boton: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  botonTexto: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary },
  botonPrincipal: { backgroundColor: c.accent, borderRadius: borderRadius.sm, padding: spacing.sm, alignItems: 'center' },
  botonPrincipalTexto: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.sm },
  deshabilitado: { opacity: 0.5 },
});
