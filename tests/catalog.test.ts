import { describe, expect, it } from 'vitest';
import { CATALOG, CATEGORIES, DEFAULT_EQUIPPED, itemById, itemsByCategory } from '../src/state/catalog';

describe('Catálogo (SPEC §5.5)', () => {
  it('tiene exactamente 22 ítems', () => {
    expect(CATALOG).toHaveLength(22);
  });

  it('todos los ids son únicos', () => {
    const ids = CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reparto por categorías: 4 palas, 4 pelotas, 6 camisetas, 4 gorras, 4 pieles', () => {
    expect(itemsByCategory('racket')).toHaveLength(4);
    expect(itemsByCategory('ball')).toHaveLength(4);
    expect(itemsByCategory('shirt')).toHaveLength(6);
    expect(itemsByCategory('cap')).toHaveLength(4);
    expect(itemsByCategory('skin')).toHaveLength(4);
  });

  it('precios por categoría en orden de catálogo', () => {
    const prices = (cat: (typeof CATEGORIES)[number]['id']) => itemsByCategory(cat).map((i) => i.price);
    expect(prices('racket')).toEqual([0, 200, 450, 700]);
    expect(prices('ball')).toEqual([0, 80, 120, 180]);
    expect(prices('shirt')).toEqual([0, 100, 100, 150, 150, 200]);
    expect(prices('cap')).toEqual([0, 80, 80, 250]);
    expect(prices('skin')).toEqual([0, 0, 0, 0]);
  });

  it('hay un equipado por defecto por categoría, existente, de su categoría y gratuito', () => {
    for (const category of CATEGORIES) {
      const defaultItem = itemById(DEFAULT_EQUIPPED[category.id]);
      expect(defaultItem, `default de ${category.id}`).toBeDefined();
      expect(defaultItem?.category).toBe(category.id);
      expect(defaultItem?.price).toBe(0);
    }
    expect(DEFAULT_EQUIPPED).toEqual({
      racket: 'racket-basic',
      ball: 'ball-yellow',
      shirt: 'shirt-cyan',
      cap: 'cap-match',
      skin: 'skin-2',
    });
  });

  it('efectos documentados: potencia/alcance de palas y brillo de la pelota cara', () => {
    expect(itemById('racket-carbon')).toMatchObject({ power: 2 });
    expect(itemById('racket-gold')).toMatchObject({ power: 3, reach: 0.08 });
    expect(itemById('racket-fire')).toMatchObject({ power: 5, reach: 0.12 });
    expect(itemById('ball-ice')).toMatchObject({ glow: 1.6 });
  });
});
