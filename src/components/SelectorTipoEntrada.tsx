import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Evento, PrecioVigente } from '../types';
import { EspecialVigente, etiquetaDeEspecial } from '../lib/especiales';
import { formatearMonto } from '../lib/precio';
import { borderRadius, spacing, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import PrecioEvento from './PrecioEvento';

/** Valor de `opcion` para la entrada de siempre; un pack se elige por su id. */
export const GENERAL = 'general';

interface Props {
  evento: Evento;
  vigente: PrecioVigente | null;
  especiales: EspecialVigente[];
  opcion: string; // GENERAL o el id de un pack
  onElegir: (opcion: string) => void;
  generalAgotada: boolean;
}

/**
 * Spec 166 — selector de `BotonComprar.js` de la web (W-255): «Entrada general» y una
 * tarjeta roja por pack. Solo dibuja; la opción elegida vive en DetalleEventoScreen
 * porque la usan la compra y la auto-compra.
 */
export default function SelectorTipoEntrada({
  evento, vigente, especiales, opcion, onElegir, generalAgotada,
}: Props) {
  const styles = useEstilos(crearEstilos);
  const generalElegida = opcion === GENERAL;

  return (
    <View accessibilityRole="radiogroup" style={styles.lista}>
      <TouchableOpacity
        accessibilityRole="radio"
        accessibilityState={{ checked: generalElegida, disabled: generalAgotada }}
        disabled={generalAgotada}
        onPress={() => onElegir(GENERAL)}
        style={[styles.opcion, styles.opcionGeneral, generalElegida && styles.opcionGeneralElegida]}
      >
        <View style={[styles.circulo, generalElegida && styles.circuloElegido]} />
        <View style={styles.contenido}>
          <Text style={styles.titulo}>Entrada general</Text>
          {generalAgotada ? (
            <Text style={styles.agotada}>Agotada</Text>
          ) : (
            <PrecioEvento evento={evento} vigente={vigente} alinear="inicio" />
          )}
        </View>
      </TouchableOpacity>

      {especiales.map((e) => {
        const elegida = opcion === e.id;
        return (
          <TouchableOpacity
            key={e.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: elegida, disabled: false }}
            onPress={() => onElegir(e.id)}
            style={[styles.opcion, styles.opcionPack, elegida && styles.opcionPackElegida]}
          >
            <View style={[styles.circulo, styles.circuloPack, elegida && styles.circuloPackElegido]} />
            <View style={styles.contenido}>
              <View style={styles.pildora}>
                <Text style={styles.pildoraTexto}>
                  {etiquetaDeEspecial(e)} · {formatearMonto(e.monto, e.moneda ?? evento.moneda)}
                </Text>
              </View>
              <Text style={styles.detalle}>{e.multiplicador} entradas por el precio de 1</Text>
              <Text style={styles.detalle}>quedan {e.restantes}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  lista: { gap: spacing.sm, marginTop: spacing.xs },
  opcion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 4,
  },
  opcionGeneral: { borderColor: c.border },
  opcionGeneralElegida: { borderColor: c.primary },
  opcionPack: { borderColor: c.especial, backgroundColor: c.especialSuave },
  // 2 px elegida; se resta 1 al padding para que el contenido no salte al elegir.
  opcionPackElegida: { borderWidth: 2, padding: spacing.sm + 3 },
  circulo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: c.muted,
    marginTop: 2,
  },
  circuloElegido: { borderColor: c.primary, backgroundColor: c.primary },
  circuloPack: { borderColor: c.especial },
  circuloPackElegido: { backgroundColor: c.especial },
  contenido: { flex: 1, gap: 2 },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  agotada: { fontSize: fontSize.sm, color: c.muted, marginTop: 4 },
  pildora: {
    alignSelf: 'flex-start',
    backgroundColor: c.especial,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: 2,
  },
  pildoraTexto: { color: c.especialContenido, fontWeight: 'bold', fontSize: fontSize.sm },
  detalle: { fontSize: fontSize.sm, color: c.muted },
});
