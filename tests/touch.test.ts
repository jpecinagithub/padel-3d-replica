// Tests de la Fase 6: entrada táctil (game/TouchInput.ts) y su
// integración en el MISMO InputManager que usa el teclado (game/Input.ts).

import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/game/Input';
import {
  ButtonBank,
  JoystickTracker,
  isTouchCapable,
} from '../src/game/TouchInput';

// ------------------------------------------------------------ detección

describe('Táctil — detección de dispositivo', () => {
  it('pointer: coarse, touch points u ontouchstart bastan por separado', () => {
    expect(isTouchCapable({ coarsePointer: true, touchPoints: 0, hasTouchStart: false })).toBe(true);
    expect(isTouchCapable({ coarsePointer: false, touchPoints: 2, hasTouchStart: false })).toBe(true);
    expect(isTouchCapable({ coarsePointer: false, touchPoints: 0, hasTouchStart: true })).toBe(true);
  });

  it('un escritorio sin táctil no es capaz', () => {
    expect(isTouchCapable({ coarsePointer: false, touchPoints: 0, hasTouchStart: false })).toBe(false);
  });
});

// ------------------------------------------------------------ joystick

describe('Táctil — JoystickTracker', () => {
  const R = 48;

  it('las 4 direcciones dan los mismos vectores que WASD (D, W, A, S)', () => {
    const joy = new JoystickTracker(R);
    joy.down(1);
    joy.move(1, R, 0);
    expect(joy.vector()).toEqual({ x: 1, z: 0 }); // D
    joy.move(1, 0, -R);
    expect(joy.vector()).toEqual({ x: 0, z: 1 }); // W (arriba en pantalla)
    joy.move(1, -R, 0);
    expect(joy.vector()).toEqual({ x: -1, z: 0 }); // A
    joy.move(1, 0, R);
    expect(joy.vector()).toEqual({ x: 0, z: -1 }); // S
    joy.up(1);
    expect(joy.vector()).toEqual({ x: 0, z: 0 });
  });

  it('la diagonal sale normalizada (|v| = 1), como la del teclado', () => {
    const joy = new JoystickTracker(R);
    joy.down(1);
    joy.move(1, R, -R);
    const v = joy.vector();
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
    expect(v.z).toBeCloseTo(Math.SQRT1_2);
  });

  it('la zona muerta ignora micro-movimientos y el knob se limita al radio', () => {
    const joy = new JoystickTracker(R);
    joy.down(1);
    joy.move(1, 3, -2);
    expect(joy.vector()).toEqual({ x: 0, z: 0 });
    joy.move(1, 400, 0);
    const knob = joy.knob();
    expect(Math.hypot(knob.x, knob.y)).toBeCloseTo(R);
    expect(joy.vector().x).toBe(1); // saturado, no más de 1
  });

  it('un segundo puntero no pisa al dueño del joystick', () => {
    const joy = new JoystickTracker(R);
    expect(joy.down(1)).toBe(true);
    expect(joy.down(2)).toBe(false);
    joy.move(1, R, 0);
    expect(joy.move(2, -R, 0)).toBe(false);
    expect(joy.vector()).toEqual({ x: 1, z: 0 });
    expect(joy.up(2)).toBe(false);
    expect(joy.vector()).toEqual({ x: 1, z: 0 });
    expect(joy.up(1)).toBe(true);
    expect(joy.active).toBe(false);
  });
});

// ------------------------------------------------------------ botones multi-touch

describe('Táctil — ButtonBank multi-touch', () => {
  it('dos dedos en dos botones no se pisan al soltar', () => {
    const bank = new ButtonBank();
    bank.down(1, 'hit');
    bank.down(2, 'slice');
    expect(bank.isActive('hit')).toBe(true);
    expect(bank.isActive('slice')).toBe(true);
    expect(bank.up(1)).toBe('hit');
    expect(bank.isActive('hit')).toBe(false);
    expect(bank.isActive('slice')).toBe(true); // el otro dedo sigue
    expect(bank.up(2)).toBe('slice');
    expect(bank.activeButtons()).toEqual([]);
  });

  it('un botón con dos dedos sigue activo hasta que se levantan ambos', () => {
    const bank = new ButtonBank();
    bank.down(1, 'lift');
    bank.down(2, 'lift');
    bank.up(1);
    expect(bank.isActive('lift')).toBe(true);
    bank.up(2);
    expect(bank.isActive('lift')).toBe(false);
  });

  it('un puntero no puede poseer dos botones a la vez', () => {
    const bank = new ButtonBank();
    expect(bank.down(1, 'hit')).toBe(true);
    expect(bank.down(1, 'pause')).toBe(false);
    expect(bank.up(99)).toBeNull();
  });
});

