// Lógica pura de entrada táctil (Fase 6, REPLICA_SPEC §5.7).
//
// Sin DOM: el joystick y los botones viven aquí como máquinas de estado
// testeables, y el componente React (ui/TouchControls.tsx) solo traduce
// PointerEvents a llamadas. La salida del joystick alimenta el MISMO
// InputManager que el teclado (Input.ts): no hay un canal paralelo.
//
// Ejes de juego: x = derecha en pantalla, z = hacia la red (arriba en
// pantalla) — los mismos signos que dan D/W en el teclado.

/** Señales de «esto es un dispositivo táctil» (puras, para tests). */
export interface TouchSignals {
  /** matchMedia('(pointer: coarse)') — el puntero principal es grueso. */
  coarsePointer: boolean;
  /** navigator.maxTouchPoints. */
  touchPoints: number;
  /** 'ontouchstart' in window. */
  hasTouchStart: boolean;
}

export function isTouchCapable(signals: TouchSignals): boolean {
  return signals.coarsePointer || signals.touchPoints > 0 || signals.hasTouchStart;
}

/** Versión con el navegador real (en tests se usa isTouchCapable). */
export function detectTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  return isTouchCapable({
    coarsePointer:
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false,
    touchPoints: typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0,
    hasTouchStart: 'ontouchstart' in window,
  });
}

/**
 * Joystick virtual: sigue UN puntero (el primero que baja); los demás
 * se ignoran hasta que ese se levanta (multi-touch sin pisarse).
 * `vector()` devuelve el vector de juego normalizado (|v| ≤ 1) con
 * zona muerta; `knob()` el desplazamiento en px para pintar la palanca.
 */
export class JoystickTracker {
  private pointerId: number | null = null;
  private dx = 0;
  private dy = 0;

  constructor(
    private readonly radius = 48,
    private readonly deadzone = 0.16,
  ) {}

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** Baja un puntero: solo se acepta si el joystick está libre. */
  down(pointerId: number): boolean {
    if (this.pointerId !== null) return false;
    this.pointerId = pointerId;
    this.dx = 0;
    this.dy = 0;
    return true;
  }

  /** Mueve el puntero dueño (dx/dy en px respecto al centro). */
  move(pointerId: number, dx: number, dy: number): boolean {
    if (pointerId !== this.pointerId) return false;
    this.dx = dx;
    this.dy = dy;
    return true;
  }

  /** Levanta el puntero dueño: el vector vuelve a (0,0). */
  up(pointerId: number): boolean {
    if (pointerId !== this.pointerId) return false;
    this.pointerId = null;
    this.dx = 0;
    this.dy = 0;
    return true;
  }

  /** Vector de juego: x derecha, z hacia la red (pantalla arriba = +z). */
  vector(): { x: number; z: number } {
    const nx = this.dx / this.radius;
    const ny = this.dy / this.radius;
    const len = Math.hypot(nx, ny);
    if (len < this.deadzone) return { x: 0, z: 0 };
    const scale = Math.min(1, len) / len;
    // El `+ 0` final normaliza un posible −0 (de negar dy=0) a 0.
    return { x: nx * scale + 0, z: -ny * scale + 0 };
  }

  /** Desplazamiento del knob en px, limitado al radio del anillo. */
  knob(): { x: number; y: number } {
    const len = Math.hypot(this.dx, this.dy);
    if (len <= this.radius) return { x: this.dx, y: this.dy };
    const scale = this.radius / len;
    return { x: this.dx * scale, y: this.dy * scale };
  }
}

export type TouchButtonId =
  | 'hit'
  | 'slice'
  | 'lift'
  | 'pause'
  | 'camera'
  | 'replay'
  | 'mute';

/**
 * Banco de botones táctiles multi-touch: cada puntero posee como mucho
 * un botón y cada botón puede tener varios punteros; soltar un puntero
 * nunca libera el botón de otro dedo.
 */
export class ButtonBank {
  private readonly byPointer = new Map<number, TouchButtonId>();
  private readonly counts = new Map<TouchButtonId, number>();

  down(pointerId: number, button: TouchButtonId): boolean {
    if (this.byPointer.has(pointerId)) return false;
    this.byPointer.set(pointerId, button);
    this.counts.set(button, (this.counts.get(button) ?? 0) + 1);
    return true;
  }

  /** Levanta un puntero: devuelve el botón que poseía (o null). */
  up(pointerId: number): TouchButtonId | null {
    const button = this.byPointer.get(pointerId);
    if (button === undefined) return null;
    this.byPointer.delete(pointerId);
    const remaining = (this.counts.get(button) ?? 1) - 1;
    if (remaining <= 0) this.counts.delete(button);
    else this.counts.set(button, remaining);
    return button;
  }

  isActive(button: TouchButtonId): boolean {
    return (this.counts.get(button) ?? 0) > 0;
  }

  activeButtons(): TouchButtonId[] {
    return [...this.counts.keys()];
  }

  clear(): void {
    this.byPointer.clear();
    this.counts.clear();
  }
}
