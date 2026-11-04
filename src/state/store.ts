// Estado global persistente (REPLICA_SPEC §4).
//
// Esquema de localStorage en paridad con el observado en el original:
//   game.padel.settings / game.padel.wallet / game.padel.stats / game.padel.run
//   game.muted  ("1"/"0", fuera del envoltorio JSON)
// Lectura tolerante a errores: cualquier JSON corrupto o parcial vuelve a los
// valores por defecto (o se fusiona sobre ellos, en el caso de stats).

import { buyItem, defaultWallet, equipItem, sanitizeWallet, type Wallet } from './economy';

export const SETTINGS_KEY = 'game.padel.settings';
export const WALLET_KEY = 'game.padel.wallet';
export const STATS_KEY = 'game.padel.stats';
export const RUN_KEY = 'game.padel.run';
export const MUTED_KEY = 'game.muted';

export interface Settings {
  courtType: number;
  playerLevel: number;
  opponentLevel: number;
  doubles: boolean;
  crowd: boolean;
  ambience: number;
  camera: number;
  mode: number;
  replays: number;
  assist: number;
  playerCharacter: number;
}

export const DEFAULT_SETTINGS: Settings = {
  courtType: 0,
  playerLevel: 1,
  opponentLevel: 1,
  doubles: false,
  crowd: true,
  ambience: 0,
  camera: 0,
  mode: 0,
  replays: 0,
  // Fase 8 (M4): las ayudas pasan a tener efecto real (guías visuales).
  // El original guarda assist:0 por defecto pero su menú mostraba
  // «Ayudas: sí» con los ajustes por defecto (análisis visual, Fase A)
  // y la semántica interna del valor no es observable en el bundle
  // ([DESC] en INFORME_REA): decisión propia documentada en
  // REGLAMENTO.md — por defecto «Sí» para no cambiar la experiencia
  // que la réplica ya tenía (aguja, mensajes y medidor visibles).
  assist: 1,
  playerCharacter: 0,
};

export interface Stats {
  wins: number;
  losses: number;
  pointsWon: number;
  torneos: number;
  mundiales: number;
}

export const DEFAULT_STATS: Stats = { wins: 0, losses: 0, pointsWon: 0, torneos: 0, mundiales: 0 };

export interface RunState {
  mode: number;
  round: number;
  [extra: string]: unknown;
}

/** Interfaz mínima de almacenamiento (compatible con localStorage y con stubs de test). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GameState {
  settings: Settings;
  wallet: Wallet;
  stats: Stats;
  run: RunState | null;
  muted: boolean;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readJSON(storage: StorageLike | null, key: string): unknown {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Saneamiento de persistidos (Fase 8 · C2): cada campo se valida por
 * tipo y rango; lo inválido cae al valor por defecto, nunca pasa «tal
 * cual» al estado. Antes settings se fusionaba sin validar, stats
 * aceptaba negativos/decimales y run aceptaba cualquier mode>0 y
 * cualquier round sin cota.
 */
function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

/** Settings completos saneados a partir de un objeto crudo (posiblemente corrupto). */
export function sanitizeSettings(raw: Record<string, unknown>): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    courtType: intInRange(raw.courtType, 0, 3, d.courtType),
    playerLevel: intInRange(raw.playerLevel, 0, 2, d.playerLevel),
    opponentLevel: intInRange(raw.opponentLevel, 0, 2, d.opponentLevel),
    doubles: boolOr(raw.doubles, d.doubles),
    crowd: boolOr(raw.crowd, d.crowd),
    ambience: intInRange(raw.ambience, 0, 2, d.ambience),
    camera: intInRange(raw.camera, 0, 2, d.camera),
    mode: intInRange(raw.mode, 0, 2, d.mode),
    replays: intInRange(raw.replays, 0, 1, d.replays),
    assist: intInRange(raw.assist, 0, 1, d.assist),
    playerCharacter: nonNegativeInt(raw.playerCharacter, d.playerCharacter),
  };
}

/** Parche de settings saneado: solo claves presentes y ya validadas. */
function sanitizeSettingsPatch(patch: Partial<Settings>): Partial<Settings> {
  const full = sanitizeSettings({ ...DEFAULT_SETTINGS, ...patch });
  const clean: Partial<Settings> = {};
  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    (clean as Record<string, unknown>)[key] = full[key];
  }
  return clean;
}

function loadSettings(storage: StorageLike | null): Settings {
  const raw = readJSON(storage, SETTINGS_KEY);
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };
  return sanitizeSettings(raw);
}

