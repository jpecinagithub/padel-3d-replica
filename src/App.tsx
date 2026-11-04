import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { cameraKindFromSettings, nextCameraKind, type CameraKind } from './game/cameraMath';
import { careerStatus, settleMatch, startCareerRun, type SettleOutcome } from './game/Career';
import type { MatchSummary } from './game/MatchFlow';
import type { PadelScene, PlayProbe } from './game/PadelScene';
import { gameStore } from './state/store';
import { useGameStore } from './state/useGameStore';
import { CourtView } from './ui/CourtView';
import { Menu, type Screen } from './ui/Menu';
import { Setup } from './ui/Setup';
import { Shop } from './ui/Shop';

// La escena 3D (Three.js) se carga como chunk aparte: el menú inicial no
// paga su peso y, si WebGL falla, la UI sigue funcionando sin decorado.
const SceneCanvas = lazy(() => import('./ui/SceneCanvas'));

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  // Override de cámara dentro de la vista de pista (tecla C). No se
  // persiste: settings.camera sigue siendo la cámara por defecto al entrar.
  const [courtCamera, setCourtCamera] = useState<CameraKind | null>(null);
  const [scene, setScene] = useState<PadelScene | null>(null);
  const [paused, setPaused] = useState(false);
  // Modo de juego dentro de la vista de pista: el entrenamiento de la
  // Fase 3 o el partido libre contra la IA de la Fase 4.
  const [playMode, setPlayMode] = useState<'training' | 'match'>('training');
  // Último cierre de partido (resumen + qué pasó con la carrera), para
  // que la pantalla de fin etiquete bien sus botones.
  const [lastSettle, setLastSettle] = useState<{ summary: MatchSummary; outcome: SettleOutcome } | null>(null);
  const state = useGameStore(gameStore);

  const settingsCamera = cameraKindFromSettings(state.settings.camera);
  const activeCamera: CameraKind = screen === 'court' ? (courtCamera ?? settingsCamera) : settingsCamera;

  // Carrera (Torneo/Mundial) resuelta desde settings + run guardado: la
  // escena la usa para nivel efectivo, rondas y selección rival.
  const career = useMemo(
    () => careerStatus(state.settings, state.run),
    [state.settings, state.run],
  );

  const navigate = useCallback(
    (next: Screen) => {
      if (next === 'court') {
        setCourtCamera(null);
        // Entrar a jugar un modo de carrera sin run lo crea (ronda 1);
        // si ya había uno guardado, se continúa donde quedó.
        if (playMode === 'match') startCareerRun(gameStore);
      }
      setPaused(false);
      setScreen(next);
    },
    [playMode],
  );

  const selectPlayMode = useCallback((mode: 'training' | 'match') => {
    setPlayMode(mode);
    if (mode === 'match') startCareerRun(gameStore);
  }, []);

  /** Fin de partido: abona monedas, actualiza stats y avanza la carrera. */
  const handleMatchEnd = useCallback((summary: MatchSummary) => {
    const outcome = settleMatch(gameStore, summary);
    setLastSettle({ summary, outcome });
  }, []);

  /** Revancha / siguiente ronda / reintento: (re)crea el run si falta y arranca. */
  const handleStartMatch = useCallback(() => {
    startCareerRun(gameStore);
    setLastSettle(null);
    scene?.playStartMatch();
  }, [scene]);

  const getProbe = useCallback((): PlayProbe | null => {
    try {
      return scene ? scene.playProbe() : null;
    } catch {
      return null;
    }
  }, [scene]);

  const cycleCamera = useCallback(() => {
    setCourtCamera(nextCameraKind(activeCamera));
  }, [activeCamera]);

  // Entrada táctil (Fase 6): los controles de CourtView escriben en el
  // InputManager de los modos a través de la escena.
  const handleTouchMove = useCallback(
    (x: number, z: number) => scene?.touchMove(x, z),
    [scene],
  );
  const handleTouchPress = useCallback((code: string) => scene?.touchPress(code), [scene]);
  const handleTouchHeld = useCallback(
    (code: string, held: boolean) => scene?.touchHeld(code, held),
    [scene],
  );

  useEffect(() => {
    if (screen !== 'court') return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Solo la C: el ESC lo gestiona el entrenamiento (pausa), no App.
      if (event.code === 'KeyC') cycleCamera();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, cycleCamera]);

  return (
    <>
      <div className="scene-layer" aria-hidden="true">
        <Suspense fallback={null}>
          <SceneCanvas
            settings={state.settings}
            wallet={state.wallet}
            muted={state.muted}
            career={career}
            cameraKind={activeCamera}
            interactive={screen === 'court'}
            playMode={playMode}
            onScene={setScene}
            onToggleMuted={() => gameStore.setMuted(!state.muted)}
            onPauseChange={setPaused}
            onMatchEnd={handleMatchEnd}
          />
        </Suspense>
      </div>

      {screen !== 'court' && <div className="veil" aria-hidden="true" />}

      {screen === 'court' ? (
        <CourtView
          cameraKind={activeCamera}
          settings={state.settings}
          career={career}
          muted={state.muted}
          getProbe={getProbe}
          paused={paused}
          playMode={playMode}
          onSelectMode={selectPlayMode}
          onCycleCamera={cycleCamera}
          endInfo={lastSettle}
          onResume={() => scene?.playResume()}
          onRestart={() => scene?.playRestart()}
          onStartMatch={handleStartMatch}
          onExit={() => navigate('menu')}
          onToggleMuted={() => gameStore.setMuted(!state.muted)}
          onTouchMove={handleTouchMove}
          onTouchPress={handleTouchPress}
          onTouchHeld={handleTouchHeld}
        />
      ) : (
        <main className="app-shell">
          {screen === 'menu' && (
            <Menu state={state} onNavigate={navigate} onToggleMuted={() => gameStore.setMuted(!state.muted)} />
          )}
          {screen === 'setup' && (
            <Setup store={gameStore} settings={state.settings} onBack={() => navigate('menu')} />
          )}
          {screen === 'shop' && <Shop store={gameStore} state={state} onBack={() => navigate('menu')} />}
        </main>
      )}
    </>
  );
}
