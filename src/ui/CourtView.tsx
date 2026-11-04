import { useEffect, useRef, useState } from 'react';
import { CAMERA_NAMES, type CameraKind } from '../game/cameraMath';
import type { CareerStatus, SettleOutcome } from '../game/Career';
import { guidesFor } from '../game/guides';
import type { MatchProbe } from '../game/Match';
import type { MatchSummary } from '../game/MatchFlow';
import type { PlayProbe } from '../game/PadelScene';
import { NEEDLE_PERIOD, needleZone } from '../game/Shots';
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
  /** Fase 6: botón de mute y controles táctiles. */
  onToggleMuted: () => void;
  onTouchMove: (x: number, z: number) => void;
  onTouchPress: (code: string) => void;
  onTouchHeld: (code: string, held: boolean) => void;
}

const PHASE_LABEL: Record<PlayProbe['rally']['state'], string> = {
  'serve-ready': 'Saque',
  'serve-toss': 'Saque',
  rally: 'Rally',
  ended: 'Fin del rally',
  'match-over': 'Fin del partido',
};

const AI_STATE_LABEL: Record<MatchProbe['ai']['state'], string> = {
  waiting: 'espera',
  reacting: 'reacciona',
  moving: 'se mueve',
  hitting: 'golpea',
  recovering: 'recupera',
  serving: 'saca',
};

const SERVER_LABEL: Record<MatchProbe['match']['server'], string> = {
  human: 'tú',
  partner: 'tu compañero',
  rival: 'el rival',
  rival2: 'el rival 2',
};

function isMatchProbe(probe: PlayProbe | null): probe is MatchProbe {
  return probe !== null && 'match' in probe;
}

