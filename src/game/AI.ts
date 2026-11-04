// Cerebro de la IA (REPLICA_SPEC §5.3, Fase 4). Lógica pura: sin Three
// ni DOM. El orquestador (Match.ts) le da fotos de la bola y le pregunta;
// los tests lo ejercitan en node con relojes y RNG simulados.
//
// Diseño:
// - Percepción: cuando el equipo contrario golpea hacia su campo, el
//   cerebro anota el golpe pero no «ve» la jugada hasta que pasa su
//   aiReaction (Fácil 0,5 s · Medio 0,3 · Difícil 0,16). Entonces predice
//   la intercepción simulando la trayectoria con el propio Ball.ts
//   (rebotes en suelo y en su cristal de fondo incluidos).
// - Movimiento: se desplaza en línea recta hacia el punto predicho a
//   aiSpeed (5 / 6,1 / 7 m/s); sin predicción, vuelve a su base.
// - Golpe: lo decide el orquestador cuando la bola está en alcance; el
//   cerebro aporta la tirada de error (aiError, +aiWallError si el golpe
//   es tras su cristal), la elección del tipo y la calidad.
// - Saque: aguja virtual — con probabilidad aiServeFault cae en zona de
//   falta; si no, en la zona buena/dulce en torno al centro.
// - Dobles: el compañero cubre una mitad en x (su «zona») y cede las
//   bolas claramente del humano si este está cerca de ellas.

import type { AiLevel } from '../state/modes';
import { Ball, vec3, type SurfacePhysics, type Vec3 } from './Ball';
import { COURT } from './courtConstants';
import { SMASH_MIN_Y, type ShotKind } from './Shots';

export type AIRole = 'rival' | 'partner' | 'rival2';
export type AITeam = 'human' | 'ai';
export type AIStateName = 'waiting' | 'reacting' | 'moving' | 'hitting' | 'recovering' | 'serving';

export interface BallSnapshot {
  pos: Vec3;
  vel: Vec3;
  spinTop: number;
  spinSide: number;
}

export interface InterceptPrediction {
  /** Punto donde la IA puede golpear (en su campo, altura legal). */
  point: Vec3;
  /** Segundos desde la foto hasta ese punto. */
  time: number;
  /** Botes en su campo antes del punto. */
  bounces: number;
  /** El punto llega tras el rebote en su cristal/malla de fondo. */
  afterWall: boolean;
  /** La bola llegaba con opciones reales de devolución. */
  legal: boolean;
}

const snapshotOf = (ball: Ball): BallSnapshot => ({
  pos: { ...ball.pos },
  vel: { ...ball.vel },
  spinTop: ball.spinTop,
  spinSide: ball.spinSide,
});

/**
 * Predice dónde puede interceptar la bola un jugador del lado `sideSign`
 * (+1 campo contrario, −1 campo propio), simulando con Ball.ts a 120 Hz
 * hasta 3,5 s. Devuelve el primer punto legal de golpeo (tras al menos
 * un bote en su campo o tras el rebote en su cristal de fondo, con la
 * bola entre 0,12 y 2,45 m) o, si la bola muere en su campo sin punto
 * legal, el punto del segundo bote (legal=false: llegaba tarde).
 * Si la bola nunca entra en su campo, null.
 */
