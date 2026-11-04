import { describe, expect, it } from 'vitest';
import {
  AIBrain,
  aiQualityBase,
  doublesZoneCenterX,
  partnerShouldYield,
  predictIntercept,
  type BallSnapshot,
} from '../src/game/AI';
import { Ball, vec3 } from '../src/game/Ball';
import { computeShot, isInServeBox, serveContactPos, serveVelocity } from '../src/game/Shots';
import { AI_LEVELS, aiLevelById, surfaceById } from '../src/state/modes';

// Tests de la IA de la Fase 4 (src/game/AI.ts): lógica pura, sin Three.
// El RNG se inyecta para forzar errores y aciertos de forma determinista.

const surface = surfaceById(0);
const FACIL = aiLevelById(0);
const MEDIO = aiLevelById(1);
const DIFICIL = aiLevelById(2);

const snap = (x: number, y: number, z: number, vx: number, vy: number, vz: number): BallSnapshot => ({
  pos: vec3(x, y, z),
  vel: vec3(vx, vy, vz),
  spinTop: 0,
  spinSide: 0,
});

/** Simula una bola real hasta su primer bote (o 3 s) y devuelve el bote. */
function firstBounce(pos: BallSnapshot['pos'], vel: BallSnapshot['vel']) {
  const ball = new Ball();
  ball.launch({ ...pos }, { ...vel }, 0, 0);
  for (let t = 0; t < 3; t += 1 / 240) {
    for (const event of ball.step(1 / 240, surface)) {
      if (event.type === 'bounce') return event;
    }
  }
  return null;
}

describe('predictIntercept', () => {
  it('estima un punto legal dentro del campo de la IA para un envío claro', () => {
    const prediction = predictIntercept(snap(0, 1.3, -5, 0.5, 3.2, 9.5), surface, 1);
    expect(prediction).not.toBeNull();
    expect(prediction!.legal).toBe(true);
    expect(prediction!.point.z).toBeGreaterThan(0);
    expect(prediction!.point.z).toBeLessThan(10);
    expect(Math.abs(prediction!.point.x)).toBeLessThanOrEqual(5);
    expect(prediction!.point.y).toBeGreaterThanOrEqual(0.12);
    expect(prediction!.point.y).toBeLessThanOrEqual(2.45);
    expect(prediction!.bounces).toBeGreaterThanOrEqual(1);
    expect(prediction!.time).toBeGreaterThan(0);
  });

  it('marca afterWall cuando el primer punto legal llega tras su cristal de fondo', () => {
    // Bola ya en su campo, baja y hacia el cristal: bota después del rebote.
    const prediction = predictIntercept(snap(0, 0.8, 9.0, 0, -0.5, 6), surface, 1);
    expect(prediction).not.toBeNull();
    expect(prediction!.afterWall).toBe(true);
    expect(prediction!.legal).toBe(true);
  });

  it('devuelve null si la bola nunca entra en su campo', () => {
    expect(predictIntercept(snap(0, 1, -5, 0, 2, -6), surface, 1)).toBeNull();
  });
});

