# FASE 5 — Informe: partido completo (Score oficial, economía, Torneo/Mundial, repetición y efectos)

Réplica clean-room de «Pádel 3D» · `~/workspace/padel-replica/`
SPEC: `~/workspace/padel-analysis/REPLICA_SPEC.md` (§4, §5.1, §5.4, §5.5, §5.7, §8 Fase 5)
Fecha: 4-nov-2026. Todo el contenido es original; nada procede de
`padel-analysis/served/`.

Convención: **[OBS]** observado/ejecutado · **[DER]** derivado ·
**[INF]** inferido · **[DESC]** no comprobado.

---

## 1. Qué se ha construido

El «Partido libre» de la Fase 4 es ahora un **partido completo con
reglas oficiales**, economía real abonada al wallet y modos de carrera
Torneo/Mundial con persistencia. El modo Entrenamiento (Fase 3) queda
intacto.

### 1.1 Módulos nuevos

| Fichero | Qué hace |
|---|---|
| `src/game/MatchFlow.ts` | **Puro.** Envuelve la clase `Score` de la Fase 1 y lleva la cuenta de monedas del partido: abona en la cuenta (no en el wallet) punto/juego/victoria según las fórmulas de la SPEC §5.5 que ya vivían en `state/economy.ts`, 40 por derrota y bonus de campeón. Produce el `MatchSummary` final (ganador, juegos, puntos ganados, desglose). |
| `src/game/Career.ts` | **Puro + store.** Resuelve el estado de carrera desde settings+run (`careerStatus`: modo, ronda, nombre, nivel efectivo con rampa, selección del Mundial), crea el run (`startCareerRun`) y cierra partidos (`settleMatch`: abona el total en el wallet, actualiza stats y avanza/termina la carrera, todo persistido en el acto). |
| `src/game/Replay.ts` | **Puro.** Grabador circular del rally y reproductor con interpolación lineal. Ventana elegida: **8 s a 20 Hz = 160 frames** (bola + posiciones x/z de los jugadores en pista); reproducción a **0,5×** (cámara lenta). |
| `src/game/Effects.ts` | Partículas propias con un único `THREE.Points` (pool de 900, sin librerías ni assets): **confeti** (chorro de colores con gravedad suave y drag), **fuegos artificiales** (estallidos esféricos; la celebración de victoria dispara 3 escalonados + confeti) y **estallido dorado** (radial, breve) para el punto de oro. El fundido se hace oscureciendo el color por partícula. |

### 1.2 Marcador oficial en el partido (`Match.ts`)

- Cada fin de rally pasa por `endRally` → `MatchFlow.pointFor(lado)`:
  **un solo embudo** puntúa punto → juego → set → fin, con tiebreak a 7
  y punto de oro según la decisión documentada en la Fase 1 (en el
  juego que decide el partido, a 40-40 un punto lo cierra; fuera de
  ahí, ventaja normal).
- **El saque lo decide Score** (`snapshot.server`), no la rotación
  informal de la Fase 4 — **cambio documentado**: la secuencia
  resultante coincide (individuales tú→rival; dobles
  tú→rival→compañero→rival2, porque Score rota [0,2,1,3] sobre los
  jugadores 0=humano, 1=compañero, 2=rival, 3=rival2), pero ahora el
  saque cambia **por juegos** (no por rally) y en el tiebreak sigue el
  patrón 1-2-2 de Score. El **lado de saque** (derecha/izquierda) sale
  de la paridad de puntos del juego en curso (par = derecha), como en
  el pádel real, en lugar de alternar por turnos de sacador.
- **El contador informal de rallies de la Fase 4 ha desaparecido** (del
  HUD y del probe): solo existe el marcador oficial.
- Formatos: Partida rápida = set a 6; Torneo/Mundial = set a 4 (de
  `GAME_MODES`, campo `mode` de settings, como ya existía).
- Nueva fase `match-over`: al cerrarse el partido se disparan los
  efectos de victoria (si ganas), la celebración y **una sola vez** el
  aviso a la app con el resumen (`onMatchEnd` → `settleMatch`).
- Se mantiene la simplificación de la Fase 4: **saque único por punto**
  (la falta de saque es punto del que resta; sin segundo saque).

### 1.3 Economía y stats

- Fórmulas aplicadas (SPEC §5.5, con el nivel **efectivo** del rival,
  incluida la rampa de carrera): punto **4×(nivel+1)**, juego
  **20×(nivel+1)**, victoria **120×(nivel+1)**, derrota **40** fijas,
  bonus de campeón **200/500**.
