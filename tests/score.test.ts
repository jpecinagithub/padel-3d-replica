import { describe, expect, it } from 'vitest';
import { Score, type Side } from '../src/game/Score';

/** Gana un juego completo para `side` (sin contar el tiebreak). */
function winGame(score: Score, side: Side): void {
  for (let i = 0; i < 30; i++) {
    if (score.pointFor(side).gameWon) return;
  }
  throw new Error('El juego no se resolvió en 30 puntos');
}

function winPoints(score: Score, side: Side, n: number): void {
  for (let i = 0; i < n; i++) score.pointFor(side);
}

describe('Score — puntos y etiquetas', () => {
  it('progresa 0 → 15 → 30 → 40', () => {
    const s = new Score();
    expect(s.pointLabel(0)).toBe('0');
    s.pointFor(0);
    expect(s.pointLabel(0)).toBe('15');
    s.pointFor(0);
    expect(s.pointLabel(0)).toBe('30');
    s.pointFor(0);
    expect(s.pointLabel(0)).toBe('40');
    expect(s.pointLabel(1)).toBe('0');
  });

  it('iguales y ventaja: el juego exige diferencia de 2 tras el 40-40', () => {
    const s = new Score();
    winPoints(s, 0, 3);
    winPoints(s, 1, 3);
    expect(s.pointLabel(0)).toBe('Iguales');
    expect(s.pointLabel(1)).toBe('Iguales');
    const adv = s.pointFor(0);
    expect(adv.gameWon).toBe(false);
    expect(s.pointLabel(0)).toBe('Ventaja');
    expect(s.pointLabel(1)).toBe('40');
    s.pointFor(1); // se pierde la ventaja
    expect(s.pointLabel(0)).toBe('Iguales');
    s.pointFor(0);
    const won = s.pointFor(0);
    expect(won.gameWon).toBe(true);
    expect(s.snapshot.games).toEqual([1, 0]);
    expect(s.snapshot.points).toEqual([0, 0]);
  });

  it('gana un juego con 4 puntos seguidos', () => {
    const s = new Score();
    winPoints(s, 1, 3);
    const last = s.pointFor(1);
    expect(last.gameWon).toBe(true);
    expect(s.snapshot.games).toEqual([0, 1]);
  });
});

describe('Score — partido', () => {
  it('gana el partido a 6 juegos con diferencia de 2', () => {
    const s = new Score({ gamesToWin: 6 });
    for (let g = 0; g < 5; g++) winGame(s, 0);
    expect(s.snapshot.finished).toBe(false);
    winGame(s, 0);
    expect(s.snapshot.finished).toBe(true);
    expect(s.snapshot.winner).toBe(0);
    expect(s.snapshot.games).toEqual([6, 0]);
  });

  it('gana el partido a 4 juegos (Torneo/Mundial)', () => {
    const s = new Score({ gamesToWin: 4 });
    for (let g = 0; g < 4; g++) winGame(s, 1);
    expect(s.snapshot.finished).toBe(true);
    expect(s.snapshot.winner).toBe(1);
  });

  it('a 5-5 no basta llegar a 6: hace falta diferencia de 2', () => {
    const s = new Score({ gamesToWin: 6 });
    for (let g = 0; g < 5; g++) { winGame(s, 0); winGame(s, 1); }
    expect(s.snapshot.games).toEqual([5, 5]);
    winGame(s, 0); // 6-5
    expect(s.snapshot.finished).toBe(false);
    winGame(s, 0); // 7-5
    expect(s.snapshot.finished).toBe(true);
    expect(s.snapshot.winner).toBe(0);
  });

  it('ignora puntos cuando el partido ya terminó', () => {
    const s = new Score({ gamesToWin: 4 });
    for (let g = 0; g < 4; g++) winGame(s, 0);
    const before = s.snapshot;
    const result = s.pointFor(1);
    expect(result).toEqual({ gameWon: false, matchWon: false, serverChanged: false, goldPoint: false });
    expect(s.snapshot.games).toEqual(before.games);
  });

  it('wouldWinMatch detecta la bola de partido y solo para quien la cierra', () => {
    const s = new Score({ gamesToWin: 6 });
    for (let g = 0; g < 5; g++) winGame(s, 0);
    winPoints(s, 0, 3); // 40-0 en el sexto juego
    expect(s.wouldWinMatch(0)).toBe(true);
    expect(s.wouldWinMatch(1)).toBe(false);
    // La simulación no muta el estado real:
    expect(s.snapshot.points).toEqual([3, 0]);
    expect(s.snapshot.finished).toBe(false);
  });
});

