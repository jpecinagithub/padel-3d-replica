# Fase 3 — Bola, golpeo y entrenamiento · Informe

Réplica clean-room de «Pádel 3D». Alcance según REPLICA_SPEC §8: «Bola y
golpeo: física §5.2, entrada teclado/ratón, saque con aguja, HUD con
probe». Sin IA rival (Fase 4), sin flujo de partido con Score (Fase 5),
sin audio (Fase 6), sin GLB (Fase 4). Todo el código es original; nada se
ha copiado de la copia servida del original (`served/`).

**Resultado: la vista de pista es ya un entrenamiento jugable.** Entras
en «Jugar partido», sacas con la aguja, practicas el rally contra nadie
(la bola vuelve tras pared o se pierde y el rally se resume), cargas el
SUPERGOLPE y pausas con ESC. 96/96 tests en verde y 18/18 comprobaciones
en vivo con Playwright, con 0 errores de consola.

---

## 1. Módulos nuevos y cambios

### Nuevos (`src/game/`)
- **`Ball.ts`** — física pura de la bola, sin Three.js (solo tipos
  propios `Vec3`): estado held/flying/resting, spin (topspin y lateral),
  integración por subpasos y eventos de rally.
- **`Shots.ts`** — golpeo puro y testeable: alcance, clasificación de
  golpes, calidad por nivel, cálculo balístico, aguja del saque, zonas
  de calidad del saque y validación geométrica del cuadro diagonal.
- **`Input.ts`** — `InputManager`: teclas mantenidas + cola de
  pulsaciones consumibles + clics del canvas como golpeo.
- **`Player.ts`** — figura provisional articulada del jugador humano.
- **`Training.ts`** — orquestador del modo entrenamiento dentro de la
  escena: máquina de estados del saque/rally, reglas, SUPERGOLPE, pausa,
  bola visual con estela y sombra-pegatina, probes y hooks de test.
- Tests: **`tests/ball.test.ts`** (13) y **`tests/shots.test.ts`** (14).

### Modificados
- `Cameras.ts` — foco de juego: la TV mezcla su mirada hacia la bola y
  la cámara Jugador sigue al jugador; sin foco, poses de la Fase 2.
- `PadelScene.ts` — crea el entrenamiento, le pasa settings/wallet,
  delega probes/hooks y avanza su `update` en cada frame.
- `SceneCanvas.tsx` — props nuevos (`wallet`, `onScene`,
  `onToggleMuted`, `onPauseChange`) y hooks `__padelProbe()`,
  `__gameProbe()`, `__padelTestServe()`, `__padelTestLaunch()`.
- `App.tsx` — pasa la cartera y los callbacks a la escena; el ESC deja
  de salir al menú (ahora es la pausa del entrenamiento); la C sigue
  ciclando la cámara como en la Fase 2.
- `CourtView.tsx` — HUD de entrenamiento completo (ver §5).
- `Menu.tsx` — subtítulo «Fase 3» y ayuda actualizada y honesta.
- `styles.css` — estilos de la aguja, medidores, resumen y pausa.
- `package.json` — versión 0.3.0. READMEs de `src/game/` y `e2e/`
  actualizados.

## 2. Modelo físico implementado (Ball.ts)

Parámetros de la SPEC §5.2, verificados por tests unitarios:

- Integración con **subpasos de ≤ 1/480 s** (el dt del frame, ya
  clampado a 0,05 s por el bucle, se trocea): ninguna velocidad legal
  atraviesa paredes ni red entre subpasos.
- **Gravedad −9,9 m/s²** fija. **Drag 0,02** como factor por segundo
  (1 − 0,02·dt). **Tope de velocidad 34 m/s** tras cada subpaso.
- **Suelo:** restitución 0,72 × multiplicador `bounce` de la superficie;
  retención horizontal 0,88^`friction`. Con multiplicadores: Roja bota
  0,878 (1,22×) y Verde 0,612 (0,85×) — tests exactos.
- **Cristal** (fondo y lateral, |z| ∈ [6,10] hasta 3 m): 0,85 ×
  multiplicador `wall`, con tope 0,98. **Malla** (3–4 m y tramo central
  lateral 0–4 m): 0,50. Fuera del cerramiento, la bola sigue su vuelo.
- **Red:** si la bola cruza el plano de la red por debajo de la cinta
  (0,88 m) es evento `net` y cae muerta en el lado de origen.
- **Netcord (simplificación documentada):** si el centro de la bola
  queda a ≤ 3 cm por debajo de la cinta al cruzar y lleva ≥ 10 m/s,
  pasa al otro lado con vz × 0,45 y vy recortada; si no, es red.
