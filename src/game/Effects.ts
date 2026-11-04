// Efectos de partículas propios (Fase 5, SPEC §5.7): un único sistema
// THREE.Points con pool fijo, sin librerías ni assets. Tres sabores:
//
//   - confeti:  chorro ascendente de colores con gravedad y frenada
//               (cae como papel) — fin de rally importante / hook FX.
//   - fuegos:   estallidos esféricos que se expanden y se apagan —
//               victoria de partido (serie de 3 en celebrate()).
//   - dorado:   estallido radial dorado y breve — punto de oro.
//
// El fundido se hace oscureciendo el color por partícula (el material
// usa vertexColors): al morir, la partícula se aparca bajo la pista.

import * as THREE from 'three';
import { vec3, type Vec3 } from './Ball';

export type EffectKind = 'confetti' | 'fireworks' | 'gold';

export interface EffectsProbe {
  /** Partículas vivas ahora mismo. */
  active: number;
  /** Estallidos disparados desde la creación. */
  bursts: number;
  lastKind: EffectKind | null;
}

const MAX_PARTICLES = 900;

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
  r: number;
  g: number;
  b: number;
}

const CONFETTI_COLORS: [number, number, number][] = [
  [0.98, 0.85, 0.25],
  [0.35, 0.85, 0.45],
  [0.35, 0.6, 0.98],
  [0.98, 0.45, 0.6],
  [0.95, 0.95, 0.95],
];
const FIREWORK_COLORS: [number, number, number][] = [
  [1.0, 0.55, 0.25],
  [0.55, 0.8, 1.0],
  [1.0, 0.85, 0.4],
  [0.7, 1.0, 0.55],
];
const GOLD_COLOR: [number, number, number] = [1.0, 0.78, 0.22];

export class Effects {
  readonly group = new THREE.Group();
  private readonly particles: Particle[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly material: THREE.PointsMaterial;
  private readonly points: THREE.Points;
  private pending: { at: Vec3; kind: EffectKind; delay: number }[] = [];
  private bursts = 0;
  private lastKind: EffectKind | null = null;
  private disposed = false;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false, x: 0, y: -60, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, gravity: 0, drag: 0, r: 1, g: 1, b: 1,
      });
    }
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) this.positions[i * 3 + 1] = -60;
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  private spawn(
    at: Vec3,
    count: number,
    make: (p: Particle, i: number) => void,
  ): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.alive) continue;
      p.x = at.x;
      p.y = at.y;
      p.z = at.z;
      make(p, spawned);
      p.alive = true;
      p.life = p.maxLife;
      spawned++;
    }
    this.bursts += 1;
  }

  /** Confeti de colores que sube y cae despacio (gravedad suave + drag). */
  confetti(at: Vec3, count = 140): void {
    this.lastKind = 'confetti';
    this.spawn(at, count, (p, i) => {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * 2.2;
      p.vx = Math.cos(angle) * spread;
      p.vz = Math.sin(angle) * spread;
      p.vy = 4.5 + Math.random() * 4.5;
      p.gravity = -3.2;
      p.drag = 1.1;
      p.maxLife = 1.6 + Math.random() * 1.2;
      const c = CONFETTI_COLORS[i % CONFETTI_COLORS.length] as [number, number, number];
      [p.r, p.g, p.b] = c;
    });
  }

  /** Estallido esférico de fuegos artificiales. */
  firework(at: Vec3, count = 150): void {
    this.lastKind = 'fireworks';
    const color = FIREWORK_COLORS[(Math.random() * FIREWORK_COLORS.length) | 0] as [number, number, number];
    this.spawn(at, count, (p) => {
      // Dirección aleatoria en la esfera, velocidad casi uniforme.
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const speed = 5.5 + Math.random() * 3.5;
      p.vx = s * Math.cos(theta) * speed;
      p.vy = u * speed;
      p.vz = s * Math.sin(theta) * speed;
      p.gravity = -2.4;
      p.drag = 0.7;
      p.maxLife = 1.1 + Math.random() * 0.7;
      [p.r, p.g, p.b] = color;
    });
  }

  /** Estallido dorado breve y denso (punto de oro). */
  goldBurst(at: Vec3, count = 90): void {
    this.lastKind = 'gold';
    this.spawn(at, count, (p) => {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const speed = 2.5 + Math.random() * 3;
      p.vx = s * Math.cos(theta) * speed;
      p.vy = Math.abs(u) * speed * 0.9 + 0.8;
      p.vz = s * Math.sin(theta) * speed;
      p.gravity = -4.5;
      p.drag = 0.9;
      p.maxLife = 0.7 + Math.random() * 0.5;
      [p.r, p.g, p.b] = GOLD_COLOR;
    });
  }

  /** Espectáculo de victoria: 3 fuegos escalonados + confeti central. */
  celebrate(): void {
    this.confetti(vec3(0, 1.2, 0), 160);
    this.pending = [
      { at: vec3(-3.5, 6.5, 0), kind: 'fireworks', delay: 0.1 },
      { at: vec3(3.5, 7.5, -2), kind: 'fireworks', delay: 0.55 },
      { at: vec3(0, 8.5, 2.5), kind: 'fireworks', delay: 1.0 },
    ];
  }

  update(dt: number): void {
    if (this.disposed || dt <= 0) return;
    if (this.pending.length > 0) {
      for (const item of this.pending) item.delay -= dt;
      const due = this.pending.filter((item) => item.delay <= 0);
      this.pending = this.pending.filter((item) => item.delay > 0);
      for (const item of due) {
        if (item.kind === 'fireworks') this.firework(item.at);
        else if (item.kind === 'gold') this.goldBurst(item.at);
        else this.confetti(item.at);
      }
    }
    let i3 = 0;
    for (const p of this.particles) {
      if (p.alive) {
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          p.y = -60;
        } else {
          p.vy += p.gravity * dt;
          const dragFactor = Math.max(0, 1 - p.drag * dt);
          p.vx *= dragFactor;
          p.vy *= dragFactor;
          p.vz *= dragFactor;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < 0.03) {
            p.y = 0.03;
            p.vy = 0;
          }
        }
      }
      this.positions[i3] = p.x;
      this.positions[i3 + 1] = p.y;
      this.positions[i3 + 2] = p.z;
      const fade = p.alive ? Math.min(1, p.life / (p.maxLife * 0.55)) : 0;
      this.colors[i3] = p.r * fade;
      this.colors[i3 + 1] = p.g * fade;
      this.colors[i3 + 2] = p.b * fade;
      i3 += 3;
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  probe(): EffectsProbe {
    let active = 0;
    for (const p of this.particles) if (p.alive) active++;
    return { active, bursts: this.bursts, lastKind: this.lastKind };
  }

  dispose(): void {
    this.disposed = true;
    this.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
