// Datos de configuración del juego (REPLICA_SPEC §5.1).
// Parámetros de comportamiento observados en el original; la redacción,
// los nombres de tipos y la organización son propios de esta réplica.

export interface GameMode {
  id: number;
  name: string;
  /** Nombres de las rondas en orden; [] en partida rápida. */
  rounds: string[];
  /** Juegos necesarios (con diferencia de 2) para ganar el partido. */
  gamesToWin: number;
  /** Monedas extra al campeonar el modo. */
  championBonus: number;
  /** Subida del nivel efectivo del rival por ronda ganada. */
  levelRamp: number;
}

export const GAME_MODES: GameMode[] = [
  { id: 0, name: 'Partida rápida', rounds: [], gamesToWin: 6, championBonus: 0, levelRamp: 0 },
  { id: 1, name: 'Torneo', rounds: ['Semifinal', 'Final'], gamesToWin: 4, championBonus: 200, levelRamp: 1 },
  { id: 2, name: 'Mundial', rounds: ['Cuartos', 'Semifinal', 'Final'], gamesToWin: 4, championBonus: 500, levelRamp: 1 },
];

export interface PlayerLevel {
  id: number;
  name: string;
  speed: number;
  qualityFloor: number;
  jitter: number;
}

export const PLAYER_LEVELS: PlayerLevel[] = [
  { id: 0, name: 'Principiante', speed: 6.4, qualityFloor: 0.28, jitter: 1.4 },
  { id: 1, name: 'Aficionado', speed: 7.2, qualityFloor: 0.35, jitter: 0.5 },
  { id: 2, name: 'Profesional', speed: 7.9, qualityFloor: 0.45, jitter: 0 },
];

export interface AiLevel {
  id: number;
  name: string;
  aiSpeed: number;
  /** Segundos de reacción. */
  aiReaction: number;
  aiError: number;
  aiServeFault: number;
  aiWallError: number;
}

export const AI_LEVELS: AiLevel[] = [
  { id: 0, name: 'Fácil', aiSpeed: 5, aiReaction: 0.5, aiError: 0.24, aiServeFault: 0.14, aiWallError: 0.25 },
  { id: 1, name: 'Medio', aiSpeed: 6.1, aiReaction: 0.3, aiError: 0.12, aiServeFault: 0.07, aiWallError: 0.15 },
  { id: 2, name: 'Difícil', aiSpeed: 7, aiReaction: 0.16, aiError: 0.05, aiServeFault: 0.03, aiWallError: 0.07 },
];

export interface Surface {
  id: number;
  name: string;
  label: string;
  /** Multiplicador de bote. */
  bounce: number;
  /** Multiplicador de fricción. */
  friction: number;
  /** Multiplicador de rebote en pared/cristal. */
  wall: number;
  /** Colores propios de la réplica para representar la superficie. */
  courtColor: string;
  apronColor: string;
  lineColor: string;
}

export const SURFACES: Surface[] = [
  { id: 0, name: 'Azul', label: 'Estándar', bounce: 1, friction: 1, wall: 1, courtColor: '#1d4e9e', apronColor: '#14335f', lineColor: '#ffffff' },
  { id: 1, name: 'Verde', label: 'Rápida', bounce: 0.85, friction: 0.5, wall: 1.05, courtColor: '#1e7a46', apronColor: '#123f27', lineColor: '#ffffff' },
  { id: 2, name: 'Roja', label: 'Lenta · rebote alto', bounce: 1.22, friction: 1.7, wall: 0.9, courtColor: '#a33327', apronColor: '#5f1d16', lineColor: '#ffffff' },
  { id: 3, name: 'Negra Pro', label: 'Viva en paredes', bounce: 1.05, friction: 0.85, wall: 1.18, courtColor: '#23242c', apronColor: '#101116', lineColor: '#b6f09c' },
];

export interface Ambience {
  id: number;
  name: string;
  skyColor: string;
  fogNear: number;
  fogFar: number;
  exposure: number;
  stars: boolean;
}

export const AMBIENCES: Ambience[] = [
  { id: 0, name: 'Noche', skyColor: '#0a1020', fogNear: 38, fogFar: 95, exposure: 1.18, stars: true },
  { id: 1, name: 'Día', skyColor: '#7db4e6', fogNear: 60, fogFar: 160, exposure: 1.0, stars: false },
  { id: 2, name: 'Atardecer', skyColor: '#e8875a', fogNear: 45, fogFar: 120, exposure: 1.05, stars: false },
];

export const CAMERAS: { id: number; name: string }[] = [
  { id: 0, name: 'TV' },
  { id: 1, name: 'Jugador' },
  { id: 2, name: 'Libre' },
];

/** Selecciones del modo Mundial definidas por la réplica (SPEC §5.1: la réplica define las suyas). */
export interface NationalTeam {
  name: string;
  flag: string;
  shirtColor: string;
  capColor: string;
}

export const WORLD_TEAMS: NationalTeam[] = [
  { name: 'Argentina', flag: '🇦🇷', shirtColor: '#75aadb', capColor: '#ffffff' },
  { name: 'Brasil', flag: '🇧🇷', shirtColor: '#f7d117', capColor: '#009c3b' },
  { name: 'Italia', flag: '🇮🇹', shirtColor: '#2456a6', capColor: '#2456a6' },
  { name: 'Francia', flag: '🇫🇷', shirtColor: '#2a3f9e', capColor: '#e23b3b' },
  { name: 'Suecia', flag: '🇸🇪', shirtColor: '#fecd00', capColor: '#006aa7' },
  { name: 'Portugal', flag: '🇵🇹', shirtColor: '#a6192e', capColor: '#046a38' },
  { name: 'Chile', flag: '🇨🇱', shirtColor: '#d52b1e', capColor: '#0039a6' },
  { name: 'México', flag: '🇲🇽', shirtColor: '#006847', capColor: '#ffffff' },
];

function byId<T extends { id: number }>(list: T[], id: number, fallbackIndex = 0): T {
  return list.find((item) => item.id === id) ?? (list[fallbackIndex] as T);
}

export const modeById = (id: number): GameMode => byId(GAME_MODES, id, 0);
export const playerLevelById = (id: number): PlayerLevel => byId(PLAYER_LEVELS, id, 1);
export const aiLevelById = (id: number): AiLevel => byId(AI_LEVELS, id, 1);
export const surfaceById = (id: number): Surface => byId(SURFACES, id, 0);
export const ambienceById = (id: number): Ambience => byId(AMBIENCES, id, 0);
export const cameraName = (id: number): string => CAMERAS.find((c) => c.id === id)?.name ?? 'TV';

/** Nivel efectivo del rival en Torneo/Mundial: base + rampa por ronda (SPEC §5.1), con tope en el máximo. */
export function effectiveOpponentLevel(baseLevel: number, mode: GameMode, roundIndex: number): number {
  const max = AI_LEVELS.length - 1;
  return Math.min(max, baseLevel + mode.levelRamp * Math.max(0, roundIndex));
}
