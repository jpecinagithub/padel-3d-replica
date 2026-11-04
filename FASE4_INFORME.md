# FASE 4 — Informe: jugadores, IA por niveles, dobles y Partido libre

Réplica clean-room de «Pádel 3D» · `~/workspace/padel-replica/`
SPEC: `~/workspace/padel-analysis/REPLICA_SPEC.md` (§5.1, §5.3, §5.6, §7, §8 Fase 4)
Fecha: 4-nov-2026. Todo el contenido es original; nada procede de
`padel-analysis/served/`.

Convención: **[OBS]** observado/ejecutado · **[DER]** derivado ·
**[INF]** inferido · **[DESC]** no comprobado.

---

## 1. Ruta del modelo de jugador: rig procedural (sin GLB) — desviación documentada

- **[OBS]** `which blender` en la VM: **no hay Blender** (ni se instaló
  software pesado, según lo encargado). Por tanto se siguió la ruta
  alternativa prevista en el encargo: **rig articulado procedural
  completo en código**.
- `src/game/Player.ts` se reescribió por completo: `PlayerFigure` con
  pivotes reales (pelvis a 0,94 m, tronco, cabeza, brazo + antebrazo con
  pala en la mano derecha, muslo + pantorrilla por pierna), altura
  ~1,80 m, sombras y colores por pieza.
- **Animación por estados** equivalente a los clips de la SPEC, con la
  interfaz estable `play(state)`:
  `idle` (respiración y balanceo), `split` (saltito al golpear el
  contrario), `run` (zancada e inclinación según velocidad), `drive`,
  `backhand` (revés con el torso girado al revés), `lob` (swing suave
  ascendente), `drop` (swing corto descendente), `smash` (salto + swing
  descendente), `serve` (toss con el brazo izquierdo + swing),
  `celebrate` (saltos con brazos arriba) y `disappointed` (brazos
  caídos, cabeza baja). Los swings duran 0,34 s (0,42 s el saque) y se
  mezclan de vuelta a idle/run.
- La API de la Fase 3 se conserva (`setPosition`, `faceTowards`,
  `faceNet`, `startSwing(kind?)`, `update(dt, speedRatio)`, `dispose`):
  `Training.ts` no necesitó cambios de lógica. `setColors` admite ahora
  también `pants`.
- **Interfaz preparada para un GLB futuro**: si un día hay Blender,
  basta sustituir el interior de `PlayerFigure` (conservar `play()`,
  `pos`, `setColors`…) sin tocar `AI.ts`, `Training.ts` ni `Match.ts`.
- Colores: el humano viste lo equipado en la tienda (camiseta,
  pantalón, piel, gorra y pala del wallet, vía `applyLoadout`); el
  rival, rojo/negro (`#e23b3b`/`#1c1c22`); el segundo rival, rojo
  oscuro (`#8e2323`); el compañero, variante de equipo (verde azulado
  `#22b8cf`) que **adopta la camiseta equipada del humano** cuando este
  se la cambia.
- Peso del «modelo»: 0 bytes de assets (todo es código). No hay GLB.

## 2. Diseño de la IA — `src/game/AI.ts` (puro, sin Three, testeable)

### 2.1 Percepción y predicción
- Al golpear el equipo contrario, el orquestador entrega a cada cerebro
  rival una foto de la bola (`onOpponentStrike`). El cerebro **no
  decide hasta que pasa su `aiReaction`** (reloj propio acumulado en
  `update(dt)`); antes, su estado es `reacting` y no se mueve hacia la
  jugada.
- Al decidir, `predictIntercept` simula la trayectoria con el propio
  `Ball.ts` a 120 Hz hasta 3,5 s y devuelve el **primer punto legal de
  golpeo**: tras al menos un bote en su campo **o** tras el rebote en su
  cristal de fondo, con la bola entre 0,12 y 2,45 m. Si la bola muere
  (segundo bote) sin punto legal, devuelve ese punto con
  `legal: false`; si nunca entra en su campo, `null`.
- El objetivo de movimiento se clampea a su campo (x ±4,5, z de su lado)
  y, en dobles, a su zona.

### 2.2 Movimiento
- Se desplaza hacia el objetivo a **`aiSpeed`** constante, con base de
  resto según saque (ver §3) y recuperación tras golpear (0,55 s) antes
  de volver a base. El ratio de velocidad alimenta la animación `run`.

### 2.3 Decisión de golpe (cuando la bola entra en alcance)
- Alcance: las mismas reglas del humano (1,75 m horizontal, altura
  0,12–2,45 m, su lado con tolerancia 0,4 m tras la red), una tentativa
  por bola y jugador (un fallo es definitivo para esa bola: swing al
  aire y el rally sigue sin él).
