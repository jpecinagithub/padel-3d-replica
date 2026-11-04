// Carrera Torneo/Mundial (Fase 5, SPEC §5.1 y §4): lógica pura sobre el
// store. La estructura de rondas sale de state/modes.ts (la fijada por la
// SPEC, no una inventada aquí):
//
//   Torneo:  rondas [Semifinal, Final]           · set a 4 · bonus 200
//   Mundial: rondas [Cuartos, Semifinal, Final]  · set a 4 · bonus 500
//
// En ambos, el nivel efectivo del rival sube `levelRamp` (+1) por ronda
// (effectiveOpponentLevel, con tope en Difícil). En Mundial cada ronda se
// juega contra una selección de WORLD_TEAMS elegida de forma
// determinista por la ronda: índices (ronda × 3) mod 8 → Cuartos contra
// el equipo 0, Semifinal contra el 3 y Final contra el 6. Al ser función
// solo de la ronda, el rival es el mismo tras recargar la página.
//
// Reglas de carrera:
// - El `run` se crea al empezar a jugar un modo de carrera sin run
//   activo de ese modo (startCareerRun) y persiste en localStorage:
//   salir a mitad deja la ronda guardada y se puede continuar.
// - Ganar una ronda no final avanza el run; ganar la final lo limpia y
//   marca campeón; perder cualquier ronda lo limpia (fin de la carrera).

import {
  WORLD_TEAMS,
  effectiveOpponentLevel,
  modeById,
  type GameMode,
  type NationalTeam,
} from '../state/modes';
import type { GameStore, RunState, Settings } from '../state/store';
import type { MatchSummary } from './MatchFlow';

export interface CareerStatus {
  /** Hay carrera activa (modo Torneo/Mundial; con o sin run guardado). */
  active: boolean;
  mode: GameMode;
  /** Índice de ronda actual (0-based). */
  round: number;
  roundName: string;
  isFinal: boolean;
  /** Nivel efectivo del rival para esta ronda (índice 0/1/2). */
  opponentLevel: number;
  /** Selección rival en Mundial; null en el resto. */
  team: NationalTeam | null;
  gamesToWin: number;
  /** Hay un run guardado de este modo (carrera ya empezada). */
  hasSavedRun: boolean;
}

/** Selección rival de una ronda del Mundial (determinista, ver cabecera). */
export function worldTeamForRound(round: number): NationalTeam {
  const idx = ((round * 3) % WORLD_TEAMS.length + WORLD_TEAMS.length) % WORLD_TEAMS.length;
  return WORLD_TEAMS[idx] as NationalTeam;
}

/** Estado de carrera resuelto desde settings + run (puro). */
export function careerStatus(settings: Settings, run: RunState | null): CareerStatus {
  const mode = modeById(settings.mode);
  const saved = run !== null && run.mode === mode.id ? run : null;
  if (mode.id === 0 || mode.rounds.length === 0) {
    return {
      active: false,
      mode,
      round: 0,
      roundName: '',
      isFinal: true,
      opponentLevel: settings.opponentLevel,
      team: null,
      gamesToWin: mode.gamesToWin,
      hasSavedRun: false,
    };
  }
  const round = Math.min(saved ? saved.round : 0, mode.rounds.length - 1);
  const baseLevel =
    saved && typeof saved.baseLevel === 'number' ? (saved.baseLevel as number) : settings.opponentLevel;
  return {
    active: true,
    mode,
    round,
    roundName: mode.rounds[round] as string,
    isFinal: round === mode.rounds.length - 1,
    opponentLevel: effectiveOpponentLevel(baseLevel, mode, round),
    team: mode.id === 2 ? worldTeamForRound(round) : null,
    gamesToWin: mode.gamesToWin,
    hasSavedRun: saved !== null,
  };
}

/**
 * Crea el run del modo de carrera seleccionado si no hay uno guardado de
 * ese modo (fija el nivel base del rival: la rampa se aplica sobre él).
 * Devuelve el run vigente o null si el modo es Partida rápida.
 */
export function startCareerRun(store: GameStore): RunState | null {
  const { settings, run } = store.state;
  if (settings.mode === 0) return null;
  if (run && run.mode === settings.mode) return run;
  const created: RunState = { mode: settings.mode, round: 0, baseLevel: settings.opponentLevel };
  store.setRun(created);
  return created;
}

export interface SettleOutcome {
  /** La carrera avanzó de ronda con esta victoria. */
  advanced: boolean;
  /** El humano ha campeonado el modo con este partido. */
  champion: boolean;
  /** La carrera terminó (campeón o derrota): el run quedó limpio. */
  careerOver: boolean;
  /** Nombre de la siguiente ronda si advanced. */
  nextRoundName: string | null;
}

/**
 * Cierre de un partido (Fase 5): abona las monedas del resumen en el
 * wallet, actualiza stats (wins/losses, pointsWon y torneos/mundiales si
 * hay campeonato) y hace avanzar o terminar la carrera. Todo persiste
 * vía el store en el acto. Se llama UNA vez por partido terminado.
 */
export function settleMatch(store: GameStore, summary: MatchSummary): SettleOutcome {
  const stats = store.state.stats;
  store.addCoins(summary.coins.total);
  store.updateStats({
    wins: stats.wins + (summary.winner === 'human' ? 1 : 0),
    losses: stats.losses + (summary.winner === 'ai' ? 1 : 0),
    pointsWon: stats.pointsWon + summary.pointsWonByHuman,
    torneos: stats.torneos + (summary.champion && summary.modeId === 1 ? 1 : 0),
    mundiales: stats.mundiales + (summary.champion && summary.modeId === 2 ? 1 : 0),
  });

  const outcome: SettleOutcome = { advanced: false, champion: false, careerOver: false, nextRoundName: null };
  const run = store.state.run;
  if (!run || run.mode !== summary.modeId || summary.modeId === 0) return outcome;

  const mode = modeById(summary.modeId);
  if (summary.winner !== 'human') {
    // Derrota en una ronda: fin de la carrera.
    store.setRun(null);
    outcome.careerOver = true;
    return outcome;
  }
  if (summary.champion) {
    store.setRun(null);
    outcome.champion = true;
    outcome.careerOver = true;
    return outcome;
  }
  const nextRound = Math.min((run.round ?? 0) + 1, mode.rounds.length - 1);
  store.setRun({ ...run, round: nextRound });
  outcome.advanced = true;
  outcome.nextRoundName = mode.rounds[nextRound] ?? null;
  return outcome;
}
