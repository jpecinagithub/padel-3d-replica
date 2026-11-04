// Modo ENTRENAMIENTO de la Fase 3: saque con aguja + rally libre contra
// nadie, sobre la física de Ball.ts y el golpeo de Shots.ts. Sin rival
// (la IA es la Fase 4) y sin puntos de Score (el partido es la Fase 5):
// el rally termina y se resume, y se vuelve a sacar.
//
// Reglas de rally aplicadas (simplificación documentada de las de pádel):
// - Tras tu golpe, la bola debe cruzar la red y botar en el campo
//   contrario; el segundo bote allí cierra el rally (sería punto tuyo:
//   no hay rival que la devuelva). Si antes de botar toca el cristal o
//   la malla contrarios, es fuera («directa al cerramiento sin botar»),
//   igual que si se va por encima de los 4 m o contra tu propio
//   cerramiento.
// - Cuando la bola vuelve a tu campo (rebote en el cristal contrario que
//   la devuelve, un netcord que pasa o un lanzamiento de práctica), es
//   «entrante»: puedes golpearla de volea o tras un bote, incluso tras
//   el rebote en tu cristal de fondo; el segundo bote en tu campo cierra
//   el rally.
// - El saque debe botar en el cuadro diagonal; si no, es falta (a la
//   red, larga o fuera del cuadro) y el rally termina.

import * as THREE from 'three';
import { itemById } from '../state/catalog';
import type { Wallet } from '../state/economy';
import { playerLevelById, surfaceById } from '../state/modes';
import type { Settings } from '../state/store';
import { BALL_PHYSICS, Ball, vec3, type BallEvent, type Vec3 } from './Ball';
import type { AudioProbe, SoundEvent } from './Audio';
import { COURT } from './courtConstants';
import { InputManager, moveVector } from './Input';
import { PlayerFigure } from './Player';
import {
  canHitBall,
  classifyShot,
  computeShot,
  isInServeBox,
  needleAt,
  needleZone,
  serveContactPos,
  servePlayerPos,
  serveVelocity,
  shotQuality,
  solveBallistic,
  SHOT_NAMES,
  type ShotKind,
} from './Shots';

export type TrainingPhase = 'serve-ready' | 'serve-toss' | 'rally' | 'ended';

export interface TrainingProbe {
  active: boolean;
  paused: boolean;
  ball: { pos: [number, number, number]; vel: [number, number, number]; speed: number; spin: { top: number; side: number } };
  bounces: { own: number; opp: number };
  lastWall: string | null;
  rally: { state: TrainingPhase; hits: number; lastCause: string | null; message: string; lastShot: string | null };
  player: { pos: [number, number, number]; speed: number };
  serve: { needle: number | null; inSweetSpot: boolean; faults: number; side: number; valid: boolean | null };
  super: { charge: number; ready: boolean };
  /** Audio sintetizado (Fase 6): disparos lógicos y estado del contexto. */
  audio: AudioProbe;
}

export interface TrainingContext {
  getSettings: () => Settings;
  getWallet: () => Wallet;
  onToggleMuted: () => void;
  onPauseChange: (paused: boolean) => void;
  /** Dispara un sonido sintetizado (Audio.ts, en la escena). */
  onSound: (event: SoundEvent) => void;
  /** Probe del motor de audio para __padelProbe. */
  getAudioProbe: () => AudioProbe;
  /** Fin de cada rally (Fase 10): aviso de SOLO presentación (grada). */
  onPointEnd?: (big: boolean) => void;
}

const TRAIL_POINTS = 26;
/** Contacto de saque por debajo de esta altura = contacto fallido. */
const MIN_SERVE_CONTACT_Y = 1.6;

