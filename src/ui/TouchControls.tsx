import { useEffect, useRef, useState } from 'react';
import {
  ButtonBank,
  JoystickTracker,
  detectTouchCapable,
  type TouchButtonId,
} from '../game/TouchInput';

interface TouchControlsProps {
  muted: boolean;
  /** Joystick: vector de juego (x derecha, z hacia la red), −1..1. */
  onMove: (x: number, z: number) => void;
  /** Toque de acción = pulsación de tecla ('Space', 'Escape', 'KeyV'). */
  onPress: (code: string) => void;
  /** Botón mantenido ('KeyQ'/'KeyE') mientras dura el dedo. */
  onHeld: (code: string, held: boolean) => void;
  onCycleCamera: () => void;
  onToggleMuted: () => void;
}

/**
 * Controles táctiles (Fase 6): joystick izquierdo + botones de golpeo a
 * la derecha y columna de utilidades (cámara, repetición, pausa, mute).
 *
 * Solo se renderizan en dispositivos táctiles (pointer: coarse /
 * touchstart / maxTouchPoints) o con viewport estrecho; en escritorio
 * con teclado no aparecen ni estorban. Todo va con PointerEvents y
 * seguimiento por pointerId (JoystickTracker/ButtonBank de
 * game/TouchInput.ts): un dedo mantiene el joystick y otro golpea a la
 * vez, sin pisarse. La salida alimenta el mismo InputManager que el
 * teclado (vía PadelScene), no un canal paralelo.
 *
 * Los handlers hacen preventDefault y el contenedor corta la
 * propagación del clic: nada de clics fantasma de ratón ni del sonido
 * de UI por partida doble. `touch-action: none` (CSS) evita scroll y
 * zoom de la página mientras se juega.
 */
export function TouchControls({
  muted,
  onMove,
  onPress,
  onHeld,
  onCycleCamera,
  onToggleMuted,
}: TouchControlsProps) {
  const [visible, setVisible] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState<TouchButtonId[]>([]);
  const joystickRef = useRef<JoystickTracker | null>(null);
  const bankRef = useRef<ButtonBank | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  if (!joystickRef.current) joystickRef.current = new JoystickTracker();
  if (!bankRef.current) bankRef.current = new ButtonBank();

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 760px)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => setVisible(detectTouchCapable() || narrow.matches);
    update();
    narrow.addEventListener('change', update);
    coarse.addEventListener('change', update);
    return () => {
      narrow.removeEventListener('change', update);
      coarse.removeEventListener('change', update);
    };
  }, []);

  // Al desmontar (salir de la pista), el jugador no debe quedarse andando.
  useEffect(
    () => () => {
      onMove(0, 0);
      onHeld('KeyQ', false);
      onHeld('KeyE', false);
    },
    [onMove, onHeld],
  );

  if (!visible) return null;

  const joystick = joystickRef.current;
  const bank = bankRef.current;

  const syncActive = () => setActive(bank.activeButtons());

  const onJoyDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!joystick.down(event.pointerId)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setKnob({ x: 0, y: 0 });
  };
  const onJoyMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!joystick.active) return;
    event.preventDefault();
    const dx = event.clientX - centerRef.current.x;
    const dy = event.clientY - centerRef.current.y;
    if (!joystick.move(event.pointerId, dx, dy)) return;
    const v = joystick.vector();
    onMove(v.x, v.z);
    setKnob(joystick.knob());
  };
  const onJoyUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!joystick.up(event.pointerId)) return;
    event.preventDefault();
    onMove(0, 0);
    setKnob({ x: 0, y: 0 });
  };

  /** Botón de toque único (down dispara; up solo libera el banco). */
  const tapProps = (id: TouchButtonId, action: () => void) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!bank.down(event.pointerId, id)) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      syncActive();
      action();
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      bank.up(event.pointerId);
      syncActive();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
      bank.up(event.pointerId);
      syncActive();
    },
  });

  /** Botón mantenido: retiene su código mientras haya un dedo encima. */
  const holdProps = (id: TouchButtonId, code: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!bank.down(event.pointerId, id)) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      syncActive();
      onHeld(code, true);
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      bank.up(event.pointerId);
      syncActive();
      if (!bank.isActive(id)) onHeld(code, false);
    },
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
      bank.up(event.pointerId);
      syncActive();
      if (!bank.isActive(id)) onHeld(code, false);
    },
  });

  const btnClass = (id: TouchButtonId, base: string) =>
    active.includes(id) ? `${base} active` : base;

  return (
    <div
      className="touch-controls"
      data-testid="touch-controls"
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="touch-joystick"
        data-testid="touch-joystick"
        role="application"
        aria-label="Joystick de movimiento"
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyUp}
        onPointerCancel={onJoyUp}
      >
        <div
          className="touch-knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      <div className="touch-utils">
        <button
          type="button"
          className={btnClass('camera', 'touch-btn touch-util')}
          data-testid="touch-camera"
          aria-label="Cambiar cámara"
          {...tapProps('camera', onCycleCamera)}
        >
          📷
        </button>
        <button
          type="button"
          className={btnClass('replay', 'touch-btn touch-util')}
          data-testid="touch-replay"
          aria-label="Repetición del último punto"
          {...tapProps('replay', () => onPress('KeyV'))}
        >
          🔁
        </button>
        <button
          type="button"
          className={btnClass('pause', 'touch-btn touch-util')}
          data-testid="touch-pause"
          aria-label="Pausa"
          {...tapProps('pause', () => onPress('Escape'))}
        >
          ⏸
        </button>
        <button
          type="button"
          className={btnClass('mute', 'touch-btn touch-util')}
          data-testid="touch-mute"
          aria-label={muted ? 'Activar sonido' : 'Silenciar'}
          {...tapProps('mute', onToggleMuted)}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div className="touch-actions">
        <div className="touch-actions-row">
          <button
            type="button"
            className={btnClass('slice', 'touch-btn touch-btn-small')}
            data-testid="touch-slice"
            aria-label="Cortado (mantener)"
            {...holdProps('slice', 'KeyQ')}
          >
            CORTADO
          </button>
          <button
            type="button"
            className={btnClass('lift', 'touch-btn touch-btn-small')}
            data-testid="touch-lift"
            aria-label="Liftado (mantener)"
            {...holdProps('lift', 'KeyE')}
          >
            LIFTADO
          </button>
        </div>
        <button
          type="button"
          className={btnClass('hit', 'touch-btn touch-btn-hit')}
          data-testid="touch-hit"
          aria-label="Golpear o sacar"
          {...tapProps('hit', () => onPress('Space'))}
        >
          GOLPE
        </button>
      </div>
    </div>
  );
}
