# FASE 6 — Informe: audio sintetizado y controles táctiles

Réplica clean-room de «Pádel 3D» · `~/workspace/padel-replica/`
SPEC: `~/workspace/padel-analysis/REPLICA_SPEC.md` (§3, §5.6, §5.7, §8 Fase 6)
Fecha: 4-nov-2026. Todo el contenido es original; nada procede de
`padel-analysis/served/` (en particular, **ningún MP3 del original**:
todo el sonido se sintetiza).

Convención: **[OBS]** observado/ejecutado · **[DER]** derivado ·
**[INF]** inferido · **[DESC]** no comprobado.

---

## 1. Qué se ha construido

### 1.1 Audio sintetizado — `src/game/Audio.ts` (nuevo)

Motor WebAudio propio, sin librerías y sin ficheros (0 assets de
sonido; el `dist` solo contiene JS/CSS/HTML). Piezas:

- **Contexto perezoso:** el `AudioContext` no se crea en el
  constructor sino en el primer disparo o en el primer gesto del
  usuario (`unlock()`, enganchado en `SceneCanvas` a
  pointerdown/keydown), por la política de autoplay.
- **Cadena maestra:** ganancia master (0,9) → compresor
  (`DynamicsCompressor`, umbral −18 dB, ratio 8) → destino.
- **Anti-saturación:** máximo **12 voces** one-shot simultáneas
  (`MAX_VOICES`); las que exceden se descartan en la capa de nodos
  (el disparo lógico sí se cuenta).
- **Intensidad física:** `impactGain(velocidad)` (pura, monótona,
  0,15 a 1 entre 0 y 34 m/s) para botes y choques con paredes;
  `hitGain(potencia)` (0,30–1) para golpeos. Un bote a 30 m/s no
  suena como uno a 5.
- **Buffer de ruido blanco** reutilizable (2 s) generado en memoria
  para impactos, aplausos y grada.

Diseño de cada sonido (una línea por receta):

| Sonido | Síntesis |
|---|---|
| Golpe de pala | Seno 160→62 Hz (cuerpo grave, 0,11 s) + ruido en bandpass 750–1700 Hz según potencia; **cortado** (spinTop < −6): bandpass a 2100 Hz más largo, como un raspado; **liftado** (spinTop > 6): barrido ascendente 500→1500 Hz |
| Saque | La receta del golpe a plena potencia + «whoosh» (bandpass 380→1700 Hz tras el impacto) |
| Bote en suelo | Triángulo 195→82 Hz (0,07 s, «thock») + tick de ruido lowpass; ganancia = `impactGain(velocidad)` |
| Cristal | «Tink»: seno a 2350 Hz con decaimiento de 0,38 s + parcial a 3540 Hz + tick highpass |
| Malla | Golpe sordo: ruido lowpass a 340 Hz (0,1 s) + seno 118→70 Hz, sin resonancia |
| Red / netcord | Zumbido: cuadrado 84→76 Hz (0,15 s) + ruido bandpass a 620 Hz |
| Aplausos | 16 palmadas (cierre de juego / punto de oro, ~0,9 s) o 30 (fin de partido / campeonato, ~1,8 s): ráfagas de ruido bandpass 1100–2000 Hz con tiempos y ganancias aleatorios |
| Grada (bucle) | Ruido en bucle lowpass a 420 Hz, ganancia 0,022 con vaivén LFO de 0,14 Hz; solo con público activado, en pista y sin mute |
| Clic de UI | Cuadrado a 1150 Hz, 0,035 s, suave |
| Moneda | Dos senos ascendentes: 987,77 Hz → 1318,51 Hz |
| Victoria | Arpegio triangular Do–Mi–Sol–Do (523/659/784/1046 Hz) |
| Derrota | Descenso senoidal Sol–Mi–Do (392/330/262 Hz) |
| Campeonato | Fanfarria cuadrada (Do Do Do Mi Sol Do′) + aplausos largos integrados |

### 1.2 Mapa evento → sonido (un solo punto de disparo por evento)