- Las monedas se acumulan durante el partido (chip del HUD «🪙 +N en
  este partido» y desglose en el probe) y **se abonan al wallet al
  cerrar el partido**, junto con stats: `wins`/`losses` +1,
  `pointsWon` += puntos ganados, y `torneos`/`mundiales` +1 si hay
  campeonato. Todo persiste en `game.padel.wallet` / `game.padel.stats`
  vía el store de la Fase 1.
- Salir a mitad de partido no abona nada ni toca la carrera (el run
  sigue guardado en su ronda).
- El botón «+500 monedas (prueba)» de la tienda **se queda** (su
  retirada es Fase 6, según lo acordado). Ya no hace falta: en la
  verificación el wallet subió de 0 a 3.640 solo jugando (guiado).

### 1.4 Modos Torneo y Mundial (carrera en `game.padel.run`)

Estructura **la de la SPEC §5.1 y `modes.ts`** (no una nueva):
- **Torneo:** rondas **[Semifinal, Final]**, set a 4, bonus **200**,
  rampa de nivel +1 por ronda.
- **Mundial:** rondas **[Cuartos, Semifinal, Final]**, set a 4, bonus
  **500**, rampa +1. Rival por ronda de entre las 8 selecciones propias
  de `WORLD_TEAMS` (definidas en la Fase 1), elegido de forma
  **determinista por la ronda** (índices (ronda×3) mod 8: Cuartos =
  Argentina, Semifinal = Francia, Final = Chile), así el rival es el
  mismo tras recargar. El rival viste la camiseta/gorra de su selección.
- El `run` se crea al entrar a jugar el modo sin run de ese modo
  (`{mode, round: 0, baseLevel}` — el nivel base queda fijado y la
  rampa se aplica sobre él) y **persiste**: salir a mitad lo deja en su
  ronda y el menú lo anuncia («Torneo en curso: Final — continúa con
  «Jugar partido»»).
- **Victoria de ronda** → el run avanza; **victoria en la final** →
  campeón: bonus + stats del modo + run limpio; **derrota en cualquier
  ronda** → fin de la carrera (run limpio, 40 monedas de derrota).
- UI: el selector de modo de la vista de pista ofrece
  Entrenamiento / Partido con el nombre del modo y la ronda («🏆 Torneo
  · Final», «🌍 Mundial · Cuartos vs 🇦🇷 Argentina»); el modo se elige
  en Personalizar, como ya estaba. Pantalla de fin con el desglose y
  botón contextual: «Siguiente ronda: Final ▶», «Revancha ▶» o
  «Reintentar Torneo ▶» tras perder una carrera (y solo «Volver al
  menú» al campeonar).

### 1.5 Repetición (tecla V)

- No había nada de replay en las Fases 3/4 (solo el ajuste
  `settings.replays`): se ha construido nuevo sobre `Replay.ts`.
- Se graba durante la fase de rally (el buffer se vacía en cada saque:
  la repetición es siempre la del **último punto**). Tras el punto (o
  en la pantalla de fin), **V** reproduce: el juego se congela, la
  **cámara pasa a la lateral baja de repetición** (`CameraRig.
  setReplayBall`, ángulo distinto de TV/Jugador), la bola y las figuras
  siguen los frames interpolados a 0,5× y el HUD muestra el rótulo
  «🔁 REPETICIÓN · cámara lenta — V para volver». Al terminar (o con
  V/ESC) se restaura la foto exacta de fin de punto y el juego sigue.
- Hook equivalente para tests: `__padelTestReplay()`.

### 1.6 Efectos y hooks del original

- `window.__padelFX()` → confeti; `window.__padelWin()` → espectáculo
  de victoria (fuegos + confeti) y celebración del humano;
  `window.__padelGold()` → estallido dorado donde esté la bola.
- Automáticos: victoria de partido → celebración con fuegos; punto de
  oro resuelto (lo gane quien lo gane) → estallido dorado en la bola.
- Nuevos hooks de guiado: `__padelTestWinPoint()` /
  `__padelTestLosePoint()` cierran el punto en curso **por la vía
  normal** (endRally → Score → economía), avanzando antes si el punto
  anterior seguía en su pausa. Compatibilidad total con los hooks de
  las Fases 3/4 (`__padelProbe`, `__gameProbe`, `__padelSceneProbe`,
  `__padelTestServe`, `__padelTestLaunch`, `__padelTestSeed`,
  `__padelTestAIServe`, `__padelTestLaunchAtAI`).
- `__padelProbe()` (modo partido) añade: `score {points, labels,
  games, server, tiebreak, goldPoint, gamesToWin}`, `match {modeId,
  modeName, over, winner, champion, …}`, `career {round, roundName,
  team, isFinal} | null`, `economy {earned, points, games, result,
  bonus}` y `replay {frames, active, progress}`. `__padelSceneProbe()`
  añade `effects {active, bursts, lastKind}`.

