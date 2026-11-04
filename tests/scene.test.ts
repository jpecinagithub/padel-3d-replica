import { describe, expect, it } from 'vitest';
import { AMBIENCE_PRESETS, ambiencePreset } from '../src/game/ambiencePresets';
import {
  CAMERA_ORDER,
  FREE_BASE_DISTANCE,
  ZOOM_MAX,
  ZOOM_MIN,
  cameraKindFromSettings,
  cameraPose,
  clampPolar,
  clampZoom,
  nextCameraKind,
  orbitPosition,
} from '../src/game/cameraMath';
import { COURT, CROWD_TOTAL } from '../src/game/courtConstants';
import { SURFACES, surfaceById } from '../src/state/modes';

describe('presets de ambiente (Fase 2)', () => {
  it('hay tres ambientes con los valores de la SPEC §5.1', () => {
    expect(AMBIENCE_PRESETS).toHaveLength(3);
    const noche = ambiencePreset(0);
    expect(noche.name).toBe('Noche');
    expect(noche.fogNear).toBe(38);
    expect(noche.fogFar).toBe(95);
    expect(noche.exposure).toBe(1.18);
    expect(noche.stars).toBeGreaterThan(0);
    const dia = ambiencePreset(1);
    expect(dia.name).toBe('Día');
    expect(dia.stars).toBe(0);
    expect(dia.fogNear).toBe(60);
    expect(dia.fogFar).toBe(160);
    expect(dia.exposure).toBe(1.0);
    const atardecer = ambiencePreset(2);
    expect(atardecer.name).toBe('Atardecer');
    expect(atardecer.exposure).toBe(1.05);
    expect(atardecer.stars).toBe(0);
  });

  it('un id desconocido cae al preset por defecto (Noche)', () => {
    expect(ambiencePreset(99).id).toBe(0);
    expect(ambiencePreset(-1).id).toBe(0);
  });

  it('el sol de Atardecer está bajo y el de Día alto (coherencia visual)', () => {
    expect(ambiencePreset(2).sunPosition[1]).toBeLessThan(ambiencePreset(1).sunPosition[1]);
  });
});

describe('mapeo superficie → colores de pista', () => {
  it('las cuatro superficies tienen colores de pista distintos', () => {
    const colors = SURFACES.map((s) => s.courtColor);
    expect(new Set(colors).size).toBe(4);
  });

  it('Azul y Roja se distinguen por el canal dominante (base de la verificación visual)', () => {
    const channels = (hex: string) => ({
      r: parseInt(hex.slice(1, 3), 16),
      b: parseInt(hex.slice(5, 7), 16),
    });
    const azul = channels(surfaceById(0).courtColor);
    expect(azul.b).toBeGreaterThan(azul.r);
    const roja = channels(surfaceById(2).courtColor);
    expect(roja.r).toBeGreaterThan(roja.b);
  });
});

describe('constantes de la pista', () => {
  it('son las reglamentarias de la SPEC §5.2', () => {
    expect(COURT.halfWidth).toBe(5);
    expect(COURT.halfLength).toBe(10);
    expect(COURT.netHeight).toBe(0.88);
    expect(COURT.glassHeight).toBe(3);
    expect(COURT.wallHeight).toBe(4);
    expect(COURT.serviceLineZ).toBe(6.95);
  });

  it('el público instanciado es una cantidad fija y documentada', () => {
    expect(CROWD_TOTAL).toBe(306);
  });
});

describe('cámaras: mapeo y ciclo', () => {
  it('settings.camera mapea 0→TV, 1→Jugador, 2→Libre y el resto→TV', () => {
    expect(cameraKindFromSettings(0)).toBe('tv');
    expect(cameraKindFromSettings(1)).toBe('player');
    expect(cameraKindFromSettings(2)).toBe('free');
    expect(cameraKindFromSettings(7)).toBe('tv');
  });

  it('la tecla C cicla TV → Jugador → Libre → TV', () => {
    expect(CAMERA_ORDER).toEqual(['tv', 'player', 'free']);
    expect(nextCameraKind('tv')).toBe('player');
    expect(nextCameraKind('player')).toBe('free');
    expect(nextCameraKind('free')).toBe('tv');
  });
});

describe('cámaras: zoom', () => {
  it('clampZoom respeta el rango 0,45–2,6 de la SPEC', () => {
    expect(ZOOM_MIN).toBe(0.45);
    expect(ZOOM_MAX).toBe(2.6);
    expect(clampZoom(0.1)).toBe(0.45);
    expect(clampZoom(99)).toBe(2.6);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('a mayor zoom, menor distancia de la cámara TV al punto de mira', () => {
    const distance = (zoom: number) => {
      const pose = cameraPose('tv', zoom);
      return Math.hypot(
        pose.position[0] - pose.lookAt[0],
        pose.position[1] - pose.lookAt[1],
        pose.position[2] - pose.lookAt[2],
      );
    };
    expect(distance(2.6)).toBeLessThan(distance(1));
    expect(distance(1)).toBeLessThan(distance(0.45));
    // El zoom fuera de rango se comporta como el extremo del rango.
    expect(distance(10)).toBeCloseTo(distance(2.6));
  });
});

describe('cámaras: poses y órbita', () => {
  it('la cámara TV está elevada tras un fondo y mira al centro', () => {
    const pose = cameraPose('tv');
    expect(pose.position[1]).toBeGreaterThan(8);
    expect(pose.position[2]).toBeGreaterThan(10);
    expect(pose.lookAt).toEqual([0, 0.5, 0]);
  });

  it('la cámara Jugador está baja tras el fondo local (z<0) mirando hacia la red', () => {
    const pose = cameraPose('player');
    expect(pose.position[1]).toBeLessThan(3);
    expect(pose.position[2]).toBeLessThan(-10);
    expect(pose.lookAt[2]).toBeGreaterThan(pose.position[2]);
  });

  it('orbitPosition conserva el radio y respeta el clamp polar', () => {
    const target: [number, number, number] = [0, 0.5, 0];
    const distance = FREE_BASE_DISTANCE;
    const pos = orbitPosition(target, 0.7, 1.0, distance);
    const actual = Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
    expect(actual).toBeCloseTo(distance, 5);
    expect(clampPolar(0)).toBeGreaterThan(0);
    expect(clampPolar(3)).toBeLessThan(Math.PI / 2);
    const top = orbitPosition(target, 0, 0, distance);
    expect(top[1]).toBeLessThanOrEqual(target[1] + distance);
  });
});
