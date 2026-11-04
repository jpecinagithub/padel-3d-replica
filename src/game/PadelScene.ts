// Orquestador de la escena 3D de la réplica: renderer, pista, entorno y
// rig de cámaras, con aplicación diferencial de los settings del store.
// Desde la Fase 3 vive aquí el modo Entrenamiento; desde la Fase 4, el
// Partido libre contra la IA (Match.ts). Solo uno de los dos está activo
// a la vez (PlayMode); el menú los ve desactivados, como decorado.
// Fase 5: la escena alberga también los efectos de partículas
// (Effects.ts) que dispara el partido, la cámara de repetición y el
// puente de fin de partido hacia la app (monedas/stats/carrera).

import * as THREE from 'three';
import type { Wallet } from '../state/economy';
import { ambienceById, surfaceById } from '../state/modes';
import { DEFAULT_SETTINGS, type Settings } from '../state/store';
import { ambiencePreset } from './ambiencePresets';
import { GameAudio, type AudioProbe, type SoundEvent } from './Audio';
import { buildBackdrop, type Backdrop } from './Backdrop';
import { CameraRig } from './Cameras';
import { careerStatus, type CareerStatus } from './Career';
import { buildCourt, type CourtParts } from './Court';
import { CAMERA_NAMES, cameraKindFromSettings, type CameraKind } from './cameraMath';
import { Effects, type EffectsProbe } from './Effects';
import { Match, type MatchProbe } from './Match';
import type { MatchSummary } from './MatchFlow';
import { Training, type TrainingProbe } from './Training';

export type PlayMode = 'none' | 'training' | 'match';
export type PlayProbe = TrainingProbe | MatchProbe;

export interface SceneProbe {
  ready: boolean;
  frames: number;
  camera: CameraKind;
  cameraName: string;
  zoom: number;
  surface: string;
  ambience: string;
  crowd: boolean;
  crowdCount: number;
  glassPanels: number;
  meshPanels: number;
  adBoards: number;
  objects: number;
  meshes: number;
  rendererSize: [number, number];
  pixelRatio: number;
  effects: EffectsProbe;
  /** Audio sintetizado (Fase 6): disparos, estado del contexto y mute. */
  audio: AudioProbe;
  /** Modo de bajo consumo activo (Fase 8 · C4): menú sin modo de juego. */
  lowPower: boolean;
}

export interface SceneHandlers {
  onToggleMuted: () => void;
  onPauseChange: (paused: boolean) => void;
  onMatchEnd: (summary: MatchSummary) => void;
  /** Petición de partido nuevo del motor (tecla R; la app crea el run). */
  onStartMatch: () => void;
}

