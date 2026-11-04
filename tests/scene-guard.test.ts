// Tests de la Fase 8 · A1: la creación protegida de la escena.

import { describe, expect, it } from 'vitest';
import { tryCreateScene } from '../src/ui/sceneGuard';

describe('tryCreateScene — WebGL no disponible (A1)', () => {
  it('si la fábrica lanza (renderer sin WebGL), devuelve el error sin propagarlo', () => {
    const result = tryCreateScene(() => {
      throw new Error('WebGL context creation failed');
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('WebGL');
  });

  it('si la fábrica funciona, devuelve el valor creado', () => {
    const scene = { id: 1 };
    const result = tryCreateScene(() => scene);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(scene);
  });

  it('un error que no es Error también se captura como texto', () => {
    const result = tryCreateScene(() => {
      throw 'fallo seco'; // eslint-disable-line no-throw-literal
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('fallo seco');
  });
});