// ------------------------------------------------------------ integración en InputManager

/** Blanco falso mínimo para capturar los listeners del manager. */
class FakeTarget {
  private listeners = new Map<string, Set<(event: never) => void>>();

  addEventListener(type: string, fn: (event: never) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
  }

  removeEventListener(type: string, fn: (event: never) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  key(code: string, type: 'keydown' | 'keyup' = 'keydown'): void {
    const event = { code, repeat: false, preventDefault: () => undefined };
    for (const fn of this.listeners.get(type) ?? []) {
      (fn as (e: typeof event) => void)(event);
    }
  }
}

function managerOnFakeTarget() {
  const target = new FakeTarget();
  const input = new InputManager();
  input.attach(target as unknown as Window);
  return { input, target };
}

describe('Táctil — el joystick alimenta el mismo InputManager que WASD', () => {
  it('el teclado da los ejes esperados (referencia)', () => {
    const { input, target } = managerOnFakeTarget();
    target.key('KeyD');
    expect(input.axisX()).toBe(1);
    expect(input.axisZ()).toBe(0);
    target.key('KeyW');
    expect(input.axisZ()).toBe(1);
    input.detach();
  });

  it('el vector táctil produce los mismos ejes que las teclas', () => {
    const { input } = managerOnFakeTarget();
    input.setTouchMove(1, 0); // como D
    expect(input.axisX()).toBe(1);
    expect(input.axisZ()).toBe(0);
    input.setTouchMove(0, 1); // como W
    expect(input.axisX()).toBe(0);
    expect(input.axisZ()).toBe(1);
    input.setTouchMove(Math.SQRT1_2, Math.SQRT1_2); // diagonal W+D
    expect(input.axisX()).toBeCloseTo(Math.SQRT1_2);
    expect(input.axisZ()).toBeCloseTo(Math.SQRT1_2);
    input.setTouchMove(0, 0);
    expect(input.axisX()).toBe(0);
    expect(input.axisZ()).toBe(0);
    input.detach();
  });

  it('multi-touch: CORTADO mantenido y GOLPE pulsado a la vez no se pisan', () => {
    const { input } = managerOnFakeTarget();
    // Dedo 1 mantiene CORTADO; dedo 2 pulsa GOLPE.
    input.setTouchHeld('KeyQ', true);
    input.pressTouch('Space');
    const shot = input.shotInput();
    expect(shot.slice).toBe(true);
    expect(input.consumePressed('Space')).toBe(true);
    expect(input.consumePressed('Space')).toBe(false); // una sola vez
    // Al soltar CORTADO, el resto del estado queda intacto.
    input.setTouchHeld('KeyQ', false);
    expect(input.shotInput().slice).toBe(false);
    input.detach();
  });

  it('empujar el joystick a la red cuenta como potencia y hacia atrás como dejada', () => {
    const { input } = managerOnFakeTarget();
    input.setTouchMove(0, 1);
    expect(input.shotInput().power).toBe(true);
    expect(input.shotInput().drop).toBe(false);
    input.setTouchMove(0, -1);
    expect(input.shotInput().power).toBe(false);
    expect(input.shotInput().drop).toBe(true);
    input.detach();
  });

  it('pressTouch sirve también para Escape (pausa) y KeyV (repetición)', () => {
    const { input } = managerOnFakeTarget();
    input.pressTouch('Escape');
    expect(input.consumePressed('Escape')).toBe(true);
    input.pressTouch('KeyV');
    expect(input.consumePressed('KeyV')).toBe(true);
    input.detach();
  });

  it('detach limpia el estado táctil', () => {
    const { input } = managerOnFakeTarget();
    input.setTouchMove(1, 1);
    input.setTouchHeld('KeyE', true);
    input.detach();
    expect(input.axisX()).toBe(0);
    expect(input.shotInput().lift).toBe(false);
  });
});
