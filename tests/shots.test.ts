import { describe, expect, it } from 'vitest';
import { Ball, vec3, type BallEvent } from '../src/game/Ball';
import {
  canHitBall,
  classifyShot,
  computeShot,
  isInServeBox,
  needleAt,
  needleZone,
  serveBoxFor,
  serveContactPos,
  serveVelocity,
  shotQuality,
  NEEDLE_PERIOD,
  type ShotInput,
} from '../src/game/Shots';
import { PLAYER_LEVELS, playerLevelById, surfaceById } from '../src/state/modes';

const noInput: ShotInput = { moveX: 0, power: false, drop: false, slice: false, lift: false };
const rngMid = () => 0.5;

describe('classifyShot', () => {
  it('sin teclas es drive; W potencia; S dejada; Q cortado; E liftado; W+E globo', () => {
    expect(classifyShot(1.1, noInput, false)).toBe('drive');
    expect(classifyShot(1.1, { ...noInput, power: true }, false)).toBe('power-drive');
    expect(classifyShot(1.1, { ...noInput, drop: true }, false)).toBe('drop');
    expect(classifyShot(1.1, { ...noInput, slice: true }, false)).toBe('slice');
    expect(classifyShot(1.1, { ...noInput, lift: true }, false)).toBe('topspin');
    expect(classifyShot(1.1, { ...noInput, power: true, lift: true }, false)).toBe('lob');
  });

  it('bola alta + W es smash, y con el medidor lleno es super-smash', () => {
    const power: ShotInput = { ...noInput, power: true };
    expect(classifyShot(2.2, power, false)).toBe('smash');
    expect(classifyShot(2.2, power, true)).toBe('super-smash');
    // Alta pero sin potencia: no hay smash.
    expect(classifyShot(2.2, noInput, true)).toBe('drive');
    // Con potencia pero baja: drive potente, no smash.
    expect(classifyShot(1.4, power, true)).toBe('power-drive');
  });
});

describe('shotQuality', () => {
  it('vale 1 a distancia 0 sin jitter y nunca baja del suelo del nivel', () => {
    const pro = playerLevelById(2);
    expect(shotQuality(0, pro, () => 0)).toBe(1);
    for (const level of PLAYER_LEVELS) {
      const q = shotQuality(3.5, level, () => 0);
      expect(q).toBeGreaterThanOrEqual(level.qualityFloor);
      expect(q).toBeLessThanOrEqual(level.qualityFloor + 0.02);
    }
  });

  it('decrece con la distancia y está siempre en [floor, 1]', () => {
    const aficionado = playerLevelById(1);
    const near = shotQuality(0.4, aficionado, rngMid);
    const far = shotQuality(1.6, aficionado, rngMid);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(aficionado.qualityFloor);
    expect(near).toBeLessThanOrEqual(1);
  });
});

describe('canHitBall', () => {
  const player = vec3(0, 0, -5);
  it('acepta una bola a 1 m y 1,1 m de alto y rechaza lo inalcanzable', () => {
    expect(canHitBall(vec3(0.8, 1.1, -4.4), player)).toBe(true);
    expect(canHitBall(vec3(2.6, 1.1, -4.4), player)).toBe(false);
    expect(canHitBall(vec3(0.5, 2.6, -4.6), player)).toBe(false);
    expect(canHitBall(vec3(0.5, 0.05, -4.6), player)).toBe(false);
    // Bola ya al otro lado de la red: no se alcanza.
    expect(canHitBall(vec3(0.2, 1.1, 0.5), vec3(0, 0, -0.6))).toBe(false);
    // El bonus de alcance de las palas caras sí cuenta.
    expect(canHitBall(vec3(1.82, 1.1, -5), player, 0.12)).toBe(true);
    expect(canHitBall(vec3(1.82, 1.1, -5), player, 0)).toBe(false);
  });
});

describe('computeShot', () => {
  const ballPos = vec3(-1, 1.2, -3);
  it('la dejada es mucho más lenta que el drive y el globo vuela más tiempo', () => {
    const drive = computeShot({ ballPos, kind: 'drive', dirX: 0, quality: 1, rng: rngMid });
    const drop = computeShot({ ballPos, kind: 'drop', dirX: 0, quality: 1, rng: rngMid });
    const driveSpeed = Math.hypot(drive.velocity.x, drive.velocity.y, drive.velocity.z);
    const dropSpeed = Math.hypot(drop.velocity.x, drop.velocity.y, drop.velocity.z);
    expect(dropSpeed).toBeLessThan(driveSpeed * 0.55);
    expect(drop.target.z).toBeLessThan(2.5);
    expect(drive.target.z).toBeGreaterThan(6.5);
  });

  it('el cortado lleva spin negativo y el liftado positivo', () => {
    const slice = computeShot({ ballPos, kind: 'slice', dirX: 0, quality: 1, rng: rngMid });
    const top = computeShot({ ballPos, kind: 'topspin', dirX: 0, quality: 1, rng: rngMid });
    expect(slice.spinTop).toBeLessThan(0);
    expect(top.spinTop).toBeGreaterThan(0);
  });

  it('el smash baja y el super-smash roza el tope de velocidad', () => {
    const high = vec3(0, 2.3, -2);
    const smash = computeShot({ ballPos: high, kind: 'smash', dirX: 0, quality: 1, rng: rngMid });
    expect(smash.velocity.y).toBeLessThan(0);
    expect(Math.hypot(smash.velocity.x, smash.velocity.y, smash.velocity.z)).toBeGreaterThan(21);
    const sup = computeShot({ ballPos: high, kind: 'super-smash', dirX: 0, quality: 1, rng: rngMid });
    const supSpeed = Math.hypot(sup.velocity.x, sup.velocity.y, sup.velocity.z);
    expect(supSpeed).toBeGreaterThan(31);
    expect(supSpeed).toBeLessThanOrEqual(34.5);
  });
});

