import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '../context/TemaContext';

/**
 * Spec 174 — botón de tema del header. Hermano de la variante `icono` de W-272
 * (`components/BotonTema.js` en la web). Va en el `headerRight` de los cinco stacks
 * (Decisión 1): el header solo lleva el título, así que no hay el problema de ancho que
 * en la web lo mandó al menú hamburguesa, y aparece con o sin sesión.
 *
 * El icono muestra el tema al que se va: luna en claro, sol en oscuro.
 */
export default function BotonTema() {
  const { tema, alternar, colores } = useTema();
  const oscuro = tema === 'dark';

  return (
    <TouchableOpacity
      onPress={alternar}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={oscuro ? 'Modo claro' : 'Modo oscuro'}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* `white` sobre el header `block`, oscuro en los dos temas. */}
      <Ionicons name={oscuro ? 'sunny-outline' : 'moon-outline'} size={22} color={colores.white} />
    </TouchableOpacity>
  );
}
