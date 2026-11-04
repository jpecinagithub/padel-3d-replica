import { describe, expect, it } from 'vitest';
import { MatchFlow, type MatchFlowConfig } from '../src/game/MatchFlow';

const cfg = (patch: Partial<MatchFlowConfig> = {}): MatchFlowConfig => ({
  doubles: false,
  gamesToWin: 6,
  opponentLevel: 1, // Medio: punto 8, juego 40, victoria 240
  modeId: 0,
  isCareerFinal: false,
  ...patch,
});

/** Gana un juego entero para `side` (4 puntos seguidos sin ventaja de por medio). */
function winGame(flow: MatchFlow, side: 0 | 1): void {
  for (let i = 0; i < 4; i++) flow.pointFor(side);
}

describe('MatchFlow — monedas por punto y juego (SPEC §5.5)', () => {
  it('un punto tuyo abona 4×(nivel+1); uno de la IA, nada', () => {
    const flow = new MatchFlow(cfg());
    expect(flow.pointFor(0).coinsDelta).toBe(8);
    expect(flow.pointFor(1).coinsDelta).toBe(0);
    expect(flow.coins.points).toBe(8);
    expect(flow.pointsWonByHuman).toBe(1);
  });

  it('el nivel del rival escala las fórmulas (Fácil ×1, Difícil ×3)', () => {
    const facil = new MatchFlow(cfg({ opponentLevel: 0 }));
    expect(facil.pointFor(0).coinsDelta).toBe(4);
    const dificil = new MatchFlow(cfg({ opponentLevel: 2 }));
    expect(dificil.pointFor(0).coinsDelta).toBe(12);
  });

  it('ganar un juego suma 20×(nivel+1) además de los puntos', () => {
    const flow = new MatchFlow(cfg());
    winGame(flow, 0);
    expect(flow.coins.points).toBe(32); // 4 puntos × 8
    expect(flow.coins.games).toBe(40);
    expect(flow.score.snapshot.games).toEqual([1, 0]);
  });
});

describe('MatchFlow — flujo Score: set a 6 y a 4', () => {
  it('set a 6: 6 juegos seguidos cierran el partido con victoria y su premio', () => {
    const flow = new MatchFlow(cfg());
    for (let g = 0; g < 6; g++) winGame(flow, 0);
    const summary = flow.summary;
    expect(summary).not.toBeNull();
    expect(summary?.winner).toBe('human');
    expect(summary?.games).toEqual([6, 0]);
    expect(summary?.champion).toBe(false); // partida rápida: sin bonus
    // 24 puntos × 8 + 6 juegos × 40 + victoria 240 = 672
    expect(summary?.coins).toEqual({ points: 192, games: 240, result: 240, bonus: 0, total: 672 });
    expect(summary?.pointsWonByHuman).toBe(24);
  });

  it('set a 4 (Torneo/Mundial): cierra con 4 juegos', () => {
    const flow = new MatchFlow(cfg({ gamesToWin: 4, modeId: 1 }));
    for (let g = 0; g < 4; g++) winGame(flow, 0);
    expect(flow.summary?.games).toEqual([4, 0]);
    expect(flow.summary?.winner).toBe('human');
  });

  it('la derrota abona las 40 fijas y ningún premio de victoria', () => {
    const flow = new MatchFlow(cfg());
    for (let g = 0; g < 6; g++) winGame(flow, 1);
    const summary = flow.summary;
    expect(summary?.winner).toBe('ai');
    expect(summary?.coins.result).toBe(40);
    expect(summary?.coins.points).toBe(0);
    expect(summary?.coins.total).toBe(40);
  });

  it('tras el fin, pointFor no sigue contando', () => {
    const flow = new MatchFlow(cfg());
    for (let g = 0; g < 6; g++) winGame(flow, 0);
    const total = flow.coins.total;
    expect(flow.pointFor(0).coinsDelta).toBe(0);
    expect(flow.coins.total).toBe(total);
  });
});