export class PadelScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly court: CourtParts;
  private readonly backdrop: Backdrop;
  private readonly rig: CameraRig;
  private readonly training: Training;
  private readonly match: Match;
  private readonly effects = new Effects();
  /** Motor de audio sintetizado (Fase 6): lo disparan los dos modos vía ctx. */
  private readonly audio = new GameAudio();
  private career: CareerStatus = careerStatus({ ...DEFAULT_SETTINGS }, null);
  private readonly container: HTMLElement;
  private frames = 0;
  private appliedSurface = -1;
  private appliedAmbience = -1;
  private appliedCrowd: boolean | null = null;
  private currentSettings: Settings = { ...DEFAULT_SETTINGS };
  private currentWallet: Wallet | null = null;
  private handlers: SceneHandlers = {
    onToggleMuted: () => undefined,
    onPauseChange: () => undefined,
    onMatchEnd: () => undefined,
    onStartMatch: () => undefined,
  };
  private playMode: PlayMode = 'none';
  /** Contador para renderizar a media tasa en modo menú (C4). */
  private menuFrameSkip = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    // preserveDrawingBuffer: coste pequeño y constante; a cambio, los
    // tests visuales pueden muestrear los píxeles del canvas en cualquier
    // momento (SPEC §7.3), no solo justo tras un frame.
    // La escena nace en modo menú (sin juego): pixelRatio con tope 1
    // (C4); al entrar en pista, setPlayMode lo sube a 2.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.court = buildCourt(surfaceById(0));
    this.scene.add(this.court.group);
    this.backdrop = buildBackdrop();
    this.scene.add(this.backdrop.group);
    this.scene.add(this.effects.group);

    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.rig = new CameraRig(aspect);

    // Modos de juego (Fases 3 y 4): viven dentro de la escena,
    // desactivados hasta que la UI entra en la vista de pista y elige.
    const modeContext = {
      getSettings: () => this.currentSettings,
      getWallet: () => this.currentWallet as Wallet,
      onToggleMuted: () => this.handlers.onToggleMuted(),
      onPauseChange: (paused: boolean) => this.handlers.onPauseChange(paused),
      getCareer: () => this.career,
      onEffect: (kind: 'win' | 'gold', at?: { x: number; y: number; z: number }) => this.handleEffect(kind, at),
      onMatchEnd: (summary: MatchSummary) => this.handlers.onMatchEnd(summary),
      onRequestNewMatch: () => this.handlers.onStartMatch(),
      onSound: (event: SoundEvent) => {
        this.audio.dispatch(event);
      },
      getAudioProbe: () => this.audio.probe(),
    };
    this.training = new Training(this.scene, this.renderer.domElement, modeContext);
    this.match = new Match(this.scene, this.renderer.domElement, modeContext);
  }

  setHandlers(handlers: SceneHandlers): void {
    this.handlers = handlers;
  }

  get ready(): boolean {
    return this.frames > 0;
  }

  get cameraKind(): CameraKind {
    return this.rig.currentKind;
  }

  /** Aplica los settings del store solo donde han cambiado. */
  applySettings(settings: Settings): void {
    this.currentSettings = settings;
    if (settings.courtType !== this.appliedSurface) {
      this.appliedSurface = settings.courtType;
      this.court.applySurface(surfaceById(settings.courtType));
    }
    if (settings.ambience !== this.appliedAmbience) {
      this.appliedAmbience = settings.ambience;
      const preset = ambiencePreset(settings.ambience);
      this.backdrop.applyPreset(preset, this.scene);
      this.renderer.toneMappingExposure = preset.exposure;
    }
    if (settings.crowd !== this.appliedCrowd) {
      this.appliedCrowd = settings.crowd;
      this.court.setCrowdVisible(settings.crowd);
    }
    this.refreshCrowd();
  }

  /** Cámara que manda el ajuste de settings (sin pisar un override de vista). */
  applySettingsCamera(settings: Settings): void {
    this.rig.setKind(cameraKindFromSettings(settings.camera));
  }

  /** Lo equipado en la tienda (bola, pala, camiseta…) llega a los dos modos. */
  applyWallet(wallet: Wallet): void {
    this.currentWallet = wallet;
    this.training.applyLoadout(wallet);
    this.match.applyLoadout(wallet);
  }

  /** Estado de carrera resuelto por la app (modo, ronda, nivel efectivo). */
  setCareer(career: CareerStatus): void {
    this.career = career;
  }

  // ---------------------------------------------------- efectos (Fase 5)

  /** Efectos que dispara el partido: victoria y punto de oro. */
  private handleEffect(kind: 'win' | 'gold', at?: { x: number; y: number; z: number }): void {
    if (kind === 'win') {
      this.effects.celebrate();
    } else {
      const pos = at ?? { x: 0, y: 1.4, z: 0 };
      this.effects.goldBurst({ x: pos.x, y: Math.max(0.6, pos.y), z: pos.z });
    }
  }

  /**
   * Hooks de efectos del original (SPEC §5.7): __padelFX (confeti),
   * __padelWin (espectáculo de victoria + celebración) y __padelGold
   * (estallido dorado donde esté la bola).
   */
  triggerFX(kind: 'fx' | 'win' | 'gold'): void {
    if (kind === 'fx') {
      this.effects.confetti({ x: 0, y: 1.2, z: 0 });
    } else if (kind === 'win') {
      this.effects.celebrate();
      if (this.playMode === 'match') this.match.celebrateHuman();
    } else {
      const focus = this.playMode === 'match' ? this.match.focusData() : this.training.focusData();
      const ball = focus?.ball ?? { x: 0, y: 1.4, z: 0 };
      this.effects.goldBurst({ x: ball.x, y: Math.max(0.6, ball.y), z: ball.z });
    }
  }

  effectsProbe(): EffectsProbe {
    return this.effects.probe();
  }

  // ---------------------------------------------------- modos de juego

  /** Activa un modo (o ninguno) y desactiva el otro. */
  setPlayMode(mode: PlayMode): void {
    if (mode === this.playMode) return;
    this.playMode = mode;
    this.training.setActive(mode === 'training');
    this.match.setActive(mode === 'match');
    // Fase 8 · C4: sin modo de juego (menú/tienda/personalizar) la
    // escena es un fondo decorativo — se limita el coste sin perderlo:
    // pixelRatio con tope 1 y render a media tasa en update(). Al
    // entrar en pista se restaura la calidad completa.
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(mode === 'none' ? Math.min(dpr, 1) : Math.min(dpr, 2));
    this.resize();
    this.refreshCrowd();
  }

  // ---------------------------------------------------- audio (Fase 6)

  /** Mute global (store `game.muted`): lo aplica App vía SceneCanvas. */
  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    this.refreshCrowd();
  }

  /** Primer gesto del usuario: desbloquea el AudioContext (autoplay). */
  userGesture(): void {
    this.audio.unlock();
  }

  /** Clic de UI (botones de menú/tienda/HUD): lo engancha SceneCanvas. */
  playUIClick(): void {
    this.audio.dispatch({ kind: 'ui' });
  }

  audioProbe(): AudioProbe {
    return this.audio.probe();
  }

  /**
   * Grada sonora: murmullo en bucle solo mientras se juega (algún modo
   * activo), con público activado en los ajustes y sin mute.
   */
  private refreshCrowd(): void {
    const shouldCrowd =
      this.playMode !== 'none' && this.currentSettings.crowd && !this.audio.isMuted;
    if (shouldCrowd) this.audio.startCrowd();
    else this.audio.stopCrowd();
  }

  // ---------------------------------------------------- entrada táctil (Fase 6)

  /** Joystick de la UI: escribe en el InputManager de AMBOS modos (el inactivo lo ignora al activarse). */
  touchMove(x: number, z: number): void {
    this.training.touchMove(x, z);
    this.match.touchMove(x, z);
  }

  /** Toque de botón de acción: pulsación de tecla en ambos modos. */
  touchPress(code: string): void {
    this.training.touchPress(code);
    this.match.touchPress(code);
  }

  /** Botón mantenido (CORTADO/LIFTADO) en ambos modos. */
  touchHeld(code: string, held: boolean): void {
    this.training.touchHeld(code, held);
    this.match.touchHeld(code, held);
  }

  get currentPlayMode(): PlayMode {
    return this.playMode;
  }

  /** Probe del modo activo (entrenamiento o partido); si no hay modo, el del entrenamiento inactivo. */
  playProbe(): PlayProbe {
    return this.playMode === 'match' ? this.match.probe() : this.training.probe();
  }

  trainingProbe(): TrainingProbe {
    return this.training.probe();
  }

  matchProbe(): MatchProbe {
    return this.match.probe();
  }

  testServe(needle01: number): TrainingProbe {
    return this.training.testServe(needle01);
  }

  testLaunch(options?: { fromX?: number }): TrainingProbe {
    return this.training.testLaunch(options);
  }

  testSeed(seed: number): MatchProbe {
    return this.match.testSeed(seed);
  }

  testAIServe(): MatchProbe {
    return this.match.testAIServe();
  }

  testLaunchAtAI(): MatchProbe {
    return this.match.testLaunchAtAI();
  }

  testWinPoint(): MatchProbe {
    return this.match.testWinPoint();
  }

  testLosePoint(): MatchProbe {
    return this.match.testLosePoint();
  }

  testReplay(): MatchProbe {
    return this.match.testReplay();
  }

  /** Empieza un partido nuevo (revancha o siguiente ronda de carrera). */
  playStartMatch(): void {
    if (this.playMode === 'match') this.match.startMatch();
  }

  /** Pausa del modo activo (Continuar del panel de pausa). */
  playResume(): void {
    if (this.playMode === 'match') this.match.resume();
    else this.training.resume();
  }

  /** Reinicio del rally del modo activo. */
  playRestart(): void {
    if (this.playMode === 'match') this.match.restartRally();
    else this.training.restartRally();
  }

  playTogglePause(): void {
    if (this.playMode === 'match') this.match.togglePause();
    else this.training.togglePause();
  }

  setCameraKind(kind: CameraKind): void {
    this.rig.setKind(kind);
  }

  cycleCamera(): CameraKind {
    return this.rig.cycle();
  }

  drag(deltaX: number, deltaY: number): void {
    this.rig.drag(deltaX, deltaY);
  }

  zoomBy(factor: number): void {
    this.rig.zoomBy(factor);
  }

  resize(): void {
    const width = this.container.clientWidth;
    const height = Math.max(1, this.container.clientHeight);
    if (width === 0) return;
    this.renderer.setSize(width, height);
    this.rig.resize(width / height);
  }

  /** Un frame: avanza el modo activo, mueve la cámara y renderiza. */
  update(dt: number): void {
    this.training.update(dt);
    this.match.update(dt);
    this.effects.update(dt);
    const focus =
      this.playMode === 'match' ? this.match.focusData() : this.training.focusData();
    this.rig.setFocus(focus);
    // Durante la repetición manda la cámara lateral de Replay (Fase 5).
    this.rig.setReplayBall(
      this.playMode === 'match' && this.match.isReplaying && focus ? focus.ball : null,
    );
    this.rig.update(dt);
    // C4: en el menú (sin modo activo) basta media tasa de render: el
    // fondo sigue animado (modos inactivos y cámara se actualizan
    // igual) pero se dibuja un frame de cada dos.
    if (this.playMode === 'none') {
      this.menuFrameSkip = (this.menuFrameSkip + 1) % 2;
      if (this.menuFrameSkip === 1) return;
    }
    this.renderer.render(this.scene, this.rig.camera);
    this.frames += 1;
  }

  probe(): SceneProbe {
    let objects = 0;
    let meshes = 0;
    this.scene.traverse((object) => {
      objects += 1;
      if ((object as THREE.Mesh).isMesh) meshes += 1;
    });
    const size = this.renderer.getSize(new THREE.Vector2());
    return {
      ready: this.ready,
      frames: this.frames,
      camera: this.rig.currentKind,
      cameraName: CAMERA_NAMES[this.rig.currentKind],
      zoom: Math.round(this.rig.zoom * 100) / 100,
      surface: surfaceById(this.appliedSurface).name,
      ambience: ambienceById(this.appliedAmbience).name,
      crowd: this.court.crowdVisible(),
      crowdCount: this.court.crowdCount,
      glassPanels: this.court.glassPanels,
      meshPanels: this.court.meshPanels,
      adBoards: this.court.adBoards,
      objects,
      meshes,
      rendererSize: [size.x, size.y],
      pixelRatio: this.renderer.getPixelRatio(),
      effects: this.effects.probe(),
      audio: this.audio.probe(),
      lowPower: this.playMode === 'none',
    };
  }

  dispose(): void {
    this.audio.dispose();
    this.training.dispose();
    this.match.dispose();
    this.effects.dispose();
    this.court.dispose();
    this.backdrop.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
