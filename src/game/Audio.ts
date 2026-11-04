// Audio sintetizado con WebAudio (Fase 6, REPLICA_SPEC §5.6/§8).
//
// El original reproduce 5 MP3 propios con un reproductor WebAudio hecho
// a mano. La réplica NO copia esos ficheros: todos los sonidos se
// SINTETIZAN aquí con osciladores, ruido filtrado y envolventes, sin
// librerías y sin assets (0 ficheros de sonido). Cada sonido es una
// receta corta y distinguible (ver `FASE6_INFORME.md` para el detalle).
//
// Semántica importante (también para los tests):
// - Los contadores (`counts`) cuentan DISPAROS LÓGICOS no silenciados:
//   un disparo = «el juego quiso sonar y el mute lo permitió». No
//   afirman que nadie oyera nada: en un navegador sin gesto previo el
//   AudioContext puede estar 'suspended' y no emitir sonido real. El
//   probe expone `ctxState` para decir la verdad sobre eso.
// - Con mute activo, `dispatch` no cuenta ni programa nada (cero
//   disparos «sonados»), el master baja a 0 y la grada se detiene.
// - El AudioContext se crea PEREZOSO: en el primer disparo o en el
//   primer gesto del usuario (`unlock()`), nunca en el constructor,
//   por la política de autoplay de los navegadores.
// - Anti-saturación: cadena master → compresor → destino y un máximo
//   de voces one-shot simultáneas (las que exceden se descartan en la
//   capa de nodos; el disparo lógico sí se cuenta).

/** Claves de sonido del probe (una por tipo de disparo lógico). */
export type AudioKind =
  | 'hit'
  | 'serve'
  | 'bounce'
  | 'glass'
  | 'mesh'
  | 'net'
  | 'applause'
  | 'crowd'
  | 'ui'
  | 'coin'
  | 'win'
  | 'lose'
  | 'champion';

export type AudioCounts = Record<AudioKind, number>;

export const AUDIO_KINDS: AudioKind[] = [
  'hit', 'serve', 'bounce', 'glass', 'mesh', 'net',
  'applause', 'crowd', 'ui', 'coin', 'win', 'lose', 'champion',
];

export function emptyCounts(): AudioCounts {
  return {
    hit: 0, serve: 0, bounce: 0, glass: 0, mesh: 0, net: 0,
    applause: 0, crowd: 0, ui: 0, coin: 0, win: 0, lose: 0, champion: 0,
  };
}

/** Evento de sonido que disparan los modos de juego y la UI. */
export type SoundEvent =
  | { kind: 'hit'; power: number; spinTop?: number }
  | { kind: 'serve'; power: number }
  | { kind: 'bounce'; speed: number }
  | { kind: 'glass'; speed: number }
  | { kind: 'mesh'; speed: number }
  | { kind: 'net' }
  | { kind: 'applause'; big?: boolean }
  | { kind: 'ui' }
  | { kind: 'coin' }
  | { kind: 'win' }
  | { kind: 'lose' }
  | { kind: 'champion' };

export interface AudioProbe {
  counts: AudioCounts;
  /** Estado real del AudioContext: 'none' si aún no se ha creado. */
  ctxState: string;
  muted: boolean;
  crowdActive: boolean;
  /**
   * Estado REAL de los nodos de grada (Fase 8 · M1): true solo si la
   * cadena de nodos existe de verdad en el grafo (no un flag lógico).
   */
  crowdNodesCreated: boolean;
  /** True si la fuente y el LFO de la grada recibieron start(). */
  crowdStarted: boolean;
  /** Voces one-shot sonando ahora mismo (capa de nodos). */
  voices: number;
}

/** Máximo de voces one-shot simultáneas en la capa de nodos. */
export const MAX_VOICES = 12;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Ganancia de un impacto según su velocidad (m/s): un bote a 30 m/s
 * suena mucho más que uno a 5. Pura y monótona, en [0,15, 1].
 */