describe('aguja de saque', () => {
  it('oscila 0→1→0 con el periodo y las zonas se reparten como dice la SPEC', () => {
    expect(needleAt(0)).toBe(0);
    expect(needleAt(NEEDLE_PERIOD / 2)).toBe(1);
    expect(needleAt(NEEDLE_PERIOD)).toBeCloseTo(0, 6);
    expect(needleZone(0.5)).toBe('perfect');
    expect(needleZone(0.57)).toBe('perfect');
    expect(needleZone(0.62)).toBe('good');
    expect(needleZone(0.76)).toBe('weak');
    expect(needleZone(0.93)).toBe('fault');
    expect(needleZone(0.04)).toBe('fault');
  });

  it('el cuadro es diagonal al sacador', () => {
    expect(serveBoxFor(1)).toEqual({ minX: -5, maxX: 0, minZ: 0, maxZ: 6.95 });
    expect(serveBoxFor(-1)).toEqual({ minX: 0, maxX: 5, minZ: 0, maxZ: 6.95 });
    expect(isInServeBox(vec3(-2.5, 0, 3.4), 1)).toBe(true);
    expect(isInServeBox(vec3(2.5, 0, 3.4), 1)).toBe(false);
    expect(isInServeBox(vec3(-2.5, 0, 8), 1)).toBe(false);
  });
});

describe('serveVelocity + simulación con Ball', () => {
  const AZUL = surfaceById(0);
  const STEP = 1 / 240;

  function simulateServe(needle: number, side: number, seconds = 3): { events: BallEvent[]; firstOppBounce?: { x: number; z: number } } {
    const serve = serveVelocity(needle, side);
    const ball = new Ball();
    ball.launch(serve.from, serve.velocity);
    const events: BallEvent[] = [];
    let firstOppBounce: { x: number; z: number } | undefined;
    for (let i = 0; i < seconds / STEP; i++) {
      const stepEvents = ball.step(STEP, AZUL);
      events.push(...stepEvents);
      const bounce = stepEvents.find((e) => e.type === 'bounce' && e.side === 'opp');
      if (bounce?.type === 'bounce' && !firstOppBounce) {
        firstOppBounce = { x: bounce.pos.x, z: bounce.pos.z };
      }
    }
    return { events, firstOppBounce };
  }

  it('en el punto dulce (0,5) no hay falta y la bola bota dentro del cuadro, en ambos lados', () => {
    for (const side of [1, -1]) {
      const serve = serveVelocity(0.5, side);
      expect(serve.zone).toBe('perfect');
      expect(serve.fault).toBeNull();
      const { firstOppBounce } = simulateServe(0.5, side);
      expect(firstOppBounce).toBeDefined();
      if (firstOppBounce) {
        expect(isInServeBox(vec3(firstOppBounce.x, 0, firstOppBounce.z), side)).toBe(true);
      }
    }
  });

  it('en zona buena y floja tampoco hay falta declarada', () => {
    expect(serveVelocity(0.62, 1).fault).toBeNull();
    expect(serveVelocity(0.76, 1).fault).toBeNull();
    const { firstOppBounce } = simulateServe(0.62, 1);
    expect(firstOppBounce).toBeDefined();
    if (firstOppBounce) expect(isInServeBox(vec3(firstOppBounce.x, 0, firstOppBounce.z), 1)).toBe(true);
  });

  it('aguja extrema a la izquierda: falta a la red, la bola no cruza', () => {
    const serve = serveVelocity(0.03, 1);
    expect(serve.zone).toBe('fault');
    expect(serve.fault).toBe('net');
    const { events, firstOppBounce } = simulateServe(0.03, 1);
    expect(events.some((e) => e.type === 'net')).toBe(true);
    expect(firstOppBounce).toBeUndefined();
    expect(serveContactPos(1).z).toBeLessThan(-6.9);
  });

  it('aguja extrema a la derecha: falta larga, el primer bote pasa la línea de saque', () => {
    const serve = serveVelocity(0.97, 1);
    expect(serve.zone).toBe('fault');
    expect(serve.fault).toBe('long');
    const { firstOppBounce } = simulateServe(0.97, 1);
    expect(firstOppBounce).toBeDefined();
    if (firstOppBounce) expect(firstOppBounce.z).toBeGreaterThan(6.95);
  });
});
