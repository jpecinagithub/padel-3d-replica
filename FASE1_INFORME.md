# Informe de la Fase 1 (con la Fase 0) — Réplica clean-room de «Pádel 3D»

**Fecha:** miércoles 4 de noviembre de 2026 (CET).
**Proyecto:** `~/workspace/padel-replica/`, creado desde cero.
**Alcance entregado:** Fase 0 (andamiaje) + Fase 1 de `REPLICA_SPEC.md` §8 —
«Marcador y lógica pura: Score, modos, tienda (comprar/equipar) con UI de
menú/setup/shop sin 3D». **Sin 3D en esta fase**, tal como manda la SPEC.
**Clean-room:** todo el código es original. De `padel-analysis/served/` solo
se han tomado parámetros de comportamiento (reglas, fórmulas, precios,
defaults) documentados en la SPEC y el INFORME_REA; no se ha copiado código
ni ningún asset (GLB, MP3, JPEG).

---

## 1. Andamiaje (Fase 0)

- **Vite 7.3.7 + React 19.3.1 + TypeScript 5.9.3**, instalados desde el
  registro npm sin incidencias (la red funcionó con el proxy del entorno y
  `NODE_USE_ENV_PROXY=1`, sin trucos adicionales). **React 19.3.1 es la
  versión exacta** fijada por la evidencia del original — estaba disponible
  en el registro y es la que ha quedado en el `package-lock.json`.
- `package.json`: scripts `dev`, `build` (`tsc --noEmit && vite build`),
  `preview`, `test` (Vitest), `test:watch` y `test:e2e` (declarado para la
  fase de E2E, ver §7). `engines: node >=20`; `.nvmrc` con Node 22 (la VM
  corre v24.22.1 y todo funciona).
- `index.html`: `lang="es"`, `theme-color #0a1020`, `<div id="root">`,
  metas de web-app móvil y una meta description propia (el original no
  tenía; mejora sin riesgo, como el `robots.txt`).
- `public/robots.txt` básico (`Allow: /`): el original no lo tiene
  (SPEC §6 lo recomienda como mejora).
- `render.yaml` según SPEC §6: Render Static Site, `npm ci && npm run build`,
  publica `./dist`, cabecera de caché inmutable para `/assets/*`.
  **Decisión sobre el fallback SPA (documentada en el propio fichero):**
  paridad con el original — **no** se añade rewrite, porque la réplica es de
  una sola ruta; el rewrite queda comentado en el YAML como mejora a activar
  si un día se añade React Router.
- **Three.js NO se ha instalado**: sin 3D en esta fase no hace falta; será
  dependencia de la Fase 2 (r180, como fija la SPEC). Tampoco React Router
  (la SPEC recomienda omitirlo: una pantalla con estados).

## 2. Estructura creada (y la aplazada, a propósito)

```
padel-replica/
├─ index.html · package.json · package-lock.json · tsconfig.json
├─ vite.config.ts (Vite + Vitest) · render.yaml · .nvmrc · .gitignore
├─ README.md · FASE1_INFORME.md
├─ public/robots.txt
├─ src/
│  ├─ main.tsx · App.tsx · styles.css
│  ├─ state/  store.ts · economy.ts · catalog.ts · modes.ts · useGameStore.ts
│  ├─ game/   Score.ts · README.md
│  └─ ui/     Menu.tsx · Setup.tsx · Shop.tsx
├─ tests/  score · economy · store · catalog · data (5 ficheros)
└─ e2e/    README.md (los E2E llegan con el 3D, SPEC §7.3)
```

**Decisión:** los módulos 3D de la SPEC §2 (`Game.ts`, `Ball.ts`,
`Player.ts`, `AI.ts`, `Court.ts`, `Cameras.ts`, `Effects.ts`, `Audio.ts`,
`Input.ts`, `Replay.ts`) y las carpetas de assets (`public/sfx/`,
`public/models/`, `public/ads/`) **no se han creado**: serían esqueletos
vacíos. Queda explicado en `src/game/README.md`. `Hud.tsx`, `Pause.tsx` y
`EndScreen.tsx` tampoco: no hay partido que pausar ni terminar todavía.

