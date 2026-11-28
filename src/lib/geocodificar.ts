import { llamarApiWeb } from './apiWeb';
import { leerRespuestaGeocodificar, ResultadoBusqueda } from './ubicacion';

/**
 * Spec 191 — busca una dirección en el mapa a través de `GET /api/geocodificar` de la
 * web (W-339), que exige sesión. Los errores (`ErrorApiWeb` 401/502, o el `TypeError`
 * de red) se relanzan tal cual: quien llama los pasa por `mensajeErrorBusqueda`.
 *
 * Nominatim pide 1 consulta por segundo: aquí no se reintenta ni se consulta solo.
 */
export async function buscarUbicacion(consulta: {
  direccion: string;
  comuna?: string | null;
  pais?: string | null;
}): Promise<ResultadoBusqueda> {
  const direccion = consulta.direccion.trim();
  if (!direccion) return { encontrado: false };

  // A mano y no con URLSearchParams: la de React Native no trae todos sus métodos.
  let query = `direccion=${encodeURIComponent(direccion)}`;
  const comuna = consulta.comuna?.trim();
  if (comuna) query += `&comuna=${encodeURIComponent(comuna)}`;
  const pais = consulta.pais?.trim();
  if (pais) query += `&pais=${encodeURIComponent(pais)}`;

  return leerRespuestaGeocodificar(await llamarApiWeb<unknown>(`/api/geocodificar?${query}`));
}