## 2. Tests — 146/146 en verde **[OBS]**

Antes: 113 (10 ficheros). Después: **146** (12 ficheros). Los 113
previos pasan **sin cambiar ni una expectativa** (la retirada del
contador informal no tocaba ningún test: ninguno lo asertaba).

| Fichero | Tests | Novedad de la Fase 5 |
|---|---|---|
| `tests/matchflow.test.ts` | 14 | monedas por punto/juego según nivel; set a 6 (total exacto 672) y a 4; derrota = 40; tiebreak a 6-6 con rotación 1-2-2 y cierre a 7 con dif. 2 (7-6 no basta); punto de oro en juego decisivo y su ausencia fuera de él; bonus 200/500 solo en final ganada |
| `tests/career.test.ts` | 12 | estado resuelto (rondas, rampa con tope, run de otro modo ignorado); selección del Mundial determinista (Argentina/Francia/Chile); arranque del run; avance de ronda; campeonato con bonus y stats una sola vez; derrota limpia el run; **persistencia tras «recarga»** recreando el store sobre el mismo storage (wallet/stats/run) |
| `tests/replay.test.ts` | 7 | muestreo a 20 Hz; buffer circular con descarte de lo antiguo; `clear` por saque; interpolación en `sampleAt`; avance a 0,5× y auto-cierre al final; `stop` |
| Resto (score, economy, ai, ball, shots, store, catalog, data, scene) | 113 | sin cambios |

Las fórmulas de economía ya tenían sus tests desde la Fase 1
(`economy.test.ts`: 4/20/120×(nivel+1), 40, bonus 200/500); la Fase 5
añade su **aplicación** en partido (MatchFlow) y en el cierre (Career).

## 3. Build y pesos **[OBS]**

`npm run build` (tsc + vite) en verde:

| Fichero | Fase 4 | Fase 5 |
|---|---|---|
| `dist/assets/index-*.js` (menú/UI) | 253,77 kB | 260,14 kB |
| Chunk escena (lazy) | 549,78 kB | 566,17 kB |
| CSS | 7,62 kB | 9,15 kB |
| Assets externos | 0 | **0** |

Total servido ≈ **0,84 MB** (dist completo: 832 KB), muy por debajo del
presupuesto de la SPEC (~6 MB). Versión del paquete: 0.5.0.

## 4. Verificación en vivo **[OBS]** (Playwright + `vite preview`, localhost:4173)

Método: Chromium completo (`chromium-1243`, ruta `chrome-linux64/`)
con SwiftShader, esperas por estado con `{ polling: 100 }`. Como el
tiempo de juego corre ~10× más lento que el real, los partidos se
guiaron con `__padelTestWinPoint/__padelTestLosePoint` (vía normal de
puntuación) y la repetición se alimentó de un rally real. **29/29
comprobaciones en verde y 0 errores de consola** en toda la sesión.
Servidor cerrado al terminar; puerto 4173 libre.

### 4.1 Efectos por hooks (en el menú)
`__padelFX()` + `__padelGold()` + `__padelWin()`: ráfagas 0→3,
**390 partículas activas** tras la llamada, sin errores. Captura:
`celebracion-particulas.png`.

### 4.2 Partida rápida completa (set a 6) — tres partidos guiados
- **P1 (6-0):** etiquetas 15/30/40 verificadas en el probe; al cerrar
  el primer juego el saque pasa al rival; desglose exacto al nivel
  Medio (rival nivel 1): 24 puntos ×8 = 192 + 6 juegos ×40 = 240 +
  victoria 240 = **672**. Pantalla de fin con el desglose en el DOM.
  Wallet **0 → 672**; stats `wins=1, pointsWon=24`. **Tras recargar la
  página**, el menú muestra 🪙 672 y «Victorias 1»: persistencia real.
- **P2 (punto de oro):** a 5-4 y 40-40 en el juego decisivo,
  `score.goldPoint=true` y distintivo en el HUD; el punto cierra juego
  y partido (6-4). Wallet **672 → 1.344** (otros 672 exactos).
- **P3 (tiebreak):** 6-6 → `tiebreak=true`; el saque rota tras el
  primer punto (1-2-2); 6-6 en el tiebreak no cierra, 8-6 sí (juegos
  7-6). Desglose: 32 puntos ×8 = 256 + 7 juegos ×40 = 280 + 240 =
  **776**. Wallet **1.344 → 2.120**; `wins=3`.

### 4.3 Torneo completo (carrera guiada)
- Al entrar: `career = Semifinal`, `gamesToWin=4`, y
  `game.padel.run = {mode:1, round:0, baseLevel:1}` en localStorage.
