/**
 * Spec 095 — dónde se puede **crear** un local o un evento: cualquier país ISO,
 * no solo los que tienen cartelera (ese otro catálogo, `PAISES`, llega con el
 * spec 096).
 *
 * Copia de `sonopolisWeb/libs/paisesISO.js` (W-114), no paquete compartido: los
 * dos repos no comparten build ni `node_modules`, y el dato es un estándar ISO
 * que no cambia por decisión nuestra — ver Decisión 2 del spec 095.
 */

/**
 * Valor inicial del selector (Decisión 3 del spec 095). Chile hardcodeado, pero
 * en un solo lugar y visible en pantalla: quien carga lo corrige en un toque.
 * La mejora natural es `expo-localization` el día que haya otro motivo para
 * rebuildear (es un módulo nativo).
 */
export const PAIS_POR_DEFECTO = 'CL';

/**
 * Solo los códigos ISO 3166-1 alpha-2. Nombre y bandera se derivan (ver abajo):
 * escribir 249 nombres a mano sería una tabla de traducción que envejece.
 */
export const PAISES_ISO: string[] = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW',
  'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT',
  'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS',
  'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
];

// `Intl.DisplayNames` no está garantizado en Hermes (Decisión 2 del spec 095):
// si el constructor no existe, construirlo al cargar el módulo tumbaría la app
// entera. Sin él, `nombrePais` degrada al código ("AR") en vez de romper.
const nombres: { of: (codigo: string) => string | undefined } | null = (() => {
  try {
    const DisplayNames = (Intl as any).DisplayNames;
    return DisplayNames ? new DisplayNames(['es'], { type: 'region' }) : null;
  } catch {
    return null;
  }
})();

/**
 * Nombre en español del código. Devuelve el código tal cual si no es un alpha-2
 * o si el motor no resuelve el nombre — una opción fea es mejor que un selector roto.
 */
export function nombrePais(codigo: string | null | undefined): string {
  if (typeof codigo !== 'string' || !/^[A-Za-z]{2}$/.test(codigo)) return String(codigo ?? '');
  const codigoNormalizado = codigo.toUpperCase();
  if (!nombres) return codigoNormalizado;
  try {
    return nombres.of(codigoNormalizado) ?? codigoNormalizado;
  } catch {
    return codigoNormalizado;
  }
}

/**
 * La bandera es el par de "regional indicator symbols" del código: aritmética
 * de code points, sin asset que versionar ni dependencia del motor de JS.
 */
export function banderaPais(codigo: string | null | undefined): string {
  if (typeof codigo !== 'string' || !/^[A-Za-z]{2}$/.test(codigo)) return '';
  return String.fromCodePoint(
    ...[...codigo.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

/** Lo que se lee en una opción del selector: "🇨🇱 Chile". */
export function etiquetaPais(codigo: string | null | undefined): string {
  const bandera = banderaPais(codigo);
  return bandera ? `${bandera} ${nombrePais(codigo)}` : nombrePais(codigo);
}
