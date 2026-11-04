import { useEffect, useRef } from 'react';
import type { CameraKind } from '../game/cameraMath';
import type { CareerStatus } from '../game/Career';
import type { MatchSummary } from '../game/MatchFlow';
import { PadelScene, type PlayMode } from '../game/PadelScene';
import type { Wallet } from '../state/economy';
import type { Settings } from '../state/store';

interface SceneCanvasProps {
  settings: Settings;
  wallet: Wallet;
  /** Mute global del store (`game.muted`): llega al motor de audio. */
  muted: boolean;
  /** Estado de carrera resuelto por App (modo/ronda/nivel efectivo). */
  career: CareerStatus;
  /** Cámara activa ya resuelta por App (la de settings). */
  cameraKind: CameraKind;
  /** true solo en la vista de pista: habilita arrastre, rueda, tecla C y los modos de juego. */
  interactive: boolean;
  /** Modo de juego elegido en la vista de pista (entrenamiento o partido). */
  playMode: 'training' | 'match';
  /** Recibe la escena creada (para que App pase los probes a la vista). */
  onScene?: (scene: PadelScene | null) => void;
  onToggleMuted?: () => void;
  onPauseChange?: (paused: boolean) => void;
  /** Fin de partido (Fase 5): App abona monedas, stats y carrera. */
  onMatchEnd?: (summary: MatchSummary) => void;
}

interface WindowHooks {
  __GAME_READY__?: boolean;
  __padelSceneProbe?: () => unknown;
  __padelProbe?: () => unknown;
  __gameProbe?: () => unknown;
  __padelTestServe?: (needle01: number) => unknown;
  __padelTestLaunch?: (options?: { fromX?: number }) => unknown;
  __padelTestSeed?: (seed: number) => unknown;
  __padelTestAIServe?: () => unknown;
  __padelTestLaunchAtAI?: () => unknown;
  __padelTestWinPoint?: () => unknown;
  __padelTestLosePoint?: () => unknown;
  __padelTestReplay?: () => unknown;
  __padelFX?: () => void;
  __padelWin?: () => void;
  __padelGold?: () => void;
}

/**
 * Lienzo de la escena 3D: crea el renderer una sola vez, mantiene el bucle
 * rAF con dt clampado, observa el tamaño y publica los hooks de test
 * (__GAME_READY__, __padelSceneProbe y, desde la Fase 3, __padelProbe,
 * __gameProbe, __padelTestServe y __padelTestLaunch; SPEC §5.7). Se carga
 * con React.lazy desde App para que el bundle inicial no pague Three.js.
 */
