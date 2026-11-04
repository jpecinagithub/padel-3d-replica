// Tests de la Fase 8 · M4 (significado real de Ayudas/Repeticiones)
// y M2 (magnitud analógica del movimiento).

import { describe, expect, it } from 'vitest';
import { guidesFor } from '../src/game/guides';
import { InputManager, moveVector } from '../src/game/Input';

describe('guidesFor — ajustes Ayudas y Repeticiones (M4)', () => {
  it('Ayudas=Sí muestra aguja, mensajes de ayuda y medidor; No los oculta', () => {
    const on = guidesFor({ assist: 1, replays: 0 });
    expect(on.needle).toBe(true);
    expect(on.help).toBe(true);
    expect(on.superMeter).toBe(true);
    const off = guidesFor({ assist: 0, replays: 0 });
    expect(off.needle).toBe(false);
    expect(off.help).toBe(false);
    expect(off.superMeter).toBe(false);
  });

  it('Repeticiones=Sí activa la repetición automática; No la desactiva', () => {
    expect(guidesFor({ assist: 0, replays: 1 }).autoReplay).toBe(true);
    expect(guidesFor({ assist: 1, replays: 0 }).autoReplay).toBe(false);
  });

  it('los dos ajustes son independientes', () => {
    const flags = guidesFor({ assist: 0, replays: 1 });
    expect(flags.needle).toBe(false);
    expect(flags.autoReplay).toBe(true);
  });
});

describe('moveVector — magnitud analógica (M2)', () => {
  it('un vector al 20 % se conserva al 20 % (antes se normalizaba a 100 %)', () => {
    const v = moveVector(0.2, 0);
    expect(v.x).toBeCloseTo(0.2);
    expect(v.z).toBe(0);
    const diagonal = moveVector(0.14, 0.14); // |(0,14, 0,14)| ≈ 0,198
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(0.198, 2);
  });

  it('un vector al 100 % queda al 100 %', () => {
    const v = moveVector(1, 0);
    expect(Math.hypot(v.x, v.z)).toBe(1);
  });

  it('solo se recorta lo que supera 1 (diagonal de teclado √2 → 1)', () => {
    const v = moveVector(1, 1);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
    expect(v.z).toBeCloseTo(Math.SQRT1_2);
  });

  it('el vector cero queda cero', () => {
    expect(moveVector(0, 0)).toEqual({ x: 0, z: 0 });
  });
});

describe('InputManager — el eje táctil llega analógico a los modos (M2)', () => {
  it('axisX/axisZ devuelven la magnitud del joystick sin normalizar', () => {
    const input = new InputManager();
    input.setTouchMove(0.2, -0.35);
    expect(input.axisX()).toBeCloseTo(0.2);
    expect(input.axisZ()).toBeCloseTo(-0.35);
    input.setTouchMove(1, 1);
    expect(input.axisX()).toBe(1);
    expect(input.axisZ()).toBe(1);
  });

  it('la velocidad resultante escala con la magnitud: 20 % → 20 % de la velocidad del nivel', () => {
    const levelSpeed = 6.4; // velocidad de un nivel cualquiera
    const soft = moveVector(0.2, 0);
    const full = moveVector(1, 0);
    expect(levelSpeed * Math.hypot(soft.x, soft.z)).toBeCloseTo(levelSpeed * 0.2);
    expect(levelSpeed * Math.hypot(full.x, full.z)).toBeCloseTo(levelSpeed);
  });
});