## 3. Estado y persistencia — `src/state/store.ts`

- Esquema **idéntico al del original** (SPEC §4), con las mismas claves:
  `game.padel.settings`, `game.padel.wallet`, `game.padel.stats`,
  `game.padel.run` (JSON con envoltorio) y `game.muted` (`"1"`/`"0"`, fuera
  del envoltorio). Paridad de esquema deliberada: una partida guardada por
  el original sería legible por la réplica y viceversa.
- **Defaults exactos** de la SPEC §4: settings
  `{courtType:0, playerLevel:1, opponentLevel:1, doubles:false, crowd:true,
  ambience:0, camera:0, mode:0, replays:0, assist:0, playerCharacter:0}`,
  stats a cero, wallet con 0 monedas y los equipados por defecto.
- Clase `GameStore`: estado en memoria + persistencia tras **cada** cambio
  + suscriptores, pensada para `useSyncExternalStore` (hook propio en
  `useGameStore.ts`). Acepta un `StorageLike` inyectable: en el navegador
  usa `localStorage`; en tests, un stub en memoria (por eso los tests van en
  entorno node, sin jsdom).
- Lectura tolerante a errores, caso por caso:
  - JSON corrupto o ausente → defaults completos.
  - Settings parcial → se fusiona sobre los defaults.
  - **Stats parcial → fusión sobre los ceros** (campo a campo, solo números).
  - **Run inválido → `null`**: solo es válido si `mode` es número > 0
    (Torneo/Mundial); cualquier otra cosa (0, texto, ausencia) es `null`.
  - **Wallet corrupta → defaults**; wallet válida pero sucia → se sanea
    (ver economía): gratuitos garantizados y equipado no poseído → default.
  - Si `localStorage` lanza (modo privado, cuota), el juego sigue en memoria.

## 4. Datos — `src/state/modes.ts` y `src/state/catalog.ts`

- **Modos** (SPEC §5.1): Partida rápida (set a 6, bonus 0, rampa 0),
  Torneo (Semifinal→Final, a 4, bonus 200, rampa 1), Mundial
  (Cuartos→Semifinal→Final, a 4, bonus 500, rampa 1). Función
  `effectiveOpponentLevel`: nivel base + rampa × ronda, con tope en Difícil.
- **Niveles de jugador**: Principiante (6,4 / 0,28 / 1,4), Aficionado
  (7,2 / 0,35 / 0,5), Profesional (7,9 / 0,45 / 0) — velocidad, suelo de
  calidad y jitter exactos de la SPEC.
- **Niveles de IA**: Fácil (5 / 0,5 s / 0,24 / 0,14 / 0,25), Medio
  (6,1 / 0,3 / 0,12 / 0,07 / 0,15), Difícil (7 / 0,16 / 0,05 / 0,03 / 0,07).
- **Superficies**: Azul Estándar (1/1/1), Verde Rápida (0,85/0,5/1,05),
  Roja Lenta·rebote alto (1,22/1,7/0,9), Negra Pro (1,05/0,85/1,18), cada
  una con colores propios de pista/apron/líneas para la Fase 2.
- **Ambientes**: Noche (defecto; niebla 38/95, exposición 1,18, estrellas),
  Día y Atardecer con sus presets.
- **Mundial**: la SPEC ordena que la réplica defina sus selecciones; se han
  definido 8 (Argentina, Brasil, Italia, Francia, Suecia, Portugal, Chile,
  México) con bandera y colores. Solo datos: se usarán en la Fase 5.
- **Catálogo** (SPEC §5.5): **22 ítems** en 5 categorías con ids propios:
  palas `racket-basic/carbon/gold/fire` (0/200/450/700; efectos +2 pot.,
  +3 pot. y +0,08 alcance, +5 pot. y +0,12 alcance), pelotas
  `ball-yellow/orange/pink/ice` (0/80/120/180; la cara con brillo ×1,6),
  camisetas (0/100/100/150/150/200), gorras (0/80/80/250) y 4 tonos de piel
  gratuitos. Un equipado por defecto por categoría:
  `racket-basic, ball-yellow, shirt-cyan, cap-match, skin-2`.