export function predictIntercept(ball: BallSnapshot, surface: SurfacePhysics, sideSign: 1 | -1): InterceptPrediction | null {
  const sim = new Ball();
  sim.launch({ ...ball.pos }, { ...ball.vel }, ball.spinTop, ball.spinSide);
  const dt = 1 / 120;
  const sideBounces = (): number => (sideSign > 0 ? sim.bouncesOpp : sim.bouncesOwn);
  let wallOnHisBack = false;
  let firstEntry: Vec3 | null = null;
  let lastInField: Vec3 | null = null;

  for (let t = dt; t <= 3.5; t += dt) {
    const events = sim.step(dt, surface);
    for (const event of events) {
      if (event.type === 'wall') {
        const atHisBack = sideSign > 0 ? event.where === 'back-opp' : event.where === 'back-own';
        if (atHisBack) wallOnHisBack = true;
      }
    }
    const inField = sideSign * sim.pos.z > 0;
    if (!inField) {
      if (sim.state === 'resting') break;
      continue;
    }
    if (!firstEntry) firstEntry = { ...sim.pos };
    lastInField = { ...sim.pos };
    const bounces = sideBounces();
    const hittableHeight = sim.pos.y >= 0.12 && sim.pos.y <= 2.45;
    if (hittableHeight && (bounces >= 1 || wallOnHisBack)) {
      return { point: { ...sim.pos }, time: t, bounces, afterWall: wallOnHisBack, legal: true };
    }
    if (bounces >= 2) {
      // Segundo bote: la bola muere aquí; el punto sirve de referencia.
      return { point: { ...sim.pos }, time: t, bounces, afterWall: wallOnHisBack, legal: false };
    }
    if (sim.state === 'resting' || sim.out) break;
  }
  if (lastInField) {
    return { point: lastInField, time: 0, bounces: sideBounces(), afterWall: wallOnHisBack, legal: false };
  }
  return null;
}

/**
 * Calidad base del acierto de la IA por nivel (mapeo documentado): un
 * suelo análogo al qualityFloor del jugador, derivado de aiError:
 * Fácil 0,24 → 0,55 · Medio 0,12 → 0,74 · Difícil 0,05 → 0,85.
 */
export function aiQualityBase(level: AiLevel): number {
  return Math.min(0.9, Math.max(0.4, 0.925 - 1.55 * level.aiError));
}

export interface ShotDecision {
  error: boolean;
  kind: ShotKind;
  dirX: number;
  quality: number;
}

export interface AIBrainOptions {
  role: AIRole;
  /** Lado de la pista donde vive: rival/rival2 +1, compañero −1. */
  sideSign: 1 | -1;
  /** Centro de su zona en x (dobles); por defecto 0 (todo el ancho). */
  zoneCenterX?: number;
  /** Semiancho de su zona; Infinity = sin zona (individuales). */
  zoneHalfWidth?: number;
  rng?: () => number;
}

export class AIBrain {
  readonly level: AiLevel;
  readonly role: AIRole;
  readonly sideSign: 1 | -1;
  /** Posición de los pies (pura, sin Three). */
  readonly pos = vec3(0, 0, 0);
  /** Destino actual de movimiento. */
  target = vec3(0, 0, 0);
  /** Base (posición de resto) a la que vuelve sin jugada. */
  base = vec3(0, 0, 0);
  state: AIStateName = 'waiting';
  lastShot: ShotKind | null = null;
  /** Nº de tiradas de error falladas (golpes errados) en la sesión. */
  errors = 0;
  /** ms desde el golpe contrario hasta decidir (null si aún no decide). */
  decisionMs: number | null = null;
  prediction: InterceptPrediction | null = null;

  private zoneCenterX: number;
  private zoneHalfWidth: number;
  private readonly rng: () => number;
  private clock = 0;
  private struckAt: number | null = null;
  private snapshot: BallSnapshot | null = null;
  private surface: SurfacePhysics | null = null;
  private decided = false;
  private recovering = 0;

  constructor(level: AiLevel, options: AIBrainOptions) {
    this.level = level;
    this.role = options.role;
    this.sideSign = options.sideSign;
    this.zoneCenterX = options.zoneCenterX ?? 0;
    this.zoneHalfWidth = options.zoneHalfWidth ?? Number.POSITIVE_INFINITY;
    this.rng = options.rng ?? Math.random;
  }

  /** Fija base y posición (al preparar un rally o un saque). */
  place(x: number, z: number): void {
    this.pos.x = x;
    this.pos.z = z;
    this.base = vec3(x, 0, z);
    this.target = { ...this.base };
    this.state = 'waiting';
    this.struckAt = null;
    this.decided = false;
    this.prediction = null;
    this.decisionMs = null;
  }