| Evento del juego | Dónde se dispara | Sonido |
|---|---|---|
| Golpeo o saque de cualquier jugador (humano, IA, compañero) | `Match.launchBall` — **todos** los lanzamientos del partido pasan por ahí; `isServe` distingue el saque | `hit` / `serve` |
| Golpeo y saque del Entrenamiento | `Training.attemptHit` / `Training.strikeServe` | `hit` / `serve` |
| Bote de la bola | `handleEvent('bounce')` de cada modo, con `ball.speed` | `bounce` |
| Choque con cristal / malla | `handleEvent('wall')` según `event.kind` | `glass` / `mesh` |
| Red o netcord que pasa | `handleEvent('net' / 'netcord')` | `net` |
| Punto de oro resuelto | `Match.endRally` | `applause` breve (+ efecto dorado de la Fase 5) |
| Juego cerrado | `Match.endRally` si `award.result.gameWon` | `applause` (largo si además cierra el partido) |
| Fin de partido | `Match.enterMatchOver`, una sola vez | `champion` si hay campeonato; `win` / `lose`; `applause` largo si gana el humano; `coin` si el total abonado es > 0 |
| Clics en botones de cualquier pantalla | Listener de documento en `SceneCanvas` (los controles táctiles cortan la propagación para no duplicar) | `ui` |
| Entrar a pista con público y sin mute | `PadelScene.refreshCrowd()` (modo activo + `settings.crowd` + no mute) | `crowd` (bucle) |

Los modos no tocan WebAudio: disparan `SoundEvent` por su contexto
(`ctx.onSound`) y la escena, dueña del `GameAudio`, los ejecuta. Los
efectos de partículas de la Fase 5 no se han duplicado: los sonidos
de cierre conviven con ellos en los mismos puntos (`endRally`,
`enterMatchOver`, `ctx.onEffect` sigue siendo solo visual).

### 1.3 Mute y contadores — semántica exacta

- El mute vive donde siempre: `gameStore.setMuted` persiste
  `game.muted` ("1"/"0"); `App` → `SceneCanvas` → `scene.setMuted` →
  `GameAudio.setMuted`. La tecla M y el botón de sonido ya existían:
  ahora están conectados de verdad al motor.
- **Con mute activo:** `dispatch` devuelve `false` y **no cuenta ni
  programa nada**; la ganancia master baja a 0 y la grada se detiene.
- **Contadores del probe** (`__padelProbe().audio` y
  `__padelSceneProbe().audio`): cuentan **disparos lógicos no
  silenciados** por tipo (`hit, serve, bounce, glass, mesh, net,
  applause, crowd, ui, coin, win, lose, champion`), más `ctxState`
  (estado real del contexto o `'none'` si aún no existe), `muted`,
  `crowdActive` y `voices`. Cuentan que el juego *quiso* sonar, no
  que nadie oyera nada — ver §5.

### 1.4 Controles táctiles

Lógica pura en `src/game/TouchInput.ts`; presentación en
`src/ui/TouchControls.tsx`:

- **Detección:** visibles solo si hay capacidad táctil
  (`pointer: coarse`, `maxTouchPoints > 0` u `ontouchstart`) **o**
  viewport estrecho (≤ 760 px). En escritorio no se renderizan.
- **Joystick** (elección sobre pad direccional: da dirección analógica
  en las dos dimensiones, como el original con su anillo): anillo de
  128 px abajo a la izquierda, radio útil 48 px, zona muerta 0,16.
  `JoystickTracker` sigue **un** puntero por `pointerId`; el vector
  sale normalizado (|v| ≤ 1) con los mismos signos que WASD.
- **Mismo InputManager:** el joystick escribe con `setTouchMove`, los
  toques de acción con `pressTouch` (una pulsación, como un keydown)
  y CORTADO/LIFTADO con `setTouchHeld` (retenidos como KeyQ/KeyE).
  Los modos no distinguen el origen. Empujar el joystick hacia la
  red cuenta como potencia (W) en el golpeo y hacia atrás como
  dejada (S), vía `shotInput()`.
- **Botones:** GOLPE (94 px, equivale a ESPACIO: toque para lanzar la
  aguja y toque en el punto dulce para sacar, igual que la tecla),
  CORTADO y LIFTADO (66 px, mantenidos) abajo a la derecha; columna
  de utilidades a la derecha: 📷 cámara (C), 🔁 repetición (V),
  ⏸ pausa (Escape), 🔊 mute. Tamaños de pulgar, semitransparentes,
  sin tapar el marcador (que va arriba en el centro).