describe('AIBrain: reacción y movimiento', () => {
  it('no decide antes de aiReaction y decide justo después (reloj simulado)', () => {
    const brain = new AIBrain(FACIL, { role: 'rival', sideSign: 1, rng: () => 0.99 });
    brain.place(0, 7);
    brain.onOpponentStrike(snap(0, 1.3, -5, 0.5, 3.2, 9.5), surface);
    const dt = 1 / 60;
    for (let i = 0; i < 29; i += 1) brain.update(dt); // 0,483 s < 0,5 s
    expect(brain.decisionMs).toBeNull();
    expect(brain.state).toBe('reacting');
    for (let i = 0; i < 2; i += 1) brain.update(dt); // 0,517 s ≥ 0,5 s
    expect(brain.decisionMs).not.toBeNull();
    expect(brain.decisionMs!).toBeGreaterThanOrEqual(500);
    expect(brain.state).toBe('moving');
    expect(brain.prediction).not.toBeNull();
  });

  it('se desplaza hacia el objetivo sin superar aiSpeed', () => {
    const brain = new AIBrain(DIFICIL, { role: 'rival', sideSign: 1, rng: () => 0.99 });
    brain.place(-3, 5);
    brain.onOpponentStrike(snap(2.5, 1.3, -5, 0.5, 3.2, 9.5), surface);
    const before = { ...brain.pos };
    const dt = 1 / 60;
    for (let i = 0; i < 30; i += 1) brain.update(dt); // 0,5 s en total
    const moved = Math.hypot(brain.pos.x - before.x, brain.pos.z - before.z);
    expect(moved).toBeGreaterThan(1.2); // ha salido hacia la bola
    expect(moved).toBeLessThanOrEqual(DIFICIL.aiSpeed * 0.5 + 1e-6);
    expect(brain.pos.x).toBeGreaterThan(before.x); // hacia el lado de la bola
  });
});

describe('AIBrain: errores y calidad', () => {
  it('aiQualityBase reproduce el mapeo documentado por nivel', () => {
    expect(aiQualityBase(FACIL)).toBeCloseTo(0.55, 2);
    expect(aiQualityBase(MEDIO)).toBeCloseTo(0.74, 2);
    expect(aiQualityBase(DIFICIL)).toBeCloseTo(0.85, 2);
    expect(AI_LEVELS.map((l) => l.aiError)).toEqual([0.24, 0.12, 0.05]);
  });

  it('con RNG forzado a error, el golpe se erra y cuenta el error', () => {
    const brain = new AIBrain(MEDIO, { role: 'rival', sideSign: 1, rng: () => 0 });
    const decision = brain.chooseShot(snap(0, 1.2, 6, 0, 0, 0), vec3(0, 0, -6), false);
    expect(decision.error).toBe(true);
    expect(brain.errors).toBe(1);
  });

  it('la tirada intermedia solo falla tras pared (aiError + aiWallError)', () => {
    // Fácil: aiError 0,24 y aiWallError 0,25 → p = 0,24 sin pared, 0,49 con pared.
    const brain = new AIBrain(FACIL, { role: 'rival', sideSign: 1, rng: () => 0.3 });
    expect(brain.rollError(false)).toBe(false);
    expect(brain.rollError(true)).toBe(true);
  });

  it('con RNG forzado a acierto, devuelve la bola al campo contrario', () => {
    const brain = new AIBrain(MEDIO, { role: 'rival', sideSign: 1, rng: () => 0.99 });
    brain.place(0.5, 6);
    const ball = snap(0.5, 1.2, 6, 0, 0, -4);
    const decision = brain.chooseShot(ball, vec3(0, 0, -6), false);
    expect(decision.error).toBe(false);
    // Mismo espejo en z que usa Match.ts para el equipo de z positivo.
    const shot = computeShot({
      ballPos: vec3(ball.pos.x, ball.pos.y, -ball.pos.z),
      kind: decision.kind,
      dirX: decision.dirX,
      quality: decision.quality,
      rng: () => 0.5,
    });
    const bounce = firstBounce(ball.pos, vec3(shot.velocity.x, shot.velocity.y, -shot.velocity.z));
    expect(bounce).not.toBeNull();
    expect(bounce!.pos.z).toBeLessThan(0); // bota en el campo del humano
    expect(Math.abs(bounce!.pos.x)).toBeLessThanOrEqual(5);
    expect(bounce!.pos.z).toBeGreaterThanOrEqual(-10);
  });
});

