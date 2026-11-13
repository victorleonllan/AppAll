import { ReactNode, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import {
  BorradorEspecial,
  CambiosEspecial,
  MULTIPLICADORES,
  TicketEspecial,
  nombreDeEspecial,
  validarBorradorEspecial,
} from '../lib/especiales';
import { useEspeciales } from '../hooks/useEspeciales';
import { formatearMonto, montoDesdePrecio } from '../lib/precio';
import { confirmar } from '../lib/confirm';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';
import { Paleta, spacing, borderRadius, fontSize } from '../theme';

/**
 * Spec 165 — bloque rojo «🎟 Ticket especial», equivalente de
 * `TicketsEspecialesManager.js` de la web (W-254). Mismo molde que
 * `PreventasEvento` y por la misma razón tiene dos modos: la RLS de
 * `event_tickets_especiales` exige poder editar un evento que, al crear, todavía
 * no existe.
 * - `borrador`: los packs viven en el formulario y se insertan después del evento
 *   con `crearEspecialesDeBorrador`.
 * - `enVivo`: lee y escribe la tabla con `useEspeciales`; `onCambio` avisa la lista
 *   cada vez que cambia (Editar la usa para saber si queda algún pack activo).
 *
 * `moneda` es solo para mostrar cuánto se cobra por pack: el `monto` guardado no
 * depende de ella. Los errores van en un `Text` rojo: `Alert.alert` no hace nada en
 * el build web (`src/lib/confirm.ts`).
 *
 * El color es el token `especial`, no `danger`: mismo rojo, pero significa
 * «promoción», no «algo falló» (spec 165, Decisión 1).
 */
type Props =
  | { modo: 'borrador'; value: BorradorEspecial[]; onChange: (v: BorradorEspecial[]) => void; moneda?: string | null }
  | { modo: 'enVivo'; eventoId: string; moneda?: string | null; onCambio?: (lista: TicketEspecial[]) => void };

export default function TicketsEspecialesEvento(props: Props) {
  if (props.modo === 'enVivo') {
    return <EspecialesEnVivo eventoId={props.eventoId} moneda={props.moneda} onCambio={props.onCambio} />;
  }
  return <EspecialesBorrador value={props.value} onChange={props.onChange} moneda={props.moneda} />;
}

function Marco({ children }: { children: ReactNode }) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.marco}>
      <Text style={styles.titulo}>🎟 Ticket especial</Text>
      <Text style={styles.ayuda}>
        Packs promocionales: el fan paga 1 y entra con N. Se venden junto a la entrada normal.
      </Text>
      {children}
    </View>
  );
}