/**
 * Vista de pista con dos modos (elegibles arriba, al entrar):
 * - Entrenamiento (Fase 3, intacto): saque con aguja y rally libre.
 * - Partido contra la IA (Fase 5): partido COMPLETO con marcador
 *   oficial (puntos/juegos/set, tiebreak, punto de oro), monedas por
 *   punto/juego/resultado y modos Partida rápida / Torneo / Mundial
 *   con carrera persistente. Al cerrar el partido, pantalla de fin con
 *   el desglose de monedas. Tecla V: repetición del último punto.
 * El estado se lee del probe del modo activo unas 16 veces por segundo.
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
  onToggleMuted,
  onTouchMove,
  onTouchPress,
  onTouchHeld,
}: CourtViewProps) {
  const [probe, setProbe] = useState<PlayProbe | null>(null);

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
      <div className="hud-row">
        <div className="hud-chips">
          {match ? (
            <>
              <span className="hud-chip">{modeTitle} · v1.1.0</span>
              <span className="hud-chip hud-chip-opt">Saca: {SERVER_LABEL[match.match.server]}</span>
              <span className="hud-chip hud-chip-opt">
                IA {aiLevelName}: {AI_STATE_LABEL[match.ai.state]}
                {match.ai.lastShot ? ` · ${match.ai.lastShot}` : ''}
              </span>
              <span className="hud-chip">🪙 +{match.economy.earned} en este partido</span>
            </>
          ) : (
            <span className="hud-chip">🏋️ Entrenamiento · Fase 3</span>
          )}
          <span className="hud-chip hud-chip-opt">Estado: {PHASE_LABEL[phase]}</span>
          <span className="hud-chip hud-chip-opt">🎥 {CAMERA_NAMES[cameraKind]}</span>
          <span className="hud-chip hud-chip-opt">{muted ? '🔇 Silencio (M)' : '🔊 Sonido (M)'}</span>
        </div>
        <button type="button" className="icon-btn hud-btn" onClick={onExit}>
          ← Menú
        </button>
      </div>

      {match && (
        <div className="scoreboard" aria-label="Marcador oficial">
          <div className={`score-side${match.score.server === 'human' || match.score.server === 'partner' ? ' serving' : ''}`}>
            <span className="score-name">TÚ{settings.doubles ? ' (equipo)' : ''}</span>
            <span className="score-games">{match.score.games[0]}</span>
            <span className="score-points">{match.score.labels[0]}</span>
            {(match.score.server === 'human' || match.score.server === 'partner') && (
              <span className="score-ball" title="Al saque">🎾</span>
            )}
          </div>
          <div className="score-mid">
            {match.score.tiebreak ? (
              <span className="score-badge">TIEBREAK</span>
            ) : match.score.goldPoint ? (
              <span className="score-badge score-gold">⭐ PUNTO DE ORO</span>
            ) : (
              <span className="score-set">Set a {match.score.gamesToWin}</span>
            )}
          </div>
          <div className={`score-side${match.score.server === 'rival' || match.score.server === 'rival2' ? ' serving' : ''}`}>
            <span className="score-name">{career.team ? `${career.team.flag} ${career.team.name}` : 'RIVAL'}</span>
            <span className="score-games">{match.score.games[1]}</span>
            <span className="score-points">{match.score.labels[1]}</span>
            {(match.score.server === 'rival' || match.score.server === 'rival2') && (
              <span className="score-ball" title="Al saque">🎾</span>
            )}
          </div>
        </div>
      )}

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

      <div className="hud-center">
        {match?.replay.active && (
          <p className="replay-badge" role="status">
            🔁 REPETICIÓN · cámara lenta — V para volver
          </p>
        )}
        {probe?.rally.message && <p className="hud-message">{probe.rally.message}</p>}

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

        {phase === 'ended' && probe && !matchOver && (
          <div className="rally-summary">
            {match ? (
              <>
                <p>
                  Punto {match.rally.winner === 'human' ? 'tuyo 🏆' : 'del rival'} · marcador{' '}
                  {match.score.games[0]}–{match.score.games[1]} · golpes de la IA: {match.match.aiHits}
                </p>
                <p className="rally-cause">{probe.rally.lastCause}</p>
                {guides.help && (
                  <p className="rally-next">
                    ESPACIO: siguiente saque (saca {SERVER_LABEL[match.match.server]}) · V: repetición
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  Rally terminado: {probe.rally.hits} golpe{probe.rally.hits === 1 ? '' : 's'}
                  {probe.rally.lastShot ? ` · último: ${probe.rally.lastShot}` : ''}
                </p>
                <p className="rally-cause">{probe.rally.lastCause}</p>
                {guides.help && <p className="rally-next">ESPACIO o R: siguiente saque (lado contrario)</p>}
              </>
            )}
          </div>
        )}
      </div>

      <div className="hud-bottom">
        <div className="hud-meters">
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
          {match ? (
            <>
              <span className="hud-chip">Golpes IA: {match.match.aiHits}</span>
              <span className="hud-chip">Errores IA: {match.ai.errors}</span>
            </>
          ) : (
            <>
              <span className="hud-chip">Golpes: {probe?.rally.hits ?? 0}</span>
              <span className="hud-chip">Faltas de saque: {probe?.serve.faults ?? 0}</span>
            </>
          )}
        </div>
        <p className="hud-label">
          {match
            ? `${modeTitle} · v1.1.0 — marcador oficial (15/30/40, juegos y set), audio sintetizado y táctil${
                settings.doubles ? ' · dobles' : ''
              }; las monedas se abonan al cerrar el partido`
            : 'Entrenamiento · Fase 3 — saque con aguja y rally libre sin marcador'}
        </p>
        {guides.help && (
          <p className="hud-help">
            WASD/flechas moverte · ESPACIO/clic golpear y sacar · W potente · S dejada · W+E globo ·
            Q cortado · E liftado · C cámara · V repetición · R reiniciar · M sonido · ESC pausa
          </p>
        )}
        <button type="button" className="btn btn-small hud-btn" onClick={onCycleCamera}>
          Cambiar cámara (C)
        </button>
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
