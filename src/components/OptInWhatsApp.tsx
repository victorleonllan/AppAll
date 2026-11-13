import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { useOptInWhatsApp } from '../hooks/useOptInWhatsApp';
import type { TipoTenant } from '../hooks/useTenantCrm';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

interface ValorOptIn {
  acepta: boolean;
  telefono: string;
}

interface Props {
  tenantTipo: TipoTenant;
  tenantId: string;
  telefonoInicial?: string;
  etiqueta?: string;
  /** Modo controlado (compra): sin botón ni llamada propia. */
  valor?: ValorOptIn;
  onCambiar?: (v: ValorOptIn) => void;
}

const ETIQUETA_DEFAULT = 'Avísame por WhatsApp de sus próximos eventos';

// Spec 156 — hermano de components/OptInWhatsApp.js de la web (W-053, W-104). Un solo
// componente con dos modos: dos que dibujan lo mismo terminan con el texto divergiendo.
export default function OptInWhatsApp({
  tenantTipo, tenantId, telefonoInicial, etiqueta = ETIQUETA_DEFAULT, valor, onCambiar,
}: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const controlado = !!onCambiar;
  const { guardando, guardar } = useOptInWhatsApp();

  // Apagado por defecto: encendido sería un opt-out disfrazado y Meta lo trata como spam.
  const [aceptaLocal, setAceptaLocal] = useState(false);
  const [telefonoLocal, setTelefonoLocal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  // `telefonoInicial` llega async: se adopta solo si la persona no escribió nada todavía.
  const escribio = useRef(false);

  useEffect(() => {
    if (controlado || !telefonoInicial || escribio.current) return;
    setTelefonoLocal((actual) => (actual ? actual : telefonoInicial));
  }, [controlado, telefonoInicial]);

  const acepta = controlado ? !!valor?.acepta : aceptaLocal;
  const telefono = controlado ? valor?.telefono ?? '' : telefonoLocal;

  const cambiarAcepta = (v: boolean) => {
    setError(null);
    if (controlado) onCambiar!({ acepta: v, telefono });
    else setAceptaLocal(v);
  };

  const cambiarTelefono = (t: string) => {
    setError(null);
    if (controlado) onCambiar!({ acepta, telefono: t });
    else {
      escribio.current = true;
      setTelefonoLocal(t);
    }
  };

  const confirmar = async () => {
    if (!acepta) {
      setError('Activa el aviso para recibir los WhatsApp.');
      return;
    }
    const r = await guardar({ tenantTipo, tenantId, telefono });
    if (r.ok) setListo(true);
    else setError(r.mensaje);
  };

  if (listo) {
    return (
      <Text style={styles.listo}>✓ Listo — te vamos a avisar por WhatsApp de sus próximos eventos.</Text>
    );
  }

  return (
    <View style={styles.bloque}>
      <View style={styles.fila}>
        <Switch
          value={acepta}
          onValueChange={cambiarAcepta}
          trackColor={{ true: colores.accent, false: colores.border }}
        />
        <Text style={styles.etiqueta}>{etiqueta}</Text>
      </View>

      {/* En la compra el teléfono solo aparece encendido: un campo de más es un
          motivo más para no comprar. */}
      {(!controlado || acepta) && (
        <TextInput
          style={styles.input}
          value={telefono}
          onChangeText={cambiarTelefono}
          keyboardType="phone-pad"
          placeholder="+56 9 1234 5678"
          placeholderTextColor={colores.muted}
        />
      )}

      {!controlado && (
        <TouchableOpacity
          style={[styles.boton, guardando && styles.botonDeshabilitado]}
          onPress={confirmar}
          disabled={guardando}
        >
          <Text style={styles.textoBoton}>{guardando ? 'Guardando…' : 'Confirmar'}</Text>
        </TouchableOpacity>
      )}

      {/* Nada de Alert.alert (spec 137): en web no se ve. */}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  bloque: { marginTop: spacing.md, gap: spacing.sm },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  etiqueta: { flex: 1, fontSize: fontSize.sm, color: c.primary },
  input: {
    backgroundColor: c.accentLight,
    borderRadius: borderRadius.sm,
    padding: 12,
    fontSize: fontSize.md,
    color: c.primary,
    borderWidth: 1,
    borderColor: c.border,
  },
  boton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  botonDeshabilitado: { opacity: 0.5 },
  textoBoton: { color: c.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  error: { fontSize: fontSize.sm, color: c.danger },
  listo: { marginTop: spacing.md, fontSize: fontSize.sm, color: c.success },
});
