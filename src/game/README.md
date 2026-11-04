# src/game — motor del partido

Estado por fases:

- **Fase 0+1:** `Score.ts` — marcador puro, con tests.
- **Fase 5:** partido completo con marcador oficial, economía,
  carrera Torneo/Mundial, repetición y efectos:
  - `MatchFlow.ts` — envuelve `Score` y lleva la cuenta de monedas del
    partido (punto/juego/victoria con las fórmulas de la SPEC §5.5,
    40 por derrota, bonus de campeón). Puro, con tests.
  - `Career.ts` — carrera sobre el store: rondas de la SPEC (Torneo
    Semifinal/Final, bonus 200; Mundial Cuartos/Semifinal/Final, bonus
    500), rampa de nivel +1 por ronda, selección rival del Mundial
    determinista por ronda, `run` persistente y `settleMatch` (abono de
    monedas + stats + avance/fin de carrera al cerrar el partido).
  - `Replay.ts` — grabador circular del rally (8 s a 20 Hz) y
    reproductor a 0,5× con interpolación (tecla V). Puro, con tests.
  - `Effects.ts` — partículas propias con `THREE.Points` (pool de 900):
    confeti, fuegos artificiales y estallido dorado de punto de oro.
  - `Match.ts` — el partido usa el Score oficial (el saque sale del
    marcador, con patrón 1-2-2 en el tiebreak, y el lado de saque de la
    paridad de puntos), graba para la repetición, dispara los efectos
    y expone los hooks `__padelTestWinPoint/__padelTestLosePoint/
    __padelTestReplay` además de `__padelFX/__padelWin/__padelGold`
    (montados en `SceneCanvas`).
- **Fase 4:** jugadores completos, IA por niveles, dobles y
  modo Partido libre:
  - `Player.ts` — rig articulado procedural completo (pelvis, tronco,
    cabeza, brazos con antebrazo y pala, piernas con pantorrilla) con
    animación por estados (`play(state)`: idle, split, run, drive,
    backhand, lob, drop, smash, serve, celebrate, disappointed). La
    SPEC pedía un GLB propio; Blender no está en la VM y no se instaló
    software pesado: la clase `PlayerFigure` es la interfaz estable y
    su interior podrá sustituirse por un GLB sin tocar IA ni modos.
  - `AI.ts` — cerebro puro y testeable: predicción de intercepción
    simulando con `Ball.ts`, reloj de reacción (`aiReaction`),
    movimiento a `aiSpeed`, tiradas de error (`aiError` + `aiWallError`
    tras pared), calidad por nivel, selección de golpe (smash, globo,
    dejada, cortado, liftado, drive), aguja virtual de saque
    (`aiServeFault`) y zonas/cesión de dobles.
  - `Match.ts` — Partido libre contra la IA: rallies completos con
    saque alterno (rotación tú→rival y en dobles tú→rival→compañero→
    rival2), reglas de rally documentadas en su cabecera, celebraciones
    y contador informal de rallies (el Score oficial es Fase 5).
  - Hooks nuevos: `__padelProbe()` devuelve el probe del modo activo;
    `__padelTestSeed(n)`, `__padelTestAIServe()` y
    `__padelTestLaunchAtAI()` para el partido.
- **Fase 3:** bola, golpeo y entrenamiento jugable sin rival:
  - `Ball.ts` — física pura de la bola (gravedad 9,9, drag, spin con
    Magnus simplificado, botes, cristal 0,85 / malla 0,50, red con
    netcord, eventos de rally), sin Three.js.
  - `Shots.ts` — golpeo puro: alcance, tipos (drive, potente, cortado,
    liftado, dejada, globo, smash, super-smash), calidad por nivel,
    balística y saque con aguja (zonas y cuadro diagonal).
  - `Input.ts` — teclado (WASD/flechas, ESPACIO, Q, E, C, ESC, M, R) y
    clic como golpeo; teclas mantenidas + pulsaciones consumibles.
  - `Training.ts` — modo entrenamiento: saque con aguja, rally libre,
    reglas de fin de rally, SUPERGOLPE, pausa y probes de test.
  - Hooks en `window`: además de los de la Fase 2, `__padelProbe()`,
    `__gameProbe()`, `__padelTestServe(needle01)` y
    `__padelTestLaunch({fromX?})`.
- **Fase 2:** la escena 3D completa sin partido:
  - `courtConstants.ts` — medidas reglamentarias y tamaño del público (puro).
  - `cameraMath.ts` — tipos de cámara, poses, zoom 0,45–2,6 y órbita (puro).
  - `ambiencePresets.ts` — presets Noche/Día/Atardecer para la escena (puro).
  - `textures.ts` — texturas procedurales (vallas inventadas, malla, red).
  - `Court.ts` — pista: suelo y líneas, red, cristales, malla, vallas,
    gradas y público instanciado (306 figuras, sin GLB).
  - `Backdrop.ts` — cielo degradado, niebla, luces, estrellas, nubes,
    montañas y suelo exterior.
  - `Cameras.ts` — rig TV/Jugador/Libre sobre `cameraMath.ts`.
- **Fase 6 (actual):** audio sintetizado y controles táctiles:
  - `Audio.ts` — motor WebAudio propio (sin librerías ni ficheros):
    todos los sonidos se sintetizan (golpe, saque, bote, cristal,
    malla, red, aplausos, grada en bucle, clics de UI, moneda, jingle
    de victoria/derrota y fanfarria de campeonato), con contexto
    perezoso, mute estricto desde `game.muted`, compresor y máximo de
    voces. Los contadores del probe cuentan disparos lógicos.
  - `TouchInput.ts` — lógica pura del táctil: `JoystickTracker`
    (un puntero, zona muerta, vector normalizado), `ButtonBank`
    (multi-touch por pointerId) y detección de dispositivo táctil.
    El joystick alimenta el mismo `InputManager` que el teclado.
  - `PadelScene.ts` — orquestador: renderer, aplicación diferencial de
    settings y `SceneProbe` para los tests; dueño del motor de audio
    (grada según modo/ajustes/mute) y de los puentes táctiles.

Pendiente de fases posteriores: el pulido/deploy (Fase 7). No se
crean como esqueletos vacíos: cada módulo nacerá con su
implementación y sus tests.
