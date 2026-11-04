// Modo PARTIDO CONTRA LA IA: rallies completos contra el rival (y
// dobles 2v2 con compañero y segundo rival) sobre la física de Ball.ts,
// el golpeo de Shots.ts y el cerebro de AI.ts.
//
// Fase 5 — PARTIDO COMPLETO: el «Partido libre» de la Fase 4 pasa a
// jugarse con el marcador oficial de Score.ts vía MatchFlow.ts (punto →
// juego → set → fin, tiebreak a 7, punto de oro en el juego decisivo),
// con la economía de la SPEC §5.5 acumulada por partido y los modos
// Partida rápida (set a 6) / Torneo / Mundial (set a 4, carrera en
// Career.ts). CAMBIOS respecto a la Fase 4:
// - El saque lo decide Score (server del snapshot), no la rotación
//   informal por rally; en individuales y en dobles la secuencia
//   resultante coincide con la de la Fase 4 (tú→rival; tú→rival→
//   compañero→rival2) porque Score rota igual, pero ahora cambia por
//   JUEGOS, no por rally, y en el tiebreak sigue el patrón 1-2-2.
// - El lado de saque (derecha/izquierda) sale de la paridad de puntos
//   del juego en curso (par = derecha), como en el pádel real, en vez
//   de alternar por turnos de sacador.
// - El contador informal de rallies desaparece: solo hay marcador
//   oficial (probe.score / probe.match / probe.economy).
// - Tecla V: repetición del último punto (Replay.ts, 8 s a 20 Hz,
//   cámara lateral a 0,5×). Efectos de victoria y de punto de oro vía
//   ctx.onEffect (Effects.ts, en la escena).
//
// Reglas de rally (simplificación documentada de las de pádel):
// - Saque único por rally (sin segundo saque): si es falta, el rally es
//   del equipo que restaba. El saque rota por los jugadores en orden
//   (individuales: tú → rival; dobles: tú → rival → compañero → rival 2)
//   y cada sacador alterna de lado en cada turno suyo.
// - El saque debe botar en el cuadro diagonal; el resto no puede
//   volearlo antes del bote.
// - Tras un golpe, la bola debe cruzar y botar en el campo contrario:
//   segundo bote allí = punto del que golpeó; directa al cerramiento
//   sin botar, a la red, sin cruzar o por encima de los 4 m sin haber
//   botado = punto del contrario. Si bota en el campo contrario y luego
//   sale por encima del fondo, es punto del que golpeó (la «sacó»).
// - Se puede golpear de volea, tras un bote o tras el rebote en el
//   propio cristal de fondo.

import * as THREE from 'three';
import { itemById } from '../state/catalog';
import type { Wallet } from '../state/economy';
import { aiLevelById, playerLevelById, surfaceById, type AiLevel } from '../state/modes';
import type { Settings } from '../state/store';
import { AIBrain, doublesZoneCenterX, partnerShouldYield, snapshotOf, type AITeam } from './AI';
import { BALL_PHYSICS, Ball, vec3, type BallEvent, type Vec3 } from './Ball';
import type { AudioProbe, SoundEvent } from './Audio';
import type { CareerStatus } from './Career';
import { COURT } from './courtConstants';
import { InputManager } from './Input';
import { MatchFlow, type MatchSummary } from './MatchFlow';
import { PlayerFigure, type AnimState } from './Player';
import { ReplayPlayer, ReplayRecorder } from './Replay';
import type { Side } from './Score';
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

export type Role = 'human' | 'partner' | 'rival' | 'rival2';
export type MatchPhase = 'serve-ready' | 'serve-toss' | 'rally' | 'ended' | 'match-over';

export interface MatchProbe {
  active: boolean;
  paused: boolean;
  mode: 'match';
  ball: { pos: [number, number, number]; vel: [number, number, number]; speed: number; spin: { top: number; side: number } };
  bounces: { own: number; opp: number };
  lastWall: string | null;
  rally: {
    state: MatchPhase;
    hits: number;
    lastCause: string | null;
    message: string;
    lastShot: string | null;
    winner: AITeam | null;
  };
  player: { pos: [number, number, number]; speed: number };
  serve: { needle: number | null; inSweetSpot: boolean; faults: number; side: number; valid: boolean | null; server: Role };
  super: { charge: number; ready: boolean };
  ai: { level: string; state: string; lastShot: string | null; errors: number; decisionMs: number | null };
  players: {
    count: number;
    human: { pos: [number, number, number] };
    partner: { pos: [number, number, number] } | null;
    rival: { pos: [number, number, number] };
    rival2: { pos: [number, number, number] } | null;
  };
  match: {
    aiHits: number;
    server: Role;
    doubles: boolean;
    modeId: number;
    modeName: string;
    over: boolean;
    winner: 'human' | 'ai' | null;
    champion: boolean;
  };
  /** Marcador oficial (Fase 5): puntos numéricos y etiquetas, juegos, saque. */
  score: {
    points: [number, number];
    labels: [string, string];
    games: [number, number];
    server: Role;
    tiebreak: boolean;
    goldPoint: boolean;
    gamesToWin: number;
  };
  career: {
    active: boolean;
    round: number;
    roundName: string;
    team: string | null;
    isFinal: boolean;
  } | null;
  /** Monedas ganadas en ESTE partido (se abonan al wallet al cerrarlo). */
  economy: { earned: number; points: number; games: number; result: number; bonus: number };
  replay: { frames: number; active: boolean; progress: number };
  /** Audio sintetizado (Fase 6): disparos lógicos y estado del contexto. */
  audio: AudioProbe;
}

export interface MatchContext {
  getSettings: () => Settings;
  getWallet: () => Wallet;
  onToggleMuted: () => void;
  onPauseChange: (paused: boolean) => void;
  /** Estado de carrera/modo resuelto por la app (Career.careerStatus). */
  getCareer: () => CareerStatus;
  /** Efectos de partículas que dispara el partido (en la escena). */
  onEffect: (kind: 'win' | 'gold', at?: Vec3) => void;
  /** Fin de partido: se llama una sola vez, con el resumen completo. */
  onMatchEnd: (summary: MatchSummary) => void;
  /** Dispara un sonido sintetizado (Audio.ts, en la escena). */
  onSound: (event: SoundEvent) => void;
  /** Probe del motor de audio para __padelProbe. */
  getAudioProbe: () => AudioProbe;
}

interface Actor {
  role: Role;
  team: AITeam;
  /** Signo del campo donde vive: humano/compañero −1, rivales +1. */
  sideSign: 1 | -1;
  figure: PlayerFigure;
  brain: AIBrain | null;
  cooldown: number;
  lastAttemptBall: number;
  speedRatio: number;
}

const TRAIL_POINTS = 26;
const MIN_SERVE_CONTACT_Y = 1.6;

