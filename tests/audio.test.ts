// Tests de la Fase 6: motor de audio sintetizado (game/Audio.ts).
//
// El motor cuenta DISPAROS LÓGICOS no silenciados; la capa de nodos se
// prueba con un AudioContext falso que registra lo programado. Ningún
// test afirma que algo «suene»: no hay salida de audio en este entorno.

import { describe, expect, it } from 'vitest';
import {
  GameAudio,
  MAX_VOICES,
  hitGain,
  impactGain,
  type SoundEvent,
} from '../src/game/Audio';

// ------------------------------------------------------------ contexto falso

function makeParam(initial = 0) {
  return {
    value: initial,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
  };
}

class FakeNode {
  onended: (() => void) | null = null;
  connect(): void {}
  disconnect(): void {}
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = makeParam(440);
  started = false;
  start(): void {
    this.started = true;
  }
  stop(): void {}
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = makeParam(1);
  started = false;
  start(): void {
    this.started = true;
  }
  stop(): void {}
}

class FakeGain extends FakeNode {
  gain = makeParam(1);
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = makeParam(350);
  Q = makeParam(1);
}

class FakeCompressor extends FakeNode {
  threshold = makeParam(-24);
  ratio = makeParam(12);
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  sources: FakeSource[] = [];

  createGain(): FakeGain {
    return new FakeGain();
  }
  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor();
  }
  createOscillator(): FakeOscillator {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createBuffer(_channels: number, length: number, _rate: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
  /** Simula el fin de todas las voces programadas. */
  endAll(): void {
    for (const node of [...this.oscillators, ...this.sources]) {
      node.onended?.();
    }
  }
}

function audioWithFake() {
  const fake = new FakeAudioContext();
  const audio = new GameAudio({
    createContext: () => fake as unknown as AudioContext,
  });
  return { audio, fake };
}

// ------------------------------------------------------------ disparos y contadores

describe('Audio — disparos lógicos y contadores', () => {
  it('cada tipo de evento incrementa su contador', () => {
    const { audio } = audioWithFake();
    const events: SoundEvent[] = [
      { kind: 'hit', power: 0.5 },
      { kind: 'serve', power: 0.8 },
      { kind: 'bounce', speed: 12 },
      { kind: 'glass', speed: 12 },
      { kind: 'mesh', speed: 12 },
      { kind: 'net' },
      { kind: 'applause' },
      { kind: 'ui' },
      { kind: 'coin' },
      { kind: 'win' },
      { kind: 'lose' },
      { kind: 'champion' },
    ];
    for (const event of events) expect(audio.dispatch(event)).toBe(true);
    const { counts } = audio.probe();
    for (const event of events) expect(counts[event.kind]).toBe(1);
    expect(counts.crowd).toBe(0);
  });

  it('el contexto se crea perezoso: «none» hasta el primer disparo o gesto', () => {
    const { audio } = audioWithFake();
    expect(audio.probe().ctxState).toBe('none');
    audio.unlock();
    expect(audio.probe().ctxState).toBe('running');
  });

  it('sin contexto disponible (modo lógico) los disparos se cuentan igual', () => {
    const audio = new GameAudio({ createContext: () => null });
    expect(audio.dispatch({ kind: 'bounce', speed: 9 })).toBe(true);
    expect(audio.probe().counts.bounce).toBe(1);
    expect(audio.probe().ctxState).toBe('none');
  });

  it('los golpes con spin programan nodos en la capa de audio', () => {
    const { audio, fake } = audioWithFake();
    audio.dispatch({ kind: 'hit', power: 0.9, spinTop: -16 }); // cortado
    audio.dispatch({ kind: 'hit', power: 0.9, spinTop: 21 }); // liftado
    audio.dispatch({ kind: 'glass', speed: 20 });
    expect(fake.oscillators.length).toBeGreaterThan(0);
    expect(fake.sources.length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------ mute

describe('Audio — mute estricto', () => {
  it('con mute activo ningún disparo se cuenta ni se programa', () => {
    const { audio, fake } = audioWithFake();
    audio.setMuted(true);
    expect(audio.dispatch({ kind: 'hit', power: 1 })).toBe(false);
    expect(audio.dispatch({ kind: 'win' })).toBe(false);
    expect(audio.startCrowd()).toBe(false);
    const probe = audio.probe();
    expect(probe.counts.hit).toBe(0);
    expect(probe.counts.win).toBe(0);
    expect(probe.counts.crowd).toBe(0);
    expect(probe.muted).toBe(true);
    expect(probe.crowdActive).toBe(false);
    expect(fake.oscillators.length).toBe(0);
    // Al desmutear, vuelve a contar.
    audio.setMuted(false);
    expect(audio.dispatch({ kind: 'hit', power: 1 })).toBe(true);
    expect(audio.probe().counts.hit).toBe(1);
  });

  it('mutear detiene la grada en curso', () => {
    const { audio } = audioWithFake();
    audio.startCrowd();
    expect(audio.probe().crowdActive).toBe(true);
    audio.setMuted(true);
    expect(audio.probe().crowdActive).toBe(false);
  });
});

// ------------------------------------------------------------ grada

describe('Audio — grada en bucle', () => {
  it('arranca una vez, cuenta un disparo y se detiene', () => {
    const { audio } = audioWithFake();
    expect(audio.startCrowd()).toBe(true);
    expect(audio.startCrowd()).toBe(true); // ya activa: no re-cuenta
    expect(audio.probe().counts.crowd).toBe(1);
    expect(audio.probe().crowdActive).toBe(true);
    audio.stopCrowd();
    expect(audio.probe().crowdActive).toBe(false);
  });
});

describe('Audio — grada con el contexto YA creado (Fase 8 · M1)', () => {
  it('startCrowd construye y arranca los nodos de verdad (no solo el flag)', () => {
    const { audio, fake } = audioWithFake();
    audio.unlock(); // el contexto nace ANTES de pedir la grada (el caso del fallo)
    expect(audio.probe().ctxState).toBe('running');
    expect(audio.probe().crowdNodesCreated).toBe(false);
    expect(audio.probe().crowdStarted).toBe(false);

    expect(audio.startCrowd()).toBe(true);
    const probe = audio.probe();
    expect(probe.crowdActive).toBe(true);
    expect(probe.crowdNodesCreated).toBe(true);
    expect(probe.crowdStarted).toBe(true);
    // Estructura real registrada por el contexto falso: la última
    // fuente creada es la de la grada (en bucle y arrancada) y el
    // último oscilador es su LFO (también arrancado).
    const crowdSource = fake.sources[fake.sources.length - 1];
    expect(crowdSource?.loop).toBe(true);
    expect(crowdSource?.started).toBe(true);
    const lfo = fake.oscillators[fake.oscillators.length - 1];
    expect(lfo?.started).toBe(true);
  });

  it('ciclo entrar a pista → mute → desmute → salir → reentrar', () => {
    const { audio } = audioWithFake();
    audio.unlock();
    audio.startCrowd();
    expect(audio.probe().crowdStarted).toBe(true);

    audio.setMuted(true); // mutear detiene la grada: los nodos dejan de existir
    expect(audio.probe().crowdNodesCreated).toBe(false);
    expect(audio.probe().crowdStarted).toBe(false);

    audio.setMuted(false);
    audio.startCrowd(); // la escena vuelve a pedirla al desmutear en pista
    expect(audio.probe().crowdNodesCreated).toBe(true);
    expect(audio.probe().crowdStarted).toBe(true);

    audio.stopCrowd(); // salir de la pista
    expect(audio.probe().crowdActive).toBe(false);
    expect(audio.probe().crowdStarted).toBe(false);

    audio.startCrowd(); // reentrar: se reconstruye y vuelve a arrancar
    expect(audio.probe().crowdStarted).toBe(true);
    expect(audio.probe().counts.crowd).toBe(3);
  });
});

// ------------------------------------------------------------ intensidad y voces

describe('Audio — intensidad por velocidad y límite de voces', () => {
  it('impactGain es monótona, con suelo 0,15 y techo 1', () => {
    expect(impactGain(0)).toBeCloseTo(0.15);
    expect(impactGain(5)).toBeLessThan(impactGain(15));
    expect(impactGain(15)).toBeLessThan(impactGain(30));
    expect(impactGain(34)).toBeCloseTo(1);
    expect(impactGain(120)).toBe(1);
    expect(impactGain(-4)).toBeCloseTo(0.15);
  });

  it('hitGain mapea la potencia 0..1 a 0,30..1', () => {
    expect(hitGain(0)).toBeCloseTo(0.3);
    expect(hitGain(1)).toBeCloseTo(1);
    expect(hitGain(2)).toBe(1);
  });

  it('las voces simultáneas nunca superan el máximo anti-saturación', () => {
    const { audio, fake } = audioWithFake();
    for (let i = 0; i < 40; i++) audio.dispatch({ kind: 'hit', power: 0.8 });
    expect(audio.probe().counts.hit).toBe(40); // el disparo lógico sí se cuenta
    expect(audio.probe().voices).toBe(MAX_VOICES); // la capa de nodos se limita
    fake.endAll();
    expect(audio.probe().voices).toBe(0);
  });
});
