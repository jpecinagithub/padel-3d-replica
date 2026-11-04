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

/**
 * Gradas y público (Fase 10): 4 lados, 10 filas escalonadas y un plan
 * de asientos DETERMINISTA (semilla fija) que comparten Court.ts (que
 * coloca las figuras) y los tests (que fijan el conteo). El plan deja
 * pasillos verticales (un asiento libre cada 13) y ~4,5 % de huecos
 * sueltos: una grada llena pero no en rejilla perfecta.
 */
export const STAND = {
  rows: 10,
  /** Distancia del eje al primer peldaño en los laterales (|x|, m). */
  lateralStart: 8.7,
  /** Distancia del eje al primer peldaño en los fondos (|z|, m). */
  backStart: 13.9,
  stepDepth: 0.82,
  stepHeight: 0.46,
  /** Separación entre espectadores de una fila (m). */
  spacing: 0.5,
  /** Semilongitud útil de la grada lateral (eje z, m). */
  lateralHalf: 12.75,
  /** Semiancho útil de la grada de fondo (eje x, m). */
  backHalf: 11.75,
} as const;

export interface CrowdSeat {
  x: number;
  z: number;
  /** Altura del peldaño sobre el que se sienta (m). */
  topY: number;
  /** Rotación Y (rad) para mirar hacia la pista. */
  facing: number;
  /** De pie (última fila y desperdigados): cuerpo estirado. */
  standing: boolean;
  /** Del subconjunto con brazos en alto: anima la reacción al punto. */
  armsUp: boolean;
  /** Fase personal para el balanceo de la celebración (rad). */
  phase: number;
}

/** Aleatorio determinista (mulberry32): mismo plan en cada carga. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCrowdPlan(): CrowdSeat[] {
  const rand = mulberry32(20261104);
  const seats: CrowdSeat[] = [];
  // axis 'x': gradas laterales (x = ±…), la fila corre sobre z.
  // axis 'z': gradas de fondo (z = ±…), la fila corre sobre x.
  const sides: { axis: 'x' | 'z'; sign: 1 | -1 }[] = [
    { axis: 'x', sign: -1 },
    { axis: 'x', sign: 1 },
    { axis: 'z', sign: -1 },
    { axis: 'z', sign: 1 },
  ];
  for (const side of sides) {
    const half = side.axis === 'x' ? STAND.lateralHalf : STAND.backHalf;
    const perRow = Math.floor((2 * half) / STAND.spacing) + 1;
    for (let row = 0; row < STAND.rows; row++) {
      const topY = STAND.stepHeight * (row + 1);
      const dist =
        (side.axis === 'x' ? STAND.lateralStart : STAND.backStart) + row * STAND.stepDepth;
      for (let k = 0; k < perRow; k++) {
        if (k % 13 === 6) continue; // pasillo vertical
        if (rand() < 0.045) continue; // asiento vacío suelto
        const along = -half + k * STAND.spacing + (rand() - 0.5) * 0.09;
        const standing = rand() < 0.12;
        const armsUp = rand() < 0.18;
        const phase = rand() * Math.PI * 2;
        // Mirar a la pista: laterales hacia ∓x, fondos hacia ∓z.
        const facing =
          side.axis === 'x'
            ? Math.atan2(-side.sign, 0)
            : Math.atan2(0, -side.sign);
        seats.push({
          x: side.axis === 'x' ? side.sign * dist : along,
          z: side.axis === 'x' ? along : side.sign * dist,
          topY,
          facing,
          standing,
          armsUp,
          phase,
        });
      }
    }
  }
  return seats;
}

/** Plan de asientos completo y estable entre cargas. */
export const CROWD_PLAN: readonly CrowdSeat[] = buildCrowdPlan();
/** Espectadores instanciados cuando hay público (cifra exacta del plan). */
export const CROWD_TOTAL = CROWD_PLAN.length;
/** Filas de grada (compatibilidad con la API anterior). */
export const CROWD_ROWS = STAND.rows;