const RIVAL_COLORS = { shirt: '#e23b3b', pants: '#1c1c22', skin: '#b57a4e', cap: '#1c1c22', racket: '#3a3f47' };
const RIVAL2_COLORS = { shirt: '#8e2323', pants: '#23232b', skin: '#8a5a34', cap: '#e23b3b', racket: '#3a3f47' };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const animForShot = (kind: ShotKind): AnimState => {
  switch (kind) {
    case 'smash':
    case 'super-smash':
      return 'smash';
    case 'lob':
      return 'lob';
    case 'drop':
    case 'slice':
      return 'drop';
    default:
      return 'drive';
  }
};

export class Match {
  readonly group = new THREE.Group();
  private readonly ball = new Ball();
  private readonly input = new InputManager();
  private readonly ctx: MatchContext;
  private readonly ballMesh: THREE.Mesh;
  private readonly ballMaterial: THREE.MeshStandardMaterial;
  private readonly trail: THREE.Line;
  private readonly trailPositions: Float32Array;
  private readonly blob: THREE.Mesh;
  private readonly canvasEl: HTMLElement;

  private readonly human: Actor;
  private readonly partner: Actor;
  private readonly rival: Actor;
  private readonly rival2: Actor;
  private readonly actors: Actor[];

  private active = false;
  private paused = false;
  private disposed = false;
  private phase: MatchPhase = 'serve-ready';
  private settingsSignature = '';
  private rng: () => number = mulberry32((Math.random() * 1e9) | 0);

  // Marcador oficial y carrera (Fase 5)
  private flow = new MatchFlow({ doubles: false, gamesToWin: 6, opponentLevel: 1, modeId: 0, isCareerFinal: true });
  private career: CareerStatus | null = null;
  private appliedTeam: string | null = null;
  private matchEndFired = false;

  // Repetición del último punto (Fase 5)
  private readonly recorder = new ReplayRecorder();
  private readonly replayPlayer = new ReplayPlayer();
  private replayRoles: Role[] = [];
  private replaySnapshot: { ball: Vec3; positions: Partial<Record<Role, { x: number; z: number }>> } | null = null;

  // Estado del rally
  private serverRole: Role = 'human';
  private serveSide: 1 | -1 = 1;
  private lastHitTeam: AITeam | null = null;
  private crossed = false;
  private bouncesOwn = 0;
  private bouncesOpp = 0;
  private wallByTeam: Record<AITeam, boolean> = { human: false, ai: false };
  private serveInFlight = false;
  private serveValid: boolean | null = null;
  private faults = 0;
  private hits = 0;
  private aiHits = 0;
  private ballId = 0;
  private lastCause: string | null = null;
  private message = '';
  private lastShot: string | null = null;
  private winner: AITeam | null = null;
  private superCharge = 0;
  private playerSpeed = 0;
  private endTimer = 0;

  // Saque humano (aguja) y saque IA (temporizador)
  private tossT = 0;
  private needleT = 0;
  private lastNeedle: number | null = null;
  private aiServeT = 0;
  private aiServePlayed = false;

  private racketPower = 0;
  private racketReach = 0;

