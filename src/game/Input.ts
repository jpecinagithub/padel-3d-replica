// Entrada de teclado y ratón (REPLICA_SPEC §5.7). Trabaja con
// KeyboardEvent.code (posición física, como el original): WASD y flechas
// para moverse, ESPACIO para golpear/sacar, Q cortado, E liftado,
// C cámara, V repetición, ESC pausa, M sonido, R reiniciar.
//
// Fase 6: el MISMO manager recibe la entrada táctil (ui/TouchControls
// vía PadelScene): el joystick escribe un vector analógico que los ejes
// combinan con el teclado, los botones de golpeo encolan pulsaciones
// como una tecla y CORTADO/LIFTADO se mantienen como teclas retenidas.
// Sin canal paralelo: los modos no distinguen el origen de la entrada.
//
// Mantiene dos vistas: teclas mantenidas (held) y pulsaciones (pressed,
// cola que el bucle consume una vez por frame). Sin fugas: detach()
// retira todos los listeners y limpia el estado.

import type { ShotInput } from './Shots';

const GAME_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyQ', 'KeyE', 'KeyC', 'KeyV', 'KeyR', 'KeyM', 'Escape',
]);

export class InputManager {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private clicks = 0;
  private target: Window | null = null;
  private clickTarget: HTMLElement | null = null;
  /** Vector analógico del joystick táctil (x derecha, z hacia la red). */
  private touchVec = { x: 0, z: 0 };
  /** Códigos mantenidos por botones táctiles (Q/E mientras dura el dedo). */
  private touchHeld = new Set<string>();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!GAME_CODES.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat) this.pressed.add(event.code);
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
    this.resetTouch();
  };

  private readonly onPointerDown = (): void => {
    this.clicks += 1;
  };

  attach(target: Window, clickTarget?: HTMLElement): void {
    if (this.target) this.detach();
    this.target = target;
    this.resetTouch();
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    if (clickTarget) {
      this.clickTarget = clickTarget;
      clickTarget.addEventListener('pointerdown', this.onPointerDown);
    }
  }

  detach(): void {
    if (this.target) {
      this.target.removeEventListener('keydown', this.onKeyDown);
      this.target.removeEventListener('keyup', this.onKeyUp);
      this.target.removeEventListener('blur', this.onBlur);
      this.target = null;
    }
    if (this.clickTarget) {
      this.clickTarget.removeEventListener('pointerdown', this.onPointerDown);
      this.clickTarget = null;
    }
    this.held.clear();
    this.pressed.clear();
    this.clicks = 0;
    this.resetTouch();
  }

  isHeld(code: string): boolean {
    return this.held.has(code) || this.touchHeld.has(code);
  }

  // ------------------------------------------------------------ táctil (Fase 6)

  /** El joystick escribe el vector de movimiento (componentes −1..1). */
  setTouchMove(x: number, z: number): void {
    this.touchVec = {
      x: Math.min(1, Math.max(-1, x)),
      z: Math.min(1, Math.max(-1, z)),
    };
  }

  /** Vector táctil actual (para probes y tests). */
  touchVector(): { x: number; z: number } {
    return { ...this.touchVec };
  }

  /** Un toque en un botón de acción = una pulsación de tecla (Space, Escape, KeyV…). */
  pressTouch(code: string): void {
    this.pressed.add(code);
  }

  /** Un botón mantenido (CORTADO/LIFTADO) retiene su código mientras dura el dedo. */
  setTouchHeld(code: string, held: boolean): void {
    if (held) this.touchHeld.add(code);
    else this.touchHeld.delete(code);
  }

  /** Limpia todo el estado táctil (al desactivar el modo o perder el foco). */
  resetTouch(): void {
    this.touchVec = { x: 0, z: 0 };
    this.touchHeld.clear();
  }

  /** Vacía las pulsaciones y clics encolados (p. ej. al salir de pausa). */
  clearPending(): void {
    this.pressed.clear();
    this.clicks = 0;
  }

  /** Consume una pulsación: true una sola vez por cada keydown real. */
  consumePressed(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  /** Consume un clic de ratón sobre el canvas (equivale a golpear). */
  consumeClick(): boolean {
    if (this.clicks === 0) return false;
    this.clicks -= 1;
    return true;
  }

  /**
   * Eje lateral: D/flecha derecha = +1, A/flecha izquierda = −1.
   * Sin teclado, manda el joystick táctil (analógico −1..1).
   */
  axisX(): number {
    const right = this.held.has('KeyD') || this.held.has('ArrowRight') ? 1 : 0;
    const left = this.held.has('KeyA') || this.held.has('ArrowLeft') ? 1 : 0;
    const keyboard = right - left;
    return keyboard !== 0 ? keyboard : this.touchVec.x;
  }

  /**
   * Eje longitudinal: W/flecha arriba = +1 (hacia la red), S/abajo = −1.
   * Sin teclado, manda el joystick táctil (analógico −1..1).
   */
  axisZ(): number {
    const forward = this.held.has('KeyW') || this.held.has('ArrowUp') ? 1 : 0;
    const back = this.held.has('KeyS') || this.held.has('ArrowDown') ? 1 : 0;
    const keyboard = forward - back;
    return keyboard !== 0 ? keyboard : this.touchVec.z;
  }

  /**
   * Foto de las teclas de golpeo en este instante (para Shots).
   * En táctil: empujar el joystick hacia la red cuenta como potencia (W)
   * y hacia atrás como dejada (S); CORTADO/LIFTADO son los botones
   * mantenidos KeyQ/KeyE, vengan del teclado o del dedo.
   */
  shotInput(): ShotInput {
    return {
      moveX: this.axisX(),
      power: this.isHeld('KeyW') || this.isHeld('ArrowUp') || this.touchVec.z > 0.55,
      drop: this.isHeld('KeyS') || this.isHeld('ArrowDown') || this.touchVec.z < -0.55,
      slice: this.isHeld('KeyQ'),
      lift: this.isHeld('KeyE'),
    };
  }
}

/**
 * Vector de movimiento de juego a partir de los ejes crudos (Fase 8 ·
 * M2): conserva la magnitud analógica — un joystick al 20 % mueve al
 * 20 % de la velocidad del nivel — y solo recorta la longitud cuando
 * supera 1 (las diagonales de teclado, que dan |(1,1)| = √2). Antes,
 * Match y Training normalizaban siempre y el 20 % corría como el 100 %.
 */
export function moveVector(ax: number, az: number): { x: number; z: number } {
  const len = Math.hypot(ax, az);
  if (len <= 1 || len === 0) return { x: ax, z: az };
  return { x: ax / len, z: az / len };
}
