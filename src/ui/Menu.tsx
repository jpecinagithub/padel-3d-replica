import type { GameState } from '../state/store';
import { ambienceById, aiLevelById, cameraName, modeById, playerLevelById, surfaceById } from '../state/modes';

export type Screen = 'menu' | 'setup' | 'shop' | 'court';

interface MenuProps {
  state: GameState;
  onNavigate: (screen: Screen) => void;
  onToggleMuted: () => void;
}

/** Menú principal: título, monedero, resumen de la configuración y accesos. */
export function Menu({ state, onNavigate, onToggleMuted }: MenuProps) {
  const { settings, wallet, stats, run, muted } = state;
  const mode = modeById(settings.mode);
  const surface = surfaceById(settings.courtType);

  const chips: string[] = [
    mode.name,
    `${surface.name} · ${surface.label}`,
    settings.doubles ? 'Dobles' : 'Individuales',
    `Tú: ${playerLevelById(settings.playerLevel).name}`,
    `Rival: ${aiLevelById(settings.opponentLevel).name}`,
    ambienceById(settings.ambience).name,
    settings.crowd ? 'Con público' : 'Sin público',
    `Cam. ${cameraName(settings.camera)}`,
    settings.assist ? 'Ayudas: sí' : 'Ayudas: no',
  ];
  if (run) {
    const runMode = modeById(run.mode);
    const roundName = runMode.rounds[run.round] ?? `Ronda ${run.round + 1}`;
    chips.push(`${runMode.name} en curso: ${roundName} — continúa con «Jugar partido»`);
  }

  return (
    <section className="panel" aria-label="Menú principal">
      <div className="topbar">
        <span className="wallet" aria-label="Monedas">🪙 {wallet.coins}</span>
        <button type="button" className="icon-btn" onClick={onToggleMuted} aria-pressed={muted}>
          {muted ? '🔇 Sonido: off' : '🔊 Sonido: on'}
        </button>
      </div>

      <h1 className="game-title">
        Pádel <span className="accent">3D</span>
      </h1>
      <p className="replica-subtitle">Réplica clean-room · v1.0.0</p>
      <p className="tagline">Cristal, pala y gradas llenas. Tu club, tus reglas.</p>

      <div className="chip-row" aria-label="Configuración actual">
        {chips.map((chip) => (
          <span key={chip} className="chip">{chip}</span>
        ))}
      </div>

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

      <p className="stats-line">
        Victorias {stats.wins} · Derrotas {stats.losses} · Puntos ganados {stats.pointsWon}
        {stats.torneos > 0 ? ` · Torneos ${stats.torneos}` : ''}
        {stats.mundiales > 0 ? ` · Mundiales ${stats.mundiales}` : ''}
      </p>

      <p className="help-block">
        WASD moverte · ESPACIO/clic golpear y sacar · W/S potencia/dejada · A/D dirección ·
        Q cortado · E liftado · W+E globo · C cámara · V repetición · ESC pausa · M sonido · R reiniciar
        <br />
        («Jugar partido» abre la pista: elige Entrenamiento —saque con aguja y
        rally libre— o Partido completo contra la IA con marcador oficial,
        monedas y, si eliges Torneo o Mundial en Personalizar, carrera por
        rondas que se guarda aunque salgas a mitad.)
      </p>
    </section>
  );
}