export function impactGain(speed: number): number {
  return 0.15 + clamp01(Math.max(0, speed) / 34) * 0.85;
}

/** Ganancia de un golpe de pala según su potencia normalizada 0..1. */
export function hitGain(power: number): number {
  return 0.3 + clamp01(power) * 0.7;
}

interface AudioOptions {
  /** Fábrica del contexto (inyectable para tests); por defecto, el del navegador. */
  createContext?: () => AudioContext | null;
}

function defaultContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private counts: AudioCounts = emptyCounts();
  private muted = false;
  private voices = 0;
  private crowdNodes: { source: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  /** La fuente de la grada recibió start() de verdad (Fase 8 · M1). */
  private crowdStartedFlag = false;
  private readonly createContext: () => AudioContext | null;

  constructor(options: AudioOptions = {}) {
    this.createContext = options.createContext ?? defaultContext;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get crowdActive(): boolean {
    return this.crowdNodes !== null || this.crowdPending;
  }

  /** Crea el contexto si falta (perezoso) y lo reanuda si está suspendido. */
  private ensureCtx(): AudioContext | null {
    if (!this.ctx) {
      let created: AudioContext | null = null;
      try {
        created = this.createContext();
      } catch {
        created = null;
      }
      if (!created) return null;
      this.ctx = created;
      const compressor = created.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 8;
      compressor.connect(created.destination);
      this.master = created.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(compressor);
      // Buffer de ruido blanco reutilizable (2 s) para impactos, aplausos y grada.
      const length = created.sampleRate * 2;
      this.noiseBuffer = created.createBuffer(1, length, created.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      // Si la grada quedó marcada activa sin contexto, ahora sí puede sonar.
      if (this.crowdPending) this.buildCrowd();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  /** Primer gesto del usuario: desbloquea el audio (política de autoplay). */
  unlock(): void {
    this.ensureCtx();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted) {
      this.stopCrowd();
      if (this.ctx && this.master) {
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      }
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.02);
    }
  }

  probe(): AudioProbe {
    return {
      counts: { ...this.counts },
      ctxState: this.ctx ? this.ctx.state : 'none',
      muted: this.muted,
      crowdActive: this.crowdActive,
      crowdNodesCreated: this.crowdNodes !== null,
      crowdStarted: this.crowdStartedFlag,
      voices: this.voices,
    };
  }

  // ------------------------------------------------------------ grada

  private crowdPending = false;

  /**
   * Murmullo de grada en bucle (ruido muy suave filtrado, con vaivén
   * lento). Cuenta UN disparo 'crowd' por arranque efectivo. Devuelve
   * true si la grada queda activa.
   */
  startCrowd(): boolean {
    if (this.muted || this.crowdNodes || this.crowdPending) return this.crowdActive || this.crowdPending;
    this.counts.crowd += 1;
    this.crowdPending = true;
    this.ensureCtx();
    // Fase 8 · M1: con el contexto YA creado, ensureCtx() no vuelve a
    // pasar por la rama que construía la grada y los nodos nunca
    // nacían (el público figuraba «activo» sin sonar). Se construye
    // explícitamente aquí; buildCrowd es idempotente.
    this.buildCrowd();
    return true;
  }

  stopCrowd(): void {
    this.crowdPending = false;
    this.crowdStartedFlag = false;
    if (!this.ctx || !this.crowdNodes) {
      this.crowdNodes = null;
      return;
    }
    const { source, gain, lfo } = this.crowdNodes;
    this.crowdNodes = null;
    const t = this.ctx.currentTime;
    try {
      gain.gain.setTargetAtTime(0, t, 0.15);
      source.stop(t + 0.6);
      lfo.stop(t + 0.6);
    } catch {
      // Ya parado: nada que hacer.
    }
  }

  private buildCrowd(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.crowdNodes) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.022, ctx.currentTime, 0.8);
    // Vaivén lento del murmullo (±40 % en ~7 s).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.14;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.009;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    lfo.start();
    this.crowdNodes = { source, gain, lfo };
    this.crowdStartedFlag = true;
    // Los nodos existen de verdad: ya no es una intención pendiente.
    this.crowdPending = false;
  }

  // ------------------------------------------------------------ disparo

  /**
   * Dispara un sonido. Devuelve false si el mute lo bloqueó (ni se
   * cuenta ni se programa); true si el disparo lógico se registró.
   */
  dispatch(event: SoundEvent): boolean {
    if (this.muted) return false;
    const kind: AudioKind = event.kind;
    this.counts[kind] += 1;
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return true; // disparo lógico sin capa de nodos (p. ej. tests)
    switch (event.kind) {
      case 'hit':
        this.playHit(event.power, event.spinTop ?? 0, false);
        break;
      case 'serve':
        this.playHit(event.power, 0, true);
        break;
      case 'bounce':
        this.playBounce(event.speed);
        break;
      case 'glass':
        this.playGlass(event.speed);
        break;
      case 'mesh':
        this.playMesh(event.speed);
        break;
      case 'net':
        this.playNet();
        break;
      case 'applause':
        this.playApplause(event.big ?? false);
        break;
      case 'ui':
        this.playUi();
        break;
      case 'coin':
        this.playCoin();
        break;
      case 'win':
        this.playMelody([523.25, 659.25, 783.99, 1046.5], 0.09, 0.26, 'triangle', 0.16);
        break;
      case 'lose':
        this.playMelody([392, 329.63, 261.63], 0.16, 0.34, 'sine', 0.14);
        break;
      case 'champion':
        this.playMelody([523.25, 523.25, 523.25, 659.25, 783.99, 1046.5], 0.11, 0.4, 'square', 0.09);
        this.playApplause(true);
        break;
    }
    return true;
  }

  // ------------------------------------------------------------ voces

  /** Reserva una voz one-shot; false si estamos saturados. */
  private beginVoice(): boolean {
    if (this.voices >= MAX_VOICES) return false;
    this.voices += 1;
    return true;
  }

  private endVoice(): void {
    this.voices = Math.max(0, this.voices - 1);
  }

  /** Oscilador con envolvente exponencial simple. */
  private tone(options: {
    type: OscillatorType;
    from: number;
    to?: number;
    at: number;
    duration: number;
    gain: number;
  }): void {
    if (!this.ctx || !this.master || !this.beginVoice()) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + options.at;
    const osc = ctx.createOscillator();
    osc.type = options.type;
    osc.frequency.setValueAtTime(Math.max(20, options.from), t0);
    if (options.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), t0 + options.duration);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(options.gain, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + options.duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.onended = () => this.endVoice();
    osc.start(t0);
    osc.stop(t0 + options.duration + 0.05);
  }

  /** Ráfaga de ruido filtrado con envolvente. */
  private noise(options: {
    type: BiquadFilterType;
    from: number;
    to?: number;
    q?: number;
    at: number;
    duration: number;
    gain: number;
  }): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || !this.beginVoice()) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + options.at;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = options.type;
    filter.frequency.setValueAtTime(options.from, t0);
    if (options.to !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, options.to), t0 + options.duration);
    }
    filter.Q.value = options.q ?? 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(options.gain, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + options.duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.onended = () => this.endVoice();
    source.start(t0, Math.random() * 1.2);
    source.stop(t0 + options.duration + 0.05);
  }

  // ------------------------------------------------------------ recetas

  /** Golpe de pala: cuerpo grave + chasquido; el spin cambia el matiz. */
  private playHit(power: number, spinTop: number, isServe: boolean): void {
    const g = hitGain(power) * (isServe ? 1 : 0.9);
    // Cuerpo: seno que cae de 160 a 65 Hz.
    this.tone({ type: 'sine', from: 160 + power * 60, to: 62, at: 0, duration: 0.11, gain: g * 0.75 });
    if (spinTop < -6) {
      // Cortado: ruido más largo y agudo, como un raspado.
      this.noise({ type: 'bandpass', from: 2100, q: 1.4, at: 0, duration: 0.17, gain: g * 0.5 });
    } else if (spinTop > 6) {
      // Liftado: barrido ascendente corto.
      this.noise({ type: 'bandpass', from: 500, to: 1500, q: 1.2, at: 0, duration: 0.12, gain: g * 0.45 });
    } else {
      this.noise({ type: 'bandpass', from: 750 + power * 950, q: 1, at: 0, duration: 0.07, gain: g * 0.55 });
    }
    if (isServe) {
      // Whoosh del saque tras el impacto.
      this.noise({ type: 'bandpass', from: 380, to: 1700, q: 1.6, at: 0.03, duration: 0.2, gain: g * 0.3 });
    }
  }

  /** Bote en el suelo: «thock» corto, intensidad por velocidad de impacto. */
  private playBounce(speed: number): void {
    const g = impactGain(speed);
    this.tone({ type: 'triangle', from: 195, to: 82, at: 0, duration: 0.07, gain: g * 0.5 });
    this.noise({ type: 'lowpass', from: 900, at: 0, duration: 0.035, gain: g * 0.22 });
  }

  /** Cristal: «tink» agudo con resonancia y decaimiento largo. */
  private playGlass(speed: number): void {
    const g = impactGain(speed) * 0.8;
    this.tone({ type: 'sine', from: 2350, at: 0, duration: 0.38, gain: g * 0.4 });
    this.tone({ type: 'sine', from: 3540, at: 0, duration: 0.22, gain: g * 0.18 });
    this.noise({ type: 'highpass', from: 3200, at: 0, duration: 0.03, gain: g * 0.2 });
  }

  /** Malla: golpe sordo y amortiguado, sin resonancia. */
  private playMesh(speed: number): void {
    const g = impactGain(speed) * 0.75;
    this.noise({ type: 'lowpass', from: 340, at: 0, duration: 0.1, gain: g * 0.6 });
    this.tone({ type: 'sine', from: 118, to: 70, at: 0, duration: 0.09, gain: g * 0.3 });
  }

  /** Red / netcord: zumbido breve de la cinta y la malla de la red. */
  private playNet(): void {
    this.tone({ type: 'square', from: 84, to: 76, at: 0, duration: 0.15, gain: 0.08 });
    this.noise({ type: 'bandpass', from: 620, q: 2, at: 0, duration: 0.09, gain: 0.1 });
  }

  /** Aplausos: ráfaga de palmadas (ruido moldeado) durante 0,9–1,9 s. */
  private playApplause(big: boolean): void {
    const claps = big ? 30 : 16;
    const span = big ? 1.8 : 0.9;
    for (let i = 0; i < claps; i++) {
      const at = Math.random() * span;
      this.noise({
        type: 'bandpass',
        from: 1100 + Math.random() * 900,
        q: 1.1,
        at,
        duration: 0.055,
        gain: 0.1 + Math.random() * 0.1,
      });
    }
  }

  /** Clic de UI. */
  private playUi(): void {
    this.tone({ type: 'square', from: 1150, at: 0, duration: 0.035, gain: 0.05 });
  }

  /** Moneda abonada: dos notas agudas ascendentes. */
  private playCoin(): void {
    this.tone({ type: 'sine', from: 987.77, at: 0, duration: 0.09, gain: 0.14 });
    this.tone({ type: 'sine', from: 1318.51, at: 0.07, duration: 0.3, gain: 0.14 });
  }

  /** Melodía corta nota a nota (victoria, derrota, fanfarria). */
  private playMelody(
    notes: number[],
    step: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void {
    notes.forEach((freq, i) => {
      this.tone({ type, from: freq, at: i * step, duration, gain });
    });
  }

  /** Cierre: detiene la grada y suelta el contexto. */
  dispose(): void {
    this.stopCrowd();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
    }
  }
}
