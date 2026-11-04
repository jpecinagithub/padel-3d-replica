import { useEffect, useRef, useState } from 'react';
import { CAMERA_NAMES, type CameraKind } from '../game/cameraMath';
import type { CareerStatus, SettleOutcome } from '../game/Career';
import { guidesFor } from '../game/guides';
import type { MatchProbe } from '../game/Match';
import type { MatchSummary } from '../game/MatchFlow';
import type { PlayProbe } from '../game/PadelScene';
import { NEEDLE_PERIOD, needleZone } from '../game/Shots';
import { detectTouchCapable } from '../game/TouchInput';
import { aiLevelById } from '../state/modes';
import type { Settings } from '../state/store';
import { TouchControls } from './TouchControls';

interface CourtViewProps {
  cameraKind: CameraKind;
  settings: Settings;
  career: CareerStatus;
  muted: boolean;
  getProbe: () => PlayProbe | null;
  paused: boolean;
  playMode: 'training' | 'match';
  endInfo: { summary: MatchSummary; outcome: SettleOutcome } | null;
  onSelectMode: (mode: 'training' | 'match') => void;
  onCycleCamera: () => void;
  onResume: () => void;
  onRestart: () => void;
  onStartMatch: () => void;
  onExit: () => void;
  /** Fase 10: botón ⏸ de la columna derecha (equivale a ESC). */
  onTogglePause: () => void;
  /** Fase 10: botón 🎥 cuando hay repetición disponible (equivale a V). */
  onReplay: () => void;
  /** Fase 6: botón de mute y controles táctiles. */
  onToggleMuted: () => void;
  onTouchMove: (x: number, z: number) => void;
  onTouchPress: (code: string) => void;
  onTouchHeld: (code: string, held: boolean) => void;
}

function isMatchProbe(probe: PlayProbe | null): probe is MatchProbe {
  return probe !== null && 'match' in probe;
}

/**
 * ¿Manda la UI táctil? Mismo criterio que TouchControls (dispositivo
 * táctil o viewport estrecho): si los controles táctiles están
 * visibles, la columna de botones de escritorio (Fase 10) se oculta
 * para no duplicar cámara/repetición/pausa/sonido en el mismo borde.
 */
function useTouchUi(): boolean {
  const [touchUi, setTouchUi] = useState(false);
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 760px)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => setTouchUi(detectTouchCapable() || narrow.matches);
    update();
    narrow.addEventListener('change', update);
    coarse.addEventListener('change', update);
    return () => {
      narrow.removeEventListener('change', update);
      coarse.removeEventListener('change', update);
    };
  }, []);
  return touchUi;
}

/**
 * Vista de pista con dos modos (elegibles arriba a la izquierda):
 * - Entrenamiento (Fase 3, intacto): saque con aguja y rally libre.
 * - Partido contra la IA (Fase 5): partido COMPLETO con marcador
 *   oficial (puntos/juegos/set, tiebreak, punto de oro), monedas por
 *   punto/juego/resultado y modos Partida rápida / Torneo / Mundial
 *   con carrera persistente. Al cerrar el partido, pantalla de fin con
 *   el desglose de monedas. Tecla V: repetición del último punto.
 *
 * Layout (Fase 10, adaptado al modelo): el CENTRO de la pantalla queda
 * libre durante el juego. Arriba: selector de modo y salida a la
 * izquierda; marcador-píldora centrado con la banda de mensajes del
 * punto justo debajo. Derecha: botones circulares ⟳ (reiniciar),
 * 🎥 (cámara o repetición, según el estado) y ⏸ (pausa). Abajo:
 * medidor SUPERGOLPE a la izquierda, aguja del saque fina y UNA línea
 * de ayuda contextual en el centro, cámara/IA a la derecha. Los
 * paneles de pausa y de fin de partido son modales con el juego
 * detenido y siguen centrados. El estado se lee del probe del modo
 * activo unas 16 veces por segundo.
 */