- **Error**: tirada con RNG inyectable (mulberry32 con semilla en
  `Match`; en tests, función fija). Falla si `rng() < aiError`
  (+ `aiWallError` si el golpe es tras su pared).
- **Calidad del acierto**: `aiQualityBase = clamp(0,925 − 1,55·aiError,
  0,4, 0,9)` — suelo análogo al `qualityFloor` del jugador.
- **Selección** (`chooseShot`, heurística documentada en el código):
  bola ≥ 2,0 m → **smash**; apurado atrás (z profunda) con bola baja →
  **globo**; bola muriendo cerca de la red y humano muy atrás →
  **dejada**; si no, 18 % **cortado**, 25 % **liftado**, drive potente
  si viene alta y resto **drive**. La dirección apunta al lado contrario
  del humano en x, con el desvío que marca la calidad. El golpe se
  calcula con el `computeShot` de la Fase 3 (espejado en z para el
  equipo de z positivo).

### 2.4 Saque de la IA
- Aguja virtual (`serveNeedle`): con probabilidad `aiServeFault` la
  aguja cae en un extremo (0,03/0,97 → falta de red o larga según
  `serveVelocity`); si no, cae en [0,38, 0,62] (zona buena o punto
  dulce). El saque válido reutiliza `serveVelocity` de la Fase 3, así
  que bota en el cuadro diagonal correcto por construcción (verificado
  por test y en vivo).

### 2.5 Parámetros por nivel (de `src/state/modes.ts`, Fase 1)

| Nivel IA | aiSpeed (m/s) | aiReaction (s) | aiError | aiServeFault | aiWallError | Calidad base |
|---|---|---|---|---|---|---|
| Fácil | 5,0 | 0,50 | 0,24 | 0,14 | 0,25 | 0,55 |
| Medio | 6,1 | 0,30 | 0,12 | 0,07 | 0,15 | 0,74 |
| Difícil | 7,0 | 0,16 | 0,05 | 0,03 | 0,07 | 0,85 |

Niveles de jugador (referencia): velocidad 6,4/7,2/7,9 m/s y
qualityFloor 0,28/0,35/0,45 (Principiante/Aficionado/Profesional).

### 2.6 Dobles: zonas, cesión y compañero
- Cada jugador de IA cubre una **zona**: mitad en x centrada en
  `zoneCenterX` (semiancho 2,5 m). El compañero del sacador/restador se
  coloca junto a la red en la mitad contraria a la del sacador
  (`doublesZoneCenterX`), y su objetivo de intercepción se clampea a su
  zona.
- **Cesión** (`partnerShouldYield`): si el punto predicho cae fuera de
  su zona (más allá del borde + 0,6 m) y el humano está a ≤ 2,2 m del
  punto, el compañero no intenta el golpe: es del humano. Simétrico
  entre rival y rival2.
- **Anti-colisión blanda** compañero–humano: separación mínima 0,7 m
  empujando solo al compañero.
- **Perfil del compañero** (decisión documentada): nivel IA equivalente
  al nivel de jugador de los ajustes — Principiante→Fácil,
  Aficionado→Medio, Profesional→Difícil. Los rivales usan
  `opponentLevel` tal cual.

## 3. Modo «Partido libre contra la IA» — `src/game/Match.ts` (nuevo)

- Al entrar en la vista de pista hay un **selector de modo**:
  «🏋️ Entrenamiento» (el de la Fase 3, intacto) o «🤖 Partido libre
  contra la IA». `PadelScene` activa un solo modo a la vez
  (`setPlayMode('none' | 'training' | 'match')`); en el menú, la escena
  sigue siendo decorado.
- **Rallies completos** con las reglas escritas en la cabecera de
  `Match.ts`: saque único por rally (la falta de saque es rally del que
  resta; sin volea de resto antes del bote); tras el saque, pádel
  normal (volea, un bote, o bote + cristal/malla del propio fondo;
  «sacada» tras el bote = punto del que golpea); fin por doble bote,
  bola fuera del cerramiento sin botar, red o bola parada. Cada fin
  declara ganador y causa en el HUD.
- **Rotación de saque por rally**: individuales tú→rival; dobles
  tú→rival→compañero→rival2. Cada sacador alterna su lado (derecha/
  izquierda) en sus turnos, como en el pádel real.
- El humano saca con la **misma aguja de la Fase 3**; el compañero saca
  como IA con el nivel de su perfil; los rivales, con `opponentLevel`.