export class Training {
  readonly group = new THREE.Group();
  private readonly ball = new Ball();
  private readonly input = new InputManager();
  private readonly playerFigure = new PlayerFigure();
  private readonly ctx: TrainingContext;
  private readonly ballMesh: THREE.Mesh;
  private readonly ballMaterial: THREE.MeshStandardMaterial;
  private readonly trail: THREE.Line;
  private readonly trailPositions: Float32Array;
  private readonly blob: THREE.Mesh;
  /** Anillo-objetivo del saque (Fase 10): marcador de suelo, sin lógica. */
  private readonly serveRing: THREE.Mesh;
  private active = false;
  private paused = false;
  private phase: TrainingPhase = 'serve-ready';
  private serveSide = 1;
  private tossT = 0;
  private needleT = 0;
  private lastNeedle: number | null = null;
  private faults = 0;
  private serveValid: boolean | null = null;
  private serveInFlight = false;
  private possession: 'shot' | 'incoming' = 'incoming';
  private crossed = false;
  private oppBounces = 0;
  private ownBounces = 0;
  private hits = 0;
  private lastCause: string | null = null;
  private message = '';
  private lastShot: string | null = null;
  private superCharge = 0;
  private hitCooldown = 0;
  private playerSpeed = 0;
  private racketPower = 0;
  private racketReach = 0;
  private disposed = false;
  private readonly canvasEl: HTMLElement;