function ChipsMultiplicador({
  valor,
  onCambiar,
  deshabilitado,
}: {
  valor: number;
  onCambiar: (m: number) => void;
  deshabilitado?: boolean;
}) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.chips}>
      {MULTIPLICADORES.map((m) => {
        const activo = valor === m;
        return (
          <TouchableOpacity
            key={m}
            style={[styles.chip, activo && styles.chipActivo]}
            onPress={() => onCambiar(m)}
            disabled={deshabilitado}
          >
            <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{nombreDeEspecial(m)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function EspecialesBorrador({
  value,
  onChange,
  moneda,
}: {
  value: BorradorEspecial[];
  onChange: (v: BorradorEspecial[]) => void;
  moneda?: string | null;
}) {
  const styles = useEstilos(crearEstilos);
  return (
    <Marco>
      {value.length === 0 && <Text style={styles.vacio}>Sin ticket especial todavía.</Text>}
      {value.map((b, i) => (
        <View key={i} style={styles.fila}>
          <View style={styles.filaInfo}>
            <Text style={styles.filaNombre}>{b.nombre || nombreDeEspecial(b.multiplicador)}</Text>
            <Text style={styles.filaTexto}>
              {b.precio} · {b.cupo} packs = {b.cupo * b.multiplicador} entradas
            </Text>
          </View>
          <TouchableOpacity onPress={() => onChange(value.filter((_, j) => j !== i))}>
            <Text style={styles.enlace}>Quitar</Text>
          </TouchableOpacity>
        </View>
      ))}
      <FormNuevoEspecial moneda={moneda} onConfirmar={async (b) => onChange([...value, b])} />
    </Marco>
  );
}

function EspecialesEnVivo({
  eventoId,
  moneda,
  onCambio,
}: {
  eventoId: string;
  moneda?: string | null;
  onCambio?: (lista: TicketEspecial[]) => void;
}) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const { especiales, cargando, error, crear, actualizar, cerrar } = useEspeciales(eventoId);
  const [ocupado, setOcupado] = useState(false);

  // En un ref: el padre pasa una función nueva en cada render y no debe volver a
  // disparar el aviso. Mientras carga no se avisa: la lista vacía inicial diría «no
  // hay packs activos» y desbloquearía el interruptor de Editar por un instante.
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;
  useEffect(() => {
    if (!cargando) onCambioRef.current?.(especiales);
  }, [especiales, cargando]);

  // Mientras una escritura está en curso, todo el bloque queda deshabilitado (como la web).
  const correr = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setOcupado(true);
    try {
      return await fn();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Marco>
      {cargando && <ActivityIndicator color={colores.especial} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!cargando && especiales.length === 0 && <Text style={styles.vacio}>Sin ticket especial todavía.</Text>}
      {especiales.map((e) => (
        <FilaEspecialEnVivo
          // La key cambia con la fila guardada: los campos locales vuelven al valor de la base.
          key={`${e.id}-${e.vendidos}-${e.cupo}-${e.precio}-${e.multiplicador}-${e.activa}`}
          especial={e}
          ocupado={ocupado}
          onGuardar={(cambios) => correr(() => actualizar(e.id, cambios))}
          onCerrar={() => correr(() => cerrar(e.id))}
        />
      ))}
      <FormNuevoEspecial
        moneda={moneda}
        deshabilitado={ocupado}
        onConfirmar={async (b) => { await correr(() => crear(b)); }}
      />
    </Marco>
  );
}

/**
 * Una fila en edición. El multiplicador solo se cambia mientras no se vendió ningún
 * pack: cambiarlo después cambiaría cuántas entradas vale una compra ya hecha
 * (`tickets.cantidad` guarda entradas, W-252 §2).
 */
function FilaEspecialEnVivo({
  especial,
  ocupado,
  onGuardar,
  onCerrar,
}: {
  especial: TicketEspecial;
  ocupado: boolean;
  onGuardar: (cambios: CambiosEspecial) => Promise<unknown>;
  onCerrar: () => Promise<unknown>;
}) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [precio, setPrecio] = useState(especial.precio);
  const [cupo, setCupo] = useState(String(especial.cupo));
  const [error, setError] = useState<string | null>(null);

  const multiplicadorEditable = especial.activa && especial.vendidos === 0;
  const bloqueada = !especial.activa || ocupado;

  const guardar = async (cambios: CambiosEspecial, revertir: () => void) => {
    setError(null);
    try {
      await onGuardar(cambios);
    } catch (err: any) {
      revertir();
      setError(err?.message ?? 'No se pudo actualizar el ticket especial');
    }
  };

  const handleFinPrecio = () => {
    if (precio === especial.precio) return;
    if (montoDesdePrecio(precio) <= 0) {
      setPrecio(especial.precio);
      setError('El precio del pack necesita un número');
      return;
    }
    guardar({ precio }, () => setPrecio(especial.precio));
  };

  const handleFinCupo = () => {
    const valor = cupo.trim() ? parseInt(cupo, 10) : null;
    if (!valor || valor <= 0 || valor < especial.vendidos) {
      setCupo(String(especial.cupo));
      setError(
        valor && valor < especial.vendidos
          ? `El cupo no puede bajar de ${especial.vendidos}: ya se vendieron`
          : 'El cupo no puede quedar vacío'
      );
      return;
    }
    if (valor !== especial.cupo) guardar({ cupo: valor }, () => setCupo(String(especial.cupo)));
  };

  const handleCerrar = () => {
    confirmar(
      {
        title: `¿Cerrar "${especial.nombre}"?`,
        message: 'Deja de venderse aunque le queden packs — no se puede reabrir desde acá.',
        confirmText: 'Cerrar',
        destructive: true,
      },
      async () => {
        setError(null);
        try {
          await onCerrar();
        } catch (err: any) {
          setError(err?.message ?? 'No se pudo cerrar');
        }
      }
    );
  };

  return (
    <View style={styles.filaEnVivo}>
      <Text style={styles.filaNombre}>
        {especial.nombre}
        {!especial.activa ? <Text style={styles.cerrado}> (cerrado)</Text> : null}
      </Text>
      {multiplicadorEditable ? (
        <ChipsMultiplicador
          valor={especial.multiplicador}
          deshabilitado={ocupado}
          onCambiar={(m) => {
            if (m !== especial.multiplicador) guardar({ multiplicador: m }, () => {});
          }}
        />
      ) : (
        <Text style={styles.filaTexto}>{nombreDeEspecial(especial.multiplicador)}</Text>
      )}
      <View style={styles.filaCampos}>
        <TextInput
          style={[styles.input, styles.campo, bloqueada && styles.inputBloqueado]}
          value={precio}
          onChangeText={setPrecio}
          onEndEditing={handleFinPrecio}
          editable={!bloqueada}
          placeholder="Precio del pack"
          placeholderTextColor={colores.muted}
        />
        <Text style={styles.vendidos}>{especial.vendidos} vend. /</Text>
        <TextInput
          style={[styles.input, styles.campoCupo, bloqueada && styles.inputBloqueado]}
          value={cupo}
          onChangeText={setCupo}
          onEndEditing={handleFinCupo}
          editable={!bloqueada}
          placeholder="Cupo"
          placeholderTextColor={colores.muted}
          keyboardType="number-pad"
        />
      </View>
      {especial.activa && (
        <TouchableOpacity onPress={handleCerrar} disabled={ocupado}>
          <Text style={styles.enlace}>Cerrar</Text>
        </TouchableOpacity>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function FormNuevoEspecial({
  onConfirmar,
  moneda,
  deshabilitado,
}: {
  onConfirmar: (b: BorradorEspecial) => Promise<void>;
  moneda?: string | null;
  deshabilitado?: boolean;
}) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [multiplicador, setMultiplicador] = useState(2);
  const [precio, setPrecio] = useState('');
  const [unidades, setUnidades] = useState('');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cupo = unidades.trim() ? parseInt(unidades, 10) : null;
  const cupoValido = cupo !== null && Number.isInteger(cupo) && cupo > 0;
  const monto = montoDesdePrecio(precio);
  const bloqueado = deshabilitado || guardando;

  // W-240 — sin apretar «Confirmar», el pack no existe.
  const handleConfirmar = async () => {
    setError(null);
    const problema = validarBorradorEspecial({ precio, cupo });
    if (problema) {
      setError(problema);
      return;
    }
    setGuardando(true);
    try {
      await onConfirmar({ multiplicador, precio: precio.trim(), cupo: cupo as number, nombre: nombre.trim() });
      setMultiplicador(2);
      setPrecio('');
      setUnidades('');
      setNombre('');
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo agregar el ticket especial');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={styles.nuevo}>
      <ChipsMultiplicador valor={multiplicador} onCambiar={setMultiplicador} deshabilitado={bloqueado} />
      <View style={styles.filaCampos}>
        <TextInput
          style={[styles.input, styles.campo]}
          value={precio}
          onChangeText={setPrecio}
          editable={!bloqueado}
          placeholder="Precio del pack, p. ej. $10.000"
          placeholderTextColor={colores.muted}
        />
        <TextInput
          style={[styles.input, styles.campoUnidades]}
          value={unidades}
          onChangeText={setUnidades}
          editable={!bloqueado}
          placeholder="Unidades *"
          placeholderTextColor={colores.muted}
          keyboardType="number-pad"
        />
      </View>
      {cupoValido && (
        <Text style={styles.ayuda}>
          = {(cupo as number) * multiplicador} entradas ({cupo} {cupo === 1 ? 'pack' : 'packs'} de {multiplicador})
        </Text>
      )}
      {moneda && monto > 0 ? (
        <Text style={styles.ayuda}>
          Cada pack se cobrará {formatearMonto(monto, moneda)} (incluye 10% de recargo de la plataforma)
        </Text>
      ) : null}
      <TextInput
        style={[styles.input, styles.campoNombre]}
        value={nombre}
        onChangeText={setNombre}
        editable={!bloqueado}
        placeholder={`Nombre (opcional) — ${nombreDeEspecial(multiplicador)}`}
        placeholderTextColor={colores.muted}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.boton, bloqueado && styles.botonDesactivado]}
        onPress={handleConfirmar}
        disabled={bloqueado}
      >
        {guardando ? (
          <ActivityIndicator color={colores.especialContenido} />
        ) : (
          <Text style={styles.textoBoton}>✓ Confirmar ticket especial</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const crearEstilos = (c: Paleta) =>
  StyleSheet.create({
    marco: {
      borderWidth: 2,
      borderColor: c.especial,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      marginTop: spacing.sm,
    },
    titulo: { fontSize: fontSize.sm, fontWeight: '600', color: c.especial },
    ayuda: { fontSize: fontSize.xs, color: c.muted, marginTop: spacing.xs },
    vacio: { fontSize: fontSize.sm, color: c.muted, marginTop: spacing.sm },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      marginTop: spacing.xs,
    },
    filaInfo: { flexShrink: 1 },
    filaEnVivo: {
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      marginTop: spacing.xs,
    },
    filaNombre: { fontSize: fontSize.sm, fontWeight: '600', color: c.especial },
    cerrado: { fontWeight: 'normal', color: c.muted },
    filaTexto: { fontSize: fontSize.sm, color: c.primary, flexShrink: 1 },
    filaCampos: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    campo: { flex: 1 },
    campoCupo: { width: 72 },
    campoUnidades: { width: 110 },
    campoNombre: { marginTop: spacing.xs },
    vendidos: { fontSize: fontSize.xs, color: c.muted },
    nuevo: { marginTop: spacing.sm },
    input: {
      backgroundColor: c.cardBackground,
      padding: 12,
      borderRadius: borderRadius.sm,
      fontSize: fontSize.md,
      color: c.primary,
      borderWidth: 1,
      borderColor: c.border,
    },
    inputBloqueado: { opacity: 0.6 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
    chip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Mismo chip que el formulario (spec 165, Decisión 3).
    chipActivo: { backgroundColor: c.accent, borderColor: c.accent },
    chipTexto: { fontSize: fontSize.sm, color: c.primary },
    chipTextoActivo: { color: c.onAccent, fontWeight: '600' },
    enlace: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600', marginTop: spacing.xs },
    error: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.xs },
    boton: {
      backgroundColor: c.especial,
      padding: 12,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    botonDesactivado: { opacity: 0.6 },
    textoBoton: { color: c.especialContenido, fontWeight: 'bold', fontSize: fontSize.sm },
  });