  /** El orquestador avisa: el contrario acaba de golpear hacia mi campo. */
  onOpponentStrike(ball: BallSnapshot, surface: SurfacePhysics): void {
    this.snapshot = ball;
    this.surface = surface;
    this.struckAt = this.clock;
    this.decided = false;
    this.prediction = null;
    this.decisionMs = null;
    this.state = 'reacting';
  }

  /** El rally terminó o la bola ya no viene: se olvida la jugada. */
  onRallyEnd(): void {
    this.struckAt = null;
    this.snapshot = null;
    this.decided = false;
    this.prediction = null;
    if (this.state !== 'serving') this.state = this.recovering > 0 ? 'recovering' : 'waiting';
  }

  /** Redefine la zona de dobles que cubre (centro y semiancho en x). */
  setZone(centerX: number, halfWidth: number): void {
    this.zoneCenterX = centerX;
    this.zoneHalfWidth = halfWidth;
  }

  /** Centro en x de su zona de dobles (para la lógica de cesión). */
  get zoneCenterXValue(): number {
    return this.zoneCenterX;
  }

  private clampTarget(point: Vec3): Vec3 {
    const x = Math.min(4.5, Math.max(-4.5, point.x));
    const z = Math.min(9.5, Math.max(0.45, Math.abs(point.z))) * this.sideSign;
    const zoneClampedX = Number.isFinite(this.zoneHalfWidth)
      ? Math.min(this.zoneCenterX + this.zoneHalfWidth, Math.max(this.zoneCenterX - this.zoneHalfWidth, x))
      : x;
    return vec3(zoneClampedX, 0, z);
  }

