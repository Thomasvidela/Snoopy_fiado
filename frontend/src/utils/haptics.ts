/**
 * Utilidades de vibración háptica (navigator.vibrate) para dar sensación
 * de aplicación nativa en dispositivos móviles (Android / navegadores compatibles).
 */

export const hapticTap = (durationMs = 25) => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Navegador sin permiso o no soportado
    }
  }
};

export const hapticSuccess = () => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      // Doble pulsación suave para confirmar acción exitosa
      navigator.vibrate([30, 40, 30]);
    } catch {}
  }
};

export const hapticError = () => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      // Pulsación más larga de advertencia o error
      navigator.vibrate([60, 50, 60]);
    } catch {}
  }
};