- **Spin (modelo simple, documentado):** el topspin/liftado empuja la
  bola hacia abajo en vuelo (Magnus −0,055·spinTop) y el lateral la
  curva en x; ambos decaen 0,5/s. En el bote, el liftado acelera la
  salida horizontal (×(1+spin·0,006), clamp [0,6; 1,25]) y el cortado la
  frena, además de frenar más con la fricción y rebotar más bajo.
- **Eventos** que consume el orquestador: `bounce` (con lado y conteo),
  `wall` (cristal/malla y dónde), `net`, `netcord`, `netCross` (cruce
  limpio de la red), `over-wall` (sale por encima de los 4 m), `resting`
  (velocidad < 0,4 m/s o rebote < 0,35 m/s: se para en el sitio).
- Conteo de botes por lado y `lastWall` ('cristal' | 'malla' | 'net')
  expuestos para el probe, como pide la SPEC.

## 3. Golpeo (Shots.ts)

- **Alcance** (SPEC §5.3): ≤ 1,75 m en planta, bola entre 0,12 y 2,45 m
  de alto; el bonus `reach` de la pala equipada (0,08 / 0,12) se suma.
- **Tipos de golpe** (clasificación pura, en este orden): super-smash
  (medidor lleno + bola ≥ 2,0 m + W) → smash (bola ≥ 2,0 m + W) → globo
  (W+E) → dejada (S) → cortado (Q, spin −16) → liftado (E, spin +21) →
  potente (W) → drive (resto). Velocidades resultantes directas: smash
  25,5 m/s descendente; super-smash 33,5 m/s (bajo el tope de 34).
- **Apuntado (simplificación documentada):** sin rival, cada golpe se
  resuelve como balística hacia un objetivo del campo contrario (fondo
  a 6,8–8,8 m según el tipo; dejada corta a 1,8 m tras la red) con tiempo
  de vuelo por tipo (0,5–1,4 s). La dirección A/D (o el eje de
  movimiento) desplaza el objetivo lateral ±2,6 m. La balística ignora
  el drag (2 %): el punto de bote real cae algo más corto que el
  objetivo, igual para todos los golpes.
- **Calidad:** gaussiana sobre la distancia al punto ideal (1,0 m del
  jugador), σ = 0,85, con suelo `qualityFloor` y jitter del nivel
  (Principiante 0,28/1,4 · Aficionado 0,35/0,5 · Profesional 0,45/0);
  resultado siempre en [floor, 1]. La calidad modula el desvío angular
  ((1−calidad)·0,16 rad ≈ hasta 9°) y la potencia (×(0,82+0,3·calidad));
  la pala suma ×(1+potencia·0,02) salvo en la dejada. Con rng inyectable
  para tests deterministas.
- **SUPERGOLPE:** el medidor se carga solo con golpes de calidad > 0,7
  ((calidad−0,7)·0,9 + 0,04 por golpe); lleno + bola alta + W =
  super-smash que lo consume. Se muestra en el HUD.

## 4. Saque con aguja (SPEC §5.3)

- El jugador se coloca tras la línea de saque (z = −7,55) a un lado
  (x = ±2,2); el lado **alterna en cada saque** para practicar ambos.
- ESPACIO lanza la bola (toss cinemático: ápex ≈ 2,47 m a los 0,54 s,
  contacto canónico a 2,42 m). La **aguja** triangular de periodo 1,15 s
  corre en el HUD (elemento DOM) con zona buena ±18 % y **punto dulce
  ±7 %** en torno al centro.
- Segundo ESPACIO = golpeo: 'perfect' (punto dulce) vuela 0,72 s al
  centro del cuadro diagonal; 'good' y 'weak' se desvían dentro del
  cuadro con menos margen; fuera de la zona buena es **falta**
  determinista (aguja a la izquierda del centro → a la red; a la
  derecha → larga, primer bote tras la línea de saque). Contacto por
  debajo de 1,6 m o dejar caer la bola también son falta.
- Validación geométrica del primer bote contrario con el cuadro
  diagonal exacto (sacando desde x > 0: x ∈ [−5, 0], z ∈ [0, 6,95]).
  Las faltas se cuentan en el probe/HUD; la doble falta formal con
  Score es Fase 5.

## 5. Modo entrenamiento y HUD

Flujo: **saque → rally libre → fin → siguiente saque** (ESPACIO o R,
lado contrario). Reglas de rally aplicadas (simplificación de las de
pádel, documentada en el código): tras tu golpe, la bola debe botar en
el campo contrario — el segundo bote allí cierra el rally («el punto
sería tuyo»); directa al cerramiento sin botar, por encima de los 4 m o
a la red lo cierran en contra. Cuando la bola vuelve (rebote en el
cristal contrario, netcord que pasa o lanzamiento de práctica) puedes
golpearla de volea, tras un bote o tras el rebote en tu cristal; el
segundo bote en tu campo cierra el rally.

