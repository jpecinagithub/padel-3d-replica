// Rig de cámaras sobre Three (REPLICA_SPEC §5.7). Consume las matemáticas
// puras de cameraMath.ts: poses TV/Jugador con lerp suave, y cámara Libre con
// órbita propia (arrastrar + rueda), sin OrbitControls, para controlar el
// rango de zoom 0,45–2,6 de la SPEC.

import * as THREE from 'three';
import {
  FREE_BASE_DISTANCE,
  cameraPose,
  clampPolar,
  clampZoom,
  nextCameraKind,
  orbitPosition,
  type CameraKind,
} from './cameraMath';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private kind: CameraKind = 'tv';
  private userZoom = 1;
  /** Foco de juego (Fase 3): posiciones de jugador y bola, si las hay. */
  private focus: { px: number; pz: number; bx: number; by: number; bz: number } | null = null;
  /** Cámara de repetición (Fase 5): si hay bola, manda sobre el tipo elegido. */
  private replayBall: { bx: number; by: number; bz: number } | null = null;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private initialized = false;
  private readonly orbitTarget = new THREE.Vector3(0, 0.5, 0);
  private orbit = { azimuth: 0, polar: 1.02 };

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 600);
    const pose = cameraPose('tv', 1);
    this.pos.set(...pose.position);
    this.look.set(...pose.lookAt);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  get currentKind(): CameraKind {
    return this.kind;
  }

  get zoom(): number {
    return this.userZoom;
  }

  setKind(kind: CameraKind): void {
    if (kind === this.kind && this.initialized) return;
    this.kind = kind;
    if (kind === 'free') {
      // La órbita arranca desde donde esté la cámara en este momento.
      const offset = this.camera.position.clone().sub(this.orbitTarget);
      const distance = Math.max(1, offset.length());
      this.orbit.polar = clampPolar(Math.acos(THREE.MathUtils.clamp(offset.y / distance, -1, 1)));
      this.orbit.azimuth = Math.atan2(offset.x, offset.z);
    }
  }

  cycle(): CameraKind {
    this.setKind(nextCameraKind(this.kind));
    return this.kind;
  }

  /**
   * Foco de juego: la TV mezcla su mirada hacia la bola (SPEC §5.7) y la
   * cámara Jugador sigue al jugador lateralmente y por detrás. La Libre
   * lo ignora. Sin foco (menú), vuelven las poses fijas de la Fase 2.
   */
  setFocus(focus: { player: THREE.Vector3; ball: THREE.Vector3 } | null): void {
    this.focus = focus
      ? { px: focus.player.x, pz: focus.player.z, bx: focus.ball.x, by: focus.ball.y, bz: focus.ball.z }
      : null;
  }

  /**
   * Cámara de repetición (Fase 5): mientras se reproduce el último punto,
   * la cámara es lateral y baja, pegada a la bola grabada — un ángulo
   * distinto de la TV/Jugador habitual. null = volver a la cámara normal.
   */
  setReplayBall(ball: THREE.Vector3 | null): void {
    this.replayBall = ball ? { bx: ball.x, by: ball.y, bz: ball.z } : null;
  }

  /** Rueda del ratón: factor multiplicativo sobre el zoom (con clamp). */
  zoomBy(factor: number): void {
    this.userZoom = clampZoom(this.userZoom * factor);
  }

  setZoom(zoom: number): void {
    this.userZoom = clampZoom(zoom);
  }

  /** Arrastre del ratón: solo orbita en cámara Libre. */
  drag(deltaX: number, deltaY: number): void {
    if (this.kind !== 'free') return;
    this.orbit.azimuth -= deltaX * 0.0052;
    this.orbit.polar = clampPolar(this.orbit.polar - deltaY * 0.0052);
  }

  private desiredPose(): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
    if (this.replayBall) {
      // Lateral baja junto a la cristalera, mirando a la bola grabada.
      const { bx, by, bz } = this.replayBall;
      return {
        position: new THREE.Vector3(bx * 0.45 + 7.6, 1.9, bz * 0.55 + 3.2),
        lookAt: new THREE.Vector3(bx, Math.max(0.4, by), bz),
      };
    }
    if (this.kind === 'free') {
      const distance = FREE_BASE_DISTANCE / this.userZoom;
      const [x, y, z] = orbitPosition(
        [this.orbitTarget.x, this.orbitTarget.y, this.orbitTarget.z],
        this.orbit.azimuth,
        this.orbit.polar,
        distance,
      );
      return { position: new THREE.Vector3(x, y, z), lookAt: this.orbitTarget.clone() };
    }
    const pose = cameraPose(this.kind, this.userZoom);
    const position = new THREE.Vector3(...pose.position);
    const lookAt = new THREE.Vector3(...pose.lookAt);
    if (this.focus && this.kind === 'tv') {
      // La mirada (y con ella el encuadre) se mezcla hacia la bola.
      const dx = this.focus.bx * 0.38;
      const dy = Math.min(2.4, Math.max(0, this.focus.by)) * 0.16;
      const dz = this.focus.bz * 0.3;
      lookAt.x += dx;
      lookAt.y += dy;
      lookAt.z += dz;
      position.x += dx;
      position.z += dz;
    }
    if (this.focus && this.kind === 'player') {
      // Tras el jugador: le sigue en x y se coloca a su espalda.
      position.x = this.focus.px * 0.62;
      position.z = Math.max(-14.6, Math.min(-3.8, this.focus.pz - 3.4));
      lookAt.set(this.focus.px * 0.5 + this.focus.bx * 0.25, 1.05, this.focus.pz * 0.25 + this.focus.bz * 0.2);
    }
    return { position, lookAt };
  }

  /** Avanza el lerp suave hacia la pose deseada y orienta la cámara. */
  update(dt: number): void {
    const { position, lookAt } = this.desiredPose();
    if (!this.initialized) {
      this.pos.copy(position);
      this.look.copy(lookAt);
      this.initialized = true;
    } else {
      // En Libre la respuesta al arrastre debe ser directa, sin lerp.
      const factor = this.kind === 'free' ? 1 : 1 - Math.exp(-dt * 3.5);
      this.pos.lerp(position, factor);
      this.look.lerp(lookAt, factor);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