  constructor(parent: THREE.Object3D, canvas: HTMLElement, ctx: TrainingContext) {
    this.ctx = ctx;
    this.canvasEl = canvas;
    this.group.visible = false;
    parent.add(this.group);
    this.group.add(this.playerFigure.group);

    this.ballMaterial = new THREE.MeshStandardMaterial({ color: 0xd8e14c, roughness: 0.55 });
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_PHYSICS.radius, 20, 14),
      this.ballMaterial,
    );
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);

    // Sombra-pegatina: ayuda a seguir la bola (el radio real, 3,3 cm, es
    // pequeño desde la cámara TV); opacidad según la altura.
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.012;
    this.group.add(this.blob);

    // Anillo-objetivo del saque (Fase 10): anillo lima sobre el centro
    // del cuadro de saque diagonal — el objetivo nominal de un saque
    // perfecto (serveVelocity con aguja centrada). Es un marcador del
    // mundo, como en el modelo: NO sigue a la aguja (no filtra su
    // información si «Ayudas» está apagado) y no toca la mecánica.
    this.serveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 40),
      new THREE.MeshBasicMaterial({ color: 0xc6e265, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.serveRing.rotation.x = -Math.PI / 2;
    this.serveRing.position.y = 0.02;
    this.serveRing.visible = false;
    this.group.add(this.serveRing);

    this.trailPositions = new Float32Array(TRAIL_POINTS * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: 0xd8e14c, transparent: true, opacity: 0.45 }),
    );
    this.trail.frustumCulled = false;
    this.group.add(this.trail);
    // La entrada se adjunta solo mientras el modo está activo
    // (setActive), para no interceptar teclas en el menú.
  }

  // ------------------------------------------------------------ ciclo

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.group.visible = active;
    if (active) {
      this.input.attach(window, this.canvasEl);
      this.input.clearPending();
      this.resetSession();
    } else {
      this.setPaused(false);
      this.input.detach();
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.input.clearPending();
    this.ctx.onPauseChange(paused);
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  /** Reiniciar desde la pausa: vuelve al saque del mismo lado. */
  restartRally(): void {
    this.setPaused(false);
    this.setupServe(false);
  }

  resume(): void {
    this.setPaused(false);
  }

  private resetSession(): void {
    this.faults = 0;
    this.serveSide = 1;
    this.superCharge = 0;
    this.setupServe(false);
  }

  /** Aplica lo equipado en la tienda: colores de bola/jugador y pala. */
  applyLoadout(wallet: Wallet): void {
    const ballItem = itemById(wallet.equipped.ball);
    if (ballItem) {
      this.ballMaterial.color.set(ballItem.color);
      this.ballMaterial.emissive.set(ballItem.color);
      this.ballMaterial.emissiveIntensity = ballItem.glow ? (ballItem.glow - 1) * 0.9 : 0.05;
      (this.trail.material as THREE.LineBasicMaterial).color.set(ballItem.color);
    }
    const racket = itemById(wallet.equipped.racket);
    this.racketPower = racket?.power ?? 0;
    this.racketReach = racket?.reach ?? 0;
    this.playerFigure.setColors({
      shirt: itemById(wallet.equipped.shirt)?.color,
      skin: itemById(wallet.equipped.skin)?.color,
      cap: itemById(wallet.equipped.cap)?.color,
      racket: racket?.color,
    });
  }

  // ------------------------------------------------------------ saque

  private setupServe(alternate: boolean): void {
    if (alternate) this.serveSide = (this.serveSide === 1 ? -1 : 1) as 1 | -1;
    // Anillo-objetivo (Fase 10): centro del cuadro diagonal de este saque.
    const ringTarget = serveVelocity(0.5, this.serveSide).target;
    this.serveRing.position.set(ringTarget.x, 0.02, ringTarget.z);
    const pos = servePlayerPos(this.serveSide);
    this.playerFigure.setPosition(pos.x, pos.z);
    this.playerFigure.faceNet();
    this.phase = 'serve-ready';
    this.serveValid = null;
    this.serveInFlight = false;
    this.possession = 'incoming';
    this.hits = 0;
    this.lastCause = null;
    this.lastShot = null;
    this.lastNeedle = null;
    this.message = 'ESPACIO: botar y lanzar la bola';
    this.holdBallInHand();
  }

  private holdBallInHand(): void {
    const p = this.playerFigure.pos;
    this.ball.hold(vec3(p.x + 0.3, 1.02, p.z + 0.34));
    this.syncBallVisual(0);
  }

  private startToss(): void {
    this.phase = 'serve-toss';
    this.tossT = 0;
    this.needleT = 0;
    this.message = 'ESPACIO en el punto dulce para sacar';
  }

  private strikeServe(): void {
    const needle = needleAt(this.needleT);
    this.lastNeedle = needle;
    const contact = { ...this.ball.pos };
    let velocity: Vec3;
    let pendingFaultMessage: string | null = null;
    if (contact.y < MIN_SERVE_CONTACT_Y) {
      // Contacto demasiado bajo: la bola no llega a la red.
      velocity = solveBallistic(contact, vec3(contact.x * 0.4, 0, 0.2), 0.4);
      pendingFaultMessage = 'Contacto demasiado bajo';
    } else {
      const serve = serveVelocity(needle, this.serveSide);
      const flightTime = (serve.target.z - serve.from.z) / serve.velocity.z;
      velocity = solveBallistic(contact, serve.target, flightTime);
      if (serve.zone === 'perfect') this.message = '¡Saque perfecto!';
      else if (serve.zone === 'good') this.message = 'Buen saque';
      else if (serve.zone === 'weak') this.message = 'Saque flojo…';
      else pendingFaultMessage = serve.fault === 'net' ? 'Falta: a la red' : 'Falta: larga';
    }
    this.ball.launch(contact, velocity);
    this.ctx.onSound({ kind: 'serve', power: Math.min(1, this.ball.speed / 30) });
    this.possession = 'shot';
    this.crossed = false;
    this.oppBounces = 0;
    this.ownBounces = 0;
    this.serveInFlight = true;
    if (pendingFaultMessage) this.message = pendingFaultMessage;
    this.phase = 'rally';
  }

  // ------------------------------------------------------------ golpeo

  private attemptHit(): void {
    if (this.hitCooldown > 0 || this.ball.state !== 'flying') return;
    const settings = this.ctx.getSettings();
    const level = playerLevelById(settings.playerLevel);
    const bp = this.ball.pos;
    const pp = this.playerFigure.pos;
    if (!canHitBall(bp, vec3(pp.x, 0, pp.z), this.racketReach)) return;

    const input = this.input.shotInput();
    const superReady = this.superCharge >= 1;
    const kind: ShotKind = classifyShot(bp.y, input, superReady);
    const distance = Math.hypot(bp.x - pp.x, bp.z - pp.z);
    const quality = shotQuality(distance, level);
    const dirX = input.moveX !== 0 ? input.moveX : Math.max(-1, Math.min(1, (bp.x / 5) * 0.6));
    const shot = computeShot({ ballPos: bp, kind, dirX, quality, racketPower: this.racketPower });

    this.ball.launch({ ...bp }, shot.velocity, shot.spinTop, shot.spinSide);
    this.ctx.onSound({ kind: 'hit', power: Math.min(1, this.ball.speed / 30), spinTop: shot.spinTop });
    this.possession = 'shot';
    this.crossed = false;
    this.oppBounces = 0;
    this.ownBounces = 0;
    this.serveInFlight = false;
    this.hits += 1;
    this.hitCooldown = 0.28;
    this.playerFigure.startSwing();
    this.lastShot = SHOT_NAMES[kind];
    if (kind === 'super-smash') {
      this.superCharge = 0;
      this.message = '¡SUPERGOLPE!';
    } else {
      if (quality > 0.7) {
        this.superCharge = Math.min(1, this.superCharge + (quality - 0.7) * 0.9 + 0.04);
      }
      this.message = this.lastShot;
    }
  }

  // ------------------------------------------------------------ rally

  private endRally(cause: string): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.lastCause = cause;
    this.message = cause;
    this.serveInFlight = false;
    // Fase 10: la grada reacciona al punto (solo presentación).
    this.ctx.onPointEnd?.(false);
  }

  private handleEvent(event: BallEvent): void {
    if (this.phase !== 'rally') return;
    // Sonidos de contacto (Fase 6): la intensidad sale de la velocidad
    // de la bola al procesar el evento.
    if (event.type === 'bounce') {
      this.ctx.onSound({ kind: 'bounce', speed: this.ball.speed });
    } else if (event.type === 'wall') {
      this.ctx.onSound({ kind: event.kind === 'glass' ? 'glass' : 'mesh', speed: this.ball.speed });
    } else if (event.type === 'net' || (event.type === 'netcord' && event.over)) {
      this.ctx.onSound({ kind: 'net' });
    }
    switch (event.type) {
      case 'bounce': {
        if (this.serveInFlight && event.side === 'opp') {
          this.serveInFlight = false;
          if (isInServeBox(event.pos, this.serveSide)) {
            this.serveValid = true;
            this.message = 'Saque válido';
            this.oppBounces = 1;
          } else {
            this.serveValid = false;
            this.faults += 1;
            this.endRally(event.pos.z > COURT.serviceLineZ ? 'Falta de saque: larga' : 'Falta de saque: fuera del cuadro');
          }
          return;
        }
        if (this.possession === 'shot') {
          if (event.side === 'opp') {
            this.oppBounces += 1;
            if (this.oppBounces >= 2) {
              this.endRally('Doble bote en el campo contrario: el punto sería tuyo');
            }
          } else if (!this.crossed) {
            this.endRally('No pasó la red: se quedó en tu campo');
          }
        } else if (event.side === 'own') {
          this.ownBounces += 1;
          if (this.ownBounces >= 2) this.endRally('Doble bote en tu campo');
        }
        break;
      }
      case 'wall': {
        const side = event.where === 'back-opp' ? 'opp' : event.where === 'back-own' ? 'own' : event.pos.z >= 0 ? 'opp' : 'own';
        const bouncesThere = side === 'opp' ? this.oppBounces : this.ownBounces;
        if (this.possession === 'shot') {
          if (bouncesThere === 0) {
            if (this.serveInFlight) {
              this.faults += 1;
              this.endRally('Falta de saque: directa al cerramiento');
            } else {
              this.endRally(side === 'opp' ? 'Directa al cerramiento sin botar: fuera' : 'Contra tu propio cerramiento: fuera');
            }
          }
        } else if (side === 'own' && this.ownBounces === 0) {
          this.endRally('La bola dio en tu cristal sin botar antes');
        }
        break;
      }
      case 'net': {
        if (this.serveInFlight) {
          this.faults += 1;
          this.endRally('Falta de saque: a la red');
        } else {
          this.endRally('A la red');
        }
        break;
      }
      case 'netCross': {
        if (event.to === 'opp') {
          this.crossed = true;
        } else {
          this.possession = 'incoming';
          this.ownBounces = 0;
        }
        break;
      }
      case 'over-wall': {
        if (this.serveInFlight) this.faults += 1;
        this.endRally(this.possession === 'shot' ? 'Fuera: por encima del cerramiento' : 'Se marchó por el fondo');
        break;
      }
      case 'resting': {
        this.endRally(this.possession === 'incoming' ? 'La bola se paró en tu campo' : 'La bola se paró en el campo contrario');
        break;
      }
      case 'netcord': {
        if (event.over) this.message = '¡Pasa rozando la cinta!';
        break;
      }
    }
  }

  // ------------------------------------------------------------ bucle

  update(dt: number): void {
    if (!this.active || this.disposed) return;

    // Teclas globales del modo (funcionan también en pausa).
    if (this.input.consumePressed('Escape')) {
      this.togglePause();
      return;
    }
    if (this.paused) return;
    if (this.input.consumePressed('KeyM')) this.ctx.onToggleMuted();

    const settings = this.ctx.getSettings();
    const surface = surfaceById(settings.courtType);
    const level = playerLevelById(settings.playerLevel);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    // ---- Lanzamiento del saque (bola botando en la mano) ----
    if (this.phase === 'serve-toss') {
      this.tossT += dt;
      this.needleT += dt;
      const contact = serveContactPos(this.serveSide);
      const y = 1.02 + 5.35 * this.tossT - 0.5 * BALL_PHYSICS.gravity * this.tossT * this.tossT;
      this.ball.hold(vec3(contact.x, y, contact.z));
      if (y < 1.12 && this.tossT > 0.45) {
        this.faults += 1;
        // La bola cae al suelo y el rally queda cerrado como falta.
        this.ball.launch(vec3(contact.x, y, contact.z), vec3(0, 0, 0));
        this.phase = 'rally';
        this.endRally('Falta de saque: dejaste caer la bola');
      }
    }

    // ---- Acción principal (ESPACIO / clic) ----
    const actionPressed = this.input.consumePressed('Space') || this.input.consumeClick();
    if (actionPressed) {
      if (this.phase === 'serve-ready') this.startToss();
      else if (this.phase === 'serve-toss') this.strikeServe();
      else if (this.phase === 'rally') this.attemptHit();
      else if (this.phase === 'ended') this.setupServe(true);
    }
    if (this.input.consumePressed('KeyR')) {
      if (this.phase === 'ended') this.setupServe(true);
      else this.setupServe(false);
    }

    // ---- Movimiento del jugador ----
    const canMove = this.phase === 'rally' || this.phase === 'ended';
    let speedRatio = 0;
    if (!canMove) this.playerSpeed = 0;
    if (canMove) {
      const ax = this.input.axisX();
      const az = this.input.axisZ();
      if (ax !== 0 || az !== 0) {
        // M2: la magnitud analógica del joystick se conserva.
        const mv = moveVector(ax, az);
        const vx = mv.x * level.speed;
        const vz = mv.z * level.speed;
        const p = this.playerFigure.pos;
        const nx = Math.min(4.55, Math.max(-4.55, p.x + vx * dt));
        const nz = Math.min(-0.35, Math.max(-9.55, p.z + vz * dt));
        this.playerFigure.setPosition(nx, nz);
        speedRatio = Math.hypot(mv.x, mv.z);
        this.playerSpeed = level.speed * speedRatio;
      } else {
        this.playerSpeed = 0;
      }
    }

    // ---- Física de la bola ----
    if (this.phase === 'rally' || this.phase === 'ended') {
      const events = this.ball.step(dt, surface);
      for (const event of events) this.handleEvent(event);
    } else if (this.phase === 'serve-ready') {
      this.holdBallInHand();
    }

    // ---- Orientación y animación ----
    if (this.phase === 'rally' && this.ball.state === 'flying') {
      this.playerFigure.faceTowards(this.ball.pos.x, this.ball.pos.z);
    } else {
      this.playerFigure.faceNet();
    }
    this.playerFigure.update(dt, speedRatio);
    this.syncBallVisual(dt);
  }

  private syncBallVisual(_dt: number): void {
    const p = this.ball.pos;
    this.ballMesh.position.set(p.x, p.y, p.z);
    this.blob.position.x = p.x;
    this.blob.position.z = p.z;
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.34 * Math.max(0.15, 1 - p.y / 7);
    this.blob.visible = this.ball.state === 'flying';
    // Estela: desplaza las posiciones y añade la actual al final.
    const arr = this.trailPositions;
    arr.copyWithin(0, 3);
    arr[(TRAIL_POINTS - 1) * 3] = p.x;
    arr[(TRAIL_POINTS - 1) * 3 + 1] = p.y;
    arr[(TRAIL_POINTS - 1) * 3 + 2] = p.z;
    (this.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.trail.visible = this.ball.state === 'flying';
    // Anillo-objetivo del saque: visible en ready/toss, con pulso suave.
    const ringOn = this.phase === 'serve-ready' || this.phase === 'serve-toss';
    this.serveRing.visible = ringOn;
    if (ringOn) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
      (this.serveRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * pulse;
      const s = 1 + 0.07 * pulse;
      this.serveRing.scale.set(s, s, 1);
    }
  }

  /** Datos para que la cámara TV/Jugador siga a jugador y bola. */
  focusData(): { player: THREE.Vector3; ball: THREE.Vector3 } | null {
    if (!this.active) return null;
    return {
      player: this.playerFigure.pos,
      ball: new THREE.Vector3(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z),
    };
  }

  // ------------------------------------------------------------ probes

  probe(): TrainingProbe {
    const needle =
      this.phase === 'serve-toss' ? needleAt(this.needleT) : this.lastNeedle;
    return {
      active: this.active,
      paused: this.paused,
      ball: {
        pos: [round2(this.ball.pos.x), round2(this.ball.pos.y), round2(this.ball.pos.z)],
        vel: [round2(this.ball.vel.x), round2(this.ball.vel.y), round2(this.ball.vel.z)],
        speed: round2(this.ball.speed),
        spin: { top: round2(this.ball.spinTop), side: round2(this.ball.spinSide) },
      },
      bounces: { own: this.ball.bouncesOwn, opp: this.ball.bouncesOpp },
      lastWall: this.ball.lastWall,
      rally: { state: this.phase, hits: this.hits, lastCause: this.lastCause, message: this.message, lastShot: this.lastShot },
      player: {
        pos: [round2(this.playerFigure.pos.x), 0, round2(this.playerFigure.pos.z)],
        speed: round2(this.playerSpeed),
      },
      serve: {
        needle,
        inSweetSpot: needle !== null && needleZone(needle) === 'perfect',
        faults: this.faults,
        side: this.serveSide,
        valid: this.serveValid,
      },
      super: { charge: round2(this.superCharge), ready: this.superCharge >= 1 },
      audio: this.ctx.getAudioProbe(),
    };
  }

  // ------------------------------------------------------------ entrada táctil (Fase 6)

  /** Puente táctil: el joystick de la UI escribe en el InputManager del modo. */
  touchMove(x: number, z: number): void {
    this.input.setTouchMove(x, z);
  }

  /** Puente táctil: un toque = una pulsación de tecla (Space, Escape…). */
  touchPress(code: string): void {
    this.input.pressTouch(code);
  }

  /** Puente táctil: botones mantenidos (KeyQ/KeyE). */
  touchHeld(code: string, held: boolean): void {
    this.input.setTouchHeld(code, held);
  }

  /** Hook de test: saque inmediato y determinista con la aguja fijada. */
  testServe(needle01: number): TrainingProbe {
    if (!this.active) this.setActive(true);
    this.setPaused(false);
    this.setupServe(false);
    const contact = serveContactPos(this.serveSide);
    this.ball.hold(contact);
    this.lastNeedle = needle01;
    const serve = serveVelocity(needle01, this.serveSide);
    this.ball.launch({ ...contact }, serve.velocity);
    this.possession = 'shot';
    this.crossed = false;
    this.oppBounces = 0;
    this.ownBounces = 0;
    this.serveInFlight = true;
    this.phase = 'rally';
    this.message = serve.zone === 'perfect' ? '¡Saque perfecto!' : 'Saque de prueba';
    return this.probe();
  }

  /**
   * Hook de test: lanza una bola entrante hacia el jugador (desde el
   * campo contrario, a botar delante de él y a seguir hacia su cristal:
   * el patrón clásico de devolución tras pared).
   */
  testLaunch(options?: { fromX?: number }): TrainingProbe {
    if (!this.active) this.setActive(true);
    this.setPaused(false);
    if (this.phase === 'serve-ready' || this.phase === 'serve-toss' || this.phase === 'ended') {
      this.phase = 'rally';
      this.serveInFlight = false;
      this.serveValid = null;
    }
    const p = this.playerFigure.pos;
    const from = vec3(options?.fromX ?? -p.x * 0.4, 2.0, 4.2);
    const bounceTarget = vec3(p.x * 0.9, 0, p.z + 1.7);
    const velocity = solveBallistic(from, bounceTarget, 1.15);
    this.ball.launch(from, velocity);
    this.possession = 'incoming';
    this.ownBounces = 0;
    this.oppBounces = 0;
    this.crossed = false;
    this.message = '¡Bola entrante!';
    return this.probe();
  }

  dispose(): void {
    this.disposed = true;
    this.input.detach();
    this.playerFigure.dispose();
    this.ballMesh.geometry.dispose();
    this.ballMaterial.dispose();
    this.trail.geometry.dispose();
    (this.trail.material as THREE.Material).dispose();
    this.blob.geometry.dispose();
    (this.blob.material as THREE.Material).dispose();
    this.serveRing.geometry.dispose();
    (this.serveRing.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
