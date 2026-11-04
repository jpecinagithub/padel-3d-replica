// Constantes reglamentarias de la pista (REPLICA_SPEC §5.2 y §5.6).
// Módulo puro, sin dependencias de Three: lo usan Court.ts y los tests.

export const COURT = {
  /** Semiancho: pista de 10 m de ancho (x ∈ [-5, 5]). */
  halfWidth: 5,
  /** Semilargo: pista de 20 m de largo (z ∈ [-10, 10]). */
  halfLength: 10,
  /** Altura de la red en el centro. */
  netHeight: 0.88,
  /** Altura total de los cerramientos (cristal + malla). */
  wallHeight: 4,
  /** Altura de la zona de cristal. */
  glassHeight: 3,
  /** Distancia de cada línea de saque a la red. */
  serviceLineZ: 6.95,
  /** Longitud del cristal lateral desde cada fondo (el resto lateral es malla). */
  sideGlassLength: 4,
  /** Grosor orientativo de las líneas del suelo. */
  lineWidth: 0.06,
} as const;

/** Nº fijo de espectadores instanciados cuando hay público (ver Court.ts). */
export const CROWD_ROWS = 3;
export const CROWD_PER_ROW = 34;
export const CROWD_STANDS = 3;
export const CROWD_TOTAL = CROWD_ROWS * CROWD_PER_ROW * CROWD_STANDS;
