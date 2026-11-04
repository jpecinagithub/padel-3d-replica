// Marcador de pádel/tenis como clase pura (REPLICA_SPEC §5.4).
// Sin dependencias de Three.js ni del DOM: solo reglas de puntuación.
//
// Reglas implementadas:
// - Puntos 0/15/30/40, con iguales y ventaja.
// - Juego: ≥4 puntos con diferencia ≥2.
// - Partido: `gamesToWin` juegos con diferencia ≥2.
// - A gamesToWin–gamesToWin se juega un tiebreak a 7 con diferencia de 2,
//   que cuenta como el juego decisivo.
// - Punto de oro: si un juego llega a iguales (40-40) y ganarlo daría el
//   partido a alguno de los dos lados, ese único punto decide el juego
//   (sin ventaja), como documenta la SPEC para el punto decisivo.
// - Saque: rota por juegos. Individuales: ciclo de 2 (un jugador por lado).
//   Dobles: ciclo de 4 con orden [local1, visitante1, local2, visitante2].
//   En el tiebreak el saque sigue el patrón 1-2-2-2… sobre ese mismo ciclo.

export type Side = 0 | 1;

export interface PointResult {
  gameWon: boolean;
  matchWon: boolean;
  serverChanged: boolean;
  /** True si el punto jugado era un punto de oro. */
  goldPoint: boolean;
}

export interface ScoreSnapshot {
  /** Puntos del juego en curso (en tiebreak, los puntos del tiebreak). */
  points: [number, number];
  games: [number, number];
  /** Jugador que saca: 0..1 en individuales, 0..3 en dobles. */
  server: number;
  /** Lado que saca (derivado del jugador). */
  serverSide: Side;
  tiebreak: boolean;
  goldPoint: boolean;
  finished: boolean;
  winner: Side | null;
  doubles: boolean;
  gamesToWin: number;
}

const POINT_LABELS = ['0', '15', '30', '40'] as const;

/** Jugadores por orden de saque. Lado 0 = jugadores 0 y 1; lado 1 = 2 y 3. */
const SINGLES_ROTATION = [0, 1];
const DOUBLES_ROTATION = [0, 2, 1, 3];

export class Score {
  private points: [number, number] = [0, 0];
  private tiebreakPoints: [number, number] = [0, 0];
  private games: [number, number] = [0, 0];
  private tiebreak = false;
  private finished = false;
  private winnerSide: Side | null = null;
  private serverIdx = 0;
  private tiebreakStartServerIdx = 0;
  private doubles: boolean;
  private gamesToWin: number;

  constructor(options: { doubles?: boolean; gamesToWin?: number } = {}) {
    this.doubles = options.doubles ?? false;
    this.gamesToWin = options.gamesToWin ?? 6;
  }

  reset(doubles: boolean, gamesToWin: number): void {
    this.doubles = doubles;
    this.gamesToWin = gamesToWin;
    this.points = [0, 0];
    this.tiebreakPoints = [0, 0];
    this.games = [0, 0];
    this.tiebreak = false;
    this.finished = false;
    this.winnerSide = null;
    this.serverIdx = 0;
    this.tiebreakStartServerIdx = 0;
  }

  private get rotation(): number[] {
    return this.doubles ? DOUBLES_ROTATION : SINGLES_ROTATION;
  }

  private sideOfPlayer(player: number): Side {
    if (!this.doubles) return player as Side;
    return player <= 1 ? 0 : 1;
  }

  get server(): number {
    if (this.tiebreak) {
      const played = this.tiebreakPoints[0] + this.tiebreakPoints[1];
      const idx = (this.tiebreakStartServerIdx + Math.floor((played + 1) / 2)) % this.rotation.length;
      return this.rotation[idx] as number;
    }
    return this.rotation[this.serverIdx % this.rotation.length] as number;
  }

  get serverSide(): Side {
    return this.sideOfPlayer(this.server);
  }

  /** ¿Ganar este juego daría el partido a `side`? */
  private gameWouldWinMatch(side: Side): boolean {
    const other = (1 - side) as Side;
    const gamesAfter = this.games[side] + 1;
    return gamesAfter >= this.gamesToWin && gamesAfter - this.games[other] >= 2;
  }