- **Multi-touch real:** `ButtonBank` asigna cada `pointerId` a un
  botón; mantener el joystick con un dedo y pulsar GOLPE con otro
  funciona a la vez y soltar un dedo no libera lo del otro.
- **Sin efectos fantasma:** handlers con `preventDefault`,
  `touch-action: none` en controles, canvas y HUD, y corte de
  propagación del clic sintético (que tampoco duplica el clic de UI).
- Funcionan en **Entrenamiento y Partido** (el puente vive en
  `PadelScene` y escribe en ambos modos). Con la pausa abierta o el
  partido terminado se ocultan (el panel tiene sus propios botones).

### 1.5 Retirada del botón de prueba

- `src/ui/Shop.tsx`: eliminado el bloque «+500 monedas (prueba ·
  Fase 1)» (el `div.test-aid-row` completo). La tienda solo compra y
  equipa con monedas ganadas jugando.
- `src/styles.css`: eliminadas las reglas `.test-aid-row`,
  `.test-aid` y `.test-aid:hover` (ya sin uso).
- `README.md`: su sección de estado (atrasada desde la Fase 1) ahora
  refleja las Fases 2–6 y dice expresamente que las monedas solo se
  ganan jugando.
- `store.addCoins` **se queda**: no era del botón, es la vía legítima
  con la que `Career.settleMatch` abona el total al cerrar un
  partido; su test (`store.test.ts`) no se ha tocado.

## 2. Tests — 171/171 en verde **[OBS]**

Antes: 146 (12 ficheros). Después: **171** (14 ficheros). Los 146
previos pasan **sin cambiar ni una expectativa** (la retirada del
botón no tocó ningún test: ninguno asertaba su existencia).

| Fichero | Tests | Qué cubre |
|---|---|---|
| `tests/audio.test.ts` | 10 | Cada tipo de evento incrementa su contador; contexto perezoso (`'none'` hasta el primer disparo/gesto); modo lógico sin contexto (cuenta igual, `ctxState` `'none'`); golpes con spin programan nodos en un AudioContext falso; **mute: cero disparos contados ni programados** y vuelta al desmutear; mutear detiene la grada; grada cuenta 1 por arranque; `impactGain` monótona con suelo/techo; `hitGain`; **voces simultáneas ≤ 12** disparando 40 golpes (y 0 al terminar todas) |
| `tests/touch.test.ts` | 15 | Detección (cada señal por separado y el caso escritorio); joystick = mismos vectores que WASD en las 4 direcciones y diagonal normalizada; zona muerta y saturación a 1; segundo puntero no pisa al dueño; ButtonBank multi-touch (dos dedos, un botón con dos dedos, un puntero ≠ dos botones); integración en `InputManager` con blanco falso: ejes táctiles = ejes de teclado, CORTADO mantenido + GOLPE pulsado simultáneos sin pisarse, joystick a la red = potencia / atrás = dejada, `pressTouch` para Escape y KeyV, `detach` limpia el táctil |
| Resto (score, economy, ai, ball, shots, store, catalog, data, scene, matchflow, career, replay) | 146 | sin cambios |

## 3. Build y pesos **[OBS]**

`npm run build` (tsc + vite) en verde:

| Fichero | Fase 5 | Fase 6 |
|---|---|---|
| `dist/assets/index-*.js` (menú/UI) | 260,14 kB | 265,48 kB |
| Chunk escena (lazy) | 566,17 kB | 575,71 kB |
| CSS | 9,15 kB | 10,18 kB |
| **Total `dist`** | ≈0,84 MB | **852.462 B (≈0,85 MB)** |
| Ficheros de sonido | 0 | **0** |

Versión del paquete: 0.6.0.

## 4. Verificación en vivo **[OBS]** (Playwright + `vite preview`, localhost:4173)

Chromium completo (`chromium-1243`, ruta `chrome-linux64/`) con
SwiftShader, esperas por estado con `{ polling: 100 }`. **30/30
comprobaciones en verde y 0 errores de consola** en las dos vistas.
Servidor cerrado al terminar; puerto 4173 libre.

