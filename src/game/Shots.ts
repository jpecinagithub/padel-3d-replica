// Golpeo y saque: lógica pura (REPLICA_SPEC §5.3). Sin Three ni DOM.
// El golpeo usa «apuntado automático razonable»: se resuelve la velocidad
// balística exacta hacia un punto objetivo del campo contrario según el
// tipo de golpe, y la calidad del golpe (timing/distancia/nivel) introduce
// el error. El saque se resuelve igual hacia el cuadro diagonal, con la
// aguja oscilante decidiendo potencia y precisión.

import { BALL_PHYSICS, vec3, type Vec3 } from './Ball';
import { COURT } from './courtConstants';
import type { PlayerLevel } from '../state/modes';

/** Alcance de golpeo del jugador (SPEC §5.3), en metros. */
export const REACH_XZ = 1.75;
export const REACH_MAX_Y = 2.45;
export const REACH_MIN_Y = 0.12;
/** Altura a partir de la cual un golpe con potencia es un smash. */
export const SMASH_MIN_Y = 2.0;

export interface ShotInput {
  /** Dirección lateral mantenida: A/D o vector de movimiento (−1..1). */
  moveX: number;
  /** W: potencia/profundidad. */
  power: boolean;
  /** S: dejada. */
  drop: boolean;
  /** Q: cortado. */
  slice: boolean;
  /** E: liftado. */
  lift: boolean;
}

export type ShotKind = 'drive' | 'power-drive' | 'drop' | 'slice' | 'topspin' | 'lob' | 'smash' | 'super-smash';

export const SHOT_NAMES: Record<ShotKind, string> = {
  drive: 'Drive',
  'power-drive': 'Drive potente',
  drop: 'Dejada',
  slice: 'Cortado',
  topspin: 'Liftado',
  lob: 'Globo',
  smash: 'Smash',
  'super-smash': '¡SUPERGOLPE!',
};

/**
 * Clasifica el golpe según la altura de la bola y las teclas mantenidas.
 * Prioridad: smash (bola alta + W) > globo (W+E) > dejada (S) > cortado
 * (Q) > liftado (E) > potente (W) > drive normal.
 */
export function classifyShot(ballY: number, input: ShotInput, superReady: boolean): ShotKind {
  if (ballY >= SMASH_MIN_Y && input.power) return superReady ? 'super-smash' : 'smash';
  if (input.power && input.lift) return 'lob';
  if (input.drop) return 'drop';
  if (input.slice) return 'slice';
  if (input.lift) return 'topspin';
  if (input.power) return 'power-drive';
  return 'drive';
}

/**
 * Calidad del golpe en [qualityFloor, 1]: decae con la distancia al
 * jugador (gaussiana σ=0,85 m) y el jitter del nivel resta azar.
 * `rng` inyectable para tests deterministas.
 */
export function shotQuality(distance: number, level: PlayerLevel, rng: () => number = Math.random): number {
  const raw = Math.exp(-(distance * distance) / (2 * 0.85 * 0.85));
  const q = level.qualityFloor + (1 - level.qualityFloor) * raw - rng() * level.jitter * 0.05;
  return Math.min(1, Math.max(level.qualityFloor, q));
}

/**
 * ¿Está la bola dentro del alcance de golpeo de un jugador situado en el
 * lado `sideSign` de la pista (−1 = campo propio/z negativo, +1 = campo
 * contrario/z positivo)? La bola puede sobresalir 0,4 m al otro lado de
 * la red (volea junto a la red). Fase 4: lo usa la IA en su lado.
 */
export function canHitBallOnSide(ballPos: Vec3, playerPos: Vec3, sideSign: 1 | -1, reachBonus = 0): boolean {
  const dx = ballPos.x - playerPos.x;
  const dz = ballPos.z - playerPos.z;
  const horizontal = Math.hypot(dx, dz);
  return (
    horizontal <= REACH_XZ + reachBonus &&
    ballPos.y >= REACH_MIN_Y &&
    ballPos.y <= REACH_MAX_Y + reachBonus &&
    sideSign * ballPos.z >= -0.4
  );
}

