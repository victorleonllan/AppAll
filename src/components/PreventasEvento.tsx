import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { BorradorPreventa, CierreTipo, Preventa } from '../types';
import { CIERRE_RECOMENDADO, usePreventas } from '../hooks/usePreventas';
import { armarFechaHora, fechaHoraValidas, formatearFechaEs, separarFechaHora } from '../lib/fecha';
import { confirmar } from '../lib/confirm';
import { colors, spacing, borderRadius, fontSize } from '../theme';

/**
 * Spec 136 — equivalente de `PreventasManager.js` de la web. Dos modos:
 * `borrador` (crear evento: las preventas viven en el formulario y se insertan
 * después del evento con `crearPreventasDeBorrador`) y `enVivo` (editar: lee y
 * escribe `event_preventas` con `usePreventas`).
 */
type PreventasEventoProps =
  | { modo: 'borrador'; value: BorradorPreventa[]; onChange: (v: BorradorPreventa[]) => void }
  | { modo: 'enVivo'; eventoId: string };

const ERROR_SIN_CUPO = 'Falta el cupo de la preventa — toda preventa necesita un límite';

function fechaCorta(iso: string): string {
  const { fechaISO, horaISO } = separarFechaHora(iso);
  return fechaISO ? `${formatearFechaEs(fechaISO)} ${horaISO}` : '';
}

export default function PreventasEvento(props: PreventasEventoProps) {
  if (props.modo === 'enVivo') return <PreventasEnVivo eventoId={props.eventoId} />;
  return <PreventasBorrador value={props.value} onChange={props.onChange} />;
}

function PreventasBorrador({ value, onChange }: { value: BorradorPreventa[]; onChange: (v: BorradorPreventa[]) => void }) {
  return (
    <View>
      {value.map((b, i) => (
        <View key={i} style={styles.fila}>
          <Text style={styles.filaTexto}>Preventa {i + 1} · {b.precio} · cupo {b.cupo}</Text>
          <TouchableOpacity onPress={() => onChange(value.filter((_, j) => j !== i))}>
            <Text style={styles.enlace}>Quitar</Text>
          </TouchableOpacity>
        </View>
      ))}
      <FormNuevaPreventa onConfirmar={async (b) => onChange([...value, b])} />
    </View>
  );
}