### 4.1 Escritorio (1280×800) — 20/20

- **Sin gesto previo:** `probe.audio` presente con todos los
  contadores a 0 y **`ctxState = 'none'`** (el contexto no se crea
  hasta que toca). Sin controles táctiles en el DOM.
- **Tienda:** ni rastro del botón de prueba (ni el texto «+500» ni la
  clase `.test-aid`). El clic en «Tienda» ya cuenta como clic de UI
  (`ui=1`) y el contexto pasa a **`ctxState = 'running'`**.
- **Grada:** al entrar a pista, `crowdActive = true` y `crowd = 1`.
- **Entrenamiento:** saque de prueba → `bounce ≥ 1`; lanzamiento de
  práctica → `glass = 1` (la bola acaba en el cristal propio).
- **Partido (semilla 42):** en un rally guiado, `hit = 2` y
  `bounce = 4` (lanzamiento del humano + devolución de la IA).
- **Mute con M:** `game.muted = '1'` en localStorage, `muted = true`
  en el probe y grada detenida. Lanzando otra bola a la IA con el
  mute puesto, tras 5 s los contadores quedan **congelados**
  (hit 2→2, bounce 4→4). Desmuteo con M correcto.
- **Partido guiado hasta el final** (vía normal, `__padelTestWinPoint`):
  victoria del humano; al cierre, `applause = 7` (6 cierres de juego
  + el largo final), **`win = 1` y `coin = 1`**, una sola vez cada
  uno. Estado final del contexto: **`'running'`**.

### 4.2 Móvil emulado (390×844, hasTouch, isMobile) — 10/10

- Controles táctiles **visibles** en el DOM: joystick, GOLPE,
  CORTADO, LIFTADO y utilidades. Captura: `fase6-movil-controles.png`.
- **Joystick con eventos táctiles reales** (CDP
  `Input.dispatchTouchEvent`, no eventos sintéticos de ratón):
  arrastre a la derecha → el jugador se desplaza por probe,
  **x 2,20 → 3,28**.
- **Saque táctil completo:** toque en GOLPE → `serve-toss` con la
  **aguja visible en el DOM** (captura `fase6-movil-saque.png`);
  segundo toque → `rally` con **`serve = 1`** en los contadores.
- Botón ⏸: `paused = true` y panel de pausa visible.

### 4.3 Capturas (`e2e/screenshots/`)

`fase6-escritorio-partido.png` · `fase6-movil-controles.png`
(joystick, GOLPE/CORTADO/LIFTADO y utilidades sobre la pista) ·
`fase6-movil-saque.png` (aguja en el punto dulce con el marcador
oficial encima, sin tapar). Revisadas visualmente.

## 5. Limitaciones — honestidad sobre el audio y SwiftShader

- **No se afirma que nada «suene bien» ni que se oyera nada.** Lo
  verificado son los disparos lógicos y su cableado (contadores,
  estados, nodos programados en el contexto falso de los tests). En
  esta VM no hay dispositivo de salida que escuchar: la calidad y el
  volumen reales de cada síntesis los juzga Jon en su PC.
- Dato real del entorno de verificación: el AudioContext headless
  quedó en **`'running'`** tras el primer gesto (no en `'suspended'`
  como se temía), y en `'none'` (inexistente) antes de cualquier
  gesto. Eso es lo que el probe reportó; la escucha sigue sin estar
  verificada.
- La **intensidad** de los botes/choques se calcula con la velocidad
  de la bola al procesar el evento (tras el paso de física completo),
  no con la velocidad exacta del subpaso del impacto: es monótona con
  el impacto real, pero aproximada.
- En pantallas estrechas el HUD heredado de fases anteriores (textos
  de ayuda y etiquetas de escritorio) es denso y comparte la franja
  inferior con el joystick y GOLPE; el marcador, los mensajes y la
  aguja quedan libres. Un HUD móvil compacto sería trabajo de la
  Fase 7 (pulido), no de esta.
- El tacto real del joystick (tamaños, posición, respuesta al dedo)
  no es juzgable en emulación: verificado el comportamiento
  (DOM, desplazamiento por probe, saque completo), no la sensación.
