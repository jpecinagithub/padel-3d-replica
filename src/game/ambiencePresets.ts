// Presets de ambiente para la escena 3D (REPLICA_SPEC §5.1 y §5.6).
// Módulo puro: extiende los datos de modes.ts (cielo, niebla, exposición)
// con los parámetros de iluminación y decorado que necesita la Fase 2.

import type { Vec3Tuple } from './cameraMath';

export interface AmbiencePreset {
  id: number;
  name: string;
  /** Degradado del cielo: cenit y horizonte. */
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** Exposición del renderer (toneMappingExposure). */
  exposure: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** Luz clave (con sombras): sol de día, focos de noche. */
  sunColor: string;
  sunIntensity: number;
  sunPosition: Vec3Tuple;
  /** Luz de relleno, sin sombras, desde el lado opuesto. */
  fillColor: string;
  fillIntensity: number;
  /** Nº de estrellas visibles (0 = cielo sin estrellas). */
  stars: number;
  cloudColor: string;
  cloudOpacity: number;
  mountainColor: string;
  /** Suelo exterior a la pista (fuera del apron). */
  groundColor: string;
}

export const AMBIENCE_PRESETS: AmbiencePreset[] = [
  {
    id: 0,
    name: 'Noche',
    skyTop: '#04060f',
    skyHorizon: '#16263f',
    fogColor: '#0a1020',
    fogNear: 38,
    fogFar: 95,
    exposure: 1.18,
    hemiSky: '#8fb4ff',
    hemiGround: '#1a2438',
    hemiIntensity: 0.55,
    sunColor: '#cfe4ff',
    sunIntensity: 1.7,
    sunPosition: [18, 26, 12],
    fillColor: '#5a76b8',
    fillIntensity: 0.4,
    stars: 900,
    cloudColor: '#aebfd8',
    cloudOpacity: 0.1,
    mountainColor: '#0d1626',
    groundColor: '#0b1220',
  },
  {
    id: 1,
    name: 'Día',
    skyTop: '#3f8fd2',
    skyHorizon: '#bcd9f2',
    fogColor: '#a8c8e8',
    fogNear: 60,
    fogFar: 160,
    exposure: 1.0,
    hemiSky: '#bcd8ff',
    hemiGround: '#3d5a43',
    hemiIntensity: 0.95,
    sunColor: '#fff2d8',
    sunIntensity: 2.3,
    sunPosition: [25, 32, 10],
    fillColor: '#bcd4ff',
    fillIntensity: 0.5,
    stars: 0,
    cloudColor: '#ffffff',
    cloudOpacity: 0.85,
    mountainColor: '#5a7d9c',
    groundColor: '#2e4a38',
  },
  {
    id: 2,
    name: 'Atardecer',
    skyTop: '#37477d',
    skyHorizon: '#f2a56b',
    fogColor: '#c98d63',
    fogNear: 45,
    fogFar: 120,
    exposure: 1.05,
    hemiSky: '#ffb37a',
    hemiGround: '#2c2438',
    hemiIntensity: 0.65,
    sunColor: '#ff9a4d',
    sunIntensity: 1.9,
    sunPosition: [-24, 9, 8],
    fillColor: '#7a5a9c',
    fillIntensity: 0.35,
    stars: 0,
    cloudColor: '#f7c8a0',
    cloudOpacity: 0.5,
    mountainColor: '#4a3550',
    groundColor: '#1c2430',
  },
];

/** Preset por id de settings.ambience; cualquier id desconocido cae a Noche. */
export function ambiencePreset(id: number): AmbiencePreset {
  return AMBIENCE_PRESETS.find((preset) => preset.id === id) ?? (AMBIENCE_PRESETS[0] as AmbiencePreset);
}
