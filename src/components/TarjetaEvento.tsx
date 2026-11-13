import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Evento } from '../types';
import PrecioEvento from './PrecioEvento';
import { spacing, borderRadius, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';

interface Props {
  evento: Evento;
  onPress?: () => void;
  onComprar?: () => void;
}

export default function TarjetaEvento({ evento, onPress, onComprar }: Props) {
  const styles = useEstilos(crearEstilos);
  const contenido = (
    <View style={styles.tarjeta}>
      <View style={{ flex: 1 }}>
        <Text style={styles.artista}>{evento.artista}</Text>
        <Text style={styles.genero}>{evento.genero}</Text>
        <Text style={styles.detalle}>
          📍 {evento.venueName} · {evento.fecha} · {evento.hora}
        </Text>
        {/* Spec 119 — precio en la moneda del evento. Sin consulta de preventa:
            esta tarjeta la usan DashboardLocal y PerfilMusico, donde N llamadas
            al RPC no aportan. */}
        <PrecioEvento evento={evento} vigente={null} />
      </View>
      {onComprar && (
        <TouchableOpacity style={styles.boton} onPress={onComprar}>
          <Text style={styles.textoBoton}>🎫 Comprar</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {contenido}
    </TouchableOpacity>
  ) : (
    contenido
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  tarjeta: {
    backgroundColor: c.cardBackground,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: c.accent,
    flexDirection: 'row',
    alignItems: 'center',
  },
  artista: { fontSize: 16, fontWeight: '600', color: c.primary },
  genero: { fontSize: 13, color: c.secondary, marginTop: 2 },
  detalle: { fontSize: 12, color: c.muted, marginTop: 4 },
  boton: { backgroundColor: c.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.sm, marginLeft: 12 },
  textoBoton: { color: c.onAccent, fontWeight: 'bold', fontSize: 13 },
});
