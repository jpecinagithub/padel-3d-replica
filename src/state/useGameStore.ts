import { useSyncExternalStore } from 'react';
import type { GameState, GameStore } from './store';

/** Suscribe un componente al GameStore: se re-renderiza tras cada cambio persistido. */
export function useGameStore(store: GameStore): GameState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