function PreventasEnVivo({ eventoId }: { eventoId: string }) {
  const { preventas, cargando, error, crear, actualizar, cerrar } = usePreventas(eventoId);

  return (
    <View>
      {cargando && <ActivityIndicator color={colors.accent} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {preventas.map((p) => (
        <FilaPreventaEnVivo
          key={p.id}
          preventa={p}
          onGuardar={(cambios) => actualizar(p.id, cambios)}
          onCerrar={() => cerrar(p.id)}
        />
      ))}
      <FormNuevaPreventa onConfirmar={async (b) => { await crear(b); }} />
    </View>
  );
}

function FilaPreventaEnVivo({
  preventa,
  onGuardar,
  onCerrar,
}: {
  preventa: Preventa;
  onGuardar: (cambios: { precio?: string; cupo?: number }) => Promise<unknown>;
  onCerrar: () => Promise<unknown>;
}) {
  const [precio, setPrecio] = useState(preventa.precio);
  const [cupo, setCupo] = useState(String(preventa.cupo));
  const [error, setError] = useState<string | null>(null);

  const guardar = async (cambios: { precio?: string; cupo?: number }) => {
    setError(null);
    try {
      await onGuardar(cambios);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar la preventa');
    }
  };

  const handleFinPrecio = () => {
    if (precio !== preventa.precio) guardar({ precio });
  };

  const handleFinCupo = () => {
    const n = Number(cupo);
    if (n === preventa.cupo) return;
    if (!cupo.trim() || !(n > 0)) {
      setError(ERROR_SIN_CUPO);
      return;
    }
    guardar({ cupo: n });
  };

  const handleCerrar = () => {
    confirmar(
      {
        title: `¿Cerrar "${preventa.nombre}"?`,
        message: 'Deja de venderse aunque le quede cupo — no se puede reabrir desde acá.',
        confirmText: 'Cerrar',
        destructive: true,
      },
      async () => {
        setError(null);
        try {
          await onCerrar();
        } catch (err: any) {
          setError(err?.message ?? 'No se pudo cerrar la preventa');
        }
      }
    );
  };

  return (
    <View style={styles.filaEnVivo}>
      <Text style={styles.filaTexto}>
        {preventa.nombre} · {preventa.precio} · cupo {preventa.cupo} · vendidas {preventa.vendidos}
        {preventa.cierraAt ? ` · cierra ${fechaCorta(preventa.cierraAt)}` : ''}
        {!preventa.activa ? ' (cerrada)' : ''}
      </Text>
      {preventa.activa && (
        <>
          <View style={styles.filaCampos}>
            <TextInput
              style={[styles.input, styles.campo]}
              value={precio}
              onChangeText={setPrecio}
              onEndEditing={handleFinPrecio}
              placeholder="Precio"
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={[styles.input, styles.campo]}
              value={cupo}
              onChangeText={setCupo}
              onEndEditing={handleFinCupo}
              placeholder="Cupo"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
            />
          </View>
          <TouchableOpacity onPress={handleCerrar}>
            <Text style={styles.enlace}>Cerrar</Text>
          </TouchableOpacity>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function FormNuevaPreventa({ onConfirmar }: { onConfirmar: (b: BorradorPreventa) => Promise<void> }) {
  const recomendadas = String(CIERRE_RECOMENDADO.cierreHorasAntes);
  const [precio, setPrecio] = useState('');
  const [cupo, setCupo] = useState('');
  const [cierreTipo, setCierreTipo] = useState<CierreTipo>(CIERRE_RECOMENDADO.cierreTipo);
  const [horas, setHoras] = useState(recomendadas);
  const [fechaCierre, setFechaCierre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmar = async () => {
    setError(null);
    if (!precio.trim()) {
      setError('Falta el precio de la preventa');
      return;
    }
    const nCupo = Number(cupo);
    if (!cupo.trim() || !(nCupo > 0)) {
      setError(ERROR_SIN_CUPO);
      return;
    }
    let cierreHorasAntes: number | null = null;
    let cierreAt: string | null = null;
    if (cierreTipo === 'horas_antes') {
      const n = Number(horas);
      if (!horas.trim() || !Number.isInteger(n) || n < 0) {
        setError('Las horas antes del show van como un número entero');
        return;
      }
      cierreHorasAntes = n;
    } else {
      const [f = '', h = ''] = fechaCierre.trim().split(/\s+/);
      if (!fechaHoraValidas(f, h)) {
        setError('La fecha de cierre va como AAAA-MM-DD HH:MM');
        return;
      }
      cierreAt = armarFechaHora(f, h).comienzaAt;
    }
    setGuardando(true);
    try {
      await onConfirmar({ precio: precio.trim(), cupo: nCupo, cierreTipo, cierreHorasAntes, cierreAt });
      setPrecio('');
      setCupo('');
      setCierreTipo(CIERRE_RECOMENDADO.cierreTipo);
      setHoras(recomendadas);
      setFechaCierre('');
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar la preventa');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={styles.nueva}>
      <View style={styles.filaCampos}>
        <TextInput
          style={[styles.input, styles.campo]}
          value={precio}
          onChangeText={setPrecio}
          placeholder="Precio (ej: $4.000)"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={[styles.input, styles.campo]}
          value={cupo}
          onChangeText={setCupo}
          placeholder="Cupo *"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
        />
      </View>

      <Text style={styles.sublabel}>Cierre</Text>
      <View style={styles.chips}>
        {([
          ['horas_antes', 'Horas antes del show'],
          ['fecha', 'Fecha exacta'],
        ] as [CierreTipo, string][]).map(([tipo, etiqueta]) => {
          const activo = cierreTipo === tipo;
          return (
            <TouchableOpacity
              key={tipo}
              style={[styles.chip, activo && styles.chipActivo]}
              onPress={() => setCierreTipo(tipo)}
            >
              <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{etiqueta}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {cierreTipo === 'horas_antes' ? (
        <View style={styles.filaHoras}>
          <TextInput
            style={[styles.input, styles.campoHoras]}
            value={horas}
            onChangeText={setHoras}
            keyboardType="number-pad"
          />
          {horas === recomendadas ? (
            <Text style={styles.recomendado}>Recomendado</Text>
          ) : (
            <TouchableOpacity onPress={() => setHoras(recomendadas)}>
              <Text style={styles.enlace}>Volver al recomendado</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <TextInput
          style={styles.input}
          value={fechaCierre}
          onChangeText={setFechaCierre}
          placeholder="2026-11-28 18:00"
          placeholderTextColor={colors.muted}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* W-240 — el botón dice «Confirmar» con fondo de acento porque una
          persona real dejó preventas escritas sin confirmar y no se guardaron. */}
      <TouchableOpacity
        style={[styles.boton, guardando && styles.botonDesactivado]}
        onPress={handleConfirmar}
        disabled={guardando}
      >
        {guardando ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.textoBoton}>✓ Confirmar preventa</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filaEnVivo: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filaTexto: { fontSize: fontSize.sm, color: colors.primary, flexShrink: 1 },
  filaCampos: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  campo: { flex: 1 },
  nueva: { marginTop: spacing.sm },
  sublabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
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
  filaHoras: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  campoHoras: { width: 72 },
  recomendado: { fontSize: fontSize.sm, color: colors.success, fontWeight: '600' },
  enlace: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600', marginTop: spacing.xs },
  error: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.xs },
  boton: {
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  botonDesactivado: { opacity: 0.6 },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.sm },
});