El HUD muestra: estado (Saque/Rally/Fin), mensaje del momento («¡Saque
perfecto!», causa de fin…), la aguja en el saque, medidor SUPERGOLPE,
velocidad de la bola en km/h, golpes del rally, faltas de saque, ayuda
de controles y el rótulo honesto «Entrenamiento · Fase 3 — rival e IA
en la Fase 4, partido completo en la Fase 5». ESC abre la pausa
(Continuar / Reiniciar rally / Salir al menú); M alterna `game.muted`;
C cicla cámaras; la TV sigue suavemente a la bola y la cámara Jugador
sigue al jugador.

El jugador es la **figura provisional** de `Player.ts`: cápsulas y cajas
con camiseta, piel y gorra de los colores equipados en la tienda, pala
con el color de la equipada, balanceo al correr y gesto de golpeo de
0,28 s. Se mueve solo en su mitad (x ±4,55; z entre −9,55 y −0,35) a la
velocidad de su nivel. La bola visual usa el color de la pelota equipada
(la «Hielo Nocturno» de 180 brilla, glow ×1,6), con estela de 26 puntos
y una sombra-pegatina en el suelo que ayuda a seguirla (su radio real,
3,3 cm, es pequeño desde la cámara TV).

## 6. Probes y hooks de test

`window.__padelProbe()` devuelve `{active, paused, ball:{pos, vel,
speed, spin}, bounces:{own, opp}, lastWall, rally:{state, hits,
lastCause, message, lastShot}, player:{pos, speed}, serve:{needle,
inSweetSpot, faults, side, valid}, super:{charge, ready}}`.
`__gameProbe()` devuelve la parte del jugador. Hooks deterministas:
`__padelTestServe(needle01)` (saque inmediato con la aguja fijada,
desde el contacto canónico) y `__padelTestLaunch({fromX?})` (bola
entrante que bota delante del jugador y sigue hacia su cristal: el
patrón de devolución tras pared). `__GAME_READY__` y
`__padelSceneProbe()` se mantienen compatibles.

## 7. Tests

Antes de la fase: **69**. Después: **96/96 en verde** (los 69 previos
sin cambiar expectativas). Nuevos:

- `tests/ball.test.ts` (13): caída libre con g y drag (v(0,5 s) ≈
  −4,90 m/s), bote suelo 0,72 exacto y fricción, bote con Roja 1,22 y
  Verde 0,85, retención con fricción Roja, cristal 0,85 (y 0,893 en
  Verde por su pared 1,05), malla 0,50, tope 34 m/s, decaimiento del
  spin (×0,60 tras 1 s), Magnus del liftado, segundo bote contado, red
  bloquea, netcord que pasa con velocidad, rebote en el propio cristal
  tras el bote.
- `tests/shots.test.ts` (14): alcance (planta/alto/mínimo/reach de
  pala), calidad en [floor, 1] con rng inyectable, dejada más lenta que
  el drive (balística comparada), smash solo con bola alta, globo
  W+E, super-smash que exige medidor lleno, aguja (periodo 1,15 s;
  centro = perfect; extremos = falta), cuadro diagonal en ambos lados,
  y la integración saque+Ball: en el punto dulce la bola bota dentro
  del cuadro desde los dos lados; aguja extrema izquierda = red;
  extrema derecha = primer bote más allá de 6,95.

## 8. Build

`npm run build` en verde (tsc + Vite):

| Chunk | Fase 2 | Fase 3 |
|---|---|---|
| Principal (UI) | 241,34 kB | **251,79 kB** |
| Escena (lazy) | 500,67 kB | **521,89 kB** |
| CSS | 5,41 kB | 7,54 kB |
| Total `dist/` | 748.512 B | 782.309 B |

El grueso nuevo (Ball/Shots/Input/Player/Training) vive en el chunk
lazy de la escena: el menú sigue sin pagar Three.js ni el motor.

## 9. Verificación en vivo (Playwright + `vite preview`)

Script propio contra `http://localhost:4173`, esperas con
`waitForFunction(..., { polling: 100–400 })` y todo verificado por
probe (en SwiftShader el render va a ~0,5 fps y el tiempo de juego
avanza ~40× más lento que el real). **18/18 comprobaciones OK**:

1. `__GAME_READY__` tras cargar.
2. Al entrar en la vista: entrenamiento activo, estado `serve-ready`,
   bola en la mano (y = 1,02).
