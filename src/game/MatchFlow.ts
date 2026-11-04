// Flujo de un partido COMPLETO (Fase 5): envuelve la clase pura Score
// (Fase 1) y lleva la contabilidad de monedas del partido según las
// fórmulas de la SPEC §5.5, que ya vivían en state/economy.ts:
//
//   punto ganado por tu lado  = 4  × (nivelRival + 1)
//   juego ganado por tu lado  = 20 × (nivelRival + 1)
//   victoria de partido       = 120 × (nivelRival + 1)
//   derrota                   = 40 fijas
//   bonus de campeón (Torneo 200 / Mundial 500) si se gana la ronda final
//
// Módulo puro, sin Three ni DOM: Match.ts lo consume en vivo y los tests
// lo ejercitan directamente. Las monedas NO se abonan aquí: se acumulan
// en el resumen del partido y la app las ingresa en el wallet al cerrar
// (una sola transacción, ver Career.settleMatch).

import {
  COINS_FOR_LOSS,
  championBonus,
  coinsForGame,
  coinsForPoint,
  coinsForWin,
} from '../state/economy';
import { Score, type PointResult, type Side } from './Score';

export interface MatchFlowConfig {
  doubles: boolean;
  /** Juegos para ganar el set (6 en Partida rápida, 4 en Torneo/Mundial). */
  gamesToWin: number;
  /** Nivel EFECTIVO del rival (índice 0/1/2, con rampa de carrera ya aplicada). */
  opponentLevel: number;
  /** Modo de juego: 0 rápida, 1 Torneo, 2 Mundial. */
  modeId: number;
  /** True si este partido es la ronda final de una carrera (o no hay carrera). */
  isCareerFinal: boolean;
}

export interface CoinsBreakdown {
  points: number;
  games: number;
  result: number;
  bonus: number;
  total: number;
}

export interface PointAward {
  result: PointResult;
  /** Monedas que suma este punto a la cuenta del partido (0 si lo gana la IA). */
  coinsDelta: number;
}

export interface MatchSummary {
  winner: 'human' | 'ai';
  winnerSide: Side;
  modeId: number;
  opponentLevel: number;
  /** Marcador final de juegos [tú, rival] (el tiebreak cuenta como juego). */
  games: [number, number];
  tiebreakPlayed: boolean;
  pointsWonByHuman: number;
  gamesWonByHuman: number;
  /** True si el humano campeona el modo (gana la final de Torneo/Mundial). */
  champion: boolean;
  coins: CoinsBreakdown;
}

export class MatchFlow {
  readonly score: Score;
  private cfg: MatchFlowConfig;
  private coinsPoints = 0;
  private coinsGames = 0;
  private coinsResult = 0;
  private coinsBonus = 0;
  private humanPoints = 0;
  private humanGames = 0;
  private tiebreakPlayed = false;
  private finalSummary: MatchSummary | null = null;

  constructor(cfg: MatchFlowConfig) {
    this.cfg = { ...cfg };
    this.score = new Score({ doubles: cfg.doubles, gamesToWin: cfg.gamesToWin });
  }

  reset(cfg: MatchFlowConfig): void {
    this.cfg = { ...cfg };
    this.score.reset(cfg.doubles, cfg.gamesToWin);
    this.coinsPoints = 0;
    this.coinsGames = 0;
    this.coinsResult = 0;
    this.coinsBonus = 0;
    this.humanPoints = 0;
    this.humanGames = 0;
    this.tiebreakPlayed = false;
    this.finalSummary = null;
  }

  get config(): MatchFlowConfig {
    return this.cfg;
  }

  /** Desglose de monedas ganadas hasta ahora en el partido. */
  get coins(): CoinsBreakdown {
    return {
      points: this.coinsPoints,
      games: this.coinsGames,
      result: this.coinsResult,
      bonus: this.coinsBonus,
      total: this.coinsPoints + this.coinsGames + this.coinsResult + this.coinsBonus,
    };
  }

  get pointsWonByHuman(): number {
    return this.humanPoints;
  }

  get finished(): boolean {
    return this.finalSummary !== null;
  }

  /** Resumen final (null mientras el partido sigue). */
  get summary(): MatchSummary | null {
    return this.finalSummary;
  }

  /**
   * Registra un punto para `side` (0 = tu equipo, 1 = la IA): avanza el
   * Score y abona en la cuenta del partido lo que corresponda.
   */
  pointFor(side: Side): PointAward {
    if (this.finalSummary) {
      return {
        result: { gameWon: false, matchWon: false, serverChanged: false, goldPoint: false },
        coinsDelta: 0,
      };
    }
    if (this.score.snapshot.tiebreak) this.tiebreakPlayed = true;
    const result = this.score.pointFor(side);
    let delta = 0;

    if (side === 0) {
      this.humanPoints += 1;
      const pointCoins = coinsForPoint(this.cfg.opponentLevel);
      this.coinsPoints += pointCoins;
      delta += pointCoins;
      if (result.gameWon) {
        this.humanGames += 1;
        const gameCoins = coinsForGame(this.cfg.opponentLevel);
        this.coinsGames += gameCoins;
        delta += gameCoins;
      }
    }

    if (result.matchWon) {
      const winner: 'human' | 'ai' = side === 0 ? 'human' : 'ai';
      let champion = false;
      if (winner === 'human') {
        this.coinsResult = coinsForWin(this.cfg.opponentLevel);
        delta += this.coinsResult;
        if (this.cfg.modeId > 0 && this.cfg.isCareerFinal) {
          champion = true;
          this.coinsBonus = championBonus(this.cfg.modeId);
          delta += this.coinsBonus;
        }
      } else {
        this.coinsResult = COINS_FOR_LOSS;
        delta += this.coinsResult;
      }
      const snap = this.score.snapshot;
      this.finalSummary = {
        winner,
        winnerSide: side,
        modeId: this.cfg.modeId,
        opponentLevel: this.cfg.opponentLevel,
        games: [snap.games[0], snap.games[1]],
        tiebreakPlayed: this.tiebreakPlayed || snap.tiebreak,
        pointsWonByHuman: this.humanPoints,
        gamesWonByHuman: this.humanGames,
        champion,
        coins: this.coins,
      };
    }

    return { result, coinsDelta: delta };
  }
}