/** ¿Está la bola dentro del alcance de golpeo del jugador (lado propio)? */
export function canHitBall(ballPos: Vec3, playerPos: Vec3, reachBonus = 0): boolean {
  return canHitBallOnSide(ballPos, playerPos, -1, reachBonus);
}

/** Velocidad inicial para llegar de `from` a `to` en T segundos (sin drag). */
export function solveBallistic(from: Vec3, to: Vec3, flightTime: number): Vec3 {
  const g = BALL_PHYSICS.gravity;
  return vec3(
    (to.x - from.x) / flightTime,
    (to.y - from.y) / flightTime + 0.5 * g * flightTime,
    (to.z - from.z) / flightTime,
  );
}

export interface ShotResult {
  kind: ShotKind;
  velocity: Vec3;
  spinTop: number;
  spinSide: number;
  target: Vec3;
}

const clampX = (x: number): number => Math.min(4.3, Math.max(-4.3, x));

/**
 * Calcula el golpe: velocidad y spin para enviar la bola al campo
 * contrario. `dirX` es la dirección deseada (−1..1); el error angular y
 * de velocidad crece al bajar la calidad.
 */
export function computeShot(args: {
  ballPos: Vec3;
  kind: ShotKind;
  dirX: number;
  quality: number;
  racketPower?: number;
  rng?: () => number;
}): ShotResult {
  const { ballPos, kind, quality } = args;
  const dirX = Math.max(-1, Math.min(1, args.dirX));
  const rng = args.rng ?? Math.random;
  const racketPower = args.racketPower ?? 0;

  let target: Vec3;
  let flightTime: number;
  let spinTop = 0;

  switch (kind) {
    case 'drop':
      target = vec3(clampX(dirX * 1.5), 0, 1.8);
      flightTime = 0.98;
      break;
    case 'slice':
      target = vec3(clampX(dirX * 2.8), 0, 6.8);
      flightTime = 0.8;
      spinTop = -16;
      break;
    case 'topspin':
      target = vec3(clampX(dirX * 3.3), 0, 7.9);
      flightTime = 0.57;
      spinTop = 21;
      break;
    case 'lob':
      target = vec3(clampX(dirX * 2.2), 0, 8.8);
      flightTime = 1.4;
      spinTop = 4;
      break;
    case 'power-drive':
      target = vec3(clampX(dirX * 3.5), 0, 8.6);
      flightTime = 0.5;
      break;
    case 'smash':
    case 'super-smash': {
      const speed = kind === 'smash' ? 25.5 : 33.5;
      const aim = vec3(clampX(dirX * (kind === 'smash' ? 3.2 : 3.6)), 0, kind === 'smash' ? 4.4 : 5.4);
      const dir = vec3(aim.x - ballPos.x, aim.y - ballPos.y, aim.z - ballPos.z);
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const velocity = vec3((dir.x / len) * speed, (dir.y / len) * speed, (dir.z / len) * speed);
      if (velocity.y > -2.5) velocity.y = -2.5;
      return { kind, velocity, spinTop: kind === 'smash' ? 6 : 10, spinSide: dirX * 2, target: aim };
    }
    case 'drive':
    default:
      target = vec3(clampX(ballPos.x * 0.3 + dirX * 3.1), 0, 7.4);
      flightTime = 0.62;
      break;
  }

  const velocity = solveBallistic(ballPos, target, flightTime);
  // La pala con más potencia acelera los golpes de fondo (no la dejada).
  if (kind !== 'drop' && racketPower > 0) {
    const factor = 1 + racketPower * 0.02;
    velocity.x *= factor;
    velocity.z *= factor;
  }
  // Error según calidad: desvío angular y variación de velocidad.
  const angle = (rng() - 0.5) * 2 * (1 - quality) * 0.16;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const vx = velocity.x * cos - velocity.z * sin;
  const vz = velocity.x * sin + velocity.z * cos;
  velocity.x = vx;
  velocity.z = vz;
  const speedScale = 0.94 + 0.1 * quality;
  velocity.x *= speedScale;
  velocity.z *= speedScale;

  return { kind, velocity, spinTop, spinSide: dirX * 3, target };
}