- **Contador informal de rallies** ganados/perdidos en el HUD, con
  servidor actual, estado de la IA y su último golpe, golpes y errores
  de la IA. **Sin Score oficial**: nada de 15/30/juegos/sets (Fase 5).
- Al cerrar el rally, los ganadores reproducen `celebrate` y los
  perdedores `disappointed`; el siguiente saque llega solo a los 2,4 s
  o con ESPACIO/R. Pausa con ESC igual que en la Fase 3; SUPERGOLPE del
  humano con la misma carga que en el entrenamiento.
- Se respetan los ajustes: `opponentLevel`, `doubles`, `playerLevel`,
  superficie, ambiente y cámara. Los settings se reconfiguran en
  caliente si cambian con el modo activo (firma de ajustes).

## 4. Probes y hooks (SPEC §5.7)

- `__padelProbe()` devuelve el probe **del modo activo**. En
  entrenamiento es el objeto de la Fase 3 sin cambios; en partido,
  `MatchProbe` añade:
  `ai: { level, state, lastShot, errors, decisionMs }`,
  `players: { count, human, partner, rival, rival2 }` (posiciones),
  `rally: { …, winner, … }` y
  `match: { ralliesWon, ralliesLost, aiHits, server, doubles }`.
- Hooks deterministas nuevos: `__padelTestSeed(n)` (semilla del RNG de
  la IA y de los golpes), `__padelTestAIServe()` (fuerza el saque de la
  IA en su turno) y `__padelTestLaunchAtAI()` (lanza una bola clara al
  campo de la IA). Compatibilidad con los de la Fase 3 intacta
  (`__padelTestServe`, `__padelTestLaunch`, `__gameProbe`,
  `__padelSceneProbe`).

## 5. Tests — 113/113 en verde **[OBS]**

Antes: 96 (9 ficheros). Después: **113** (10 ficheros). Nuevo:
`tests/ai.test.ts` con **17 tests**, todos sobre la lógica pura:

| Bloque | Tests | Qué comprueba |
|---|---|---|
| predictIntercept | 3 | punto legal dentro de pista; `afterWall` tras su cristal; `null` si la bola no entra |
| Reacción/movimiento | 2 | sin decisión antes de `aiReaction` (reloj simulado, decisión a los ≥500 ms en Fácil); desplazamiento ≤ `aiSpeed` y hacia la bola |
| Errores/calidad | 4 | mapeo de calidad 0,55/0,74/0,85; RNG a error → falla y cuenta; tirada 0,30 solo falla tras pared (0,24 < 0,30 < 0,49); RNG a acierto → la bola simulada bota en el campo contrario |
| Selección | 3 | bola alta → smash; apurado atrás → globo; humano atrás + bola en red → dejada |
| Saque IA | 2 | falta forzada → `serveVelocity` la marca falta; sin falta → bota en el cuadro diagonal desde ambos lados |
| Dobles | 3 | objetivo del compañero clampeado a su mitad (y libre dentro de ella); `partnerShouldYield` (cede / no cede / dentro de zona); `doublesZoneCenterX` |

Los 96 previos pasan **sin cambiar ni una expectativa**: el
entrenamiento de la Fase 3 se comporta igual.

## 6. Build y pesos **[OBS]**

`npm run build` (tsc + vite) en verde:

| Fichero | Fase 3 | Fase 4 |
|---|---|---|
| `dist/assets/index-*.js` (menú/UI) | 253 kB | 253,77 kB |
| Chunk escena (lazy) | ~522 kB | 549,78 kB |
| CSS | — | 7,62 kB |
| Assets externos (GLB/audio/imágenes) | 0 | **0** |

Total servido ≈ 0,81 MB, muy por debajo del presupuesto de la SPEC
§7.3 (~6 MB). Sin GLB: el modelo es código.

## 7. Verificación en vivo **[OBS]** (Playwright + `vite preview`, localhost:4173)

Método: Chromium completo (`chromium-1243`) con SwiftShader, esperas
por estado con `{ polling: 100 }` sobre `__padelProbe()`; el tiempo de
juego corre ~10× más lento que el real (dt clampado a 0,05 s a
~0,5 fps), así que los rallies se guiaron con los hooks. Semilla 42,
IA Medio por defecto. Servidor y navegador cerrados al terminar;
puerto 4173 libre.

### Individuales — 2 rallies bastaron para todos los objetivos
- Jugadores al entrar: **2** ✓
- Rally 0 (saca el humano, bola lanzada con `__padelTestLaunchAtAI`):
  **aiHits = 2** (la IA devolvió 2 bolas; último golpe: dejada) y el
  rally lo ganó la IA por **«Doble bote en tu campo»** al no devolver
  la tercera ✓ (la IA gana un rally por no devolución).