  /**
   * Avanza el cerebro dt segundos: reloj de reacción, decisión al
   * cumplirse aiReaction y movimiento hacia el objetivo a aiSpeed.
   * Devuelve la fracción de velocidad usada (para la animación).
   */
  update(dt: number): number {
    this.clock += dt;
    if (this.recovering > 0) {
      this.recovering -= dt;
      if (this.recovering <= 0 && this.state === 'recovering') this.state = 'waiting';
    }
    if (this.struckAt !== null && !this.decided && this.snapshot && this.surface) {
      const elapsed = this.clock - this.struckAt;
      if (elapsed >= this.level.aiReaction) {
        this.decided = true;
        this.decisionMs = Math.round(elapsed * 1000);
        this.prediction = predictIntercept(this.snapshot, this.surface, this.sideSign);
        this.target = this.prediction ? this.clampTarget(this.prediction.point) : { ...this.base };
        this.state = this.prediction ? 'moving' : 'waiting';
      }
    }
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.02) return 0;
    const step = Math.min(dist, this.level.aiSpeed * dt);
    this.pos.x += (dx / dist) * step;
    this.pos.z += (dz / dist) * step;
    return step / Math.max(1e-6, this.level.aiSpeed * dt);
  }

  /** ¿Está la bola a su alcance ahora mismo (geometría, sin legalidad)? */
  inReach(ball: BallSnapshot): boolean {
    const horizontal = Math.hypot(ball.pos.x - this.pos.x, ball.pos.z - this.pos.z);
    return horizontal <= 1.75 && ball.pos.y >= 0.12 && ball.pos.y <= 2.45 && this.sideSign * ball.pos.z >= -0.4;
  }

  /**
   * True cuando el tiempo de reacción (aiReaction) ya se cumplió para
   * el golpe contrario en curso y el cerebro ha decidido (Fase 8 · A2):
   * el orquestador solo puede dejar golpear a la IA en este estado.
   */
  get hasDecided(): boolean {
    return this.decided;
  }

  /** Tirada de error: true si este golpe se erra (aiError + pared). */
  rollError(afterWall: boolean): boolean {
    const p = this.level.aiError + (afterWall ? this.level.aiWallError : 0);
    const failed = this.rng() < p;
    if (failed) this.errors += 1;
    return failed;
  }

  /**
   * Elige el golpe para una bola que ya está en alcance. Heurística
   * documentada:
   * - bola alta (≥2,0 m) cerca de la red → smash.
   * - apurado atrás (su z profunda y bola baja cayendo) → globo.
   * - el humano está muy atrás y la bola muere cerca de la red → dejada.
   * - 18 % cortado, 25 % liftado, resto drive (potente si viene alta).
   * La dirección apunta lejos del humano (lado contrario en x) con el
   * desvío que marca la calidad.
   */
  chooseShot(ball: BallSnapshot, humanPos: Vec3, afterWall: boolean): ShotDecision {
    if (this.rollError(afterWall)) {
      return { error: true, kind: 'drive', dirX: 0, quality: 0 };
    }
    const quality = aiQualityBase(this.level);
    let kind: ShotKind = 'drive';
    const deepInHisField = this.sideSign * ball.pos.z > 7.2;
    const nearNet = this.sideSign * ball.pos.z < 3.0;
    if (ball.pos.y >= SMASH_MIN_Y) {
      kind = 'smash';
    } else if (deepInHisField && ball.pos.y < 1.1) {
      kind = 'lob';
    } else if (nearNet && this.sideSign * humanPos.z < -7) {
      kind = 'drop';
    } else {
      const roll = this.rng();
      if (roll < 0.18) kind = 'slice';
      else if (roll < 0.43) kind = 'topspin';
      else if (ball.pos.y > 1.5) kind = 'power-drive';
    }
    const awayFromHuman = humanPos.x >= 0 ? -0.7 : 0.7;
    const dirX = Math.max(-1, Math.min(1, awayFromHuman + (this.rng() - 0.5) * (1 - quality) * 0.9));
    this.lastShot = kind;
    this.state = 'hitting';
    this.recovering = 0.55;
    return { error: false, kind, dirX, quality };
  }

  /**
   * Aguja virtual del saque: con probabilidad aiServeFault, la aguja
   * cae en un extremo (falta de red o larga, como en Shots.serveVelocity);
   * si no, en [0,38, 0,62]: zona buena o punto dulce.
   */
  serveNeedle(): { needle: number; fault: boolean } {
    if (this.rng() < this.level.aiServeFault) {
      return { needle: this.rng() < 0.5 ? 0.03 : 0.97, fault: true };
    }
    return { needle: 0.5 + (this.rng() - 0.5) * 0.24, fault: false };
  }

  markServing(): void {
    this.state = 'serving';
  }

  /** Distancia actual al objetivo (para depurar/probe). */
  get targetDistance(): number {
    return Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
  }
}

/**
 * Zonas de dobles: el compañero cubre la mitad en x centrada en
 * zoneCenterX. Cede la bola si el punto predicho cae claramente fuera
 * de su zona (más allá del borde + 0,6 m) y el humano está cerca del
 * punto (≤ 2,2 m): es «del humano».
 */
export function partnerShouldYield(
  predictedX: number,
  humanPos: Vec3,
  predictedPoint: Vec3,
  zoneCenterX: number,
  zoneHalfWidth: number,
): boolean {
  const outsideZone = Math.abs(predictedX - zoneCenterX) > zoneHalfWidth + 0.6;
  if (!outsideZone) return false;
  const humanDistance = Math.hypot(predictedPoint.x - humanPos.x, predictedPoint.z - humanPos.z);
  return humanDistance <= 2.2;
}

/**
 * Centro en x de la zona del compañero: la mitad contraria a la del
 * jugador que saca o resta (que se coloca a x = lado·2,2). Vale igual
 * para el equipo que saca (el compañero espera junto a la red) y para
 * el que resta (el compañero cubre la mitad libre).
 */
export function doublesZoneCenterX(serverSideX: number): number {
  return -Math.sign(serverSideX || 1) * 2.5;
}

export { snapshotOf };
export type { Vec3 };
