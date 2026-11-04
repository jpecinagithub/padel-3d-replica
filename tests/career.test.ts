import { describe, expect, it } from 'vitest';
import { careerStatus, settleMatch, startCareerRun, worldTeamForRound } from '../src/game/Career';
import type { MatchSummary } from '../src/game/MatchFlow';
import { GameStore, type StorageLike } from '../src/state/store';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const summary = (patch: Partial<MatchSummary> = {}): MatchSummary => ({
  winner: 'human',
  winnerSide: 0,
  modeId: 0,
  opponentLevel: 1,
  games: [6, 2],
  tiebreakPlayed: false,
  pointsWonByHuman: 30,
  gamesWonByHuman: 6,
  champion: false,
  coins: { points: 240, games: 240, result: 240, bonus: 0, total: 720 },
  ...patch,
});

describe('Career — estado resuelto (SPEC §5.1)', () => {
  it('Partida rápida: sin carrera, nivel del ajuste y set a 6', () => {
    const store = new GameStore(new MemoryStorage());
    const status = careerStatus(store.state.settings, store.state.run);
    expect(status.active).toBe(false);
    expect(status.opponentLevel).toBe(1);
    expect(status.gamesToWin).toBe(6);
  });

  it('Torneo sin run: ronda 0 = Semifinal, nivel base, set a 4', () => {
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 1, opponentLevel: 0 });
    const status = careerStatus(store.state.settings, store.state.run);
    expect(status.active).toBe(true);
    expect(status.round).toBe(0);
    expect(status.roundName).toBe('Semifinal');
    expect(status.isFinal).toBe(false);
    expect(status.opponentLevel).toBe(0);
    expect(status.gamesToWin).toBe(4);
    expect(status.hasSavedRun).toBe(false);
  });

  it('la rampa sube el nivel efectivo por ronda, con tope en Difícil', () => {
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 1, opponentLevel: 1 });
    store.setRun({ mode: 1, round: 1, baseLevel: 1 });
    const status = careerStatus(store.state.settings, store.state.run);
    expect(status.roundName).toBe('Final');
    expect(status.isFinal).toBe(true);
    expect(status.opponentLevel).toBe(2);
    expect(status.hasSavedRun).toBe(true);
  });

  it('un run de otro modo no cuenta para el modo seleccionado', () => {
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 2, opponentLevel: 1 });
    store.setRun({ mode: 1, round: 1, baseLevel: 1 });
    const status = careerStatus(store.state.settings, store.state.run);
    expect(status.round).toBe(0);
    expect(status.hasSavedRun).toBe(false);
  });

  it('Mundial: selección determinista por ronda', () => {
    expect(worldTeamForRound(0).name).toBe('Argentina');
    expect(worldTeamForRound(1).name).toBe('Francia');
    expect(worldTeamForRound(2).name).toBe('Chile');
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 2 });
    expect(careerStatus(store.state.settings, null).team?.name).toBe('Argentina');
  });
});

describe('Career — arranque y cierre de partidos', () => {
  it('startCareerRun crea el run con el nivel base y no lo recrea', () => {
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 1, opponentLevel: 2 });
    const run = startCareerRun(store);
    expect(run).toEqual({ mode: 1, round: 0, baseLevel: 2 });
    store.setRun({ mode: 1, round: 1, baseLevel: 2 });
    expect(startCareerRun(store)?.round).toBe(1); // ya había run: no se toca
  });

  it('partida rápida ganada: monedas al wallet y stats al día', () => {
    const store = new GameStore(new MemoryStorage());
    settleMatch(store, summary());
    expect(store.state.wallet.coins).toBe(720);
    expect(store.state.stats).toMatchObject({ wins: 1, losses: 0, pointsWon: 30 });
    expect(store.state.run).toBeNull();
  });

  it('Torneo: ganar la Semifinal avanza el run a la Final', () => {
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 1 });
    startCareerRun(store);
    const outcome = settleMatch(store, summary({ modeId: 1, games: [4, 1] }));
    expect(outcome.advanced).toBe(true);
    expect(outcome.nextRoundName).toBe('Final');
    expect(store.state.run).toMatchObject({ mode: 1, round: 1 });
  });

  it('Torneo: campeonar limpia el run y suma stats.torneos (bonus una sola vez)', () => {
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 1 });
    store.setRun({ mode: 1, round: 1, baseLevel: 1 });
    const champ = summary({
      modeId: 1,
      champion: true,
      coins: { points: 128, games: 160, result: 240, bonus: 200, total: 728 },
    });
    const outcome = settleMatch(store, champ);
    expect(outcome.champion).toBe(true);
    expect(store.state.run).toBeNull();
    expect(store.state.stats.torneos).toBe(1);
    expect(store.state.wallet.coins).toBe(728);
  });

  it('Mundial: campeonar suma stats.mundiales', () => {
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 2 });
    store.setRun({ mode: 2, round: 2, baseLevel: 1 });
    settleMatch(store, summary({ modeId: 2, champion: true }));
    expect(store.state.stats.mundiales).toBe(1);
    expect(store.state.run).toBeNull();
  });

  it('derrota en una ronda: fin de la carrera, run limpio y 40 monedas', () => {
    const store = new GameStore(new MemoryStorage());
    store.updateSettings({ mode: 1 });
    startCareerRun(store);
    const outcome = settleMatch(
      store,
      summary({
        modeId: 1,
        winner: 'ai',
        winnerSide: 1,
        pointsWonByHuman: 5,
        coins: { points: 40, games: 0, result: 40, bonus: 0, total: 80 },
      }),
    );
    expect(outcome.careerOver).toBe(true);
    expect(store.state.run).toBeNull();
    expect(store.state.stats.losses).toBe(1);
    expect(store.state.wallet.coins).toBe(80);
  });
});

describe('Career — persistencia tras «recarga» (nuevo store, mismo storage)', () => {
  it('wallet, stats y run sobreviven a recrear el store', () => {
    const storage = new MemoryStorage();
    const store = new GameStore(storage);
    store.updateSettings({ mode: 1 });
    startCareerRun(store);
    settleMatch(store, summary({ modeId: 1 }));

    const reloaded = new GameStore(storage);
    expect(reloaded.state.wallet.coins).toBe(720);
    expect(reloaded.state.stats.wins).toBe(1);
    expect(reloaded.state.stats.pointsWon).toBe(30);
    expect(reloaded.state.run).toMatchObject({ mode: 1, round: 1 });
    const status = careerStatus(reloaded.state.settings, reloaded.state.run);
    expect(status.roundName).toBe('Final');
    expect(status.hasSavedRun).toBe(true);
  });
});