## 5. Economía — `src/state/economy.ts`

Funciones **puras** (reciben una Wallet, devuelven otra; sin localStorage):

- Ganancias: punto `4×(nivelRival+1)`, juego `20×(nivelRival+1)`, victoria
  `120×(nivelRival+1)`, derrota `40`, bonus de campeón por modo (0/200/500).
- `ownsItem`: un ítem es propiedad si está en `owned` **o es gratuito**
  (los de precio 0 siempre se poseen, estén o no en la lista).
- `buyItem`: falla con motivo tipado (`unknown-item`, `already-owned`,
  `insufficient-funds`) sin tocar la cartera; si compra, descuenta y añade
  sin duplicar y **sin mutar** la cartera recibida.
- `equipItem`: exige propiedad (`not-owned`), cambia solo su categoría.
- `sanitizeWallet`: al cargar — garantiza gratuitos en `owned`, monedas
  inválidas → 0, y equipado ausente/no poseído/de otra categoría → el
  default de esa categoría (SPEC §4).

## 6. Marcador — `src/game/Score.ts`

Clase pura, sin Three ni DOM. API: `pointFor(side) → {gameWon, matchWon,
serverChanged, goldPoint}`, `pointLabel(side)`, `wouldWinMatch(side)`
(simula sobre una copia, no muta), `reset(doubles, gamesToWin)` y
`snapshot` legible (puntos, juegos, servidor, lado del saque, tiebreak,
punto de oro, terminado, ganador).

- Puntos 0/15/30/40 con **iguales y ventaja**; juego con ≥4 y diferencia ≥2;
  partido a `gamesToWin` con diferencia ≥2.
- **Tiebreak**: a `gamesToWin–gamesToWin`, el siguiente juego es un tiebreak
  a 7 con diferencia de 2 que decide el partido.
- **Punto de oro** (decisión de diseño, documentada en el código): la SPEC
  lo sitúa «en el punto que decide partido». Implementación: si un juego
  llega a iguales (40-40) **y ganarlo daría el partido a alguno de los dos
  lados**, ese único punto cierra el juego sin ventaja. Lejos del final del
  partido, a 40-40 manda la ventaja normal. Ambos comportamientos están
  cubiertos por tests opuestos.
- **Rotación de saque**: por juegos. Individuales: ciclo de 2 (jugador 0/1).
  Dobles: ciclo de 4 con orden **[0, 2, 1, 3]** (local1, visitante1, local2,
  visitante2). En el tiebreak, el saque sigue el patrón estándar 1-2-2-2…
  sobre el mismo ciclo.
- Los puntos tras el final del partido se ignoran (resultado todo a falso).

## 7. UI sin 3D — `src/ui/` + `App.tsx` + `styles.css`

CSS a mano (sin framework, como el original): fondo azul noche `#0a1020`,
panel oscuro translúcido, acento lima, chips azules de configuración.

- **Menú** (`Menu.tsx`): título «PÁDEL 3D» con subtítulo discreto
  **«Réplica clean-room · Fase 1»** (para no suplantar al original),
  monedero con el saldo real del store, botón de sonido on/off persistido
  en `game.muted`, lema, chips con la configuración actual (modo,
  superficie, formato, niveles, ambiente, público, cámara, ayudas y, si
  hay carrera en curso, la ronda del `run`), línea de estadísticas
  (victorias/derrotas/puntos/torneos/mundiales) y el bloque de ayuda con
  las teclas del original, anotando que los controles llegan con el 3D.
- **«Jugar partido»** lleva a una **pantalla honesta de «en construcción»**
  que explica qué cubre la Fase 1 y qué llegará en las Fases 2–3.
  No se simula ningún partido inexistente.
