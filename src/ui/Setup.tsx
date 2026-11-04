import type { GameStore, Settings } from '../state/store';
import { AI_LEVELS, AMBIENCES, CAMERAS, GAME_MODES, PLAYER_LEVELS, SURFACES } from '../state/modes';

interface SetupProps {
  store: GameStore;
  settings: Settings;
  onBack: () => void;
}

interface SegOption {
  value: string;
  label: string;
  caption?: string;
}

function OptionGroup({
  title,
  options,
  current,
  onSelect,
}: {
  title: string;
  options: SegOption[];
  current: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="option-group">
      <h3>{title}</h3>
      <div className="seg-row" role="group" aria-label={title}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === current ? 'seg-btn active' : 'seg-btn'}
            aria-pressed={option.value === current}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
            {option.caption ? <small>{option.caption}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

const num = (n: number) => String(n);
const boolOpts: SegOption[] = [
  { value: 'true', label: 'Sí' },
  { value: 'false', label: 'No' },
];

/** Pantalla de personalización: cada control edita `settings` y persiste al instante. */
export function Setup({ store, settings, onBack }: SetupProps) {
  const set = (patch: Partial<Settings>) => store.updateSettings(patch);
  const intGroup = (
    title: string,
    options: SegOption[],
    current: number,
    apply: (value: number) => void,
  ) => (
    <OptionGroup title={title} options={options} current={num(current)} onSelect={(v) => apply(Number(v))} />
  );

  return (
    <section className="panel" aria-label="Personalizar partido">
      <h2 className="screen-title">⚙ Personalizar partido</h2>
      <p className="screen-note">Cada cambio se guarda automáticamente en este navegador.</p>

      {intGroup(
        'Modo de juego',
        GAME_MODES.map((m) => ({
          value: num(m.id),
          label: m.name,
          caption: m.id === 0 ? 'Set a 6 juegos' : `Set a 4 · bonus ${m.championBonus} 🪙`,
        })),
        settings.mode,
        (v) => set({ mode: v }),
      )}

      {intGroup(
        'Tipo de pista',
        SURFACES.map((s) => ({ value: num(s.id), label: s.name, caption: s.label })),
        settings.courtType,
        (v) => set({ courtType: v }),
      )}

      <OptionGroup
        title="Formato"
        options={[
          { value: 'false', label: 'Individuales' },
          { value: 'true', label: 'Dobles', caption: 'Con compañero IA' },
        ]}
        current={String(settings.doubles)}
        onSelect={(v) => set({ doubles: v === 'true' })}
      />

      {intGroup(
        'Tu nivel',
        PLAYER_LEVELS.map((l) => ({ value: num(l.id), label: l.name })),
        settings.playerLevel,
        (v) => set({ playerLevel: v }),
      )}

      {intGroup(
        'Nivel del rival',
        AI_LEVELS.map((l) => ({ value: num(l.id), label: l.name })),
        settings.opponentLevel,
        (v) => set({ opponentLevel: v }),
      )}

      {intGroup(
        'Ambiente',
        AMBIENCES.map((a) => ({ value: num(a.id), label: a.name })),
        settings.ambience,
        (v) => set({ ambience: v }),
      )}

      {intGroup(
        'Cámara',
        CAMERAS.map((c) => ({ value: num(c.id), label: c.name })),
        settings.camera,
        (v) => set({ camera: v }),
      )}

      <OptionGroup
        title="Público"
        options={boolOpts}
        current={String(settings.crowd)}
        onSelect={(v) => set({ crowd: v === 'true' })}
      />

      <OptionGroup
        title="Repeticiones"
        options={boolOpts}
        current={String(settings.replays === 1)}
        onSelect={(v) => set({ replays: v === 'true' ? 1 : 0 })}
      />

      <OptionGroup
        title="Ayudas"
        options={boolOpts}
        current={String(settings.assist === 1)}
        onSelect={(v) => set({ assist: v === 'true' ? 1 : 0 })}
      />

      <button type="button" className="btn btn-primary" onClick={onBack}>
        ← Volver al menú
      </button>
    </section>
  );
}
