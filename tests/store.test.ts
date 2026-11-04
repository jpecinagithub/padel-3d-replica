import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  GameStore,
  MUTED_KEY,
  RUN_KEY,
  SETTINGS_KEY,
  STATS_KEY,
  WALLET_KEY,
  type StorageLike,
} from '../src/state/store';
import { DEFAULT_EQUIPPED, freeItemIds } from '../src/state/catalog';

/** Almacenamiento en memoria para tests (sin DOM). */
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

describe('Store — valores por defecto (SPEC §4)', () => {
  it('sin nada guardado, todo son los defaults exactos', () => {
    const store = new GameStore(new MemoryStorage());
    expect(store.state.settings).toEqual({
      courtType: 0,
      playerLevel: 1,
      opponentLevel: 1,
      doubles: false,
      crowd: true,
      ambience: 0,
      camera: 0,
      mode: 0,
      replays: 0,
      assist: 0,
      playerCharacter: 0,
    });
    expect(store.state.wallet.coins).toBe(0);
    expect(store.state.wallet.owned).toEqual(expect.arrayContaining(freeItemIds()));
    expect(store.state.wallet.equipped).toEqual(DEFAULT_EQUIPPED);
    expect(store.state.stats).toEqual({ wins: 0, losses: 0, pointsWon: 0, torneos: 0, mundiales: 0 });
    expect(store.state.run).toBeNull();
    expect(store.state.muted).toBe(false);
  });

  it('DEFAULT_SETTINGS coincide con el objeto de la SPEC §4', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      courtType: 0, playerLevel: 1, opponentLevel: 1, doubles: false, crowd: true,
      ambience: 0, camera: 0, mode: 0, replays: 0, assist: 0, playerCharacter: 0,
    });
  });
});

describe('Store — persistencia de settings', () => {
  it('updateSettings guarda en localStorage y una instancia nueva lo recupera', () => {
    const storage = new MemoryStorage();
    const store = new GameStore(storage);
    store.updateSettings({ courtType: 2, opponentLevel: 2, doubles: true });
    const raw = JSON.parse(storage.getItem(SETTINGS_KEY) as string) as Record<string, unknown>;
    expect(raw.courtType).toBe(2);
    const reloaded = new GameStore(storage);
    expect(reloaded.state.settings.courtType).toBe(2);
    expect(reloaded.state.settings.opponentLevel).toBe(2);
    expect(reloaded.state.settings.doubles).toBe(true);
    expect(reloaded.state.settings.playerLevel).toBe(1); // el resto, defaults
  });

  it('un settings corrupto vuelve a los defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, '{esto no es json');
    expect(new GameStore(storage).state.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('un settings parcial se fusiona sobre los defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ambience: 2 }));
    const settings = new GameStore(storage).state.settings;
    expect(settings.ambience).toBe(2);
    expect(settings.courtType).toBe(0);
  });
});

describe('Store — stats', () => {
  it('un stats parcial se fusiona sobre los ceros', () => {
    const storage = new MemoryStorage();
    storage.setItem(STATS_KEY, JSON.stringify({ wins: 3, torneos: 1 }));
    expect(new GameStore(storage).state.stats).toEqual({
      wins: 3, losses: 0, pointsWon: 0, torneos: 1, mundiales: 0,
    });
  });

  it('updateStats persiste', () => {
    const storage = new MemoryStorage();
    const store = new GameStore(storage);
    store.updateStats({ wins: 1, pointsWon: 57 });
    expect(new GameStore(storage).state.stats).toMatchObject({ wins: 1, pointsWon: 57 });
  });
});

describe('Store — run (carrera Torneo/Mundial)', () => {
  it('run con mode no numérico o ≤ 0 → null', () => {
    for (const bad of [{ mode: 0, round: 0 }, { mode: 'Torneo', round: 0 }, { round: 1 }, 'texto', 42]) {
      const storage = new MemoryStorage();
      storage.setItem(RUN_KEY, JSON.stringify(bad));
      expect(new GameStore(storage).state.run, JSON.stringify(bad)).toBeNull();
    }
  });

  it('run válido se carga y setRun persiste / limpia', () => {
    const storage = new MemoryStorage();
    storage.setItem(RUN_KEY, JSON.stringify({ mode: 1, round: 1 }));
    const store = new GameStore(storage);
    expect(store.state.run).toMatchObject({ mode: 1, round: 1 });
    store.setRun(null);
    expect(storage.getItem(RUN_KEY)).toBeNull();
    expect(new GameStore(storage).state.run).toBeNull();
    store.setRun({ mode: 2, round: 0 });
    expect(new GameStore(storage).state.run).toMatchObject({ mode: 2, round: 0 });
  });
});

describe('Store — wallet', () => {
  it('una wallet corrupta vuelve a los defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(WALLET_KEY, '###basura###');
    const wallet = new GameStore(storage).state.wallet;
    expect(wallet.coins).toBe(0);
    expect(wallet.equipped).toEqual(DEFAULT_EQUIPPED);
    expect(wallet.owned).toEqual(expect.arrayContaining(freeItemIds()));
  });

  it('una wallet guardada con un equipado no poseído se sanea al cargar', () => {
    const storage = new MemoryStorage();
    storage.setItem(WALLET_KEY, JSON.stringify({
      coins: 25,
      owned: freeItemIds(),
      equipped: { ...DEFAULT_EQUIPPED, cap: 'cap-gold' },
    }));
    const wallet = new GameStore(storage).state.wallet;
    expect(wallet.coins).toBe(25);
    expect(wallet.equipped.cap).toBe('cap-match');
  });

  it('comprar y equipar desde el store persiste tras «recargar»', () => {
    const storage = new MemoryStorage();
    const store = new GameStore(storage);
    store.addCoins(500);
    const bought = store.buy('racket-carbon');
    expect(bought.ok).toBe(true);
    expect(store.equip('racket-carbon').ok).toBe(true);
    const reloaded = new GameStore(storage);
    expect(reloaded.state.wallet.coins).toBe(300);
    expect(reloaded.state.wallet.owned).toContain('racket-carbon');
    expect(reloaded.state.wallet.equipped.racket).toBe('racket-carbon');
  });
});

describe('Store — mute', () => {
  it('se guarda en game.muted como "1"/"0" y se recupera', () => {
    const storage = new MemoryStorage();
    const store = new GameStore(storage);
    store.setMuted(true);
    expect(storage.getItem(MUTED_KEY)).toBe('1');
    expect(new GameStore(storage).state.muted).toBe(true);
    store.setMuted(false);
    expect(storage.getItem(MUTED_KEY)).toBe('0');
    expect(new GameStore(storage).state.muted).toBe(false);
  });
});