- Rally 1 (saca el rival, forzado con `__padelTestAIServe`): saque
  **válido por probe** (`serve.valid = true`, 0 faltas) ✓; la IA
  llegó a **aiHits = 3** en ese rally y también lo ganó por doble
  bote en el campo del humano ✓.
- Errores de la IA en ambos rallies: 0. **Errores de consola: 0** ✓.

### Dobles (activado en ajustes vía localStorage)
- Jugadores al entrar: **4**, con compañero y rival2 en el probe ✓.
  Rotación de saque observada: humano → **rival** en el segundo rally ✓.
- Primera corrida (semilla 7): el compañero **no se movió** (0,00 m).
  Diagnóstico con volcado del probe cada 2 s: la IA **erró su primer
  golpe** (contador de errores = 1, visible también en la captura de
  dobles: «Errores IA: 1») y la bola murió en su campo sin que ninguna
  devolución llegara al equipo humano; el compañero, correctamente,
  se quedó en su base. Es el comportamiento de error diseñado
  (Medio: 12 %), no un fallo de las zonas.
- Segunda corrida (semilla 42): **aiHits = 3** y el compañero se
  desplazó **4,53 m** desde su posición de saque (de la red a
  interceptar en su zona) ✓. El rally terminó «La IA la estrelló en
  la red».

## 8. Capturas (`e2e/screenshots/`)

- `partido-rally-ia.png` — rally individual en curso con la IA en juego.
- `partido-celebracion.png` — fin de rally: resumen en el HUD («Rally
  perdido · golpes de la IA: 2 · Doble bote en tu campo») y figuras en
  pose de fin de rally.
- `partido-dobles.png` — dobles con los 4 jugadores en pista y HUD de
  partido (Rallies 1–0, «IA Medio · dobles»).
- `partido-dobles-saque-rival.png` — dobles en el segundo saque
  (rotación al rival).

## 9. Decisiones y simplificaciones

- **Un intento de golpe por bola y jugador**: si la IA (o el compañero)
  erra el swing, no reintenta con esa misma bola. Simplifica el rally
  y hace el error «real», como en el humano de la Fase 3, que también
  puede fallar su ventana.
- La **predicción se hace una sola vez** por golpe contrario (al
  cumplirse la reacción), sin replanificar en vuelo: suficiente para
  este nivel de IA y determinista en tests.
- El compañero **resta solo si la bola entra en su alcance y zona**
  cuando el humano resta (está junto a la red, como su compañero del
  sacador); no hay resto cruzado «poaching» agresivo.
- La física del saque de la IA entra por el mismo `handleEvent` que la
  del humano, con el chequeo del cuadro espejado en z: una sola
  implementación de la regla.
- `Match.ts` no reutiliza la clase `Training` (comparten `Ball`,
  `Shots`, `Input` y `PlayerFigure`): los dos modos tienen máquinas de
  estados distintas y mezclarlas habría ensuciado ambas; el
  entrenamiento queda intacto y congelado.

## 10. Qué NO incluye (fases 5–6)

- Score oficial en partido (puntos 15/30/40, juegos, sets, tiebreak),
  fin de partido y su flujo de menús.
- Modos **Torneo** y **Mundial** con `run`, rondas y recompensas (la
  lógica de `Score.ts`/economía existe desde la Fase 1, sin cablear).
- Repetición/replay y efectos de victoria.
- Estadísticas (`stats`) al terminar partidos.
- Audio y controles táctiles (Fase 6).
- GLB del jugador (sustitución futura del interior de `PlayerFigure`).

## 11. Riesgo: equilibrio y tacto no juzgables aquí

**Sin rodeos**: que la IA devuelva, erre y se mueva está verificado;
que el partido sea *divertido y justo* no se puede juzgar en esta VM.
Con SwiftShader el juego corre a cámara lenta (~0,5 fps), así que el
tacto del golpeo, si la IA llega «fácil» o «imposible» a las bolas, la
utilidad real de las zonas de dobles y la sensación de las animaciones
solo se pueden evaluar en un PC real jugando con teclado. Los
parámetros por nivel salen de la SPEC/`modes.ts` y los tests fijan su
comportamiento numérico, pero el ajuste fino de dificultad (velocidad
de la IA frente a la del jugador, probabilidades de error) queda
pendiente de esa prueba manual, igual que quedó el tacto en la Fase 3.
