import { describe, expect, it } from 'vitest';
import {
  REPLAY_MAX_FRAMES,
  ReplayPlayer,
  ReplayRecorder,
  type ReplayFrame,
} from '../src/game/Replay';

/** Graba `seconds` segundos de una bola que avanza en z a 1 m/s. */
function recordFlight(recorder: ReplayRecorder, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    const t = i / 60;
    recorder.record(1 / 60, [0, 1, -5 + t], [[-1, -5], [1, 5]]);
  }
}

describe('Replay — grabación (buffer circular 8 s a 20 Hz)', () => {
  it('muestrea a 20 Hz: 2 s de juego ≈ 40 frames', () => {
    const recorder = new ReplayRecorder();
    recordFlight(recorder, 2);
    expect(recorder.frameCount).toBeGreaterThanOrEqual(38);
    expect(recorder.frameCount).toBeLessThanOrEqual(42);
    expect(recorder.duration).toBeGreaterThan(1.8);
  });

  it('el buffer es circular: nunca supera el máximo y descarta lo antiguo', () => {
    const recorder = new ReplayRecorder();
    recordFlight(recorder, 20);
    expect(recorder.frameCount).toBe(REPLAY_MAX_FRAMES);
    const frames = recorder.frames();
    // Lo grabado es el final del vuelo (z ya positiva), no el principio.
    expect((frames[0] as ReplayFrame).ball[2]).toBeGreaterThan(5);
  });

  it('clear() vacía el buffer (cada saque empieza una grabación nueva)', () => {
    const recorder = new ReplayRecorder();
    recordFlight(recorder, 1);
    recorder.clear();
    expect(recorder.frameCount).toBe(0);
    expect(recorder.duration).toBe(0);
  });
});

describe('Replay — reproducción a cámara lenta', () => {
  it('sin material suficiente no arranca', () => {
    const player = new ReplayPlayer();
    expect(player.start([])).toBe(false);
    const recorder = new ReplayRecorder();
    recorder.record(0.05, [0, 1, 0], [[0, 0]]);
    expect(player.start(recorder.frames())).toBe(false);
    expect(player.active).toBe(false);
  });

  it('sampleAt interpola entre frames', () => {
    const frames: ReplayFrame[] = [
      { t: 0, ball: [0, 1, 0], players: [[0, -5]] },
      { t: 1, ball: [2, 3, -4], players: [[2, -3]] },
    ];
    const player = new ReplayPlayer();
    expect(player.start(frames)).toBe(true);
    const mid = player.sampleAt(0.5);
    expect(mid?.ball).toEqual([1, 2, -2]);
    expect(mid?.players).toEqual([[1, -4]]);
  });

  it('update avanza a 0,5× y se desactiva al llegar al final', () => {
    const recorder = new ReplayRecorder();
    recordFlight(recorder, 2);
    const player = new ReplayPlayer();
    expect(player.start(recorder.frames())).toBe(true);
    const first = player.update(0.1); // 0,1 s reales = 0,05 s de grabación
    expect(first).not.toBeNull();
    expect(player.active).toBe(true);
    expect(player.progress).toBeLessThan(0.1);
    // Avanzar mucho más que la duración termina la reproducción.
    let frame = player.update(100);
    expect(frame).not.toBeNull();
    expect(player.active).toBe(false);
    frame = player.update(0.1);
    expect(frame).toBeNull();
  });

  it('stop() cancela la reproducción en curso', () => {
    const recorder = new ReplayRecorder();
    recordFlight(recorder, 1);
    const player = new ReplayPlayer();
    player.start(recorder.frames());
    player.stop();
    expect(player.active).toBe(false);
    expect(player.update(0.1)).toBeNull();
  });
});
