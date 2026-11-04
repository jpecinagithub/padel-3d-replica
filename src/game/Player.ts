// Figura de jugador de la Fase 4: rig articulado PROCEDURAL completo en
// código (pelvis, tronco, cabeza, brazos con antebrazo y pala, piernas con
// muslo y pantorrilla, todo con pivotes propios) y un sistema de animación
// por estados equivalente a los clips que traería un GLB:
//
//   idle · split (SplitStep) · run · drive · backhand · lob · drop ·
//   smash · serve · celebrate · disappointed
//
// ¿Por qué no un GLB? La SPEC §5.6 preveía un GLB propio hecho en Blender,
// pero Blender no está instalado en esta VM y no se instala software
// pesado por cuenta propia (ver FASE4_INFORME.md). La interfaz pública es
// la que consumiría un GLB (play(estado), setColors, setPosition,
// faceTowards, update): sustituir el interior por un modelo cargado con
// GLTFLoader + AnimationMixer no exige tocar ni la IA ni los modos.
//
// Alturas: piernas ~0,94 m, hombros a ~1,48 m, coronilla a ~1,80 m.
// Los colores (camiseta, pantalón, piel, gorra, pala) se aplican a los
// materiales y se pueden cambiar en caliente (lo equipado en la tienda).

import * as THREE from 'three';

export interface PlayerColors {
  shirt: string;
  skin: string;
  cap: string;
  pants: string;
}

export const DEFAULT_PLAYER_COLORS: PlayerColors = {
  shirt: '#22b8cf',
  skin: '#d9a06b',
  cap: '#22b8cf',
  pants: '#20304d',
};

export type AnimState =
  | 'idle'
  | 'split'
  | 'run'
  | 'drive'
  | 'backhand'
  | 'lob'
  | 'drop'
  | 'smash'
  | 'serve'
  | 'celebrate'
  | 'disappointed';

/** Duración (s) de los estados de un solo paso; idle/run son continuos. */
const ONE_SHOT_DURATION: Partial<Record<AnimState, number>> = {
  split: 0.45,
  drive: 0.34,
  backhand: 0.36,
  lob: 0.44,
  drop: 0.38,
  smash: 0.52,
  serve: 0.78,
  celebrate: 1.5,
  disappointed: 1.3,
};

const SWING_STATES: ReadonlySet<AnimState> = new Set(['drive', 'backhand', 'lob', 'drop', 'smash', 'serve']);

interface Pivots {
  inner: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  foreL: THREE.Group;
  armR: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  shinL: THREE.Group;
  legR: THREE.Group;
  shinR: THREE.Group;
}

export class PlayerFigure {
  readonly group = new THREE.Group();
  /** Posición de los pies (la misma referencia que group.position). */
  readonly pos = new THREE.Vector3(0, 0, -7.55);
  private readonly mats: {
    torso: THREE.MeshStandardMaterial;
    skin: THREE.MeshStandardMaterial;
    cap: THREE.MeshStandardMaterial;
    pants: THREE.MeshStandardMaterial;
    racket: THREE.MeshStandardMaterial;
  };
  private readonly p: Pivots;
  private yaw = 0;
  private targetYaw = 0;
  private runPhase = 0;
  private idlePhase = 0;
  private state: AnimState = 'idle';
  private stateT = 0;
  /** Velocidad actual 0..1 que alimenta la zancada cuando no hay one-shot. */
  private moveRatio = 0;

