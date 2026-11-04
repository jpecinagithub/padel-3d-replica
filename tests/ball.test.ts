import { describe, expect, it } from 'vitest';
import { BALL_PHYSICS, Ball, vec3, type BallEvent, type SurfacePhysics } from '../src/game/Ball';
import { SURFACES, surfaceById } from '../src/state/modes';

const AZUL: SurfacePhysics = surfaceById(0);
const VERDE: SurfacePhysics = surfaceById(1);
const ROJA: SurfacePhysics = surfaceById(2);

const STEP = 1 / 240;

function simulate(ball: Ball, surface: SurfacePhysics, seconds: number): BallEvent[] {
  const events: BallEvent[] = [];
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) events.push(...ball.step(STEP, surface));
  return events;
}

describe('Ball: caída libre (SPEC §7.1)', () => {
  it('tras 1 s, vy ≈ −9,80 por g=−9,9 con drag 0,02 y la altura concuerda', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 6, 0), vec3(0, 0, 0));
    simulate(ball, AZUL, 1);
    // Solución analítica con drag lineal: v = −(g/k)(1−e^(−kt)), k=0,02.
    expect(ball.vel.y).toBeGreaterThan(-9.95);
    expect(ball.vel.y).toBeLessThan(-9.65);
    expect(ball.pos.y).toBeGreaterThan(0.95);
    expect(ball.pos.y).toBeLessThan(1.3);
  });

  it('la velocidad nunca supera el tope de 34 m/s', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 2, 0), vec3(0, 0, 60));
    ball.step(STEP, AZUL);
    expect(ball.speed).toBeLessThanOrEqual(BALL_PHYSICS.maxSpeed + 1e-6);
    expect(ball.speed).toBeGreaterThan(33.5);
  });

  it('el spin decae con el tiempo', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 8, 0), vec3(0, 0, 3), 20, 0);
    simulate(ball, AZUL, 1);
    expect(ball.spinTop).toBeGreaterThan(8);
    expect(ball.spinTop).toBeLessThan(15);
  });
});

describe('Ball: bote en el suelo y multiplicadores de superficie', () => {
  function dropAndCatch(surface: SurfacePhysics): { after: number; impact: number } {
    const ball = new Ball();
    ball.launch(vec3(0, 2, 0), vec3(0, 0, 0));
    for (let i = 0; i < 240 * 3; i++) {
      const before = ball.vel.y;
      const events = ball.step(STEP, surface);
      if (events.some((e) => e.type === 'bounce')) return { after: ball.vel.y, impact: -before };
    }
    throw new Error('la bola no botó');
  }

  it('restitución en suelo 0,72 sobre superficie estándar', () => {
    const { after, impact } = dropAndCatch(AZUL);
    const ratio = after / impact;
    expect(ratio).toBeGreaterThan(0.68);
    expect(ratio).toBeLessThan(0.76);
  });

  it('la Roja (×1,22) bota más y la Verde (×0,85) menos que la Azul', () => {
    const azul = dropAndCatch(AZUL).after;
    const roja = dropAndCatch(ROJA).after;
    const verde = dropAndCatch(VERDE).after;
    expect(roja / azul).toBeGreaterThan(1.14);
    expect(roja / azul).toBeLessThan(1.3);
    expect(verde / azul).toBeGreaterThan(0.78);
    expect(verde / azul).toBeLessThan(0.92);
    void SURFACES;
  });
});

describe('Ball: paredes', () => {
  it('el cristal devuelve con restitución 0,85', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 2.2, 4), vec3(0, 2.5, 11));
    let wall: BallEvent | undefined;
    let before = 0;
    for (let i = 0; i < 240 * 3 && !wall; i++) {
      before = ball.vel.z;
      const events = ball.step(STEP, AZUL);
      wall = events.find((e) => e.type === 'wall');
    }
    expect(wall?.type).toBe('wall');
    if (wall?.type === 'wall') {
      expect(wall.kind).toBe('glass');
      expect(wall.where).toBe('back-opp');
    }
    expect(ball.vel.z).toBeLessThan(0);
    const ratio = Math.abs(ball.vel.z) / Math.abs(before);
    expect(ratio).toBeGreaterThan(0.78);
    expect(ratio).toBeLessThan(0.92);
    expect(ball.lastWall).toBe('cristal');
  });

  it('la malla lateral devuelve con restitución 0,50', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 3.4, 0), vec3(9, 0.5, 0));
    let wall: BallEvent | undefined;
    let before = 0;
    for (let i = 0; i < 240 * 3 && !wall; i++) {
      before = ball.vel.x;
      const events = ball.step(STEP, AZUL);
      wall = events.find((e) => e.type === 'wall');
    }
    expect(wall?.type).toBe('wall');
    if (wall?.type === 'wall') {
      expect(wall.kind).toBe('mesh');
      expect(wall.where).toBe('side');
    }
    const ratio = Math.abs(ball.vel.x) / Math.abs(before);
    expect(ratio).toBeGreaterThan(0.43);
    expect(ratio).toBeLessThan(0.57);
    expect(ball.lastWall).toBe('malla');
  });

  it('por encima de los 4 m del cerramiento la bola se va fuera', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 3.9, -6), vec3(0, 6.5, 16));
    const events = simulate(ball, AZUL, 1.6);
    expect(events.some((e) => e.type === 'over-wall')).toBe(true);
    expect(ball.out).toBe(true);
  });
});

describe('Ball: red y botes', () => {
  it('la red bloquea un golpe bajo y la bola se queda en su campo', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 0.5, -3), vec3(0, 0.3, 10));
    const events = simulate(ball, AZUL, 1.2);
    expect(events.some((e) => e.type === 'net')).toBe(true);
    expect(ball.pos.z).toBeLessThan(0.4);
    expect(ball.lastWall).toBe('net');
  });

  it('el netcord rápido y alto pasa al otro lado perdiendo velocidad', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 0.86, -1), vec3(0, 0.6, 12));
    const events = simulate(ball, AZUL, 0.6);
    const cord = events.find((e) => e.type === 'netcord');
    expect(cord?.type).toBe('netcord');
    if (cord?.type === 'netcord') expect(cord.over).toBe(true);
    expect(ball.pos.z).toBeGreaterThan(0);
  });

  it('el netcord lento se queda en la red', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 0.86, -1), vec3(0, 0.6, 6));
    const events = simulate(ball, AZUL, 0.8);
    expect(events.some((e) => e.type === 'net')).toBe(true);
    expect(ball.pos.z).toBeLessThan(0.2);
  });

  it('cuenta los botes por lado y detecta el doble bote', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 2, -3), vec3(0, 0, 2));
    const events = simulate(ball, AZUL, 4);
    const bounces = events.filter((e) => e.type === 'bounce');
    expect(bounces.length).toBeGreaterThanOrEqual(2);
    expect(ball.bouncesOwn).toBeGreaterThanOrEqual(2);
    expect(ball.bouncesOpp).toBe(0);
  });

  it('un cruce limpio por encima de la red emite netCross', () => {
    const ball = new Ball();
    ball.launch(vec3(0, 2.5, -3), vec3(0, 1, 9));
    const events = simulate(ball, AZUL, 0.5);
    expect(events.some((e) => e.type === 'netCross' && e.to === 'opp')).toBe(true);
  });
});