- Semifinal ganada 4-0 → **528** monedas (16×8 + 4×40 + 240); la
  pantalla de fin ofrece «Siguiente ronda: Final» y el run queda en
  `{round:1}`. Wallet **2.120 → 2.648**.
- Final: la rampa se nota — `probe.ai.level = 'Difícil'`. Ganada 4-0
  con `champion=true` y `bonus=200`: 16×12 + 4×60 + 360 + 200 = **992**.
  Al cerrar: **run eliminado, `stats.torneos=1`**, wallet
  **2.648 → 3.640**. El bonus se abonó una sola vez (el total cuadra al
  céntimo con bonus único).

### 4.4 Mundial y repetición (rally real)
- Mundial: `career = Cuartos vs Argentina` (selección determinista),
  scoreboard «Set a 4» con 🇦🇷 Argentina en el marcador.
- Rally real (semilla 42, `__padelTestLaunchAtAI`): la IA devolvió 1
  bola y ganó el punto por doble bote («Doble bote en tu campo»);
  grabados **10 frames** en ese tramo final del rally.
- `__padelTestReplay()` → `replay.active=true` **y rótulo «REPETICIÓN»
  en el DOM**; la tecla **V** lo cierra y el juego continúa.

### 4.5 Capturas (`e2e/screenshots/`)
`celebracion-particulas.png` · `fin-partido.png` (desglose + fuegos) ·
`punto-oro.png` · `marcador-tiebreak.png` · `torneo-ronda.png` ·
`torneo-semifinal-fin.png` · `campeon-torneo.png` ·
`mundial-cuartos.png` · `repeticion.png` (rótulo + cámara lateral).
Revisadas visualmente: marcador oficial con juegos/puntos y 🎾 de
saque, panel de fin con desglose, figuras celebrando.

## 5. Decisiones y desviaciones

- **Rondas de carrera = las de la SPEC** (Torneo 2 rondas, Mundial 3),
  no las de ejemplo del encargo (que solo aplicaban «si la SPEC no
  detalla»): la SPEC §5.1 y `modes.ts` ya las fijaban desde la Fase 1.
- **Las monedas se abonan al cerrar el partido**, no punto a punto: el
  HUD muestra lo acumulado y el wallet solo cambia en el cierre (una
  transacción, sin estados intermedios si se abandona).
- **Contador informal de la Fase 4: retirado** por completo (HUD y
  probe). `match.ralliesWon/ralliesLost` ya no existen; el probe trae
  `score/match/career/economy/replay` oficiales.
- **La repetición es del modo Partido**; el Entrenamiento conserva su
  flujo de la Fase 3 sin repetición (su probe no cambia).
- `__padelWin()/__padelGold()/__padelFX()` son disparadores de efectos
  (como en el original, donde son hooks de desarrollo); la resolución
  «de verdad» de un punto de oro ocurre en el juego y también dispara
  su estallido.
- Mundial abreviado en la verificación: se comprobó el arranque
  (Cuartos vs Argentina) y la mecánica de carrera completa se verificó
  en el Torneo (mismo código de avance/campeonato, con su bonus de 500
  cubierto por tests unitarios).
- Un tropiezo del **script** de verificación (no de la app): al salir
  al menú con la pantalla de fin abierta, el overlay interceptaba el
  clic del botón del HUD; se corrigió saliendo por el botón del panel.

## 6. Qué NO incluye (fases 6–7)

- Audio WebAudio propio y controles táctiles (Fase 6), incluida la
  retirada entonces del botón «+500 monedas (prueba)».
- Pulido, E2E completos y deploy (Fase 7).
- Segundo saque tras falta (simplificación heredada de la Fase 4).

## 7. Limitaciones — honestidad sobre SwiftShader

**Sin rodeos**: lo verificado en vivo son partidos **guiados por
hooks** que cierran cada punto por la vía normal de puntuación — no
partidos jugados a mano en tiempo real. En esta VM el render va a
~0,5 fps y un set jugado con teclado duraría horas de reloj; por eso:
- La **duración real** de un partido completo jugado a mano, el tacto
  de la repetición a 0,5× en un PC real (aquí solo se verificó su
  estado, su rótulo y su cámara, no su «sensación») y el equilibrio de
  una carrera entera quedan **para la prueba de Jon en PC real**, como
  ya pasó con el tacto en las Fases 3 y 4.
- Sí está verificado con números exactos todo lo que no depende del
  tiempo real: marcador (punto/juego/set/tiebreak/punto de oro),
  rotación de saque, economía al céntimo en 5 partidos, persistencia
  tras recarga, avance y cierre de carrera, y la existencia funcional
  de repetición y efectos.
