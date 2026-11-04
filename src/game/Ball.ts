// Física pura de la bola (REPLICA_SPEC §5.2). Sin dependencias de Three
// ni del DOM: el núcleo numérico trabaja con vectores planos {x,y,z} y lo
// consume tanto el render (Training.ts) como los tests en node.
//
// Modelo (documentado, deliberadamente sencillo):
// - Integración semi-implícita de Euler con subpasos de ≤1/480 s para que
//   una bola a 34 m/s avance ≤7 cm por subpaso y no atraviese la red.
// - Gravedad −9,9 m/s², drag lineal 0,02 (factor (1 − k·dt)) y tope de
//   velocidad de 34 m/s.
// - Spin: topspin (positivo) / slice (negativo) y lateral. Magnus simple:
//   el topspin hunde la bola (−0,055·spinTop de aceleración vertical) y
//   el lateral la curva en x. Al botar, el topspin acelera la salida
//   (×(1 + spin·0,006)) y el slice la frena; el spin decae con el tiempo
//   (tasa 0,5/s) y en cada contacto.
// - Suelo: restitución 0,72 × multiplicador de bote de la superficie;
//   fricción horizontal con retención 0,88^multFricción (una superficie
//   «lenta» como la Roja, mult 1,7, retiene 0,88^1,7 ≈ 0,80: frena más).
// - Cristal: restitución 0,85 × multPared (con tope 0,98 para no crear
//   energía). Malla: 0,50. Zonas según Court.ts: fondos completos y
//   laterales junto a los fondos son cristal hasta 3 m y malla de 3 a
//   4 m; el tramo lateral central es malla de 0 a 4 m. Por encima de
//   4 m la bola se va fuera (evento over-wall).
// - Red: si la bola cruza el plano z=0 por debajo de la cinta, evento
//   'net' y la bola cae en su lado. Si roza la cinta (netcord): solo la
//   pasa si llega rápida (≥10 m/s) y alta (centro a ≤3 cm bajo la cinta),
//   perdiendo el 55 % de su velocidad; si no, cae de su lado.

import { COURT } from './courtConstants';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

/** Multiplicadores de la superficie en juego (de modes.ts: Surface). */
export interface SurfacePhysics {
  bounce: number;
  friction: number;
  wall: number;
}

export const BALL_PHYSICS = {
  radius: 0.033,
  gravity: 9.9,
  drag: 0.02,
  maxSpeed: 34,
  floorRestitution: 0.72,
  glassRestitution: 0.85,
  meshRestitution: 0.5,
  /** Retención horizontal base al botar (antes del multiplicador). */
  floorFrictionBase: 0.88,
  /** Decaimiento del spin por segundo. */
  spinDecay: 0.5,
  /** Impacto vertical mínimo para que un bote cuente como bote. */
  bounceThreshold: 1.1,
} as const;

export type CourtSide = 'own' | 'opp';
export type WallKind = 'glass' | 'mesh';
export type WallWhere = 'back-own' | 'back-opp' | 'side';

export type BallEvent =
  | { type: 'bounce'; side: CourtSide; pos: Vec3; count: number }
  | { type: 'wall'; kind: WallKind; where: WallWhere; pos: Vec3 }
  | { type: 'net' }
  | { type: 'netcord'; over: boolean }
  | { type: 'netCross'; to: CourtSide }
  | { type: 'over-wall'; side: CourtSide | 'side' }
  | { type: 'resting' };

const sideOf = (z: number): CourtSide => (z < 0 ? 'own' : 'opp');

/** Zona de pared de un lateral: cristal junto a los fondos, malla en el centro. */
function sideWallKind(y: number, z: number): WallKind | null {
  const glassZone = Math.abs(z) >= COURT.halfLength - COURT.sideGlassLength;
  if (glassZone) {
    if (y <= COURT.glassHeight) return 'glass';
    if (y <= COURT.wallHeight) return 'mesh';
    return null;
  }
  return y <= COURT.wallHeight ? 'mesh' : null;
}

export type BallState = 'held' | 'flying' | 'resting';