function loadWallet(storage: StorageLike | null): Wallet {
  const raw = readJSON(storage, WALLET_KEY);
  if (!isRecord(raw)) return defaultWallet();
  const coins = typeof raw.coins === 'number' ? raw.coins : 0;
  const owned = Array.isArray(raw.owned) ? raw.owned.filter((x): x is string => typeof x === 'string') : [];
  const equipped = isRecord(raw.equipped) ? (raw.equipped as Wallet['equipped']) : defaultWallet().equipped;
  return sanitizeWallet({ coins, owned, equipped });
}

function loadStats(storage: StorageLike | null): Stats {
  const raw = readJSON(storage, STATS_KEY);
  if (!isRecord(raw)) return { ...DEFAULT_STATS };
  // Fusión saneada sobre los ceros: enteros ≥ 0; lo demás cae a 0.
  const merged = { ...DEFAULT_STATS };
  for (const key of Object.keys(DEFAULT_STATS) as (keyof Stats)[]) {
    merged[key] = nonNegativeInt(raw[key], 0);
  }
  return merged;
}

function loadRun(storage: StorageLike | null): RunState | null {
  const raw = readJSON(storage, RUN_KEY);
  // Solo tienen carrera Torneo (1) y Mundial (2); cualquier otro mode
  // (o un round fuera de las rondas del modo) se descarta/sanea (C2).
  if (!isRecord(raw)) return null;
  if (raw.mode !== 1 && raw.mode !== 2) return null;
  const rounds = raw.mode === 1 ? 2 : 3; // rondas por modo (state/modes)
  const run: RunState = { mode: raw.mode, round: intInRange(raw.round, 0, rounds - 1, 0) };
  if (typeof raw.baseLevel === 'number' && Number.isFinite(raw.baseLevel)) {
    run.baseLevel = intInRange(raw.baseLevel, 0, 2, 0);
  }
  return run;
}

function loadMuted(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Store del juego: mantiene el estado en memoria, lo persiste tras cada
 * cambio y notifica a los suscriptores (pensado para useSyncExternalStore).
 */
export class GameStore {
  private storage: StorageLike | null;
  private listeners = new Set<() => void>();
  state: GameState;

  constructor(storage?: StorageLike | null) {
    this.storage = storage === undefined ? browserStorage() : storage;
    this.state = {
      settings: loadSettings(this.storage),
      wallet: loadWallet(this.storage),
      stats: loadStats(this.storage),
      run: loadRun(this.storage),
      muted: loadMuted(this.storage),
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameState => this.state;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private persist(key: string, value: unknown): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      // Almacenamiento no disponible (modo privado, cuota…): el juego sigue en memoria.
    }
  }

  updateSettings(patch: Partial<Settings>): void {
    this.state = { ...this.state, settings: { ...this.state.settings, ...sanitizeSettingsPatch(patch) } };
    this.persist(SETTINGS_KEY, this.state.settings);
    this.emit();
  }

  /** Sustituye la cartera (tras comprar/equipar con las funciones puras de economía). */
  setWallet(wallet: Wallet): void {
    this.state = { ...this.state, wallet };
    this.persist(WALLET_KEY, wallet);
    this.emit();
  }

  buy(itemId: string): ReturnType<typeof buyItem> {
    const result = buyItem(this.state.wallet, itemId);
    if (result.ok) this.setWallet(result.wallet);
    return result;
  }

  equip(itemId: string): ReturnType<typeof equipItem> {
    const result = equipItem(this.state.wallet, itemId);
    if (result.ok) this.setWallet(result.wallet);
    return result;
  }

  addCoins(amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    const coins = Math.max(0, Math.floor(this.state.wallet.coins + amount));
    this.setWallet({ ...this.state.wallet, coins });
  }

  updateStats(patch: Partial<Stats>): void {
    this.state = { ...this.state, stats: { ...this.state.stats, ...patch } };
    this.persist(STATS_KEY, this.state.stats);
    this.emit();
  }

  setRun(run: RunState | null): void {
    this.state = { ...this.state, run };
    // Fase 8 · M6: la notificación va SIEMPRE, también sin
    // almacenamiento (antes el `return` temprano la saltaba y la UI
    // no se enteraba de los cambios de carrera en ese modo).
    if (this.storage) {
      try {
        if (run === null) this.storage.removeItem(RUN_KEY);
        else this.storage.setItem(RUN_KEY, JSON.stringify(run));
      } catch {
        // Igual que persist(): sin almacenamiento, el estado vive en memoria.
      }
    }
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.state = { ...this.state, muted };
    if (this.storage) {
      try {
        this.storage.setItem(MUTED_KEY, muted ? '1' : '0');
      } catch {
        // Sin almacenamiento disponible: solo cambia en memoria.
      }
    }
    this.emit();
  }
}

/** Instancia compartida por la UI (en tests se crean instancias propias). */
export const gameStore = new GameStore();
