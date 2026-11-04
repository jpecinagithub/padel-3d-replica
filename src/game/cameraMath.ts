// Matemáticas puras de cámara (REPLICA_SPEC §5.7): tipos, poses, zoom y
// órbita. Sin dependencias de Three ni del DOM, para poder testearlo en
// node; Cameras.ts (el rig) consume estas funciones.

export type CameraKind = 'tv' | 'player' | 'free';

export const CAMERA_ORDER: CameraKind[] = ['tv', 'player', 'free'];

export const CAMERA_NAMES: Record<CameraKind, string> = {
  tv: 'TV',
  player: 'Jugador',
  free: 'Libre',
};

/** Siguiente cámara del ciclo de la tecla C: TV → Jugador → Libre → TV. */
export function nextCameraKind(kind: CameraKind): CameraKind {
  const index = CAMERA_ORDER.indexOf(kind);
  return CAMERA_ORDER[(index + 1) % CAMERA_ORDER.length] as CameraKind;
}

/**
 * Mapeo del ajuste `camera` de settings (Fase 1, modes.ts CAMERAS):
 * 0 = TV, 1 = Jugador, 2 = Libre. Cualquier otro valor cae a TV.
 */
export function cameraKindFromSettings(id: number): CameraKind {
  if (id === 1) return 'player';
  if (id === 2) return 'free';
  return 'tv';
}

/** Rango de zoom de usuario de la SPEC §5.7. */
export const ZOOM_MIN = 0.45;
export const ZOOM_MAX = 2.6;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export type Vec3Tuple = [number, number, number];

export interface CameraPose {
  position: Vec3Tuple;
  lookAt: Vec3Tuple;
}

/** Desplazamiento base de cada cámara respecto a su punto de mira (zoom = 1). */
const BASE_OFFSETS: Record<CameraKind, Vec3Tuple> = {
  // Elevada tras un fondo: encuadra la pista completa (20 m) en vertical.
  tv: [0, 9.5, 15.5],
  // Baja, tras la posición de resto del jugador local (fondo z = -10).
  player: [0, 1.6, -13.8],
  // La libre arranca desde la pose de TV y pasa a control orbital.
  free: [0, 9.5, 15.5],
};

const LOOK_ATS: Record<CameraKind, Vec3Tuple> = {
  tv: [0, 0.5, 0],
  player: [0, 1.0, 0],
  free: [0, 0.5, 0],
};

/**
 * Pose de una cámara para un zoom dado. El zoom es un factor de
 * acercamiento: la distancia al punto de mira es la base dividida por él
 * (zoom 2,6 = muy cerca; zoom 0,45 = muy lejos), siempre dentro del rango.
 */
export function cameraPose(kind: CameraKind, zoom = 1): CameraPose {
  const z = clampZoom(zoom);
  const [ox, oy, oz] = BASE_OFFSETS[kind];
  const lookAt = LOOK_ATS[kind];
  return {
    position: [lookAt[0] + ox / z, lookAt[1] + oy / z, lookAt[2] + oz / z],
    lookAt: [...lookAt] as Vec3Tuple,
  };
}

/** Límites del ángulo polar orbital (radianes desde el eje +Y). */
export const POLAR_MIN = 0.12;
export const POLAR_MAX = 1.48;

export function clampPolar(polar: number): number {
  if (!Number.isFinite(polar)) return 0.95;
  return Math.min(POLAR_MAX, Math.max(POLAR_MIN, polar));
}

/**
 * Posición sobre la esfera orbital de centro `target`, con azimut y ángulo
 * polar dados y radio `distance`. Convención: azimut 0 mira desde +Z.
 */
export function orbitPosition(target: Vec3Tuple, azimuth: number, polar: number, distance: number): Vec3Tuple {
  const p = clampPolar(polar);
  const sinP = Math.sin(p);
  return [
    target[0] + distance * sinP * Math.sin(azimuth),
    target[1] + distance * Math.cos(p),
    target[2] + distance * sinP * Math.cos(azimuth),
  ];
}

/** Distancia orbital base de la cámara libre (antes de aplicar el zoom). */
export const FREE_BASE_DISTANCE = 18.4;