describe('Score — tiebreak', () => {
  function reachTiebreak(): Score {
    const s = new Score({ gamesToWin: 4 });
    for (let g = 0; g < 4; g++) { winGame(s, 0); winGame(s, 1); }
    return s;
  }

  it('a gamesToWin–gamesToWin se entra en tiebreak', () => {
    const s = reachTiebreak();
    expect(s.snapshot.games).toEqual([4, 4]);
    expect(s.snapshot.tiebreak).toBe(true);
    expect(s.snapshot.finished).toBe(false);
  });

  it('el tiebreak se gana a 7 con diferencia de 2 y decide el partido', () => {
    const s = reachTiebreak();
    // 5-5 en el tiebreak
    for (let i = 0; i < 5; i++) { s.pointFor(0); s.pointFor(1); }
    expect(s.pointLabel(0)).toBe('5');
    s.pointFor(0); // 6-5: no basta
    expect(s.snapshot.finished).toBe(false);
    const last = s.pointFor(0); // 7-5
    expect(last.gameWon).toBe(true);
    expect(last.matchWon).toBe(true);
    expect(s.snapshot.winner).toBe(0);
    expect(s.snapshot.games).toEqual([5, 4]);
  });

  it('en el tiebreak el saque sigue el patrón 1-2-2-2…', () => {
    const s = reachTiebreak();
    const first = s.snapshot.server;
    s.pointFor(0);
    const second = s.snapshot.server;
    expect(second).not.toBe(first); // tras 1 punto cambia
    s.pointFor(1);
    expect(s.snapshot.server).toBe(second); // se queda 2 puntos
    s.pointFor(0);
    expect(s.snapshot.server).toBe(first); // y vuelve
  });
});

describe('Score — punto de oro', () => {
  it('en el juego decisivo, a 40-40 un solo punto cierra juego y partido', () => {
    const s = new Score({ gamesToWin: 6 });
    for (let g = 0; g < 5; g++) winGame(s, 0); // 5-0
    for (let g = 0; g < 3; g++) winGame(s, 1); // 5-3
    winPoints(s, 0, 3);
    winPoints(s, 1, 3); // 40-40 en el juego que puede cerrar el partido
    expect(s.snapshot.goldPoint).toBe(true);
    expect(s.wouldWinMatch(0)).toBe(true);
    expect(s.wouldWinMatch(1)).toBe(false); // si lo gana el rival, gana el juego pero no el partido
    const result = s.pointFor(0);
    expect(result.goldPoint).toBe(true);
    expect(result.gameWon).toBe(true);
    expect(result.matchWon).toBe(true);
    expect(s.snapshot.winner).toBe(0);
  });

  it('lejos del final, a 40-40 NO hay punto de oro (manda la ventaja)', () => {
    const s = new Score({ gamesToWin: 6 });
    winPoints(s, 0, 3);
    winPoints(s, 1, 3);
    expect(s.snapshot.goldPoint).toBe(false);
    const result = s.pointFor(0);
    expect(result.gameWon).toBe(false);
    expect(s.pointLabel(0)).toBe('Ventaja');
  });
});

describe('Score — rotación de saque', () => {
  it('individuales: el saque alterna entre los dos lados (ciclo de 2)', () => {
    const s = new Score();
    expect(s.snapshot.server).toBe(0);
    expect(s.snapshot.serverSide).toBe(0);
    winGame(s, 0);
    expect(s.snapshot.server).toBe(1);
    expect(s.snapshot.serverSide).toBe(1);
    winGame(s, 1);
    expect(s.snapshot.server).toBe(0);
    // serverChanged se anuncia en el punto que cierra el juego
    winPoints(s, 0, 3);
    const closing = s.pointFor(0);
    expect(closing.gameWon).toBe(true);
    expect(closing.serverChanged).toBe(true);
  });

  it('dobles: el saque recorre el ciclo de 4 jugadores [0, 2, 1, 3]', () => {
    const s = new Score({ doubles: true, gamesToWin: 6 });
    const seen: number[] = [];
    const seenSides: number[] = [];
    for (let g = 0; g < 4; g++) {
      seen.push(s.snapshot.server);
      seenSides.push(s.snapshot.serverSide);
      winGame(s, 0);
    }
    expect(seen).toEqual([0, 2, 1, 3]);
    expect(seenSides).toEqual([0, 1, 0, 1]);
    expect(s.snapshot.server).toBe(0); // el ciclo vuelve a empezar
  });
});

describe('Score — reset', () => {
  it('reset(doubles, gamesToWin) deja el marcador a cero con la nueva config', () => {
    const s = new Score();
    winGame(s, 0);
    s.pointFor(1);
    s.reset(true, 4);
    const snap = s.snapshot;
    expect(snap.games).toEqual([0, 0]);
    expect(snap.points).toEqual([0, 0]);
    expect(snap.doubles).toBe(true);
    expect(snap.gamesToWin).toBe(4);
    expect(snap.finished).toBe(false);
    expect(snap.winner).toBeNull();
    expect(snap.server).toBe(0);
  });
});