// ---------------------------------------------------------------------
// Saque con aguja (SPEC §5.3)
// ---------------------------------------------------------------------

export const NEEDLE_PERIOD = 1.15;
export const SWEET_HALF_WIDTH = 0.07;
export const GOOD_HALF_WIDTH = 0.18;
export const WEAK_HALF_WIDTH = 0.34;

/** Posición del jugador al sacar: tras la línea de saque, en su mitad. */
export function servePlayerPos(side: number): Vec3 {
  return vec3(side * 2.2, 0, -(COURT.serviceLineZ + 0.6));
}

/** Punto de contacto del saque (delante del jugador, a 2,42 m). */
export function serveContactPos(side: number): Vec3 {
  return vec3(side * 2.05, 2.42, -(COURT.serviceLineZ + 0.15));
}

/** Aguja oscilante: onda triangular 0→1→0 con el periodo dado. */
export function needleAt(t: number): number {
  const phase = (((t % NEEDLE_PERIOD) + NEEDLE_PERIOD) % NEEDLE_PERIOD) / NEEDLE_PERIOD;
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

export type NeedleZone = 'perfect' | 'good' | 'weak' | 'fault';

export function needleZone(needle: number): NeedleZone {
  const d = Math.abs(needle - 0.5);
  if (d <= SWEET_HALF_WIDTH) return 'perfect';
  if (d <= GOOD_HALF_WIDTH) return 'good';
  if (d <= WEAK_HALF_WIDTH) return 'weak';
  return 'fault';
}

/** Cuadro de saque que debe pisar la bola: diagonal al lado del sacador. */
export function serveBoxFor(side: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return side > 0
    ? { minX: -COURT.halfWidth, maxX: 0, minZ: 0, maxZ: COURT.serviceLineZ }
    : { minX: 0, maxX: COURT.halfWidth, minZ: 0, maxZ: COURT.serviceLineZ };
}

export function isInServeBox(pos: Vec3, side: number): boolean {
  const box = serveBoxFor(side);
  return pos.x >= box.minX && pos.x <= box.maxX && pos.z >= box.minZ && pos.z <= box.maxZ;
}

export type ServeFault = 'net' | 'long';

export interface ServeResult {
  velocity: Vec3;
  zone: NeedleZone;
  fault: ServeFault | null;
  target: Vec3;
  from: Vec3;
}

/**
 * Velocidad del saque según la aguja. Punto dulce: saque plano y exacto
 * al centro del cuadro. Zona buena: pequeño desvío dentro del cuadro.
 * Zona floja: saque lento y alto, aún dentro. Extremos: falta
 * determinista (a la red si la aguja quedó a la izquierda del centro,
 * larga si quedó a la derecha).
 */
export function serveVelocity(needle: number, side: number): ServeResult {
  const from = serveContactPos(side);
  const box = serveBoxFor(side);
  const centerX = (box.minX + box.maxX) / 2;
  const zone = needleZone(needle);
  const offset = needle - 0.5;

  if (zone === 'perfect') {
    const target = vec3(centerX, 0, 3.45);
    return { velocity: solveBallistic(from, target, 0.72), zone, fault: null, target, from };
  }
  if (zone === 'good') {
    const target = vec3(centerX + offset * 4.4, 0, 3.45 + offset * 2);
    return { velocity: solveBallistic(from, target, 0.78), zone, fault: null, target, from };
  }
  if (zone === 'weak') {
    const target = vec3(centerX + offset * 6, 0, 3.45 + offset * 4);
    return { velocity: solveBallistic(from, target, 0.98), zone, fault: null, target, from };
  }
  if (needle < 0.5) {
    const target = vec3(from.x * 0.4, 0, 0.15);
    return { velocity: solveBallistic(from, target, 0.42), zone, fault: 'net', target, from };
  }
  const target = vec3(centerX, 0, 8.8);
  return { velocity: solveBallistic(from, target, 0.66), zone, fault: 'long', target, from };
}
