import { describe, expect, it } from 'vitest';
import {
  buyItem,
  championBonus,
  coinsForGame,
  coinsForPoint,
  coinsForWin,
  COINS_FOR_LOSS,
  defaultWallet,
  ensureFreeOwned,
  equipItem,
  ownsItem,
  sanitizeWallet,
  type Wallet,
} from '../src/state/economy';
import { DEFAULT_EQUIPPED, freeItemIds } from '../src/state/catalog';

describe('Economía — fórmulas de ganancias (SPEC §5.5)', () => {
  it('punto = 4×(nivelRival+1), juego = 20×(…), victoria = 120×(…)', () => {
    expect([0, 1, 2].map(coinsForPoint)).toEqual([4, 8, 12]);
    expect([0, 1, 2].map(coinsForGame)).toEqual([20, 40, 60]);
    expect([0, 1, 2].map(coinsForWin)).toEqual([120, 240, 360]);
  });

  it('derrota = 40 y bonus de campeón según modo: 0 / 200 / 500', () => {
    expect(COINS_FOR_LOSS).toBe(40);
    expect(championBonus(0)).toBe(0);
    expect(championBonus(1)).toBe(200);
    expect(championBonus(2)).toBe(500);
  });
});

describe('Economía — cartera por defecto y propiedad', () => {
  it('la cartera inicial tiene 0 monedas, todos los gratuitos y los equipados por defecto', () => {
    const wallet = defaultWallet();
    expect(wallet.coins).toBe(0);
    expect(wallet.owned).toEqual(expect.arrayContaining(freeItemIds()));
    expect(wallet.owned).toHaveLength(freeItemIds().length);
    expect(wallet.equipped).toEqual(DEFAULT_EQUIPPED);
  });

  it('los ítems de precio 0 son propiedad aunque no estén en owned', () => {
    const empty: Wallet = { coins: 0, owned: [], equipped: { ...DEFAULT_EQUIPPED } };
    expect(ownsItem(empty, 'skin-3')).toBe(true);
    expect(ownsItem(empty, 'racket-basic')).toBe(true);
    expect(ownsItem(empty, 'racket-carbon')).toBe(false);
    expect(ownsItem(empty, 'id-que-no-existe')).toBe(false);
  });

  it('ensureFreeOwned añade los gratuitos sin duplicar', () => {
    const once = ensureFreeOwned({ coins: 0, owned: [], equipped: { ...DEFAULT_EQUIPPED } });
    const twice = ensureFreeOwned(once);
    expect(twice.owned).toHaveLength(freeItemIds().length);
    expect(new Set(twice.owned).size).toBe(twice.owned.length);
  });
});

describe('Economía — comprar', () => {
  it('sin saldo, la compra falla y la cartera no cambia', () => {
    const wallet = defaultWallet();
    const result = buyItem(wallet, 'racket-carbon'); // cuesta 200
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-funds');
    expect(result.wallet).toBe(wallet);
  });

  it('con saldo, descuenta el precio y añade a owned sin mutar la original', () => {
    const wallet: Wallet = { ...defaultWallet(), coins: 500 };
    const result = buyItem(wallet, 'racket-carbon');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wallet.coins).toBe(300);
      expect(result.wallet.owned).toContain('racket-carbon');
    }
    expect(wallet.coins).toBe(500);
    expect(wallet.owned).not.toContain('racket-carbon');
  });

  it('no se puede comprar dos veces el mismo ítem', () => {
    const first = buyItem({ ...defaultWallet(), coins: 500 }, 'ball-orange');
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = buyItem(first.wallet, 'ball-orange');
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.reason).toBe('already-owned');
    }
  });

  it('comprar un ítem inexistente falla con unknown-item', () => {
    const result = buyItem({ ...defaultWallet(), coins: 9999 }, 'no-existe');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unknown-item');
  });
});

describe('Economía — equipar', () => {
  it('equipar algo no poseído falla con not-owned', () => {
    const result = equipItem(defaultWallet(), 'racket-fire');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-owned');
  });

  it('equipar algo poseído cambia solo su categoría', () => {
    const bought = buyItem({ ...defaultWallet(), coins: 700 }, 'racket-fire');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    const equipped = equipItem(bought.wallet, 'racket-fire');
    expect(equipped.ok).toBe(true);
    if (equipped.ok) {
      expect(equipped.wallet.equipped.racket).toBe('racket-fire');
      expect(equipped.wallet.equipped.ball).toBe('ball-yellow');
      expect(equipped.wallet.equipped.skin).toBe('skin-2');
    }
  });
});

describe('Economía — sanitizeWallet (carga desde disco, SPEC §4)', () => {
  it('un equipado no poseído vuelve al equipado por defecto de su categoría', () => {
    const dirty: Wallet = {
      coins: 10,
      owned: [...freeItemIds()],
      equipped: { ...DEFAULT_EQUIPPED, racket: 'racket-gold' }, // no poseída
    };
    const clean = sanitizeWallet(dirty);
    expect(clean.equipped.racket).toBe('racket-basic');
  });

  it('un equipado válido y poseído se conserva', () => {
    const owned: Wallet = {
      coins: 0,
      owned: [...freeItemIds(), 'racket-gold'],
      equipped: { ...DEFAULT_EQUIPPED, racket: 'racket-gold' },
    };
    expect(sanitizeWallet(owned).equipped.racket).toBe('racket-gold');
  });

  it('monedas negativas o no numéricas se dejan en 0', () => {
    const dirty = { coins: -50, owned: [], equipped: { ...DEFAULT_EQUIPPED } } as Wallet;
    expect(sanitizeWallet(dirty).coins).toBe(0);
  });
});