  /**
   * Hay punto de oro cuando el juego está en iguales (40-40) y ganarlo
   * decidiría el partido para alguno de los dos lados.
   */
  get goldPoint(): boolean {
    if (this.tiebreak || this.finished) return false;
    if (this.points[0] !== 3 || this.points[1] !== 3) return false;
    return this.gameWouldWinMatch(0) || this.gameWouldWinMatch(1);
  }

  /** Etiqueta de los puntos de un lado: '0'|'15'|'30'|'40'|'Iguales'|'Ventaja' o el número en tiebreak. */
  pointLabel(side: Side): string {
    if (this.tiebreak) return String(this.tiebreakPoints[side]);
    const mine = this.points[side] as number;
    const theirs = this.points[(1 - side) as Side] as number;
    if (mine >= 3 && theirs >= 3) {
      if (mine === theirs) return 'Iguales';
      if (mine === theirs + 1) return 'Ventaja';
      return '40';
    }
    return POINT_LABELS[Math.min(mine, 3)] as string;
  }

  /** ¿Ganar el siguiente punto daría el partido a `side`? (simula sin mutar). */
  wouldWinMatch(side: Side): boolean {
    if (this.finished) return false;
    const copy = this.clone();
    const result = copy.pointFor(side);
    return result.matchWon && copy.winnerSide === side;
  }

  private clone(): Score {
    const copy = new Score({ doubles: this.doubles, gamesToWin: this.gamesToWin });
    copy.points = [...this.points];
    copy.tiebreakPoints = [...this.tiebreakPoints];
    copy.games = [...this.games];
    copy.tiebreak = this.tiebreak;
    copy.finished = this.finished;
    copy.winnerSide = this.winnerSide;
    copy.serverIdx = this.serverIdx;
    copy.tiebreakStartServerIdx = this.tiebreakStartServerIdx;
    return copy;
  }

  /** Registra un punto para `side` y avanza juego/partido/saque si procede. */
  pointFor(side: Side): PointResult {
    if (this.finished) return { gameWon: false, matchWon: false, serverChanged: false, goldPoint: false };
    const serverBefore = this.server;
    const wasGoldPoint = this.goldPoint;
    let gameWon = false;
    let matchWon = false;

    if (this.tiebreak) {
      this.tiebreakPoints[side]++;
      const mine = this.tiebreakPoints[side] as number;
      const theirs = this.tiebreakPoints[(1 - side) as Side] as number;
      if (mine >= 7 && mine - theirs >= 2) {
        this.games[side]++;
        gameWon = true;
        matchWon = true;
        this.finished = true;
        this.winnerSide = side;
      }
    } else if (wasGoldPoint) {
      // Un solo punto decide el juego.
      gameWon = true;
      this.winGame(side);
      matchWon = this.finished;
    } else {
      this.points[side]++;
      const mine = this.points[side] as number;
      const theirs = this.points[(1 - side) as Side] as number;
      if (mine >= 4 && mine - theirs >= 2) {
        gameWon = true;
        this.winGame(side);
        matchWon = this.finished;
      }
    }

    return { gameWon, matchWon, serverChanged: this.server !== serverBefore, goldPoint: wasGoldPoint };
  }

  private winGame(side: Side): void {
    this.games[side]++;
    this.points = [0, 0];
    const other = (1 - side) as Side;
    if (this.games[side] >= this.gamesToWin && this.games[side] - this.games[other] >= 2) {
      this.finished = true;
      this.winnerSide = side;
      return;
    }
    // El siguiente en sacar es el siguiente del ciclo…
    this.serverIdx = (this.serverIdx + 1) % this.rotation.length;
    // …y si se llegó a gamesToWin–gamesToWin, ese juego es el tiebreak.
    if (this.games[0] === this.gamesToWin && this.games[1] === this.gamesToWin) {
      this.tiebreak = true;
      this.tiebreakPoints = [0, 0];
      this.tiebreakStartServerIdx = this.serverIdx;
    }
  }

  get snapshot(): ScoreSnapshot {
    return {
      points: this.tiebreak ? [...this.tiebreakPoints] : [...this.points],
      games: [...this.games],
      server: this.server,
      serverSide: this.serverSide,
      tiebreak: this.tiebreak,
      goldPoint: this.goldPoint,
      finished: this.finished,
      winner: this.winnerSide,
      doubles: this.doubles,
      gamesToWin: this.gamesToWin,
    };
  }
}