export function CourtView({
  cameraKind,
  settings,
  career,
  muted,
  getProbe,
  paused,
  playMode,
  endInfo,
  onSelectMode,
  onCycleCamera,
  onResume,
  onRestart,
  onStartMatch,
  onExit,
  onTogglePause,
  onReplay,
  onToggleMuted,
  onTouchMove,
  onTouchPress,
  onTouchHeld,
}: CourtViewProps) {
  const [probe, setProbe] = useState<PlayProbe | null>(null);
  const touchUi = useTouchUi();

  useEffect(() => {
    const tick = () => setProbe(getProbe());
    tick();
    const id = window.setInterval(tick, 60);
    return () => window.clearInterval(id);
  }, [getProbe]);

  const match = isMatchProbe(probe) ? probe : null;
  const guides = guidesFor(settings);
  const phase = probe?.rally.state ?? 'serve-ready';
  const needle = probe?.serve.needle ?? null;
  const needlePct = needle === null ? null : needle * 100;
  const zone = needle === null ? null : needleZone(needle);
  const needleSeconds = needle === null ? null : needle * NEEDLE_PERIOD;
  const superPct = Math.round((probe?.super.charge ?? 0) * 100);
  const speedKmh = Math.round((probe?.ball.speed ?? 0) * 3.6);
  const humanServing = !match || match.match.server === 'human';
  const aiLevelName = aiLevelById(settings.opponentLevel).name;
  const replayActive = match?.replay.active ?? false;

  const modeTitle = career.active
    ? `${career.mode.id === 2 ? '🌍' : '🏆'} ${career.mode.name} · ${career.roundName}${
        career.team ? ` vs ${career.team.flag} ${career.team.name}` : ''
      }`
    : '🏆 Partida rápida';
  const matchOver = match?.match.over ?? false;
  const outcome = endInfo?.outcome ?? null;
  const endPrimaryLabel = match?.match.champion
    ? null
    : outcome?.advanced
      ? `Siguiente ronda: ${outcome.nextRoundName} ▶`
      : outcome?.careerOver && match?.match.winner === 'ai'
        ? `Reintentar ${career.mode.name} ▶`
        : 'Revancha ▶';
  // Fase 8 · M3: la pantalla de fin describe el partido TERMINADO con
  // los datos cerrados del resumen (modo y ronda jugados), no con la
  // carrera viva, que para entonces ya avanzó a la siguiente ronda.
  const endSummary = endInfo?.summary ?? null;
  const endModeRound = endSummary
    ? `${endSummary.modeName ?? career.mode.name}${endSummary.roundName ? ` (${endSummary.roundName})` : ''}`
    : career.active
      ? `${career.mode.name} (${career.roundName})`
      : 'Partida rápida';

  // Fase 10: la columna derecha (⟳ 🎥 ⏸) solo existe en escritorio sin
  // controles táctiles y fuera de los estados modales/repetición.
  const showSideActions = !touchUi && !paused && !matchOver && !replayActive;
  const replayOffered = match !== null && phase === 'ended';
  const handleCameraReplay = () => {
    if (replayOffered) onReplay();
    else onCycleCamera();
  };

  // Fase 10: banda bajo el marcador — el mensaje del punto (resultado
  // del saque durante el rally; causa y ganador al cerrarse). En
  // serve-ready/toss mandan la línea de ayuda y la aguja, no la banda.
  const bandText = (() => {
    if (!probe || replayActive) return null;
    if (phase === 'ended' && !matchOver) {
      if (!probe.rally.message) return null;
      return match
        ? `${match.rally.winner === 'human' ? 'Punto tuyo 🏆' : 'Punto del rival'} · ${probe.rally.message}`
        : probe.rally.message;
    }
    if (phase === 'rally') return probe.rally.message || null;
    return null;
  })();

  // Fase 10: UNA línea de ayuda contextual abajo en el centro, solo
  // cuando el estado la justifica (con «Ayudas» desactivado no hay
  // línea: semántica de guides.ts intacta). En el lanzamiento, el pie
  // de la aguja hace de línea; en rally no hay línea.
  const helpLine = (() => {
    if (!guides.help) return null;
    if (phase === 'serve-ready') {
      if (match) {
        return humanServing
          ? 'Tu saque: ESPACIO para lanzar la bola y golpearla en el punto dulce'
          : null;
      }
      return 'ESPACIO para lanzar la bola · golpéala en el punto dulce';
    }
    if (phase === 'ended' && !matchOver) {
      return match
        ? 'ESPACIO: siguiente saque · V: repetición del punto'
        : 'ESPACIO o R: siguiente saque (lado contrario)';
    }
    return null;
  })();

  const servingHome =
    match !== null && (match.score.server === 'human' || match.score.server === 'partner');
  const servingAway =
    match !== null && (match.score.server === 'rival' || match.score.server === 'rival2');
  const scoreCenter = match?.score.tiebreak
    ? null
    : match?.score.goldPoint
      ? null
      : `SET · ${career.active ? `${career.mode.name} ${career.roundName}` : 'PARTIDA RÁPIDA'} · ${
          settings.doubles ? 'DOBLES' : 'INDIVIDUALES'
        }`;

  // Fase 8 · C5: gestión de foco de los paneles modales (pausa y fin de
  // partido): al abrirse, el foco va a su primer botón; al cerrarse,
  // vuelve a donde estaba.
  const pausePanelRef = useRef<HTMLDivElement>(null);
  const endPanelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<Element | null>(null);
  const pauseOpen = paused && !matchOver;
  useEffect(() => {
    if (pauseOpen || matchOver) {
      if (!prevFocusRef.current) prevFocusRef.current = document.activeElement;
      const panel = matchOver ? endPanelRef.current : pausePanelRef.current;
      panel?.querySelector('button')?.focus();
    } else if (prevFocusRef.current) {
      const prev = prevFocusRef.current as HTMLElement;
      prevFocusRef.current = null;
      if (typeof prev.focus === 'function') prev.focus();
    }
  }, [pauseOpen, matchOver]);

  return (
    <div className="court-hud" aria-label={match ? 'Partido contra la IA' : 'Entrenamiento en pista'}>
      <div className="hud-top">
        <div className="hud-topleft">
          <div className="mode-selector" role="group" aria-label="Modo de juego">
            <button
              type="button"
              className={`btn btn-small${playMode === 'training' ? ' btn-primary' : ''}`}
              onClick={() => onSelectMode('training')}
            >
              🏋️ Entrenamiento
            </button>
            <button
              type="button"
              className={`btn btn-small${playMode === 'match' ? ' btn-primary' : ''}`}
              onClick={() => onSelectMode('match')}
            >
              {modeTitle}
            </button>
          </div>
          <button type="button" className="icon-btn hud-btn" onClick={onExit}>
            ← Menú
          </button>
          {match ? (
            <span className="hud-chip">🪙 +{match.economy.earned} en este partido</span>
          ) : (
            <span className="hud-chip">🏋️ Entrenamiento · saque con aguja</span>
          )}
        </div>

        <div className="hud-topcenter">
          {match && (
            <div className="scoreboard" aria-label="Marcador oficial">
              <div className={`score-side${servingHome ? ' serving' : ''}`}>
                <span className="score-name">{settings.doubles ? 'TÚ + CPU' : 'TÚ'}</span>
                {servingHome && <span className="score-dot" title="Al saque" />}
                <span className="score-games">{match.score.games[0]}</span>
                <span className="score-points">{match.score.labels[0]}</span>
              </div>
              <div className="score-sep" aria-hidden="true" />
              <div className="score-mid">
                {match.score.tiebreak ? (
                  <span className="score-badge">TIEBREAK</span>
                ) : match.score.goldPoint ? (
                  <span className="score-badge score-gold">⭐ PUNTO DE ORO</span>
                ) : (
                  <span className="score-mode">{scoreCenter}</span>
                )}
              </div>
              <div className="score-sep" aria-hidden="true" />
              <div className={`score-side${servingAway ? ' serving' : ''}`}>
                <span className="score-games">{match.score.games[1]}</span>
                <span className="score-points">{match.score.labels[1]}</span>
                {servingAway && <span className="score-dot" title="Al saque" />}
                <span className="score-name">
                  {career.team ? `${career.team.flag} ${career.team.name}` : 'CPU'}
                </span>
              </div>
            </div>
          )}
          {replayActive && (
            <p className="replay-badge" role="status">
              🔁 REPETICIÓN · cámara lenta — V para volver
            </p>
          )}
          {bandText && (
            <p className="hud-band" role="status">
              {bandText}
            </p>
          )}
        </div>

        <div className="hud-topright" aria-hidden="true" />
      </div>

      {showSideActions && (
        <div className="hud-side-actions">
          <button
            type="button"
            className="side-btn"
            onClick={onRestart}
            title="Reiniciar rally (R)"
            aria-label="Reiniciar rally"
          >
            ⟳
          </button>
          <button
            type="button"
            className="side-btn"
            onClick={handleCameraReplay}
            title={replayOffered ? 'Repetición del último punto (V)' : 'Cambiar cámara (C)'}
            aria-label={replayOffered ? 'Repetición del último punto' : 'Cambiar cámara'}
          >
            🎥
          </button>
          <button
            type="button"
            className="side-btn"
            onClick={onTogglePause}
            title="Pausa (ESC)"
            aria-label="Pausa"
          >
            ⏸
          </button>
        </div>
      )}

      <div className="hud-bottom">
        <div className="hud-bottom-side hud-bottom-left">
          {guides.superMeter && (
            <div className="meter" aria-label="Medidor de supergolpe">
              <span className="meter-label">SUPERGOLPE</span>
              <div className="meter-track">
                <div
                  className={`meter-fill${probe?.super.ready ? ' meter-ready' : ''}`}
                  style={{ width: `${superPct}%` }}
                />
              </div>
              <span className="meter-value">{probe?.super.ready ? '¡LISTO! (bola alta + W)' : `${superPct}%`}</span>
            </div>
          )}
          <span className="hud-chip">🎾 {speedKmh} km/h</span>
        </div>

        <div className="hud-bottom-center">
          {phase === 'serve-toss' && needlePct !== null && humanServing && guides.needle && (
            <div className="needle-gauge" role="img" aria-label="Aguja del saque">
              <div className="needle-track">
                <div className="needle-sweet" />
                <div className="needle-good" />
                <div
                  className={`needle-marker needle-${zone ?? ''}`}
                  style={{ left: `${needlePct}%` }}
                />
              </div>
              <p className="needle-caption">
                {zone === 'perfect'
                  ? '¡Punto dulce! ESPACIO ahora'
                  : `Aguja ${(needleSeconds ?? 0).toFixed(2)} s — ESPACIO en la zona verde`}
              </p>
            </div>
          )}
          {helpLine && <p className="hud-help">{helpLine}</p>}
        </div>

        <div className="hud-bottom-side hud-bottom-right">
          <span className="hud-chip hud-chip-opt">🎥 {CAMERA_NAMES[cameraKind]}</span>
          {match && (
            <span className="hud-chip hud-chip-opt">
              IA {aiLevelName} · {match.match.aiHits} golpes · {match.ai.errors} errores
            </span>
          )}
        </div>
      </div>

      {!paused && !matchOver && (
        <TouchControls
          muted={muted}
          onMove={onTouchMove}
          onPress={onTouchPress}
          onHeld={onTouchHeld}
          onCycleCamera={onCycleCamera}
          onToggleMuted={onToggleMuted}
        />
      )}

      {matchOver && match && (
        <div className="pause-overlay">
          <div className="pause-panel end-panel" ref={endPanelRef}>
            <h2>
              {match.match.champion
                ? `🏆 ¡CAMPEÓN DEL ${career.mode.name.toUpperCase()}!`
                : match.match.winner === 'human'
                  ? '🏆 ¡Victoria!'
                  : 'Derrota'}
            </h2>
            <p className="end-score">
              Juegos: {match.score.games[0]} — {match.score.games[1]}
              {` · ${endModeRound}`}
            </p>
            <div className="end-breakdown">
              <p>
                <span>Por puntos ganados</span>
                <strong>+{match.economy.points} 🪙</strong>
              </p>
              <p>
                <span>Por juegos ganados</span>
                <strong>+{match.economy.games} 🪙</strong>
              </p>
              <p>
                <span>{match.match.winner === 'human' ? 'Por la victoria' : 'Por la derrota'}</span>
                <strong>+{match.economy.result} 🪙</strong>
              </p>
              {match.economy.bonus > 0 && (
                <p>
                  <span>Bonus de campeón</span>
                  <strong>+{match.economy.bonus} 🪙</strong>
                </p>
              )}
              <p className="end-total">
                <span>Total al monedero</span>
                <strong>+{match.economy.earned} 🪙</strong>
              </p>
            </div>
            {outcome?.advanced && (
              <p className="end-note">Ronda superada: te espera la {outcome.nextRoundName}.</p>
            )}
            {outcome?.careerOver && match.match.winner === 'ai' && career.active && (
              <p className="end-note">La carrera termina aquí: el {career.mode.name} queda cerrado.</p>
            )}
            {endPrimaryLabel && (
              <button type="button" className="btn btn-primary" onClick={onStartMatch}>
                {endPrimaryLabel}
              </button>
            )}
            <button type="button" className="btn" onClick={onExit}>
              Volver al menú
            </button>
          </div>
        </div>
      )}

      {paused && !matchOver && (
        <div className="pause-overlay">
          <div className="pause-panel" ref={pausePanelRef}>
            <h2>Pausa</h2>
            <button type="button" className="btn btn-primary" onClick={onResume}>
              Continuar
            </button>
            <button type="button" className="btn" onClick={onRestart}>
              Reiniciar rally
            </button>
            <button type="button" className="btn" onClick={onExit}>
              Salir al menú
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
