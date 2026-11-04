// Tests de INTEGRACIÓN de la Fase 8 sobre Match.ts completo (no sobre
// piezas aisladas): la IA y el orquestador juntos (A2), la resolución
// de puntos contra cerramientos laterales (A3), el reinicio unificado
// de carrera con la tecla R (A4) y la repetición automática (M4).
//
// Match se construye en node: sus dependencias (Ball, Player, AI,
// Score…) no usan DOM; solo hay que apuntalar `window` para el
// InputManager y un canvas mínimo.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { emptyCounts, type AudioProbe } from '../src/game/Audio';
import { vec3, type Ball, type BallEvent } from '../src/game/Ball';
import { careerStatus, settleMatch, startCareerRun } from '../src/game/Career';
import { Match, type MatchContext, type MatchPhase } from '../src/game/Match';
import type { MatchSummary } from '../src/game/MatchFlow';
import type { ReplayRecorder } from '../src/game/Replay';
import { defaultWallet } from '../src/state/economy';
import { GameStore, type StorageLike } from '../src/state/store';

// InputManager.attach trabaja sobre `window`: stub mínimo sin eventos.
(globalThis as { window?: unknown }).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

interface MatchInternals {
  ball: Ball;
  phase: MatchPhase;
  lastHitTeam: 'human' | 'ai' | null;
  bouncesOpp: number;
  recorder: ReplayRecorder;
  handleEvent: (event: BallEvent) => void;
}

const internals = (match: Match): MatchInternals => match as unknown as MatchInternals;

const audioProbeStub = (): AudioProbe => ({
  counts: emptyCounts(),
  ctxState: 'none',
  muted: false,
  crowdActive: false,
  crowdNodesCreated: false,
  crowdStarted: false,
  voices: 0,
});

interface Rig {
  match: Match;
  store: GameStore;
  summaries: MatchSummary[];
  newMatchRequests: () => number;
}

/**
 * Monta un Match con el MISMO cableado que la app real: el store manda
 * en settings/carrera y onMatchEnd liquida el partido (settleMatch),
 * como hace App.handleMatchEnd.
 */
function makeMatch(options: { withNewMatchCallback?: boolean } = {}): Rig {
  const store = new GameStore(new MemoryStorage());
  const summaries: MatchSummary[] = [];
  let requests = 0;
  let match: Match;
  const ctx: MatchContext = {
    getSettings: () => store.state.settings,
    getWallet: () => defaultWallet(),
    onToggleMuted: () => undefined,
    onPauseChange: () => undefined,
    getCareer: () => careerStatus(store.state.settings, store.state.run),
    onEffect: () => undefined,
    onMatchEnd: (summary) => {
      summaries.push(summary);
      settleMatch(store, summary);
    },
    onSound: () => undefined,
    getAudioProbe: audioProbeStub,
  };
  if (options.withNewMatchCallback !== false) {
    // El flujo de la app ante la petición: crear/mantener el run y arrancar.
    ctx.onRequestNewMatch = () => {
      requests += 1;
      startCareerRun(store);
      match.startMatch();
    };
  }
  const canvasStub = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLElement;
  match = new Match(new THREE.Group(), canvasStub, ctx);
  return { match, store, summaries, newMatchRequests: () => requests };
}

/** Juega puntos guiados hasta que el partido se cierra. */
function playGuidedMatch(match: Match): void {
  let guard = 0;
  while (!match.probe().match.over && guard++ < 400) match.testWinPoint();
  expect(match.probe().match.over).toBe(true);
}

// ------------------------------------------------------------ A2