export default function SceneCanvas({
  settings,
  wallet,
  muted,
  career,
  cameraKind,
  interactive,
  playMode,
  onScene,
  onToggleMuted,
  onPauseChange,
  onMatchEnd,
}: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PadelScene | null>(null);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const initialSettingsRef = useRef(settings);
  const initialWalletRef = useRef(wallet);
  const initialMutedRef = useRef(muted);
  const initialCameraRef = useRef(cameraKind);
  const initialCareerRef = useRef(career);
  const callbacksRef = useRef({ onScene, onToggleMuted, onPauseChange, onMatchEnd });
  callbacksRef.current = { onScene, onToggleMuted, onPauseChange, onMatchEnd };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new PadelScene(container);
    sceneRef.current = scene;
    scene.setHandlers({
      onToggleMuted: () => callbacksRef.current.onToggleMuted?.(),
      onPauseChange: (paused) => callbacksRef.current.onPauseChange?.(paused),
      onMatchEnd: (summary) => callbacksRef.current.onMatchEnd?.(summary),
    });
    scene.applySettings(initialSettingsRef.current);
    scene.applyWallet(initialWalletRef.current);
    scene.setMuted(initialMutedRef.current);
    scene.setCareer(initialCareerRef.current);
    scene.setCameraKind(initialCameraRef.current);
    callbacksRef.current.onScene?.(scene);

    const hooks = window as unknown as WindowHooks;
    hooks.__padelSceneProbe = () => scene.probe();
    // __padelProbe devuelve el probe del modo activo (entrenamiento o
    // partido); en modo entrenamiento es el mismo objeto de la Fase 3.
    hooks.__padelProbe = () => scene.playProbe();
    hooks.__gameProbe = () => scene.playProbe().player;
    hooks.__padelTestServe = (needle01: number) => scene.testServe(needle01);
    hooks.__padelTestLaunch = (options?: { fromX?: number }) => scene.testLaunch(options);
    hooks.__padelTestSeed = (seed: number) => scene.testSeed(seed);
    hooks.__padelTestAIServe = () => scene.testAIServe();
    hooks.__padelTestLaunchAtAI = () => scene.testLaunchAtAI();
    // Fase 5: puntos guiados, repetición y efectos (hooks del original).
    hooks.__padelTestWinPoint = () => scene.testWinPoint();
    hooks.__padelTestLosePoint = () => scene.testLosePoint();
    hooks.__padelTestReplay = () => scene.testReplay();
    hooks.__padelFX = () => scene.triggerFX('fx');
    hooks.__padelWin = () => scene.triggerFX('win');
    hooks.__padelGold = () => scene.triggerFX('gold');

    let raf = 0;
    let last = performance.now();
    let disposed = false;
    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      scene.update(dt);
      if (scene.ready) hooks.__GAME_READY__ = true;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver(() => scene.resize());
    resizeObserver.observe(container);

    const canvas = scene.renderer.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (!interactiveRef.current) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || !interactiveRef.current) return;
      scene.drag(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      if (!interactiveRef.current) return;
      event.preventDefault();
      scene.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    // La tecla C la gestiona App (override de cámara no persistido) y el
    // resto de teclas de juego, el Input del entrenamiento.
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Audio (Fase 6): el primer gesto desbloquea el AudioContext
    // (política de autoplay) y cualquier clic en un botón de la UI
    // suena a clic. Los controles táctiles cortan la propagación de su
    // clic para no duplicar sonidos.
    const onGesture = () => scene.userGesture();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    const onDocumentClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest('button')) scene.playUIClick();
    };
    document.addEventListener('click', onDocumentClick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      document.removeEventListener('click', onDocumentClick);
      delete hooks.__GAME_READY__;
      delete hooks.__padelSceneProbe;
      delete hooks.__padelProbe;
      delete hooks.__gameProbe;
      delete hooks.__padelTestServe;
      delete hooks.__padelTestLaunch;
      delete hooks.__padelTestSeed;
      delete hooks.__padelTestAIServe;
      delete hooks.__padelTestLaunchAtAI;
      delete hooks.__padelTestWinPoint;
      delete hooks.__padelTestLosePoint;
      delete hooks.__padelTestReplay;
      delete hooks.__padelFX;
      delete hooks.__padelWin;
      delete hooks.__padelGold;
      callbacksRef.current.onScene?.(null);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.applySettings(settings);
  }, [settings]);

  useEffect(() => {
    sceneRef.current?.applyWallet(wallet);
  }, [wallet]);

  useEffect(() => {
    sceneRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    sceneRef.current?.setCareer(career);
  }, [career]);

  useEffect(() => {
    sceneRef.current?.setCameraKind(cameraKind);
  }, [cameraKind]);

  useEffect(() => {
    // Entrar en la vista activa el modo elegido (entrenamiento o
    // partido); salir los desactiva y la escena queda como decorado.
    // La cámara la aplica el efecto de cameraKind (al entrar, App ya ha
    // reseteado el override y manda la de los ajustes).
    const mode: PlayMode = interactive ? playMode : 'none';
    sceneRef.current?.setPlayMode(mode);
  }, [interactive, playMode]);

  return <div ref={containerRef} className="scene-canvas" />;
}