describe('AIBrain: selección de golpe', () => {
  const brainAt = () => new AIBrain(MEDIO, { role: 'rival', sideSign: 1, rng: () => 0.99 });

  it('bola alta cerca de la red → smash', () => {
    const decision = brainAt().chooseShot(snap(0.5, 2.2, 2.0, 0, 0, 0), vec3(0, 0, -6), false);
    expect(decision.kind).toBe('smash');
  });

  it('apurado atrás con bola baja → globo', () => {
    const decision = brainAt().chooseShot(snap(0.5, 0.8, 8.5, 0, 0, 0), vec3(0, 0, -6), false);
    expect(decision.kind).toBe('lob');
  });

  it('humano muy atrás y bola muriendo en la red → dejada', () => {
    const decision = brainAt().chooseShot(snap(0.5, 1.2, 1.5, 0, 0, 0), vec3(0, 0, -8.5), false);
    expect(decision.kind).toBe('drop');
  });
});

describe('AIBrain: saque', () => {
  it('con falta forzada, la aguja cae en un extremo y Shots lo marca falta', () => {
    const brain = new AIBrain(FACIL, { role: 'rival', sideSign: 1, rng: () => 0 });
    const { needle, fault } = brain.serveNeedle();
    expect(fault).toBe(true);
    expect(serveVelocity(needle, 1).fault).not.toBeNull();
  });

  it('sin falta, el saque bota en el cuadro diagonal correcto desde ambos lados', () => {
    for (const side of [1, -1] as const) {
      const brain = new AIBrain(MEDIO, { role: 'rival', sideSign: 1, rng: () => 0.99 });
      const { needle, fault } = brain.serveNeedle();
      expect(fault).toBe(false);
      const serve = serveVelocity(needle, side);
      const from = serveContactPos(side);
      // Espejo en z (la IA saca desde z positivo), como en Match.ts.
      const bounce = firstBounce(
        vec3(from.x, from.y, -from.z),
        vec3(serve.velocity.x, serve.velocity.y, -serve.velocity.z),
      );
      expect(bounce).not.toBeNull();
      const mirrored = vec3(bounce!.pos.x, bounce!.pos.y, -bounce!.pos.z);
      expect(isInServeBox(mirrored, side)).toBe(true);
    }
  });
});

describe('dobles: zonas y cesión', () => {
  it('el objetivo del compañero queda clampeado a su mitad', () => {
    const brain = new AIBrain(MEDIO, {
      role: 'partner',
      sideSign: -1,
      zoneCenterX: -2.5,
      zoneHalfWidth: 2.5,
      rng: () => 0.99,
    });
    brain.place(-2.5, -6);
    // Bola clara a la mitad contraria (x positiva): no debe cruzar a x > 0.
    brain.onOpponentStrike(snap(3.5, 1.2, 4, 0.5, 2.5, -9), surface);
    for (let i = 0; i < 40; i += 1) brain.update(1 / 60);
    expect(brain.target.x).toBeLessThanOrEqual(0);
    // Bola a su zona: el objetivo sí entra en ella.
    brain.onOpponentStrike(snap(-3.5, 1.2, 4, -0.5, 2.5, -9), surface);
    for (let i = 0; i < 40; i += 1) brain.update(1 / 60);
    expect(brain.target.x).toBeLessThan(-1.5);
  });

  it('partnerShouldYield: cede solo fuera de zona y con el humano cerca', () => {
    const point = vec3(3.5, 0.8, -6.2);
    expect(partnerShouldYield(3.5, vec3(2.8, 0, -5.5), point, -2.5, 2.5)).toBe(true);
    expect(partnerShouldYield(3.5, vec3(-4, 0, -9), point, -2.5, 2.5)).toBe(false);
    expect(partnerShouldYield(-3, vec3(-2.8, 0, -5.5), vec3(-3, 0.8, -6.2), -2.5, 2.5)).toBe(false);
  });

  it('doublesZoneCenterX da la mitad contraria a la del sacador', () => {
    expect(doublesZoneCenterX(2.2)).toBe(-2.5);
    expect(doublesZoneCenterX(-2.2)).toBe(2.5);
  });
});