- **Personalizar** (`Setup.tsx`): grupos segmentados reales que editan y
  persisten al instante — modo, tipo de pista, formato (individuales/
  dobles), tu nivel, nivel rival, ambiente, cámara, público, repeticiones
  y ayudas (estos dos últimos como 0/1, como en el settings observado).
- **Tienda** (`Shop.tsx`): pestañas por las 5 categorías, tarjeta por ítem
  con muestra de color (círculo CSS), efecto en texto, precio o «Gratis» y
  estado: **Equipado** (deshabilitado), **Equipar**, o **Comprar · 🪙precio**
  (deshabilitado sin saldo, con el aviso «Te faltan X 🪙»). Comprar y
  equipar van contra el store y **persisten tras recargar**. Mensajes de
  confirmación/error en español en la propia pantalla.
- **Ayuda de prueba de la tienda (decisión señalada):** botón discreto con
  borde de puntos al pie de la tienda, **«+500 monedas (prueba · Fase 1)»**.
  Existe porque sin partidos jugables no hay otra forma de ganar monedas
  para probar compras; está etiquetado como ayuda de prueba y deberá
  retirarse (o limitarse a modo desarrollo) cuando el partido sea jugable.

## 8. Tests — resultados reales

`npm test` (Vitest 3.2.7, entorno node): **5 ficheros, 55 tests, 55 en
verde, 0 fallos** (1,67 s).

| Fichero | Tests | Qué cubre |
|---|---|---|
| `tests/score.test.ts` | 16 | Secuencia 15/30/40; iguales y ventaja con diferencia de 2; partido a 6 y a 4; 6-5 no basta (diferencia de 2); puntos tras el final ignorados; `wouldWinMatch` sin mutar; tiebreak (entrada a 4-4, cierre a 7 con dif. 2, patrón de saque 1-2-2); punto de oro en el juego decisivo y su ausencia lejos del final; rotación de saque ciclo 2 y ciclo 4 [0,2,1,3] con `serverChanged`; `reset` |
| `tests/store.test.ts` | 13 | Defaults exactos de §4 (objeto comparado literalmente); persistencia de settings y relectura; settings corrupto → defaults y parcial → fusión; fusión de stats parciales; run inválido (5 variantes) → null y run válido; wallet corrupta → defaults; saneamiento de equipado no poseído; comprar/equipar vía store persiste; mute `"1"`/`"0"` |
| `tests/economy.test.ts` | 14 | Fórmulas 4/20/120×(nivel+1) en los 3 niveles, derrota 40, bonus 0/200/500; cartera por defecto; gratuitos siempre poseídos; `ensureFreeOwned` sin duplicar; comprar sin saldo / con saldo (sin mutar) / duplicado / inexistente; equipar no poseído y poseído; `sanitizeWallet` (3 casos) |
| `tests/catalog.test.ts` | 6 | 22 ítems; ids únicos; reparto 4/4/6/4/4; precios exactos por categoría; un default por categoría (existente, de su categoría, gratuito); efectos de palas y brillo de pelota |
| `tests/data.test.ts` | 6 | Modos (gamesToWin/bonus/rampa/rondas); rampa de nivel con tope; niveles de jugador e IA exactos; multiplicadores de superficie; ambientes |

## 9. Build — resultado real

`npm run build` (typecheck de TypeScript estricto + Vite 7.3.7) **en
verde**. Salida `dist/` (252 KB en total):

| Fichero | Tamaño | gzip |
|---|---|---|
| `dist/index.html` | 1,07 kB | 0,57 kB |
| `dist/assets/index-[hash].css` | 4,42 kB | 1,44 kB |
| `dist/assets/index-[hash].js` | 238,44 kB | 74,86 kB |
| `dist/robots.txt` | 23 B | — |

El patrón de salida (HTML + `assets/index-[hash].js|css`) coincide con el
del original, como busca la SPEC. El JS es casi todo React 19; la lógica
propia es pequeña en comparación (quedará diluida cuando entre Three.js).

## 10. Verificación en vivo (preview + navegador)

