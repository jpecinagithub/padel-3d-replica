// Economía del juego (REPLICA_SPEC §5.5): funciones puras sobre la cartera.
// No tocan localStorage ni el store: reciben una Wallet y devuelven otra,
// para poder testearlas sin DOM ni navegador.

import { DEFAULT_EQUIPPED, freeItemIds, itemById, type Category } from './catalog';
import { modeById } from './modes';

export interface Wallet {
  coins: number;
  owned: string[];
  equipped: Record<Category, string>;
}

export function defaultWallet(): Wallet {
  return {
    coins: 0,
    owned: freeItemIds(),
    equipped: { ...DEFAULT_EQUIPPED },
  };
}

// ---- Ganancias (fórmulas de la SPEC §5.5) ----

/** Monedas por punto ganado, según el nivel del rival (índice 0, 1 o 2). */
export const coinsForPoint = (opponentLevel: number): number => 4 * (opponentLevel + 1);
/** Monedas por juego ganado. */
export const coinsForGame = (opponentLevel: number): number => 20 * (opponentLevel + 1);
/** Monedas por victoria en el partido. */
export const coinsForWin = (opponentLevel: number): number => 120 * (opponentLevel + 1);
/** Monedas por derrota. */
export const COINS_FOR_LOSS = 40;

/** Bonus por campeonar un modo (Partida rápida 0, Torneo 200, Mundial 500). */
export const championBonus = (modeId: number): number => modeById(modeId).championBonus;

// ---- Propiedad, compra y equipación ----

/** Un ítem es propiedad si está en `owned` o es gratuito (los de precio 0 siempre se poseen). */
export function ownsItem(wallet: Wallet, itemId: string): boolean {
  const item = itemById(itemId);
  if (!item) return false;
  if (item.price === 0) return true;
  return wallet.owned.includes(itemId);
}

/** Garantiza que todos los ítems gratuitos figuren en `owned`, sin duplicar. */
export function ensureFreeOwned(wallet: Wallet): Wallet {
  const owned = [...wallet.owned];
  for (const id of freeItemIds()) {
    if (!owned.includes(id)) owned.push(id);
  }
  return { ...wallet, owned };
}

export type BuyResult =
  | { ok: true; wallet: Wallet }
  | { ok: false; reason: 'unknown-item' | 'already-owned' | 'insufficient-funds'; wallet: Wallet };

/** Comprar: exige que el ítem exista, no ser ya propiedad y tener saldo. No muta la cartera recibida. */
export function buyItem(wallet: Wallet, itemId: string): BuyResult {
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: 'unknown-item', wallet };
  if (ownsItem(wallet, itemId)) return { ok: false, reason: 'already-owned', wallet };
  if (wallet.coins < item.price) return { ok: false, reason: 'insufficient-funds', wallet };
  return {
    ok: true,
    wallet: { ...wallet, coins: wallet.coins - item.price, owned: [...wallet.owned, itemId] },
  };
}

export type EquipResult =
  | { ok: true; wallet: Wallet }
  | { ok: false; reason: 'unknown-item' | 'not-owned'; wallet: Wallet };

/** Equipar: exige que el ítem exista y sea propiedad. No muta la cartera recibida. */
export function equipItem(wallet: Wallet, itemId: string): EquipResult {
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: 'unknown-item', wallet };
  if (!ownsItem(wallet, itemId)) return { ok: false, reason: 'not-owned', wallet };
  return { ok: true, wallet: { ...wallet, equipped: { ...wallet.equipped, [item.category]: itemId } } };
}

/**
 * Sanea una cartera cargada de disco (SPEC §4): garantiza los gratuitos en
 * `owned` y devuelve al equipado por defecto cualquier categoría cuyo ítem
 * falte o no sea propiedad.
 */
export function sanitizeWallet(wallet: Wallet): Wallet {
  const withFree = ensureFreeOwned(wallet);
  const equipped = { ...DEFAULT_EQUIPPED };
  for (const category of Object.keys(DEFAULT_EQUIPPED) as Category[]) {
    const current = withFree.equipped?.[category];
    if (current && itemById(current)?.category === category && ownsItem(withFree, current)) {
      equipped[category] = current;
    }
  }
  const coins = Number.isFinite(withFree.coins) && withFree.coins >= 0 ? Math.floor(withFree.coins) : 0;
  return { coins, owned: withFree.owned, equipped };
}
