// Repetición del último punto (Fase 5, SPEC §5.7: tecla V).
//
// Grabación: buffer circular de los últimos REPLAY_SECONDS segundos del
// rally, muestreados a REPLAY_HZ (8 s × 20 Hz = 160 frames). Cada frame
// guarda la posición de la bola y las posiciones en planta (x, z) de los
// jugadores en pista, en orden fijo. El buffer se vacía al preparar cada
// saque: la repetición es siempre la del último punto jugado.
//
// Reproducción: a cámara lenta (REPLAY_SPEED = 0,5×) con interpolación
// lineal entre frames. Módulo puro (sin Three ni DOM): Match.ts lo
// alimenta y consume; los tests lo ejercitan directamente.

export interface ReplayFrame {
  /** Instante de grabación (segundos de juego desde el inicio del buffer). */
  t: number;
  ball: [number, number, number];
  /** Posiciones [x, z] de los jugadores, en el orden fijado al grabar. */
  players: [number, number][];
}

export const REPLAY_HZ = 20;
export const REPLAY_SECONDS = 8;
export const REPLAY_MAX_FRAMES = REPLAY_HZ * REPLAY_SECONDS;
export const REPLAY_SPEED = 0.5;

const SAMPLE_DT = 1 / REPLAY_HZ;

export class ReplayRecorder {
  private buffer: ReplayFrame[] = [];
  private acc = 0;
  private clock = 0;

  clear(): void {
    this.buffer = [];
    this.acc = 0;
    this.clock = 0;
  }

  /**
   * Alimenta el grabador con el estado actual; solo muestrea cuando toca
   * (cada 1/REPLAY_HZ segundos). Si el buffer se llena, descarta lo más
   * antiguo (circular).
   */
  record(dt: number, ball: [number, number, number], players: [number, number][]): void {
    if (dt <= 0) return;
    this.clock += dt;
    this.acc += dt;
    if (this.acc < SAMPLE_DT) return;
    this.acc %= SAMPLE_DT;
    this.buffer.push({
      t: this.clock,
      ball: [ball[0], ball[1], ball[2]],
      players: players.map((p) => [p[0], p[1]] as [number, number]),
    });
    if (this.buffer.length > REPLAY_MAX_FRAMES) {
      this.buffer.splice(0, this.buffer.length - REPLAY_MAX_FRAMES);
    }
  }

  get frameCount(): number {
    return this.buffer.length;
  }

  /** Duración grabada (del primer al último frame), en segundos. */
  get duration(): number {
    if (this.buffer.length < 2) return 0;
    return (this.buffer[this.buffer.length - 1] as ReplayFrame).t - (this.buffer[0] as ReplayFrame).t;
  }

  /** Copia de los frames grabados (para entregarla al reproductor). */
  frames(): ReplayFrame[] {
    return this.buffer.map((f) => ({
      t: f.t,
      ball: [...f.ball] as [number, number, number],
      players: f.players.map((p) => [p[0], p[1]] as [number, number]),
    }));
  }
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export class ReplayPlayer {
  private frames: ReplayFrame[] = [];
  private playhead = 0;
  active = false;

  /** Arranca la reproducción; false si no hay material suficiente. */
  start(frames: ReplayFrame[]): boolean {
    if (frames.length < 2) return false;
    this.frames = frames;
    this.playhead = (frames[0] as ReplayFrame).t;
    this.active = true;
    return true;
  }

  stop(): void {
    this.active = false;
    this.frames = [];
    this.playhead = 0;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /** Progreso 0..1 sobre la duración grabada. */
  get progress(): number {
    if (this.frames.length < 2) return 0;
    const start = (this.frames[0] as ReplayFrame).t;
    const end = (this.frames[this.frames.length - 1] as ReplayFrame).t;
    if (end <= start) return 1;
    return Math.min(1, Math.max(0, (this.playhead - start) / (end - start)));
  }

  /** Frame interpolado en un instante de grabación dado (puro). */
  sampleAt(time: number): ReplayFrame | null {
    if (this.frames.length === 0) return null;
    const first = this.frames[0] as ReplayFrame;
    const last = this.frames[this.frames.length - 1] as ReplayFrame;
    if (time <= first.t) return first;
    if (time >= last.t) return last;
    let hi = 1;
    while (hi < this.frames.length && (this.frames[hi] as ReplayFrame).t < time) hi++;
    const b = this.frames[hi] as ReplayFrame;
    const a = this.frames[hi - 1] as ReplayFrame;
    const span = b.t - a.t;
    const k = span > 0 ? (time - a.t) / span : 0;
    const count = Math.min(a.players.length, b.players.length);
    const players: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const pa = a.players[i] as [number, number];
      const pb = b.players[i] as [number, number];
      players.push([lerp(pa[0], pb[0], k), lerp(pa[1], pb[1], k)]);
    }
    return {
      t: time,
      ball: [lerp(a.ball[0], b.ball[0], k), lerp(a.ball[1], b.ball[1], k), lerp(a.ball[2], b.ball[2], k)],
      players,
    };
  }

  /**
   * Avanza la reproducción dt segundos (a REPLAY_SPEED) y devuelve el
   * frame a mostrar; al llegar al final se desactiva y devuelve el
   * último frame una vez.
   */
  update(dt: number): ReplayFrame | null {
    if (!this.active || this.frames.length < 2) return null;
    this.playhead += dt * REPLAY_SPEED;
    const last = this.frames[this.frames.length - 1] as ReplayFrame;
    if (this.playhead >= last.t) {
      const frame = this.sampleAt(last.t);
      this.active = false;
      return frame;
    }
    return this.sampleAt(this.playhead);
  }
}
