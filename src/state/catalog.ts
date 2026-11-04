// Catálogo de la tienda (REPLICA_SPEC §5.5): 22 ítems en 5 categorías.
// Precios y efectos = comportamiento observado; nombres, ids y colores son
// la recreación propia de esta réplica a partir de la descripción de la SPEC.

export type Category = 'racket' | 'ball' | 'shirt' | 'cap' | 'skin';

export interface CatalogItem {
  id: string;
  category: Category;
  name: string;
  price: number;
  /** Color de muestra en la tarjeta de la tienda. */
  color: string;
  /** Efectos sobre el juego (solo donde la SPEC los documenta). */
  power?: number;
  reach?: number;
  glow?: number;
}

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'racket', name: 'Palas' },
  { id: 'ball', name: 'Pelotas' },
  { id: 'shirt', name: 'Camisetas' },
  { id: 'cap', name: 'Gorras' },
  { id: 'skin', name: 'Piel' },
];

export const CATALOG: CatalogItem[] = [
  // Palas — efectos: potencia y alcance extra.
  { id: 'racket-basic', category: 'racket', name: 'Club', price: 0, color: '#8a6f4d' },
  { id: 'racket-carbon', category: 'racket', name: 'Carbono FX', price: 200, color: '#2b2f36', power: 2 },
  { id: 'racket-gold', category: 'racket', name: 'Oro Pro', price: 450, color: '#d4af37', power: 3, reach: 0.08 },
  { id: 'racket-fire', category: 'racket', name: 'Fuego 500', price: 700, color: '#e0521f', power: 5, reach: 0.12 },
  // Pelotas — la más cara lleva brillo ×1,6.
  { id: 'ball-yellow', category: 'ball', name: 'Amarillas', price: 0, color: '#d8e14c' },
  { id: 'ball-orange', category: 'ball', name: 'Naranja Tour', price: 80, color: '#f08a24' },
  { id: 'ball-pink', category: 'ball', name: 'Rosa Shock', price: 120, color: '#ef6fb0' },
  { id: 'ball-ice', category: 'ball', name: 'Hielo Nocturno', price: 180, color: '#bfe8ff', glow: 1.6 },
  // Camisetas.
  { id: 'shirt-cyan', category: 'shirt', name: 'Cian Club', price: 0, color: '#22b8cf' },
  { id: 'shirt-lime', category: 'shirt', name: 'Lima', price: 100, color: '#a3d426' },
  { id: 'shirt-red', category: 'shirt', name: 'Roja', price: 100, color: '#d43a2f' },
  { id: 'shirt-black', category: 'shirt', name: 'Negra', price: 150, color: '#1c1d22' },
  { id: 'shirt-white', category: 'shirt', name: 'Blanca', price: 150, color: '#f2f2f0' },
  { id: 'shirt-purple', category: 'shirt', name: 'Morada', price: 200, color: '#7b4ba8' },
  // Gorras.
  { id: 'cap-match', category: 'cap', name: 'A juego', price: 0, color: '#22b8cf' },
  { id: 'cap-black', category: 'cap', name: 'Negra', price: 80, color: '#1c1d22' },
  { id: 'cap-white', category: 'cap', name: 'Blanca', price: 80, color: '#f2f2f0' },
  { id: 'cap-gold', category: 'cap', name: 'Dorada', price: 250, color: '#d4af37' },
  // Tonos de piel — todos gratuitos.
  { id: 'skin-1', category: 'skin', name: 'Clara', price: 0, color: '#f2c9a4' },
  { id: 'skin-2', category: 'skin', name: 'Media', price: 0, color: '#d9a06b' },
  { id: 'skin-3', category: 'skin', name: 'Morena', price: 0, color: '#a66a3f' },
  { id: 'skin-4', category: 'skin', name: 'Oscura', price: 0, color: '#6e4525' },
];

/** Ítem equipado por defecto en cada categoría (REPLICA_SPEC §4). */
export const DEFAULT_EQUIPPED: Record<Category, string> = {
  racket: 'racket-basic',
  ball: 'ball-yellow',
  shirt: 'shirt-cyan',
  cap: 'cap-match',
  skin: 'skin-2',
};

export function itemById(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

export function itemsByCategory(category: Category): CatalogItem[] {
  return CATALOG.filter((item) => item.category === category);
}

/** Ids de los ítems gratuitos: siempre son propiedad del jugador. */
export function freeItemIds(): string[] {
  return CATALOG.filter((item) => item.price === 0).map((item) => item.id);
}