export class Ball {
  pos: Vec3 = vec3(0, BALL_PHYSICS.radius, 0);
  vel: Vec3 = vec3();
  /** Topspin (+) / slice (−), en rad/s nominales del modelo. */
  spinTop = 0;
  /** Spin lateral: curva la bola en x. */
  spinSide = 0;
  state: BallState = 'held';
  bouncesOwn = 0;
  bouncesOpp = 0;
  lastWall: string | null = null;
  out = false;
  private prevZSign = -1;

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.y, this.vel.z);
  }

  /** Bola en la mano (saque): step() no la mueve. */
  hold(pos: Vec3): void {
    this.pos = { ...pos };
    this.vel = vec3();
    this.spinTop = 0;
    this.spinSide = 0;
    this.state = 'held';
    this.out = false;
    this.bouncesOwn = 0;
    this.bouncesOpp = 0;
    this.lastWall = null;
    this.prevZSign = pos.z < 0 ? -1 : 1;
  }

  /** Lanza la bola en vuelo libre con velocidad y spin dados. */
  launch(pos: Vec3, vel: Vec3, spinTop = 0, spinSide = 0): void {
    this.pos = { ...pos };
    this.vel = { ...vel };
    this.spinTop = spinTop;
    this.spinSide = spinSide;
    this.state = 'flying';
    this.out = false;
    this.bouncesOwn = 0;
    this.bouncesOpp = 0;
    this.lastWall = null;
    this.prevZSign = pos.z < 0 ? -1 : 1;
  }

  /**
   * Un golpe (del jugador o un lanzamiento) reinicia el conteo de botes
   * y la memoria de pared: empieza una «pierna» nueva del rally.
   */
  onHit(): void {
    this.bouncesOwn = 0;
    this.bouncesOpp = 0;
    this.lastWall = null;
  }

  /**
   * Avanza la física dt segundos (dt ya clampado por el bucle) y devuelve
   * los eventos producidos, en orden.
   */
  step(dt: number, surface: SurfacePhysics): BallEvent[] {
    const events: BallEvent[] = [];
    if (this.state !== 'flying' || dt <= 0) return events;
    const subSteps = Math.max(1, Math.ceil(dt / (1 / 480)));
    const h = dt / subSteps;
    for (let i = 0; i < subSteps; i++) {
      this.integrate(h);
      this.collide(surface, events);
      if (this.state !== 'flying') break;
    }
    return events;
  }

  private integrate(h: number): void {
    const { gravity, drag, maxSpeed, spinDecay } = BALL_PHYSICS;
    // Magnus simple (ver cabecera): topspin hunde, slice sostiene, el
    // lateral curva en función del avance en z.
    this.vel.y += (-gravity - this.spinTop * 0.055) * h;
    this.vel.x += this.spinSide * 0.05 * Math.min(1, Math.abs(this.vel.z) / 8 + 0.3) * h;
    const dragFactor = Math.max(0, 1 - drag * h);
    this.vel.x *= dragFactor;
    this.vel.y *= dragFactor;
    this.vel.z *= dragFactor;
    const speed = this.speed;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.vel.x *= scale;
      this.vel.y *= scale;
      this.vel.z *= scale;
    }
    const spinFactor = Math.max(0, 1 - spinDecay * h);
    this.spinTop *= spinFactor;
    this.spinSide *= spinFactor;
    this.pos.x += this.vel.x * h;
    this.pos.y += this.vel.y * h;
    this.pos.z += this.vel.z * h;
  }

  private collide(surface: SurfacePhysics, events: BallEvent[]): void {
    const r = BALL_PHYSICS.radius;
    const { pos, vel } = this;

    // ---- Red y cruce de red (plano z = 0) ----
    const zSign = pos.z < 0 ? -1 : 1;
    if (zSign !== this.prevZSign && !this.out) {
      if (pos.y - r >= COURT.netHeight) {
        events.push({ type: 'netCross', to: sideOf(pos.z) });
      } else if (Math.abs(pos.x) <= COURT.halfWidth + 0.05 && vel.z !== 0) {
        // Cruce por debajo de la parte alta: la red interviene.
        const tapeZone = pos.y >= COURT.netHeight - 0.075;
        const incomingSpeed = Math.abs(vel.z);
        if (tapeZone && incomingSpeed >= 10 && pos.y >= COURT.netHeight - 0.03) {
          // Netcord que pasa: pierde velocidad y cae al otro lado.
          vel.z *= 0.45;
          vel.y = Math.min(vel.y, -0.5);
          pos.z = zSign * r;
          this.spinTop *= 0.3;
          events.push({ type: 'netcord', over: true });
          events.push({ type: 'netCross', to: sideOf(pos.z) });
        } else {
          // A la red: cae en el lado del que venía.
          pos.z = this.prevZSign * r;
          vel.z = -vel.z * 0.08;
          vel.x *= 0.4;
          vel.y *= 0.5;
          this.spinTop *= 0.3;
          this.lastWall = 'net';
          events.push({ type: 'netcord', over: false });
          events.push({ type: 'net' });
        }
      }
      this.prevZSign = pos.z < 0 ? -1 : 1;
    }

    // ---- Suelo ----
    if (pos.y < r && vel.y < 0) {
      pos.y = r;
      const impact = -vel.y;
      if (impact > BALL_PHYSICS.bounceThreshold) {
        vel.y = impact * BALL_PHYSICS.floorRestitution * surface.bounce;
        const retention = Math.pow(BALL_PHYSICS.floorFrictionBase, surface.friction);
        vel.x *= retention;
        vel.z *= retention;
        // El spin actúa en el bote: topspin acelera, slice frena, el
        // lateral desvía.
        const spinForward = clamp(1 + this.spinTop * 0.006, 0.6, 1.25);
        vel.z *= spinForward;
        vel.x += this.spinSide * 0.015;
        this.spinTop *= 0.55;
        this.spinSide *= 0.55;
        const side = sideOf(pos.z);
        if (side === 'own') this.bouncesOwn += 1;
        else this.bouncesOpp += 1;
        events.push({
          type: 'bounce',
          side,
          pos: { ...pos },
          count: side === 'own' ? this.bouncesOwn : this.bouncesOpp,
        });
      } else {
        // Bote muerto: la bola se queda rodando y se para.
        vel.y = 0;
        const roll = Math.max(0, 1 - 2.4 * (1 / 480));
        vel.x *= roll;
        vel.z *= roll;
        if (this.speed < 0.4) {
          vel.x = 0;
          vel.z = 0;
          this.state = 'resting';
          events.push({ type: 'resting' });
        }
      }
    }

    // ---- Paredes de fondo (z = ±semilargo) ----
    for (const sign of [-1, 1] as const) {
      const plane = sign * COURT.halfLength;
      if (sign < 0 ? pos.z - r < plane && vel.z < 0 : pos.z + r > plane && vel.z > 0) {
        if (pos.y > COURT.wallHeight) break;
        const kind: WallKind = pos.y <= COURT.glassHeight ? 'glass' : 'mesh';
        const restitution =
          kind === 'glass'
            ? Math.min(0.98, BALL_PHYSICS.glassRestitution * surface.wall)
            : BALL_PHYSICS.meshRestitution;
        const impactSpeed = Math.abs(vel.z);
        pos.z = plane - sign * r; // se recoloca justo dentro de la pista
        vel.z = -vel.z * restitution;
        vel.x *= 0.94;
        this.spinTop *= 0.6;
        this.spinSide *= 0.6;
        if (impactSpeed > 0.7) {
          this.lastWall = kind === 'glass' ? 'cristal' : 'malla';
          events.push({ type: 'wall', kind, where: sign < 0 ? 'back-own' : 'back-opp', pos: { ...pos } });
        }
      }
    }

    // ---- Paredes laterales (x = ±semiancho) ----
    for (const sign of [-1, 1] as const) {
      const plane = sign * COURT.halfWidth;
      if (sign < 0 ? pos.x - r < plane && vel.x < 0 : pos.x + r > plane && vel.x > 0) {
        const kind = sideWallKind(pos.y, pos.z);
        if (!kind) break;
        const restitution =
          kind === 'glass'
            ? Math.min(0.98, BALL_PHYSICS.glassRestitution * surface.wall)
            : BALL_PHYSICS.meshRestitution;
        const impactSpeed = Math.abs(vel.x);
        pos.x = plane - sign * r;
        vel.x = -vel.x * restitution;
        vel.z *= 0.94;
        this.spinTop *= 0.6;
        this.spinSide *= 0.6;
        if (impactSpeed > 0.7) {
          this.lastWall = kind === 'glass' ? 'cristal' : 'malla';
          events.push({ type: 'wall', kind, where: 'side', pos: { ...pos } });
        }
      }
    }

    // ---- Salida del cerramiento ----
    if (!this.out) {
      const overBack = Math.abs(pos.z) > COURT.halfLength + 0.05 && pos.y > COURT.wallHeight;
      const overSide = Math.abs(pos.x) > COURT.halfWidth + 0.05 && pos.y > COURT.wallHeight;
      const farAway = Math.abs(pos.z) > COURT.halfLength + 3.5 || Math.abs(pos.x) > COURT.halfWidth + 4;
      if (overBack || overSide || farAway) {
        this.out = true;
        events.push({
          type: 'over-wall',
          side: Math.abs(pos.z) > COURT.halfLength ? sideOf(pos.z) : 'side',
        });
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