- Servidor: `vite preview` sobre `dist/` en `http://localhost:4173/`
  (local, sin pasar por el proxy). Cerrado al terminar, sin procesos
  residuales (comprobado: puerto libre y 0 procesos de navegador).
- Navegador: Chromium headless vía Playwright (el instalado en otro
  proyecto de la VM; no es dependencia de la réplica). Sin WebGL en esta
  fase, la carga es inmediata y fluida.
- **17 comprobaciones, 17 en verde**, incluidos **0 errores de consola** al
  principio y al final de todo el recorrido:
  1. Carga: título, subtítulo de réplica y monedero a 🪙 0 visibles.
  2. Personalizar: cambiar a superficie Roja, rival Difícil y Dobles →
     `game.padel.settings` guardado con esos valores.
  3. El menú muestra el chip «Roja · Lenta · rebote alto» y, **tras
     recargar la página, todo persiste** (chip y JSON).
  4. Tienda: ayuda de prueba +500 → saldo 500; comprar Carbono FX (200) →
     saldo 300; equipar → estado «Equipado»; `game.padel.wallet` en
     localStorage con coins 300, `owned` con la pala y `equipped.racket`
     correcto; **tras recargar, sigue equipada con 300**.
  5. Sonido: silenciar → `game.muted === "1"`; tras recargar, sigue en off.
  6. «Jugar partido» → pantalla «Partido 3D: en construcción».
  7. Captura del menú revisada visualmente: estética coherente con lo
     observado (panel oscuro sobre azul noche, CTA lima, chips azules).
- La misma persistencia está además cubierta por tests unitarios con
  instancias nuevas del store sobre el mismo almacenamiento (§8), así que
  no depende solo de esta pasada manual.

## 11. Qué NO incluye esta fase (por diseño de la SPEC)

- **Nada de 3D**: ni escena, ni pista, ni cámaras, ni Three.js instalado
  (Fase 2).
- Sin física de bola ni golpeo, sin saque con aguja, sin HUD de partido ni
  hooks `__GAME_READY__`/`__padelProbe` (Fase 3).
- Sin jugadores, GLB propio, IA ni dobles jugables (Fase 4) — la IA y los
  dobles existen solo como **datos** (niveles y rotación de saque).
- Sin flujo de partido completo: puntos/juegos no se juegan aún, así que
  las ganancias de la economía están implementadas y testeadas como
  funciones, pero nadie las invoca desde un partido; el `run` de
  Torneo/Mundial se carga/guarda pero no avanza (Fase 5).
- Sin audio (ni MP3 propios ni síntesis), sin controles táctiles (Fase 6).
- Sin E2E de Playwright como suite del proyecto ni deploy real en Render:
  el `render.yaml` está escrito y el build es desplegable, pero nadie lo
  ha desplegado (Fase 7).

## 12. Riesgos y notas para la Fase 2 (escena)

- **Instalar Three r180** y crear `Court.ts`/`Cameras.ts` con las
  constantes ya fijadas en datos: pista 20×10, red 0,88 m, superficies con
  sus colores/multiplicadores de `modes.ts` y ambientes con su niebla y
  exposición. La SPEC pide hooks de test desde el principio:
  `window.__GAME_READY__` al primer frame y un `__padelProbe()` mínimo,
  porque los E2E de la Fase 7 se apoyan en ellos.
- **El tacto no se decide aquí**: la lógica pura está cerrada y testeada;
  el riesgo principal del proyecto sigue donde decía la SPEC — física,
  golpeo e IA (Fases 3–4) y la producción del GLB propio.
- El botón «+500 monedas (prueba)» debe retirarse o limitarse a desarrollo
  cuando ganar monedas jugando sea posible (Fase 5).
- `replays` y `assist` van como 0/1 en settings (paridad con lo observado);
  si en fases futuras se prefiere booleano, el cambio es local a
  `store.ts` + `Setup.tsx`.
- El `dist/` generado es de esta fase: si se desplegara hoy en Render con
  el `render.yaml` incluido, se serviría exactamente lo verificado aquí.