3. ESPACIO orgánico: aparece la aguja en el HUD (probe en
   `serve-toss`, needle 0,61) y el segundo ESPACIO golpea el saque.
4. `__padelTestServe(0.5)`: **saque válido** — `serve.valid === true`,
   primer bote contrario dentro del cuadro (la bola quedó en
   (−2,9; 0,41; 4,38) tras el bote, x ∈ [−5,0], z ∈ [0, 6,95]) y
   **0 faltas nuevas**. En la captura del rally se lee «¡Saque
   perfecto!» y 58 km/h.
5. `__padelTestServe(0.02)`: **falta registrada** (0 → 1), causa
   «Falta de saque: a la red».
6. WASD: manteniendo D, el jugador pasa de x = 2,2 a x = 3,64 (probe).
7. `__padelTestLaunch` + ESPACIO en alcance: **hits = 1** («Drive») y
   la bola sale hacia el campo contrario (velocidad z = +23,34 m/s).
8. ESC: se abre la pausa (`paused === true`, panel visible);
   «Continuar» reanuda (`paused === false`).
9. **0 errores de consola** en toda la sesión.

Capturas en `e2e/screenshots/`: `entrenamiento-saque.png`,
`entrenamiento-aguja.png`, `entrenamiento-rally.png`,
`entrenamiento-hud.png`, `entrenamiento-pausa.png`. Revisadas
visualmente: HUD completo, aguja con su zona dulce, jugador y estela
visibles. Al terminar se cerró el navegador y el `vite preview`:
**puerto 4173 libre, sin procesos residuales**.

Nota de entorno: el Chromium usado fue el binario completo de la caché
de la VM (`chromium-1243`), porque el headless-shell que pide esta
versión de Playwright no está descargado; sin cambios en el proyecto.

## 10. Decisiones de esta fase

- **Entrenamiento sin rival y sin marcador:** el rally se practica
  contra el cristal y la red; los puntos/juegos con `Score` se conectan
  en la Fase 5 y el rival, en la 4. El rótulo del HUD lo dice.
- **Figura provisional sin GLB** con los colores de la tienda; su
  interfaz (posición, orientación, swing, colores) está pensada para
  que el GLB de la Fase 4 la sustituya sin tocar el orquestador.
- **Apuntado automático razonable** al campo contrario con error según
  calidad (la SPEC lo prevé para esta fase); el apuntado fino con
  intención táctica llegará con la IA.
- **La aguja es DOM, no canvas**: nítida, accesible y verificable.
- **ESC = pausa** (antes salía al menú): la salida vive en el panel de
  pausa y en el botón «← Menú» del HUD.

## 11. Qué NO incluye (fases siguientes)

- Rival con IA, compañero de dobles y modelo GLB del jugador (Fase 4).
  El ajuste `doubles` no tiene efecto aún y el HUD lo advierte.
- Partido completo: puntos/juegos/set con `Score`, fin de partido,
  monedas por jugar, Torneo/Mundial, doble falta formal (Fase 5).
- Repeticiones (tecla V), efectos y vibración (Fase 5).
- Audio y controles táctiles (Fase 6). La tecla M ya alterna el ajuste
  `game.muted`, pero aún no hay sonidos que silenciar.
- Despliegue (Fase 7): la réplica no se ha subido a ningún sitio.

## 12. Riesgos de tacto (a validar en un PC real)

**Nada de esto se puede validar en SwiftShader (~0,5 fps)**: la
verificación en vivo prueba lógica y estados por probe, no sensaciones.
Cuando Jon lo pruebe en su PC habrá que ajustar con su feedback:

- El **timing de la aguja** (periodo 1,15 s, punto dulce ±7 %): puede
  resultar fácil o frustrante; es un número, se cambia en `Shots.ts`.
- La **ventana de golpeo** (alcance 1,75 m y cuándo «llega» la bola):
  el juicio de distancia con la sombra-pegatina y la estela ayuda,
  pero el tacto real dirá si hace falta la ayuda visual de la SPEC
  (asistencia, Fase 5) o un alcance algo mayor.
- La **velocidad del jugador** frente a la de la bola: con los valores
  de la SPEC puede sentirse lento al principio (Principiante 6,4 m/s).
- La mezcla de la **cámara TV hacia la bola** (0,38/0,30) puede marear
  o quedarse corta; la cámara Jugador siguiendo por la espalda es
  nueva y también necesita prueba real.
- El **peso de los golpes** (tiempos de vuelo 0,5–1,4 s y desvíos por
  calidad): la dejada y el globo son los más sensibles al ajuste fino.