describe('MatchFlow — tiebreak y punto de oro', () => {
  it('a 6-6 se entra en tiebreak y el saque rota 1-2-2', () => {
    const flow = new MatchFlow(cfg());
    for (let g = 0; g < 6; g++) {
      winGame(flow, 0);
      winGame(flow, 1);
    }
    const snap = flow.score.snapshot;
    expect(snap.games).toEqual([6, 6]);
    expect(snap.tiebreak).toBe(true);
    // Patrón 1-2-2 del tiebreak: el primer sacador sirve 1 punto, el
    // siguiente sirve 2, y así sucesivamente (implementación de Score).
    const firstServer = flow.score.server;
    flow.pointFor(0);
    expect(flow.score.server).not.toBe(firstServer); // tras el 1.er punto cambia
    const secondServer = flow.score.server;
    flow.pointFor(1);
    expect(flow.score.server).toBe(secondServer); // sirve 2 seguidos
    flow.pointFor(0);
    expect(flow.score.server).toBe(firstServer); // y vuelve al primero
  });

  it('el tiebreak se gana a 7 con diferencia de 2 y cierra el partido', () => {
    const flow = new MatchFlow(cfg());
    for (let g = 0; g < 6; g++) {
      winGame(flow, 0);
      winGame(flow, 1);
    }
    for (let p = 0; p < 6; p++) {
      flow.pointFor(0);
      flow.pointFor(1);
    }
    expect(flow.finished).toBe(false); // 6-6 en el tiebreak
    flow.pointFor(0);
    expect(flow.finished).toBe(false); // 7-6 no basta
    flow.pointFor(0);
    expect(flow.finished).toBe(true);
    expect(flow.summary?.winner).toBe('human');
    expect(flow.summary?.tiebreakPlayed).toBe(true);
    expect(flow.summary?.games).toEqual([7, 6]);
  });

  it('punto de oro: en el juego decisivo, a 40-40 un solo punto cierra juego y partido', () => {
    const flow = new MatchFlow(cfg());
    for (let g = 0; g < 5; g++) winGame(flow, 0);
    for (let g = 0; g < 4; g++) winGame(flow, 1); // 5-4: el próximo juego tuyo decide
    // Juego decisivo a iguales: 3-3 en puntos.
    for (let p = 0; p < 3; p++) {
      flow.pointFor(0);
      flow.pointFor(1);
    }
    expect(flow.score.goldPoint).toBe(true);
    const award = flow.pointFor(0);
    expect(award.result.goldPoint).toBe(true);
    expect(award.result.gameWon).toBe(true);
    expect(award.result.matchWon).toBe(true);
    expect(flow.summary?.winner).toBe('human');
  });

  it('sin juego decisivo no hay punto de oro: a 40-40 manda la ventaja', () => {
    const flow = new MatchFlow(cfg());
    for (let p = 0; p < 3; p++) {
      flow.pointFor(0);
      flow.pointFor(1);
    }
    expect(flow.score.goldPoint).toBe(false);
    const award = flow.pointFor(0); // ventaja, no juego
    expect(award.result.gameWon).toBe(false);
    expect(flow.score.pointLabel(0)).toBe('Ventaja');
  });
});

describe('MatchFlow — bonus de campeón', () => {
  it('ganar la final del Torneo suma 200 y marca campeón', () => {
    const flow = new MatchFlow(cfg({ gamesToWin: 4, modeId: 1, isCareerFinal: true }));
    for (let g = 0; g < 4; g++) winGame(flow, 0);
    expect(flow.summary?.champion).toBe(true);
    expect(flow.summary?.coins.bonus).toBe(200);
  });

  it('ganar la final del Mundial suma 500', () => {
    const flow = new MatchFlow(cfg({ gamesToWin: 4, modeId: 2, isCareerFinal: true }));
    for (let g = 0; g < 4; g++) winGame(flow, 0);
    expect(flow.summary?.champion).toBe(true);
    expect(flow.summary?.coins.bonus).toBe(500);
  });

  it('ganar una ronda NO final no da bonus ni campeonato', () => {
    const flow = new MatchFlow(cfg({ gamesToWin: 4, modeId: 1, isCareerFinal: false }));
    for (let g = 0; g < 4; g++) winGame(flow, 0);
    expect(flow.summary?.champion).toBe(false);
    expect(flow.summary?.coins.bonus).toBe(0);
  });
});
