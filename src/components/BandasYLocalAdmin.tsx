// Spec 206 — bloque «Bandas y local» de la edición del evento, solo para el admin (W-355).

import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import SelectorBandaAdmin, { EtiquetaBanda } from './SelectorBandaAdmin';
import {
  adminCambiarLocalEvento,
  adminCambiarPrincipalEvento,
  agregarBandaAdicional,
  bandasDelEventoAdmin,
  quitarBandaAdicional,
  type BandaDelEvento,
  type BandaEncontrada,
} from '../lib/adminEdicion';
import { estaEnElEvento, siguienteOrden } from '../lib/bandas';
import { useVenues } from '../context/VenuesContext';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

const comparable = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nombreDe = (b: { nombre: string }) => b.nombre || 'Sin nombre';

interface Props {
  eventoId: string;
  local: { id: string; nombre: string } | null;
  onCambio: () => Promise<void>;
  onCambioPrincipal: (artistName: string) => void;
}

export default function BandasYLocalAdmin({ eventoId, local, onCambio, onCambioPrincipal }: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const { allVenues } = useVenues();
  const [bandas, setBandas] = useState<BandaDelEvento[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const [localElegido, setLocalElegido] = useState<{ id: string; nombre: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      setBandas(await bandasDelEventoAdmin(eventoId));
      setErrorCarga(null);
    } catch (e: any) {
      setErrorCarga(e?.message ?? 'No se pudieron leer las bandas');
    }
  }, [eventoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Toda escritura pasa por acá: bloquea los botones, avisa y relee. El mensaje de error
  // es el de la base, tal cual.
  const correr = async (accion: () => Promise<string>) => {
    setOcupado(true);
    setAviso(null);
    try {
      const texto = await accion();
      setAviso({ ok: true, texto });
      await cargar();
      await onCambio();
    } catch (e: any) {
      setAviso({ ok: false, texto: e?.message ?? 'No se pudo guardar' });
    } finally {
      setOcupado(false);
    }
  };

  const principal = bandas?.find((b) => b.orden === 0) ?? null;
  const adicionales = bandas?.filter((b) => b.orden !== 0) ?? [];

  const cambiarPrincipal = (banda: BandaEncontrada) =>
    correr(async () => {
      const fila = await adminCambiarPrincipalEvento(eventoId, banda);
      setCambiando(false);
      onCambioPrincipal(fila.artist_name);
      return `${nombreDe(banda)} es la banda principal`;
    });

  const agregar = (banda: BandaEncontrada) => {
    if (estaEnElEvento(bandas ?? [], banda)) {
      setAviso({ ok: false, texto: 'Esa banda ya está en el evento' });
      return;
    }
    correr(async () => {
      await agregarBandaAdicional(eventoId, banda, siguienteOrden(adicionales));
      return `${nombreDe(banda)} se agregó al evento`;
    });
  };

  const quitar = (banda: BandaDelEvento) =>
    correr(async () => {
      await quitarBandaAdicional(eventoId, banda);
      return `${nombreDe(banda)} se quitó del evento`;
    });

  const cambiarLocal = () => {
    if (!localElegido) return;
    const elegido = localElegido;
    correr(async () => {
      await adminCambiarLocalEvento(eventoId, elegido.id);
      setLocalElegido(null);
      setBusquedaLocal('');
      return `El evento ahora es en ${elegido.nombre}`;
    });
  };

  const filtro = comparable(busquedaLocal);
  const locales = filtro ? allVenues.filter((v) => comparable(v.name).includes(filtro)).slice(0, 8) : [];
  const sinCambioDeLocal = !localElegido || localElegido.id === local?.id;

  return (
    <View style={styles.tarjeta}>
      <Text style={styles.titulo}>Bandas y local</Text>
      <Text style={styles.bajada}>
        Solo el admin ve este bloque. Cambiar la banda principal o el local también cambia quién puede editar el evento.
      </Text>
      {aviso && <Text style={[styles.aviso, aviso.ok ? styles.avisoOk : styles.avisoError]}>{aviso.texto}</Text>}
      {errorCarga && <Text style={[styles.aviso, styles.avisoError]}>{errorCarga}</Text>}

      {!bandas ? (
        !errorCarga && <ActivityIndicator color={colores.accent} />
      ) : (
        <>
          <Text style={styles.label}>Banda principal</Text>
          {principal ? (
              <View style={styles.fila}>
                <View style={styles.datos}>
                  <Text style={styles.texto}>{nombreDe(principal)}</Text>
                  <EtiquetaBanda tipo={principal.tipo} />
                </View>
                <TouchableOpacity
                  style={[styles.boton, ocupado && styles.deshabilitado]}
                  disabled={ocupado}
                  onPress={() => setCambiando((v) => !v)}
                >
                  <Text style={styles.botonTexto}>{cambiando ? 'Cancelar' : 'Cambiar'}</Text>
                </TouchableOpacity>
              </View>
          ) : (
            <Text style={styles.vacio}>Sin banda principal.</Text>
          )}
          {(!principal || cambiando) && (
            <SelectorBandaAdmin
              tipos={['cuenta', 'ficha']}
              placeholder="Buscar banda o cuenta"
              textoAccion="Elegir"
              textoVacio="No hay bandas con ese nombre."
              deshabilitado={ocupado}
              onElegir={cambiarPrincipal}
            />
          )}

          <Text style={styles.label}>Otras bandas</Text>
          {adicionales.length === 0 && <Text style={styles.vacio}>No hay otras bandas.</Text>}
          {adicionales.map((b) => (
            <View key={`${b.tipo}:${b.id}`} style={styles.fila}>
              <View style={styles.datos}>
                <Text style={styles.texto}>{nombreDe(b)}</Text>
                <EtiquetaBanda tipo={b.tipo} />
              </View>
              <TouchableOpacity
                style={[styles.boton, ocupado && styles.deshabilitado]}
                disabled={ocupado}
                onPress={() => quitar(b)}
              >
                <Text style={styles.botonTexto}>Quitar</Text>
              </TouchableOpacity>
            </View>
          ))}
          <SelectorBandaAdmin
            tipos={['cuenta', 'ficha']}
            placeholder="Agregar otra banda"
            textoAccion="Agregar"
            textoVacio="No hay bandas con ese nombre."
            deshabilitado={ocupado}
            onElegir={agregar}
          />
        </>
      )}

      <Text style={styles.label}>Local</Text>
      <Text style={styles.texto}>{local?.nombre || 'Sin local'}</Text>
      <TextInput
        style={styles.input}
        value={busquedaLocal}
        onChangeText={(t) => {
          setBusquedaLocal(t);
          setLocalElegido(null);
        }}
        placeholder="Buscar local"
        placeholderTextColor={colores.muted}
        autoCorrect={false}
      />
      {locales.map((v) => (
        <TouchableOpacity
          key={v.id}
          style={[styles.opcion, localElegido?.id === v.id && styles.opcionElegida]}
          onPress={() => setLocalElegido({ id: v.id, nombre: v.name })}
        >
          <Text style={styles.texto}>{[v.name, v.comuna].filter(Boolean).join(' · ')}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.botonPrincipal, (ocupado || sinCambioDeLocal) && styles.deshabilitado]}
        disabled={ocupado || sinCambioDeLocal}
        onPress={cambiarLocal}
      >
        <Text style={styles.botonPrincipalTexto}>{local ? 'Cambiar local' : 'Poner local'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  tarjeta: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: c.primary },
  bajada: { fontSize: fontSize.xs, color: c.muted },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary, marginTop: spacing.sm },
  texto: { fontSize: fontSize.sm, color: c.primary },
  vacio: { fontSize: fontSize.sm, color: c.secondary },
  aviso: { fontSize: fontSize.sm, marginTop: spacing.xs },
  avisoOk: { color: c.success },
  avisoError: { color: c.danger },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  datos: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  boton: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  botonTexto: { fontSize: fontSize.xs, fontWeight: '600', color: c.primary },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: c.primary,
    backgroundColor: c.cardBackground,
  },
  opcion: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  opcionElegida: { borderColor: c.accent, backgroundColor: c.accentLight },
  botonPrincipal: {
    backgroundColor: c.accent,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  botonPrincipalTexto: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.sm },
  deshabilitado: { opacity: 0.5 },
});
