import { describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  AMBIENCES,
  GAME_MODES,
  PLAYER_LEVELS,
  SURFACES,
  effectiveOpponentLevel,
  modeById,
} from '../src/state/modes';

describe('Datos de configuración (SPEC §5.1)', () => {
  it('modos: rápida a 6 sin bonus, Torneo y Mundial a 4 con bonus 200/500 y rampa 1', () => {
    expect(GAME_MODES.map((m) => [m.gamesToWin, m.championBonus, m.levelRamp])).toEqual([
      [6, 0, 0],
      [4, 200, 1],
      [4, 500, 1],
    ]);
    expect(modeById(1).rounds).toEqual(['Semifinal', 'Final']);
    expect(modeById(2).rounds).toEqual(['Cuartos', 'Semifinal', 'Final']);
    expect(modeById(0).rounds).toEqual([]);
  });

  it('la rampa sube el nivel efectivo del rival por ronda, con tope', () => {
    const torneo = modeById(1);
    expect(effectiveOpponentLevel(0, torneo, 0)).toBe(0);
    expect(effectiveOpponentLevel(0, torneo, 1)).toBe(1);
    expect(effectiveOpponentLevel(2, torneo, 1)).toBe(2); // no pasa del máximo
    expect(effectiveOpponentLevel(1, modeById(0), 3)).toBe(1); // rápida no tiene rampa
  });

  it('niveles de jugador con velocidad / suelo de calidad / jitter exactos', () => {
    expect(PLAYER_LEVELS.map((l) => [l.speed, l.qualityFloor, l.jitter])).toEqual([
      [6.4, 0.28, 1.4],
      [7.2, 0.35, 0.5],
      [7.9, 0.45, 0],
    ]);
  });

  it('niveles de IA con sus parámetros exactos', () => {
    expect(AI_LEVELS.map((l) => [l.aiSpeed, l.aiReaction, l.aiError, l.aiServeFault, l.aiWallError])).toEqual([
      [5, 0.5, 0.24, 0.14, 0.25],
      [6.1, 0.3, 0.12, 0.07, 0.15],
      [7, 0.16, 0.05, 0.03, 0.07],
    ]);
  });

  it('superficies con multiplicadores exactos', () => {
    expect(SURFACES.map((s) => [s.bounce, s.friction, s.wall])).toEqual([
      [1, 1, 1],
      [0.85, 0.5, 1.05],
      [1.22, 1.7, 0.9],
      [1.05, 0.85, 1.18],
    ]);
  });

  it('ambientes: Noche por defecto (id 0) con sus valores de niebla/exposición', () => {
    expect(AMBIENCES.map((a) => a.name)).toEqual(['Noche', 'Día', 'Atardecer']);
    expect(AMBIENCES[0]).toMatchObject({ fogNear: 38, fogFar: 95, exposure: 1.18 });
  });
});
