import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

// react-native-web implementa Alert.alert como no-op (`static alert() {}`):
// en web no muestra nada y nunca dispara el onPress de los botones. Un
// Alert.alert de confirmación (Cancelar/Confirmar) queda muerto ahí —
// el usuario aprieta y no pasa nada. window.confirm es el único diálogo
// bloqueante real disponible en web; en nativo se usa Alert.alert normal.
export function confirmar(options: ConfirmOptions, onConfirm: () => void) {
  const { title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', destructive } = options;

  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