  constructor(parent: THREE.Object3D, canvas: HTMLElement, ctx: MatchContext) {
    this.ctx = ctx;
    this.canvasEl = canvas;
    this.group.visible = false;
    parent.add(this.group);

    const mkActor = (
      role: Role,
      team: AITeam,
      sideSign: 1 | -1,
      colors: ConstructorParameters<typeof PlayerFigure>[0],
    ): Actor => {
      const figure = new PlayerFigure(colors);
      this.group.add(figure.group);
      return { role, team, sideSign, figure, brain: null, cooldown: 0, lastAttemptBall: -1, speedRatio: 0 };
    };
    this.human = mkActor('human', 'human', -1, {});
    this.partner = mkActor('partner', 'human', -1, { shirt: '#22b8cf', pants: '#2c3e57', skin: '#c98d54', cap: '#ffffff', racket: '#2b2f36' });
    this.rival = mkActor('rival', 'ai', 1, RIVAL_COLORS);
    this.rival2 = mkActor('rival2', 'ai', 1, RIVAL2_COLORS);
    this.actors = [this.human, this.partner, this.rival, this.rival2];

    this.ballMaterial = new THREE.MeshStandardMaterial({ color: 0xd8e14c, roughness: 0.55 });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_PHYSICS.radius, 20, 14), this.ballMaterial);
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.012;
    this.group.add(this.blob);
    this.trailPositions = new Float32Array(TRAIL_POINTS * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: 0xd8e14c, transparent: true, opacity: 0.45 }),
    );
    this.trail.frustumCulled = false;
    this.group.add(this.trail);
  }

  // ------------------------------------------------------------ ciclo

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.group.visible = active;
    if (active) {
      this.input.attach(window, this.canvasEl);
      this.input.clearPending();
      this.configure(true);
      this.startMatch();
    } else {
      this.setPaused(false);
      this.input.detach();
      for (const actor of this.actors) actor.brain?.onRallyEnd();
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

  resume(): void {
    this.setPaused(false);
  }

  /** Reiniciar desde la pausa: se repite el rally con el mismo sacador. */
  restartRally(): void {
    this.setPaused(false);
    this.setupServe();
  }

  // ------------------------------------------------------------ configuración

  private doubles(): boolean {
    return this.ctx.getSettings().doubles;
  }

  private actorByRole(role: Role): Actor {
    return this.actors.find((a) => a.role === role) as Actor;
  }

  private partnerLevel(): AiLevel {
    // Mapeo documentado: el compañero juega con el nivel de IA
    // equivalente al nivel del jugador elegido (0→Fácil, 1→Medio, 2→Difícil).
    return aiLevelById(this.ctx.getSettings().playerLevel);
  }

  /**
   * (Re)crea los cerebros según los ajustes y la carrera: el nivel del
   * rival es el EFECTIVO de la ronda (base + rampa), y en Mundial el
   * rival viste los colores de su selección. El marcador (flow) no se
   * toca aquí: solo se reinicia en startMatch.
   */
  private configure(force = false): void {
    const settings = this.ctx.getSettings();
    const career = this.ctx.getCareer();
    this.career = career;
    const signature = `${career.opponentLevel}|${settings.playerLevel}|${settings.doubles}|${career.mode.id}|${career.round}`;
    if (!force && signature === this.settingsSignature) return;
    this.settingsSignature = signature;
    const rivalLevel = aiLevelById(career.opponentLevel);
    this.rival.brain = new AIBrain(rivalLevel, { role: 'rival', sideSign: 1, rng: this.rng });
    this.rival2.brain = new AIBrain(rivalLevel, { role: 'rival2', sideSign: 1, rng: this.rng });
    this.partner.brain = new AIBrain(this.partnerLevel(), { role: 'partner', sideSign: -1, rng: this.rng });
    const doubles = settings.doubles;
    this.partner.figure.group.visible = doubles;
    this.rival2.figure.group.visible = doubles;
    // Colores del rival: selección del Mundial o el rojo/negro habitual.
    const teamName = career.team?.name ?? null;
    if (teamName !== this.appliedTeam) {
      this.appliedTeam = teamName;
      if (career.team) {
        this.rival.figure.setColors({ shirt: career.team.shirtColor, cap: career.team.capColor });
        this.rival2.figure.setColors({ shirt: career.team.shirtColor });
      } else {
        this.rival.figure.setColors({ shirt: RIVAL_COLORS.shirt, cap: RIVAL_COLORS.cap });
        this.rival2.figure.setColors({ shirt: RIVAL2_COLORS.shirt });
      }
    }
  }

  /**
   * Empieza un partido nuevo con la configuración vigente (modo, ronda de
   * carrera, nivel efectivo): marcador a cero y primer saque según Score.
   * Lo llama setActive y la UI para revancha / siguiente ronda.
   */
  startMatch(): void {
    this.setPaused(false);
    if (this.replayPlayer.active) this.finishReplay();
    this.configure(true);
    const career = this.currentCareer();
    const settings = this.ctx.getSettings();
    this.flow.reset({
      doubles: settings.doubles,
      gamesToWin: career.gamesToWin,
      opponentLevel: career.opponentLevel,
      modeId: career.mode.id,
      isCareerFinal: career.active ? career.isFinal : true,
    });
    this.aiHits = 0;
    this.faults = 0;
    this.superCharge = 0;
    this.matchEndFired = false;
    this.setupServe();
  }

  /** Carrera vigente según la app; si aún no llegó ninguna, se resuelve aquí. */
  private currentCareer(): CareerStatus {
    if (!this.career) this.career = this.ctx.getCareer();
    return this.career;
  }

  /** Rol del jugador `idx` de Score (en individuales, 1 es el rival). */
  private roleForPlayer(idx: number): Role {
    if (!this.doubles()) return idx === 0 ? 'human' : 'rival';
    return (['human', 'partner', 'rival', 'rival2'] as Role[])[idx] as Role;
  }

  /** Aplica lo equipado en la tienda (bola, pala y colores del humano y su compañero). */
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
    const humanColors = {
      shirt: itemById(wallet.equipped.shirt)?.color,
      skin: itemById(wallet.equipped.skin)?.color,
      cap: itemById(wallet.equipped.cap)?.color,
      racket: racket?.color,
    };
    this.human.figure.setColors(humanColors);
    // El compañero viste la camiseta del equipo (la equipada por el humano).
    if (humanColors.shirt) this.partner.figure.setColors({ shirt: humanColors.shirt });
  }

  // ------------------------------------------------------------ colocación y saque

  private teamSign(team: AITeam): 1 | -1 {
    return team === 'human' ? -1 : 1;
  }

  private servePosFor(actor: Actor, side: number): Vec3 {
    const base = servePlayerPos(side);
    return vec3(base.x, 0, actor.sideSign * Math.abs(base.z));
  }

  private contactPosFor(actor: Actor, side: number): Vec3 {
    const base = serveContactPos(side);
    return vec3(base.x, base.y, actor.sideSign * Math.abs(base.z));
  }

  private placeActor(actor: Actor, x: number, z: number): void {
    actor.figure.setPosition(x, z);
    actor.brain?.place(x, z);
  }

  private setupServe(): void {
    this.configure();
    // Fase 5: el sacador lo decide el marcador oficial (Score) y el lado
    // de saque, la paridad de puntos del juego en curso (par = derecha),
    // como en el pádel real. La grabación de la repetición empieza de
    // cero en cada punto.
    const snap = this.flow.score.snapshot;
    this.serverRole = this.roleForPlayer(snap.server);
    const pointsPlayed = (snap.points[0] as number) + (snap.points[1] as number);
    this.serveSide = pointsPlayed % 2 === 0 ? 1 : -1;
    this.recorder.clear();
    const server = this.actorByRole(this.serverRole);
    const serverPos = this.servePosFor(server, this.serveSide);
    const doubles = this.doubles();

    for (const actor of this.actors) {
      if (!doubles && (actor.role === 'partner' || actor.role === 'rival2')) continue;
      if (actor === server) {
        this.placeActor(actor, serverPos.x, serverPos.z);
      } else if (actor.team === server.team) {
        // Compañero del sacador: junto a la red, en la otra mitad en x.
        const zoneX = doublesZoneCenterX(serverPos.x);
        this.placeActor(actor, zoneX, actor.sideSign * 3.3);
        actor.brain?.setZone(zoneX, 2.5);
      } else {
        // Equipo que resta: el receptor en diagonal; si hay dos, el que
        // está en la diagonal es el «principal» de ese equipo.
        const isReceiver =
          actor.team !== server.team &&
          ((actor.team === 'ai' && actor.role === 'rival') || (actor.team === 'human' && actor.role === 'human') || !doubles);
        if (isReceiver) {
          this.placeActor(actor, -serverPos.x, actor.sideSign * (COURT.serviceLineZ + 0.6));
        } else {
          const zoneX = Math.sign(serverPos.x || 1) * 2.5;
          this.placeActor(actor, zoneX, actor.sideSign * 3.3);
          actor.brain?.setZone(zoneX, 2.5);
        }
      }
      actor.figure.faceNet();
      actor.brain?.onRallyEnd();
    }
    // Zona del sacador en dobles: la mitad de su lado de saque.
    if (doubles && server.brain) {
      server.brain.setZone(Math.sign(serverPos.x || 1) * 2.5, 2.5);
    }

    this.phase = 'serve-ready';
    this.serveValid = null;
    this.serveInFlight = false;
    this.lastHitTeam = null;
    this.crossed = false;
    this.bouncesOwn = 0;
    this.bouncesOpp = 0;
    this.wallByTeam = { human: false, ai: false };
    this.hits = 0;
    this.lastCause = null;
    this.lastShot = null;
    this.winner = null;
    this.lastNeedle = null;
    this.aiServeT = 0;
    this.aiServePlayed = false;
    this.message =
      this.serverRole === 'human'
        ? 'Tu saque: ESPACIO para lanzar la bola'
        : `Saca ${this.serverRole === 'partner' ? 'tu compañero' : 'el rival'}…`;
    this.holdBallAtServer();
  }

  private server(): Actor {
    return this.actorByRole(this.serverRole);
  }

  private holdBallAtServer(): void {
    const contact = this.contactPosFor(this.server(), this.serveSide);
    this.ball.hold(vec3(contact.x, 1.02, contact.z));
    this.syncBallVisual(0);
  }

  /** Golpe genérico ya resuelto: lanza la bola y avisa a los cerebros rivales. */
  private launchBall(from: Actor, pos: Vec3, velocity: Vec3, spinTop = 0, spinSide = 0, isServe = false): void {
    this.ball.launch({ ...pos }, velocity, spinTop, spinSide);
    // Sonido del golpe (Fase 6): TODOS los golpeos y saques del partido
    // pasan por aquí — un solo punto de disparo. La potencia sale de la
    // velocidad de salida y el spin da el matiz cortado/liftado.
    if (this.ball.speed > 1) {
      this.ctx.onSound({
        kind: isServe ? 'serve' : 'hit',
        power: Math.min(1, this.ball.speed / 30),
        spinTop,
      });
    }
    this.ballId += 1;
    this.lastHitTeam = from.team;
    this.crossed = false;
    this.bouncesOwn = 0;
    this.bouncesOpp = 0;
    this.wallByTeam = { human: false, ai: false };
    const surface = surfaceById(this.ctx.getSettings().courtType);
    const snap = snapshotOf(this.ball);
    for (const actor of this.actors) {
      if (!actor.brain) continue;
      if (actor.team !== from.team && this.isInPlay(actor)) actor.brain.onOpponentStrike(snap, surface);
      else actor.brain.onRallyEnd();
    }
    // Split-step de los que reciben: reaccionan al golpe contrario.
    for (const actor of this.actors) {
      if (actor.team !== from.team && this.isInPlay(actor)) actor.figure.play('split');
    }
  }

  private isInPlay(actor: Actor): boolean {
    if (!this.doubles() && (actor.role === 'partner' || actor.role === 'rival2')) return false;
    return true;
  }

  // ------------------------------------------------------------ saque humano e IA

  private startHumanToss(): void {
    this.phase = 'serve-toss';
    this.tossT = 0;
    this.needleT = 0;
    this.human.figure.play('serve');
    this.message = 'ESPACIO en el punto dulce para sacar';
  }

  private strikeHumanServe(): void {
    const needle = needleAt(this.needleT);
    this.lastNeedle = needle;
    const contact = { ...this.ball.pos };
    let velocity: Vec3;
    if (contact.y < MIN_SERVE_CONTACT_Y) {
      velocity = solveBallistic(contact, vec3(contact.x * 0.4, 0, 0.2), 0.4);
      this.message = 'Contacto demasiado bajo';
    } else {
      const serve = serveVelocity(needle, this.serveSide);
      const flightTime = (serve.target.z - serve.from.z) / serve.velocity.z;
      velocity = solveBallistic(contact, serve.target, flightTime);
      if (serve.zone === 'perfect') this.message = '¡Saque perfecto!';
      else if (serve.zone === 'good') this.message = 'Buen saque';
      else if (serve.zone === 'weak') this.message = 'Saque flojo…';
      else this.message = serve.fault === 'net' ? 'Falta: a la red' : 'Falta: larga';
    }
    this.serveInFlight = true;
    this.phase = 'rally';
    this.launchBall(this.human, contact, velocity, 0, 0, true);
  }

  private strikeAIServe(actor: Actor): void {
    const brain = actor.brain as AIBrain;
    const { needle } = brain.serveNeedle();
    this.lastNeedle = needle;
    const contact = this.contactPosFor(actor, this.serveSide);
    const serve = serveVelocity(needle, this.serveSide);
    const velocity =
      actor.sideSign > 0
        ? vec3(serve.velocity.x, serve.velocity.y, -serve.velocity.z)
        : serve.velocity;
    this.serveInFlight = true;
    this.phase = 'rally';
    if (needleZone(needle) === 'fault') this.message = 'El saque de la IA sale mal…';
    this.launchBall(actor, contact, velocity, 0, 0, true);
  }

  // ------------------------------------------------------------ golpeo

  private attemptHumanHit(): void {
    if (this.ball.state !== 'flying' || this.serveInFlight) return;
    if (this.lastHitTeam !== 'ai') return; // la última en golpear fue tu equipo
    const settings = this.ctx.getSettings();
    const level = playerLevelById(settings.playerLevel);
    const bp = this.ball.pos;
    const pp = this.human.figure.pos;
    if (!canHitBall(bp, vec3(pp.x, 0, pp.z), this.racketReach)) return;

    const input = this.input.shotInput();
    const superReady = this.superCharge >= 1;
    const kind: ShotKind = classifyShot(bp.y, input, superReady);
    const distance = Math.hypot(bp.x - pp.x, bp.z - pp.z);
    const quality = shotQuality(distance, level);
    const dirX = input.moveX !== 0 ? input.moveX : Math.max(-1, Math.min(1, (bp.x / 5) * 0.6));
    const shot = computeShot({ ballPos: bp, kind, dirX, quality, racketPower: this.racketPower });

    this.hits += 1;
    this.human.cooldown = 0.28;
    const backhand = bp.x < pp.x - 0.25;
    this.human.figure.play(backhand && kind === 'drive' ? 'backhand' : animForShot(kind));
    this.lastShot = SHOT_NAMES[kind];
    if (kind === 'super-smash') {
      this.superCharge = 0;
      this.message = '¡SUPERGOLPE!';
    } else {
      if (quality > 0.7) this.superCharge = Math.min(1, this.superCharge + (quality - 0.7) * 0.9 + 0.04);
      this.message = this.lastShot;
    }
    this.launchBall(this.human, bp, shot.velocity, shot.spinTop, shot.spinSide);
  }

  private attemptAIHit(actor: Actor): void {
    const brain = actor.brain;
    if (!brain || this.ball.state !== 'flying' || this.serveInFlight) return;
    if (this.lastHitTeam === actor.team) return;
    if (actor.cooldown > 0 || actor.lastAttemptBall === this.ballId) return;
    const bp = this.ball.pos;
    if (!brain.inReach(snapshotOf(this.ball))) return;

    // El compañero cede las bolas claramente del humano si este está cerca.
    if (actor.role === 'partner' && brain.prediction) {
      const humanPos = vec3(this.human.figure.pos.x, 0, this.human.figure.pos.z);
      if (partnerShouldYield(brain.prediction.point.x, humanPos, brain.prediction.point, brain.zoneCenterXValue, 2.5)) {
        return;
      }
    }
    // El segundo rival cede las del rival principal en las mismas condiciones.
    if (actor.role === 'rival2' && brain.prediction) {
      const rivalPos = vec3(this.rival.figure.pos.x, 0, this.rival.figure.pos.z);
      if (partnerShouldYield(brain.prediction.point.x, rivalPos, brain.prediction.point, brain.zoneCenterXValue, 2.5)) {
        return;
      }
    }

    actor.lastAttemptBall = this.ballId;
    const afterWall = this.wallByTeam[actor.team];
    const humanPos = vec3(this.human.figure.pos.x, 0, this.human.figure.pos.z);
    const decision = brain.chooseShot(snapshotOf(this.ball), humanPos, afterWall);
    const backhand = actor.sideSign > 0 ? bp.x > brain.pos.x + 0.25 : bp.x < brain.pos.x - 0.25;
    actor.figure.play(backhand && decision.kind === 'drive' ? 'backhand' : animForShot(decision.kind));
    actor.cooldown = 0.3;

    if (decision.error) {
      // Swing al aire: la bola sigue y el rally se resolverá por eventos.
      this.lastShot = `Error de ${actor.role === 'partner' ? 'tu compañero' : 'la IA'}`;
      return;
    }

    // Golpe espejado si golpea desde el campo contrario (z > 0).
    const mirror = actor.sideSign > 0;
    const shot = computeShot({
      ballPos: mirror ? vec3(bp.x, bp.y, -bp.z) : bp,
      kind: decision.kind,
      dirX: decision.dirX,
      quality: decision.quality,
      rng: this.rng,
    });
    const velocity = mirror ? vec3(shot.velocity.x, shot.velocity.y, -shot.velocity.z) : shot.velocity;
    // El spin lateral curva en x con independencia del signo de z (el
    // Magnus de Ball.ts usa |vz|): no se espeja.
    const spinSide = shot.spinSide;
    this.hits += 1;
    this.aiHits += 1;
    this.lastShot = SHOT_NAMES[decision.kind];
    this.message = actor.role === 'partner' ? `Tu compañero: ${this.lastShot}` : `Rival: ${this.lastShot}`;
    this.launchBall(actor, bp, velocity, shot.spinTop, spinSide);
  }

  // ------------------------------------------------------------ fin del rally

  private endRally(winnerTeam: AITeam, cause: string): void {
    if (this.phase === 'ended' || this.phase === 'match-over') return;
    this.phase = 'ended';
    this.winner = winnerTeam;
    this.lastCause = cause;
    this.message = cause;
    this.serveInFlight = false;
    this.endTimer = 2.4;
    // Roles grabados en este rally, para mapear los frames de la repetición.
    this.replayRoles = this.actors.filter((a) => this.isInPlay(a)).map((a) => a.role);
    for (const actor of this.actors) {
      if (!this.isInPlay(actor)) continue;
      actor.figure.play(actor.team === winnerTeam ? 'celebrate' : 'disappointed');
      actor.brain?.onRallyEnd();
    }
    // Fase 5: el punto entra en el marcador oficial y en la cuenta de
    // monedas del partido (MatchFlow). El punto de oro dispara su efecto.
    const wasGoldPoint = this.flow.score.goldPoint;
    const winnerSide: Side = winnerTeam === 'human' ? 0 : 1;
    const award = this.flow.pointFor(winnerSide);
    // Aplausos (Fase 6): breves en el punto de oro y al cerrar un juego;
    // largos cuando el juego cierra el partido.
    if (wasGoldPoint) {
      this.ctx.onSound({ kind: 'applause', big: false });
    } else if (award.result.gameWon) {
      this.ctx.onSound({ kind: 'applause', big: award.result.matchWon });
    }
    if (wasGoldPoint) {
      this.ctx.onEffect('gold', { ...this.ball.pos });
      this.message = `⭐ ¡Punto de oro! ${cause}`;
    } else if (award.result.matchWon) {
      this.message = `${cause} · ¡Fin del partido!`;
    } else if (award.result.gameWon) {
      const games = this.flow.score.snapshot.games;
      this.message = `${cause} · Juego ${winnerTeam === 'human' ? 'tuyo' : 'del rival'} (${games[0]}–${games[1]})`;
    }
  }

  /** Tras un punto: o se prepara el siguiente saque o se cierra el partido (devuelve true si se cerró). */
  private advanceAfterPoint(): boolean {
    if (this.flow.finished) {
      this.enterMatchOver();
      return true;
    }
    this.setupServe();
    return false;
  }

  /** Cierre del partido: fase final, efectos y aviso a la app (una vez). */
  private enterMatchOver(): void {
    this.phase = 'match-over';
    const summary = this.flow.summary;
    if (!summary) return;
    this.message = summary.champion
      ? `🏆 ¡CAMPEÓN del ${this.currentCareer().mode.name}!`
      : summary.winner === 'human'
        ? '🏆 ¡Victoria!'
        : 'Derrota — la IA se lleva el partido';
    for (const actor of this.actors) {
      if (!this.isInPlay(actor)) continue;
      actor.figure.play(actor.team === summary.winner ? 'celebrate' : 'disappointed');
    }
    if (!this.matchEndFired) {
      this.matchEndFired = true;
      if (summary.winner === 'human') this.ctx.onEffect('win');
      // Sonidos de cierre (Fase 6): fanfarria de campeonato o jingle de
      // victoria / tono de derrota, moneda al abonarse el total ganado
      // y aplausos largos si gana el humano.
      if (summary.champion) this.ctx.onSound({ kind: 'champion' });
      else if (summary.winner === 'human') this.ctx.onSound({ kind: 'win' });
      else this.ctx.onSound({ kind: 'lose' });
      if (summary.winner === 'human') this.ctx.onSound({ kind: 'applause', big: true });
      if (summary.coins.total > 0) this.ctx.onSound({ kind: 'coin' });
      this.ctx.onMatchEnd(summary);
    }
  }

  private receivingTeam(): AITeam {
    return this.lastHitTeam === 'human' ? 'ai' : 'human';
  }

  private handleEvent(event: BallEvent): void {
    if (this.phase !== 'rally' || !this.lastHitTeam) return;
    // Sonidos de contacto (Fase 6): la intensidad sale de la velocidad
    // de la bola al procesar el evento.
    if (event.type === 'bounce') {
      this.ctx.onSound({ kind: 'bounce', speed: this.ball.speed });
    } else if (event.type === 'wall') {
      this.ctx.onSound({ kind: event.kind === 'glass' ? 'glass' : 'mesh', speed: this.ball.speed });
    } else if (event.type === 'net' || (event.type === 'netcord' && event.over)) {
      this.ctx.onSound({ kind: 'net' });
    }
    const hitter = this.lastHitTeam;
    const receiver = this.receivingTeam();
    switch (event.type) {
      case 'bounce': {
        const sideTeam: AITeam = event.side === 'own' ? 'human' : 'ai';
        if (this.serveInFlight) {
          this.serveInFlight = false;
          if (sideTeam !== receiver) {
            this.faults += 1;
            this.endRally(receiver, 'Falta de saque: no llegó al campo contrario');
            return;
          }
          const inBox = isInServeBox(
            this.serverRole === 'human' || this.teamSign(this.server().team) < 0
              ? event.pos
              : vec3(event.pos.x, event.pos.y, -event.pos.z),
            this.serveSide,
          );
          if (inBox) {
            this.serveValid = true;
            this.message = 'Saque válido';
            if (event.side === 'own') this.bouncesOwn = 1;
            else this.bouncesOpp = 1;
          } else {
            this.serveValid = false;
            this.faults += 1;
            this.endRally(receiver, event.pos.z * this.teamSign(receiver) > COURT.serviceLineZ ? 'Falta de saque: larga' : 'Falta de saque: fuera del cuadro');
          }
          return;
        }
        if (sideTeam === receiver) {
          if (event.side === 'own') this.bouncesOwn += 1;
          else this.bouncesOpp += 1;
          const count = event.side === 'own' ? this.bouncesOwn : this.bouncesOpp;
          if (count >= 2) {
            this.endRally(hitter, hitter === 'human' ? 'Doble bote en el campo rival: rally tuyo' : 'Doble bote en tu campo: rally del rival');
          }
        } else if (!this.crossed) {
          this.endRally(receiver, hitter === 'human' ? 'No pasó la red: se quedó en tu campo' : 'La IA no pasó la red');
        }
        break;
      }
      case 'wall': {
        const sideTeam: AITeam = event.where === 'back-own' ? 'human' : event.where === 'back-opp' ? 'ai' : event.pos.z >= 0 ? 'ai' : 'human';
        const bouncesThere = sideTeam === 'human' ? this.bouncesOwn : this.bouncesOpp;
        if (this.serveInFlight) {
          if (sideTeam === receiver && bouncesThere === 0) {
            this.faults += 1;
            this.endRally(receiver, 'Falta de saque: directa al cerramiento');
          }
          return;
        }
        if (sideTeam === hitter) {
          this.endRally(receiver, hitter === 'human' ? 'Contra tu propio cerramiento: fuera' : 'La IA se dio contra su cerramiento');
        } else if (bouncesThere === 0 && event.where !== 'side') {
          this.endRally(receiver, hitter === 'human' ? 'Directa al cerramiento sin botar: fuera' : 'La IA la mandó directa al cerramiento');
        } else {
          this.wallByTeam[sideTeam] = true;
        }
        break;
      }
      case 'net': {
        if (this.serveInFlight) this.faults += 1;
        this.endRally(receiver, this.serveInFlight ? 'Falta de saque: a la red' : hitter === 'human' ? 'A la red' : 'La IA la estrelló en la red');
        break;
      }
      case 'netCross': {
        this.crossed = true;
        break;
      }
      case 'netcord': {
        if (event.over) this.message = '¡Pasa rozando la cinta!';
        break;
      }
      case 'over-wall': {
        const receiverBounces = receiver === 'human' ? this.bouncesOwn : this.bouncesOpp;
        if (this.serveInFlight) {
          this.faults += 1;
          this.endRally(receiver, 'Falta de saque: se marchó por encima');
        } else if (receiverBounces >= 1) {
          this.endRally(hitter, hitter === 'human' ? '¡La sacaste de la pista tras el bote!' : 'La IA la sacó de la pista tras el bote');
        } else {
          this.endRally(receiver, hitter === 'human' ? 'Fuera: por encima del cerramiento' : 'La IA la mandó fuera por encima');
        }
        break;
      }
      case 'resting': {
        const restTeam: AITeam = this.ball.pos.z < 0 ? 'human' : 'ai';
        this.endRally(restTeam === receiver ? hitter : receiver, 'La bola se paró');
        break;
      }
    }
  }

  // ------------------------------------------------------------ bucle

  update(dt: number): void {
    if (!this.active || this.disposed) return;
    // Repetición en curso: el juego queda congelado; V o ESC la cierran.
    if (this.replayPlayer.active) {
      if (this.input.consumePressed('KeyV') || this.input.consumePressed('Escape')) {
        this.finishReplay();
        return;
      }
      const frame = this.replayPlayer.update(dt);
      if (frame) this.applyReplayFrame(frame);
      if (!this.replayPlayer.active) this.finishReplay();
      this.syncBallVisual(0);
      return;
    }
    if (this.input.consumePressed('Escape')) {
      this.togglePause();
      return;
    }
    if (this.paused) return;
    if (this.input.consumePressed('KeyM')) this.ctx.onToggleMuted();
    // V tras un punto (o al final del partido): repetición del último punto.
    if (this.input.consumePressed('KeyV') && (this.phase === 'ended' || this.phase === 'match-over')) {
      this.startReplay();
    }
    this.configure();

    const settings = this.ctx.getSettings();
    const surface = surfaceById(settings.courtType);
    const level = playerLevelById(settings.playerLevel);

    for (const actor of this.actors) actor.cooldown = Math.max(0, actor.cooldown - dt);

    // ---- Saque ----
    if (this.phase === 'serve-ready') {
      const server = this.server();
      if (server.role === 'human') {
        this.holdBallAtServer();
        if (this.input.consumePressed('Space') || this.input.consumeClick()) this.startHumanToss();
      } else {
        // Saque de un cerebro: espera breve, gesto y golpeo.
        this.aiServeT += dt;
        const contact = this.contactPosFor(server, this.serveSide);
        this.ball.hold(vec3(contact.x, 1.02 + Math.min(1, this.aiServeT / 0.5) * 1.35, contact.z));
        this.syncBallVisual(0);
        if (!this.aiServePlayed) {
          server.figure.play('serve');
          server.brain?.markServing();
          this.aiServePlayed = true;
        }
        if (this.aiServeT >= 0.62) this.strikeAIServe(server);
      }
    } else if (this.phase === 'serve-toss') {
      this.tossT += dt;
      this.needleT += dt;
      const contact = serveContactPos(this.serveSide);
      const y = 1.02 + 5.35 * this.tossT - 0.5 * BALL_PHYSICS.gravity * this.tossT * this.tossT;
      this.ball.hold(vec3(contact.x, y, contact.z));
      if (this.input.consumePressed('Space') || this.input.consumeClick()) {
        this.strikeHumanServe();
      } else if (y < 1.12 && this.tossT > 0.45) {
        this.faults += 1;
        this.serveInFlight = false;
        this.phase = 'rally';
        this.launchBall(this.human, vec3(contact.x, y, contact.z), vec3(0, 0, 0));
        this.endRally('ai', 'Falta de saque: dejaste caer la bola');
      }
    }

    // ---- Acción del humano en rally / fin ----
    if (this.phase === 'rally') {
      if (this.input.consumePressed('Space') || this.input.consumeClick()) this.attemptHumanHit();
    } else if (this.phase === 'ended') {
      this.endTimer -= dt;
      if (this.input.consumePressed('Space') || this.endTimer <= 0) {
        this.advanceAfterPoint();
      }
    }
    if (this.input.consumePressed('KeyR') && this.phase !== 'serve-ready') {
      // R repite el saque del punto en curso (el punto ya anotado no se
      // deshace: en 'ended' equivale a avanzar, y en 'match-over' es revancha).
      if (this.phase === 'match-over') this.startMatch();
      else if (this.phase === 'ended') this.advanceAfterPoint();
      else this.setupServe();
    }

    // ---- Movimiento del humano ----
    let speedRatio = 0;
    if (this.phase === 'rally' || this.phase === 'ended' || this.phase === 'serve-ready' || this.phase === 'match-over') {
      const ax = this.input.axisX();
      const az = this.input.axisZ();
      if (ax !== 0 || az !== 0) {
        const len = Math.hypot(ax, az);
        const p = this.human.figure.pos;
        const nx = Math.min(4.55, Math.max(-4.55, p.x + ((ax / len) * level.speed) * dt));
        const nz = Math.min(-0.35, Math.max(-9.55, p.z + ((az / len) * level.speed) * dt));
        this.human.figure.setPosition(nx, nz);
        this.playerSpeed = level.speed;
        speedRatio = 1;
      } else {
        this.playerSpeed = 0;
      }
    }

    // ---- Cerebros: percepción/movimiento y golpeo ----
    for (const actor of this.actors) {
      if (!actor.brain || !this.isInPlay(actor)) continue;
      const ratio = actor.brain.update(dt);
      actor.speedRatio = ratio;
      actor.figure.setPosition(actor.brain.pos.x, actor.brain.pos.z);
    }
    // Anti-colisión blanda compañero–humano.
    if (this.doubles()) {
      const hp = this.human.figure.pos;
      const pp = this.partner.figure.pos;
      const d = Math.hypot(pp.x - hp.x, pp.z - hp.z);
      if (d < 0.7 && d > 1e-4) {
        const push = (0.7 - d) / 2;
        const ux = (pp.x - hp.x) / d;
        const uz = (pp.z - hp.z) / d;
        const nx = Math.min(4.55, Math.max(-4.55, pp.x + ux * push));
        const nz = Math.min(-0.35, Math.max(-9.55, pp.z + uz * push));
        this.partner.figure.setPosition(nx, nz);
        if (this.partner.brain) {
          this.partner.brain.pos.x = nx;
          this.partner.brain.pos.z = nz;
        }
      }
    }

    // ---- Física ----
    if (this.phase === 'rally' || this.phase === 'ended' || this.phase === 'match-over') {
      const wasRally = this.phase === 'rally';
      const events = this.ball.step(dt, surface);
      for (const event of events) this.handleEvent(event);
      // Grabación para la repetición: bola y jugadores en pista, en orden
      // fijo de roles (el muestreo a 20 Hz lo hace el propio ReplayRecorder).
      if (wasRally) {
        const inPlay = this.actors.filter((a) => this.isInPlay(a));
        this.recorder.record(
          dt,
          [this.ball.pos.x, this.ball.pos.y, this.ball.pos.z],
          inPlay.map((a) => [a.figure.pos.x, a.figure.pos.z] as [number, number]),
        );
      }
      if (this.phase === 'rally') {
        for (const actor of this.actors) {
          if (actor.brain && this.isInPlay(actor)) this.attemptAIHit(actor);
        }
        if (this.ball.state === 'resting') {
          const restTeam: AITeam = this.ball.pos.z < 0 ? 'human' : 'ai';
          this.endRally(restTeam === this.receivingTeam() ? (this.lastHitTeam as AITeam) : this.receivingTeam(), 'La bola se paró');
        }
      }
    }

    // ---- Orientación y animación ----
    for (const actor of this.actors) {
      if (!this.isInPlay(actor) && actor.role !== 'human') continue;
      if (this.phase === 'rally' && this.ball.state === 'flying') {
        actor.figure.faceTowards(this.ball.pos.x, this.ball.pos.z);
      } else {
        actor.figure.faceNet();
      }
      actor.figure.update(dt, actor.role === 'human' ? speedRatio : actor.speedRatio);
    }
    this.syncBallVisual(dt);
  }

  private syncBallVisual(_dt: number): void {
    const p = this.ball.pos;
    this.ballMesh.position.set(p.x, p.y, p.z);
    this.blob.position.x = p.x;
    this.blob.position.z = p.z;
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.34 * Math.max(0.15, 1 - p.y / 7);
    this.blob.visible = this.ball.state === 'flying';
    const arr = this.trailPositions;
    arr.copyWithin(0, 3);
    arr[(TRAIL_POINTS - 1) * 3] = p.x;
    arr[(TRAIL_POINTS - 1) * 3 + 1] = p.y;
    arr[(TRAIL_POINTS - 1) * 3 + 2] = p.z;
    (this.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.trail.visible = this.ball.state === 'flying';
  }

  focusData(): { player: THREE.Vector3; ball: THREE.Vector3 } | null {
    if (!this.active) return null;
    return {
      player: this.human.figure.pos,
      ball: new THREE.Vector3(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z),
    };
  }

  // ------------------------------------------------------------ repetición

  get isReplaying(): boolean {
    return this.replayPlayer.active;
  }

  /** Arranca la repetición del último punto si hay material grabado. */
  private startReplay(): void {
    if (this.recorder.frameCount < 2) return;
    const positions: Partial<Record<Role, { x: number; z: number }>> = {};
    for (const actor of this.actors) {
      positions[actor.role] = { x: actor.figure.pos.x, z: actor.figure.pos.z };
    }
    this.replaySnapshot = { ball: { ...this.ball.pos }, positions };
    if (this.replayRoles.length === 0) {
      this.replayRoles = this.actors.filter((a) => this.isInPlay(a)).map((a) => a.role);
    }
    this.replayPlayer.start(this.recorder.frames());
  }

  /** Aplica un frame grabado a la bola y a las figuras. */
  private applyReplayFrame(frame: { ball: [number, number, number]; players: [number, number][] }): void {
    this.ball.pos.x = frame.ball[0];
    this.ball.pos.y = frame.ball[1];
    this.ball.pos.z = frame.ball[2];
    frame.players.forEach((p, i) => {
      const role = this.replayRoles[i];
      if (!role) return;
      this.actorByRole(role).figure.setPosition(p[0], p[1]);
    });
  }

  /** Cierra la repetición y restaura el estado visual de fin de punto. */
  private finishReplay(): void {
    this.replayPlayer.stop();
    if (this.replaySnapshot) {
      this.ball.pos = { ...this.replaySnapshot.ball };
      for (const actor of this.actors) {
        const pos = this.replaySnapshot.positions[actor.role];
        if (pos) actor.figure.setPosition(pos.x, pos.z);
      }
      this.replaySnapshot = null;
    }
    this.syncBallVisual(0);
  }

  /** Celebración del humano a petición externa (hook __padelWin). */
  celebrateHuman(): void {
    this.human.figure.play('celebrate');
  }

  // ------------------------------------------------------------ probes y hooks

  probe(): MatchProbe {
    const needle = this.phase === 'serve-toss' ? needleAt(this.needleT) : this.lastNeedle;
    const rivalBrain = this.rival.brain;
    const career = this.currentCareer();
    const snap = this.flow.score.snapshot;
    const coins = this.flow.coins;
    const summary = this.flow.summary;
    const posOf = (actor: Actor): [number, number, number] => [
      round2(actor.figure.pos.x),
      0,
      round2(actor.figure.pos.z),
    ];
    return {
      active: this.active,
      paused: this.paused,
      mode: 'match',
      ball: {
        pos: [round2(this.ball.pos.x), round2(this.ball.pos.y), round2(this.ball.pos.z)],
        vel: [round2(this.ball.vel.x), round2(this.ball.vel.y), round2(this.ball.vel.z)],
        speed: round2(this.ball.speed),
        spin: { top: round2(this.ball.spinTop), side: round2(this.ball.spinSide) },
      },
      bounces: { own: this.ball.bouncesOwn, opp: this.ball.bouncesOpp },
      lastWall: this.ball.lastWall,
      rally: {
        state: this.phase,
        hits: this.hits,
        lastCause: this.lastCause,
        message: this.message,
        lastShot: this.lastShot,
        winner: this.winner,
      },
      player: { pos: posOf(this.human), speed: round2(this.playerSpeed) },
      serve: {
        needle,
        inSweetSpot: needle !== null && needleZone(needle) === 'perfect',
        faults: this.faults,
        side: this.serveSide,
        valid: this.serveValid,
        server: this.serverRole,
      },
      super: { charge: round2(this.superCharge), ready: this.superCharge >= 1 },
      ai: {
        level: rivalBrain ? rivalBrain.level.name : '',
        state: rivalBrain ? rivalBrain.state : '',
        lastShot: rivalBrain?.lastShot ?? null,
        errors: rivalBrain ? rivalBrain.errors : 0,
        decisionMs: rivalBrain ? rivalBrain.decisionMs : null,
      },
      players: {
        count: this.doubles() ? 4 : 2,
        human: { pos: posOf(this.human) },
        partner: this.doubles() ? { pos: posOf(this.partner) } : null,
        rival: { pos: posOf(this.rival) },
        rival2: this.doubles() ? { pos: posOf(this.rival2) } : null,
      },
      match: {
        aiHits: this.aiHits,
        server: this.serverRole,
        doubles: this.doubles(),
        modeId: career.mode.id,
        modeName: career.mode.name,
        over: this.phase === 'match-over',
        winner: summary?.winner ?? null,
        champion: summary?.champion ?? false,
      },
      score: {
        points: [snap.points[0] as number, snap.points[1] as number],
        labels: [this.flow.score.pointLabel(0), this.flow.score.pointLabel(1)],
        games: [snap.games[0] as number, snap.games[1] as number],
        server: this.roleForPlayer(snap.server),
        tiebreak: snap.tiebreak,
        goldPoint: snap.goldPoint,
        gamesToWin: snap.gamesToWin,
      },
      career: career.active
        ? {
            active: true,
            round: career.round,
            roundName: career.roundName,
            team: career.team?.name ?? null,
            isFinal: career.isFinal,
          }
        : null,
      economy: {
        earned: coins.total,
        points: coins.points,
        games: coins.games,
        result: coins.result,
        bonus: coins.bonus,
      },
      replay: {
        frames: this.recorder.frameCount,
        active: this.replayPlayer.active,
        progress: round2(this.replayPlayer.progress),
      },
      audio: this.ctx.getAudioProbe(),
    };
  }

  // ------------------------------------------------------------ entrada táctil (Fase 6)

  /** Puente táctil: el joystick de la UI escribe en el InputManager del modo. */
  touchMove(x: number, z: number): void {
    this.input.setTouchMove(x, z);
  }

  /** Puente táctil: un toque = una pulsación de tecla (Space, Escape, KeyV…). */
  touchPress(code: string): void {
    this.input.pressTouch(code);
  }

  /** Puente táctil: botones mantenidos (KeyQ/KeyE). */
  touchHeld(code: string, held: boolean): void {
    this.input.setTouchHeld(code, held);
  }

  /** Hook de test: fija la semilla del RNG de la IA (recrea los cerebros). */
  testSeed(seed: number): MatchProbe {
    this.rng = mulberry32(seed);
    this.configure(true);
    if (this.active) this.setupServe();
    return this.probe();
  }

  /**
   * Hook de test: fuerza un saque del rival y lo ejecuta ya, aunque el
   * turno de saque de Score sea de otro (solo recoloca a los jugadores;
   * el punto, cuando se resuelva, puntuará con normalidad).
   */
  testAIServe(): MatchProbe {
    if (!this.active) this.setActive(true);
    this.setPaused(false);
    if (this.replayPlayer.active) this.finishReplay();
    this.setupServe();
    this.serverRole = 'rival';
    const servePos = this.servePosFor(this.rival, this.serveSide);
    this.placeActor(this.rival, servePos.x, servePos.z);
    this.aiServeT = 0.62;
    this.strikeAIServe(this.rival);
    return this.probe();
  }

  /**
   * Hook de test (Fase 5): cierra el punto en curso a favor del equipo
   * dado POR LA VÍA NORMAL (endRally → Score → economía), avanzando
   * primero si el punto anterior aún estaba en su pausa de fin. Permite
   * jugar un set entero guiado sin esperar a la física.
   */
  private forcePoint(winnerTeam: AITeam): MatchProbe {
    if (!this.active) this.setActive(true);
    this.setPaused(false);
    if (this.replayPlayer.active) this.finishReplay();
    if (this.phase === 'match-over') return this.probe();
    if (this.phase === 'ended' && this.advanceAfterPoint()) return this.probe();
    this.phase = 'rally';
    this.serveInFlight = false;
    this.endRally(
      winnerTeam,
      winnerTeam === 'human' ? 'Punto guiado de prueba: lo ganas tú' : 'Punto guiado de prueba: lo gana la IA',
    );
    return this.probe();
  }

  /** Hook de test: gana el punto en curso (ver forcePoint). */
  testWinPoint(): MatchProbe {
    return this.forcePoint('human');
  }

  /** Hook de test: pierde el punto en curso (ver forcePoint). */
  testLosePoint(): MatchProbe {
    return this.forcePoint('ai');
  }

  /** Hook de test: arranca la repetición del último punto, como la tecla V. */
  testReplay(): MatchProbe {
    if (!this.active) this.setActive(true);
    this.setPaused(false);
    if (this.phase === 'ended' || this.phase === 'match-over') this.startReplay();
    return this.probe();
  }

  /** Hook de test: lanza una bola clara al campo de la IA (para que devuelva). */
  testLaunchAtAI(): MatchProbe {
    if (!this.active) this.setActive(true);
    this.setPaused(false);
    if (this.phase !== 'rally') {
      this.phase = 'rally';
      this.serveInFlight = false;
      this.serveValid = null;
    }
    const r = this.rival.figure.pos;
    const from = vec3(-r.x * 0.4, 2.0, -4.2);
    const bounceTarget = vec3(r.x * 0.9, 0, r.z - 1.7);
    const velocity = solveBallistic(from, bounceTarget, 1.15);
    this.message = '¡Bola hacia la IA!';
    this.launchBall(this.human, from, velocity);
    return this.probe();
  }

  dispose(): void {
    this.disposed = true;
    this.input.detach();
    for (const actor of this.actors) actor.figure.dispose();
    this.ballMesh.geometry.dispose();
    this.ballMaterial.dispose();
    this.trail.geometry.dispose();
    (this.trail.material as THREE.Material).dispose();
    this.blob.geometry.dispose();
    (this.blob.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