  constructor(colors: Partial<PlayerColors> & { racket?: string } = {}) {
    const merged = { ...DEFAULT_PLAYER_COLORS, ...colors };
    this.mats = {
      torso: new THREE.MeshStandardMaterial({ color: merged.shirt, roughness: 0.85 }),
      skin: new THREE.MeshStandardMaterial({ color: merged.skin, roughness: 0.7 }),
      cap: new THREE.MeshStandardMaterial({ color: merged.cap, roughness: 0.8 }),
      pants: new THREE.MeshStandardMaterial({ color: merged.pants, roughness: 0.9 }),
      racket: new THREE.MeshStandardMaterial({ color: colors.racket ?? '#2b2f36', roughness: 0.5, metalness: 0.3 }),
    };
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.6 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });

    const mesh = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
    ): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const pivot = (parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    const inner = new THREE.Group();
    this.group.add(inner);

    // ---- Pelvis (cadera) a 0,94 m ----
    const pelvis = pivot(inner, 0, 0.94, 0);
    mesh(pelvis, new THREE.BoxGeometry(0.42, 0.26, 0.26), this.mats.pants, 0, 0.02, 0);

    // ---- Piernas: muslo (piel, bajo el pantalón) + pantorrilla + zapato ----
    const buildLeg = (hipX: number): { leg: THREE.Group; shin: THREE.Group } => {
      const leg = pivot(pelvis, hipX, -0.06, 0);
      mesh(leg, new THREE.CapsuleGeometry(0.082, 0.3, 4, 10), this.mats.skin, 0, -0.22, 0);
      const shin = pivot(leg, 0, -0.44, 0);
      mesh(shin, new THREE.CapsuleGeometry(0.062, 0.3, 4, 10), this.mats.skin, 0, -0.2, 0);
      mesh(shin, new THREE.BoxGeometry(0.11, 0.07, 0.27), shoeMat, 0, -0.42, 0.05);
      return { leg, shin };
    };
    const legL = buildLeg(-0.14);
    const legR = buildLeg(0.14);

    // ---- Tronco (camiseta) ----
    const torso = pivot(pelvis, 0, 0.1, 0);
    mesh(torso, new THREE.CapsuleGeometry(0.175, 0.4, 4, 12), this.mats.torso, 0, 0.28, 0);

    // ---- Cabeza con gorra (el grupo permite asentir/negar) ----
    const head = pivot(torso, 0, 0.62, 0);
    mesh(head, new THREE.SphereGeometry(0.132, 14, 10), this.mats.skin, 0, 0.1, 0);
    mesh(head, new THREE.CylinderGeometry(0.142, 0.148, 0.07, 12), this.mats.cap, 0, 0.21, 0);
    const brim = mesh(head, new THREE.BoxGeometry(0.2, 0.03, 0.15), this.mats.cap, 0, 0.18, 0.15);
    brim.castShadow = false;

    // ---- Brazos: brazo + antebrazo; el derecho lleva la pala ----
    const buildArm = (shoulderX: number, withRacket: boolean): { arm: THREE.Group; fore: THREE.Group } => {
      const arm = pivot(torso, shoulderX, 0.5, 0.01);
      mesh(arm, new THREE.CapsuleGeometry(0.058, 0.26, 4, 8), this.mats.skin, 0, -0.17, 0);
      // Manga corta del color de la camiseta.
      mesh(arm, new THREE.CapsuleGeometry(0.068, 0.08, 4, 8), this.mats.torso, 0, -0.06, 0);
      const fore = pivot(arm, 0, -0.36, 0);
      mesh(fore, new THREE.CapsuleGeometry(0.05, 0.24, 4, 8), this.mats.skin, 0, -0.15, 0);
      if (withRacket) {
        const racket = new THREE.Group();
        racket.position.set(0, -0.32, 0.03);
        racket.rotation.x = 0.5;
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8), darkMat);
        handle.rotation.x = Math.PI / 2.6;
        handle.castShadow = true;
        racket.add(handle);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.034, 18), this.mats.racket);
        disc.rotation.x = Math.PI / 2;
        disc.position.set(0, 0.02, 0.24);
        disc.castShadow = true;
        racket.add(disc);
        fore.add(racket);
      }
      return { arm, fore };
    };
    const armL = buildArm(-0.29, false);
    const armR = buildArm(0.29, true);

    this.p = {
      inner,
      pelvis,
      torso,
      head,
      armL: armL.arm,
      foreL: armL.fore,
      armR: armR.arm,
      foreR: armR.fore,
      legL: legL.leg,
      shinL: legL.shin,
      legR: legR.leg,
      shinR: legR.shin,
    };
    this.group.position.copy(this.pos);
    this.resetPose();
    this.applyPose(0);
  }

  // ------------------------------------------------------------ API

  /** Estado de animación actual (para probes y depuración). */
  get animState(): AnimState {
    return this.state;
  }

  /**
   * Pide un estado de animación. Los one-shot (golpes, split, celebración…)
   * se reproducen una vez y vuelven solos a idle/run; pedir un golpe nuevo
   * reinicia el anterior. idle/run son continuos y ceden ante un one-shot.
   */
  play(state: AnimState): void {
    if (SWING_STATES.has(state) || ONE_SHOT_DURATION[state] !== undefined) {
      this.state = state;
      this.stateT = 0;
      return;
    }
    // Continuos: solo mandan si no hay un one-shot en curso.
    if (ONE_SHOT_DURATION[this.state] === undefined || this.stateT >= (ONE_SHOT_DURATION[this.state] ?? 0)) {
      this.state = state;
      this.stateT = 0;
    }
  }

  /** Compatibilidad con la Fase 3: gesto de golpeo (drive por defecto). */
  startSwing(kind: AnimState = 'drive'): void {
    this.play(SWING_STATES.has(kind) ? kind : 'drive');
  }

  /** Aplica los colores equipados (camiseta, pantalón, piel, gorra, pala). */
  setColors(colors: Partial<PlayerColors> & { racket?: string }): void {
    if (colors.shirt) this.mats.torso.color.set(colors.shirt);
    if (colors.skin) this.mats.skin.color.set(colors.skin);
    if (colors.cap) this.mats.cap.color.set(colors.cap);
    if (colors.pants) this.mats.pants.color.set(colors.pants);
    if (colors.racket) this.mats.racket.color.set(colors.racket);
  }

  /** Orienta la figura hacia un punto (suavizado en update). */
  faceTowards(x: number, z: number): void {
    this.targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  /** Orienta la figura hacia la red según su lado es contexto del llamante. */
  faceNet(): void {
    this.targetYaw = this.pos.z <= 0 ? 0 : Math.PI;
  }

  setPosition(x: number, z: number): void {
    this.pos.set(x, 0, z);
    this.group.position.copy(this.pos);
  }

  // ------------------------------------------------------------ pose

  private resetPose(): void {
    const p = this.p;
    p.inner.position.set(0, 0, 0);
    p.inner.rotation.set(0, 0, 0);
    p.pelvis.rotation.set(0, 0, 0);
    p.torso.rotation.set(0, 0, 0);
    p.head.rotation.set(0, 0, 0);
    p.armL.rotation.set(0.12, 0, 0.22);
    p.foreL.rotation.set(-0.25, 0, 0);
    p.armR.rotation.set(0.12, 0, -0.22);
    p.foreR.rotation.set(-0.55, 0, 0);
    p.legL.rotation.set(0, 0, 0.03);
    p.shinL.rotation.set(0.06, 0, 0);
    p.legR.rotation.set(0, 0, -0.03);
    p.shinR.rotation.set(0.06, 0, 0);
  }

  private applyPose(dt: number): void {
    const p = this.p;
    const t = this.stateT;
    const dur = ONE_SHOT_DURATION[this.state];
    const k = dur ? Math.min(1, t / dur) : 0;
    const ease = (x: number): number => x * x * (3 - 2 * x);
    const swingCurve = Math.sin(Math.min(1, k) * Math.PI); // sube y baja

    switch (this.state) {
      case 'run': {
        const ph = this.runPhase;
        const amp = 0.62 * Math.max(0.25, this.moveRatio);
        p.legL.rotation.x = Math.sin(ph) * amp;
        p.legR.rotation.x = Math.sin(ph + Math.PI) * amp;
        p.shinL.rotation.x = Math.max(0, -Math.sin(ph)) * 0.85 + 0.08;
        p.shinR.rotation.x = Math.max(0, -Math.sin(ph + Math.PI)) * 0.85 + 0.08;
        p.armL.rotation.x = Math.sin(ph + Math.PI) * 0.5;
        p.armR.rotation.x = Math.sin(ph) * 0.42 - 0.1;
        p.foreR.rotation.x = -0.7;
        p.inner.rotation.x = 0.13 * this.moveRatio;
        p.inner.position.y = Math.abs(Math.sin(ph)) * 0.05 * this.moveRatio;
        break;
      }
      case 'split': {
        const c = swingCurve;
        p.inner.position.y = -0.09 * c;
        p.legL.rotation.z = 0.3 * c;
        p.legR.rotation.z = -0.3 * c;
        p.shinL.rotation.x = 0.38 * c;
        p.shinR.rotation.x = 0.38 * c;
        p.torso.rotation.x = 0.16 * c;
        p.armR.rotation.x = -0.5 * c;
        p.foreR.rotation.x = -0.35;
        break;
      }
      case 'drive': {
        // Barrido de derecha: atrás (k<0.35) y golpe hacia delante.
        const wind = k < 0.35 ? ease(k / 0.35) : 1 - ease((k - 0.35) / 0.65);
        p.armR.rotation.x = -0.3 - 1.5 * wind + 2.1 * (k < 0.35 ? 0 : ease((k - 0.35) / 0.65));
        p.armR.rotation.z = -0.22 - 0.35 * wind;
        p.foreR.rotation.x = -0.25 - 0.5 * wind;
        p.torso.rotation.y = -0.45 * wind + 0.25 * (1 - wind);
        p.inner.rotation.x = 0.08 * swingCurve;
        break;
      }
      case 'backhand': {
        const wind = k < 0.35 ? ease(k / 0.35) : 1 - ease((k - 0.35) / 0.65);
        p.armR.rotation.z = -0.22 - 1.05 * wind;
        p.armR.rotation.x = -0.25 - 0.7 * wind + 1.2 * (k < 0.35 ? 0 : ease((k - 0.35) / 0.65));
        p.foreR.rotation.x = -0.3 - 0.4 * wind;
        p.torso.rotation.y = 0.4 * wind - 0.2 * (1 - wind);
        p.inner.rotation.x = 0.07 * swingCurve;
        break;
      }
      case 'lob': {
        const c = swingCurve;
        p.armR.rotation.x = -0.3 - 2.0 * c;
        p.foreR.rotation.x = -0.2 - 0.3 * c;
        p.head.rotation.x = -0.25 * c;
        p.torso.rotation.x = -0.1 * c;
        p.inner.position.y = 0.03 * c;
        break;
      }
      case 'drop': {
        const c = swingCurve;
        p.armR.rotation.x = -0.3 - 0.75 * c;
        p.foreR.rotation.x = -0.15;
        p.torso.rotation.x = 0.22 * c;
        p.inner.position.y = -0.06 * c;
        p.shinL.rotation.x = 0.25 * c;
        p.shinR.rotation.x = 0.25 * c;
        break;
      }
      case 'smash': {
        const jump = Math.sin(Math.min(1, k) * Math.PI);
        p.inner.position.y = 0.34 * jump;
        const wind = k < 0.4 ? ease(k / 0.4) : 1 - ease((k - 0.4) / 0.6);
        p.armR.rotation.x = -0.4 - 2.5 * wind + 1.9 * (k < 0.4 ? 0 : ease((k - 0.4) / 0.6));
        p.foreR.rotation.x = -0.15 - 0.55 * wind;
        p.torso.rotation.x = -0.18 * wind + 0.22 * (1 - wind) * (k > 0.4 ? 1 : 0);
        p.legL.rotation.x = 0.3 * jump;
        p.legR.rotation.x = -0.22 * jump;
        p.shinL.rotation.x = 0.5 * jump;
        p.shinR.rotation.x = 0.4 * jump;
        break;
      }
      case 'serve': {
        // Lanzamiento con la izquierda y swing alto con la derecha.
        const toss = k < 0.45 ? ease(k / 0.45) : 1;
        p.armL.rotation.x = 0.12 - 2.6 * toss * (k < 0.8 ? 1 : 1 - ease((k - 0.8) / 0.2));
        const wind = k < 0.55 ? ease(k / 0.55) : 1 - ease((k - 0.55) / 0.45);
        p.armR.rotation.x = -0.4 - 2.4 * wind + 1.8 * (k < 0.55 ? 0 : ease((k - 0.55) / 0.45));
        p.foreR.rotation.x = -0.2 - 0.5 * wind;
        p.inner.position.y = 0.07 * Math.sin(Math.min(1, k) * Math.PI);
        p.head.rotation.x = -0.2 * swingCurve;
        break;
      }
      case 'celebrate': {
        const hop = Math.abs(Math.sin(t * 5.2)) * 0.09;
        p.inner.position.y = hop;
        p.armL.rotation.set(-2.9, 0, 0.55);
        p.armR.rotation.set(-2.9, 0, -0.55);
        p.foreL.rotation.x = -0.15;
        p.foreR.rotation.x = -0.15;
        p.head.rotation.x = -0.18;
        break;
      }
      case 'disappointed': {
        const c = Math.min(1, t / 0.3);
        p.torso.rotation.x = 0.24 * c;
        p.head.rotation.x = 0.42 * c;
        p.armL.rotation.set(0.3 * c, 0, 0.08);
        p.armR.rotation.set(0.3 * c, 0, -0.08);
        p.foreR.rotation.x = -0.2;
        p.inner.position.y = -0.03 * c;
        break;
      }
      case 'idle':
      default: {
        const breathe = Math.sin(this.idlePhase * 1.8);
        p.inner.position.y = breathe * 0.008;
        p.armL.rotation.x = 0.12 + breathe * 0.03;
        p.armR.rotation.x = 0.12 + breathe * 0.03;
        // Listo para recibir: ligera flexión y pala centrada.
        p.foreR.rotation.x = -0.55 + breathe * 0.02;
        p.shinL.rotation.x = 0.1;
        p.shinR.rotation.x = 0.1;
        break;
      }
    }
  }

  /**
   * Avanza la animación. `speedRatio` 0..1 = fracción de la velocidad
   * máxima del jugador en este frame (alimenta la zancada en run).
   */
  update(dt: number, speedRatio: number): void {
    this.idlePhase += dt;
    this.moveRatio = speedRatio;
    // Giro suave hacia el objetivo (arco más corto).
    let diff = this.targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 10);
    this.group.rotation.y = this.yaw;

    this.stateT += dt;
    const dur = ONE_SHOT_DURATION[this.state];
    if (dur !== undefined && this.stateT >= dur) {
      // El one-shot termina: se vuelve a la locomoción que toque.
      this.state = speedRatio > 0.12 ? 'run' : 'idle';
      this.stateT = 0;
    } else if (this.state !== 'run' && dur === undefined && speedRatio > 0.12) {
      this.state = 'run';
      this.stateT = 0;
    } else if (this.state === 'run' && speedRatio <= 0.12) {
      this.state = 'idle';
      this.stateT = 0;
    }
    if (this.state === 'run') this.runPhase += dt * (5 + speedRatio * 6.5);

    this.resetPose();
    this.applyPose(dt);
    this.group.position.copy(this.pos);
  }

  dispose(): void {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
  }
}
