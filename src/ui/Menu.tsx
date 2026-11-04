import type { GameState } from '../state/store';
import { ambienceById, aiLevelById, cameraName, modeById, playerLevelById, surfaceById } from '../state/modes';

export type Screen = 'menu' | 'setup' | 'shop' | 'court';

interface MenuProps {
  state: GameState;
  onNavigate: (screen: Screen) => void;
  onToggleMuted: () => void;
}

/**
 * Menú principal (Fase 9 — portada recomposada): cabecera con píldora de
 * monedas y píldora de sonido, título y eslogan, botones grandes,
 * chips con la configuración actual, una sola línea de estado y pie con
 * los controles y la identidad de la réplica. Todo DOM: no necesita WebGL.
 */
export function Menu({ state, onNavigate, onToggleMuted }: MenuProps) {
  const { settings, wallet, stats, run, muted } = state;
  const mode = modeById(settings.mode);
  const surface = surfaceById(settings.courtType);

  const chips: string[] = [
    mode.name,
    `${surface.name} · ${surface.label}`,
    settings.doubles ? '1 jugador + CPU vs 2 CPU' : 'Individuales',
    `Tú: ${playerLevelById(settings.playerLevel).name}`,
    `Rival: ${aiLevelById(settings.opponentLevel).name}`,
    ambienceById(settings.ambience).name,
    settings.crowd ? 'Con público' : 'Sin público',
    `Cam. ${cameraName(settings.camera)}`,
    settings.assist ? 'Ayudas: sí' : 'Ayudas: no',
  ];

  // Una sola línea de estado, con prioridad a la carrera en curso.
  let statusLine: string;
  if (run) {
    const runMode = modeById(run.mode);
    const roundName = runMode.rounds[run.round] ?? `Ronda ${run.round + 1}`;
    statusLine = `${runMode.name} en curso: ${roundName} — continúa con «Jugar partido»`;
  } else if (stats.wins === 0 && stats.losses === 0) {
    statusLine = 'Primer partido — ¡a por ello!';
  } else {
    statusLine =
      `Victorias ${stats.wins} · Derrotas ${stats.losses} · Puntos ganados ${stats.pointsWon}` +
      (stats.torneos > 0 ? ` · Torneos ${stats.torneos}` : '') +
      (stats.mundiales > 0 ? ` · Mundiales ${stats.mundiales}` : '');
  }

  return (
    <section className="panel menu-panel" aria-label="Menú principal">
      <div className="topbar">
        <span className="wallet" aria-label="Monedas">🪙 {wallet.coins}</span>
        <button type="button" className="icon-btn sound-pill" onClick={onToggleMuted} aria-pressed={muted}>
          {muted ? '🔇 Sonido: off' : '🔊 Sonido: on'}
        </button>
      </div>

      <h1 className="game-title">
        Pádel <span className="accent">3D</span>
      </h1>
      <p className="tagline">Cristal, pala y gradas llenas. Tu club, tus reglas.</p>

      <div className="menu-actions">
        <button type="button" className="btn btn-primary" onClick={() => onNavigate('court')}>
          ▶ Jugar partido
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('setup')}>
          ⚙ Personalizar partido
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('shop')}>
          🛒 Tienda
        </button>
      </div>

      <div className="chip-row" aria-label="Configuración actual">
        {chips.map((chip) => (
          <span key={chip} className="chip">{chip}</span>
        ))}
      </div>

      <p className="stats-line">{statusLine}</p>

      <div className="help-block">
        <p>
          <strong>WASD</strong> moverte · <strong>ESPACIO</strong>/clic golpear y sacar ·{' '}
          <strong>W/S</strong> potencia/dejada · <strong>A/D</strong> dirección
        </p>
        <p>
          <strong>Q</strong> cortado · <strong>E</strong> liftado · <strong>W+E</strong> globo · en el
          saque, <strong>ESPACIO</strong> de nuevo en el punto dulce = más potencia
        </p>
        <p>
          <strong>C</strong> cámara · <strong>V</strong> repetición · <strong>ESC</strong> pausa ·{' '}
          <strong>M</strong> sonido · <strong>R</strong> reiniciar
        </p>
      </div>

      <p className="replica-subtitle">Réplica clean-room · v1.2.0</p>
    </section>
  );
}