describe('Match · A2 — la IA no golpea antes de terminar su reacción', () => {
  it('con la bola en alcance pero aún «reaccionando», no hay golpe; tras decidir, sí', () => {
    const { match } = makeMatch();
    match.testSeed(42);
    match.setActive(true);
    match.testLaunchAtAI();

    const before = match.probe();
    expect(before.ai.state).toBe('reacting');
    expect(before.ai.decisionMs).toBe(null);

    // La bola aparece JUNTO al rival (p. ej. tras su cristal) mientras
    // sigue reaccionando: geométricamente está en alcance.
    const inner = internals(match);
    const rivalPos = before.players.rival.pos;
    inner.ball.pos = vec3(rivalPos[0], 1.0, rivalPos[2]);
    inner.ball.vel = vec3(0, 0.5, 2);
    match.update(0.016);

    const during = match.probe();
    expect(during.ai.state).toBe('reacting');
    expect(during.ai.decisionMs).toBe(null);
    expect(during.match.aiHits).toBe(0);
    expect(during.rally.lastShot).toBe(null); // ni siquiera hubo intento

    // Manteniendo la bola a su alcance, una vez decide SÍ golpea.
    let probe = during;
    let sinceDecision = 0;
    for (let i = 0; i < 600 && probe.match.aiHits === 0; i++) {
      const rp = probe.players.rival.pos;
      inner.ball.pos = vec3(rp[0], 1.0, rp[2]);
      inner.ball.vel = vec3(0, 0.5, 2);
      match.update(0.016);
      probe = match.probe();
      if (probe.ai.decisionMs !== null) {
        sinceDecision += 1;
        // Si el swing salió errado, se relanza una bola nueva (otro ballId).
        if (sinceDecision > 40 && probe.match.aiHits === 0) {
          match.testLaunchAtAI();
          sinceDecision = 0;
        }
      }
    }
    expect(probe.ai.decisionMs).not.toBe(null);
    expect(probe.ai.decisionMs as number).toBeGreaterThanOrEqual(300); // Medio: aiReaction 0,3 s
    expect(probe.match.aiHits).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------ A3

describe('Match · A3 — directa al cerramiento lateral sin botar', () => {
  // La directa al cerramiento sin botar es FALTA de quien golpea (la
  // bola debía botar antes en el campo contrario): el punto es del
  // equipo receptor, igual que ya resolvían el fondo y el saque.
  const wallCases = [
    { kind: 'glass', hitter: 'human', z: 4, winner: 'ai' },
    { kind: 'mesh', hitter: 'human', z: 4.5, winner: 'ai' },
    { kind: 'glass', hitter: 'ai', z: -4, winner: 'human' },
    { kind: 'mesh', hitter: 'ai', z: -4.5, winner: 'human' },
  ] as const;

  for (const c of wallCases) {
    it(`cristal/malla lateral (${c.kind}, golpea ${c.hitter}) cierra el punto para el receptor (${c.winner})`, () => {
      const { match } = makeMatch();
      match.setActive(true);
      const inner = internals(match);
      inner.phase = 'rally';
      inner.lastHitTeam = c.hitter;
      inner.handleEvent({ type: 'wall', kind: c.kind, where: 'side', pos: vec3(Math.sign(c.z) * 5, 1.5, c.z) });
      const probe = match.probe();
      expect(probe.rally.state).toBe('ended');
      expect(probe.rally.winner).toBe(c.winner);
    });
  }

  it('tras un bote en el campo receptor, el lateral NO cierra: el rally sigue', () => {
    const { match } = makeMatch();
    match.setActive(true);
    const inner = internals(match);
    inner.phase = 'rally';
    inner.lastHitTeam = 'human';
    inner.bouncesOpp = 1; // ya botó en el campo de la IA
    inner.handleEvent({ type: 'wall', kind: 'glass', where: 'side', pos: vec3(5, 1.5, 4) });
    expect(match.probe().rally.state).toBe('rally');
  });

  it('el fondo directo sin botar sigue cerrando (comportamiento previo intacto)', () => {
    const { match } = makeMatch();
    match.setActive(true);
    const inner = internals(match);
    inner.phase = 'rally';
    inner.lastHitTeam = 'human';
    inner.handleEvent({ type: 'wall', kind: 'glass', where: 'back-opp', pos: vec3(0, 2, 10) });
    const probe = match.probe();
    expect(probe.rally.state).toBe('ended');
    expect(probe.rally.winner).toBe('ai'); // falta del que golpeó: punto del receptor
  });
});

// ------------------------------------------------------------ A4

describe('Match · A4 — reinicio unificado con R en carrera', () => {
  it('tras la semifinal, R crea el partido de la Final con el run vivo y campeonar abona el bonus', () => {
    const rig = makeMatch();
    const { match, store } = rig;
    store.updateSettings({ mode: 1, opponentLevel: 0 }); // Torneo, base Fácil
    startCareerRun(store); // como hace la app al entrar a jugar
    match.setActive(true);

    playGuidedMatch(match); // semifinal ganada 4-0 en juegos
    expect(rig.summaries).toHaveLength(1);
    expect(rig.summaries[0]?.roundName).toBe('Semifinal'); // M3: ronda jugada
    expect(store.state.run).toMatchObject({ mode: 1, round: 1 }); // avanzó a la Final

    // R sobre el panel de fin: debe pedir el partido a la app, no
    // arrancar uno «suelto» sin carrera.
    match.touchPress('KeyR');
    match.update(0.016);
    expect(rig.newMatchRequests()).toBe(1);
    const restarted = match.probe();
    expect(restarted.match.over).toBe(false);
    expect(restarted.career?.round).toBe(1);
    expect(restarted.career?.roundName).toBe('Final');

    // Ganar ESA final campeona: bonus de 200 y carrera cerrada.
    playGuidedMatch(match);
    expect(rig.summaries).toHaveLength(2);
    expect(rig.summaries[1]?.roundName).toBe('Final');
    expect(rig.summaries[1]?.champion).toBe(true);
    expect(rig.summaries[1]?.coins.bonus).toBe(200);
    expect(store.state.run).toBeNull();
    expect(store.state.stats.torneos).toBe(1);
  });

  it('sin callback de la app, R mantiene el repliegue de arrancar el partido (robustez)', () => {
    const rig = makeMatch({ withNewMatchCallback: false });
    rig.store.updateSettings({ mode: 0 });
    rig.match.setActive(true);
    playGuidedMatch(rig.match);
    rig.match.touchPress('KeyR');
    rig.match.update(0.016);
    expect(rig.match.probe().match.over).toBe(false);
  });
});

// ------------------------------------------------------------ M4

describe('Match · M4 — repetición automática según el ajuste', () => {
  function matchWithRecordedPoint(replays: 0 | 1): Match {
    const rig = makeMatch();
    rig.store.updateSettings({ replays });
    const { match } = rig;
    match.setActive(true);
    // Frames grabados como los dejaría un rally real (muestreo a 20 Hz).
    const inner = internals(match);
    for (let i = 0; i < 5; i++) {
      inner.recorder.record(0.05, [0, 1, 0], [[0, -3], [0, 3]]);
    }
    match.testWinPoint(); // cierra el punto → fase 'ended'
    return match;
  }

  it('Repeticiones=Sí: el punto se repite solo, una sola vez', () => {
    const match = matchWithRecordedPoint(1);
    match.update(0.016);
    expect(match.probe().replay.active).toBe(true);
    // Dejar terminar la repetición: no debe relanzarse en bucle.
    for (let i = 0; i < 120 && match.probe().replay.active; i++) match.update(0.016);
    expect(match.probe().replay.active).toBe(false);
    match.update(0.016);
    expect(match.probe().replay.active).toBe(false);
  });

  it('Repeticiones=No: no hay repetición automática (la manual con V sigue existiendo)', () => {
    const match = matchWithRecordedPoint(0);
    match.update(0.016);
    expect(match.probe().replay.active).toBe(false);
    match.testReplay(); // la vía manual (misma que usa la tecla V)
    expect(match.probe().replay.active).toBe(true);
  });
});
