# FASE 7 — Informe: pulido final, regresión E2E y preparación de despliegue

Réplica clean-room de «Pádel 3D» · `~/workspace/padel-replica/`
SPEC: `~/workspace/padel-analysis/REPLICA_SPEC.md` (§6, §7.3, §8 Fase 7)
Fecha: 4-nov-2026. Alcance de este informe: la parte de CÓDIGO de la
Fase 7 y la subida al repo. El despliegue lo hace el padre después
(ver §6, PENDIENTE).

Convención: **[OBS]** observado/ejecutado · **[DER]** derivado ·
**[INF]** inferido · **[DESC]** no comprobado.

---

## 1. Pulido: HUD móvil compacto

La única pega declarada en la Fase 6: en pantallas estrechas el HUD
heredado de escritorio era denso y compartía la franja inferior con
el joystick y GOLPE. La captura «antes» (390×844, modo Partido) lo
muestra sin paliativos **[OBS]**: seis chips en cuatro filas tapando
el marcador (la fila de «Set a 6» y los puntos del rival quedaban
bajo los chips y la columna de utilidades), la etiqueta larga del
modo envuelta en cuatro líneas sobre el joystick y el botón GOLPE,
la ayuda de teclado en otras cuatro líneas y el botón «Cambiar
cámara (C)» en el borde inferior.

Cambios (solo presentación; el HUD de escritorio no se toca):

- **`src/ui/CourtView.tsx`**: los chips informativos secundarios
  (saque, estado de la IA, fase, cámara y sonido) llevan la clase
  nueva `hud-chip-opt`. En móvil se ocultan porque esa información
  ya vive en otro sitio: quién saca lo marca la 🎾 del marcador y
  cámara/sonido tienen botón táctil propio (📷/🔊). Se quedan el
  chip del modo y el de monedas. Además, las etiquetas internas
  «Fase 6» del HUD y el subtítulo del menú pasan a «v1.0.0».
- **`src/styles.css`**: bloque nuevo `@media (max-width: 760px)` al
  final, sin tocar ni una regla de escritorio:
  - `.court-hud` con padding 10px; chips a 0,8rem y `.hud-chip-opt`
    en `display: none`.
  - Marcador reducido pero legible: juegos 1,7rem → 1,3rem, puntos
    1,15rem → 1rem, laterales con menos padding, distintivos a
    0,68rem.
  - Mensaje central a 1rem, aguja al 92vw con pista de 20px, resumen
    de rally y distintivo de repetición compactos.
  - Franja inferior reducida a los medidores en una línea:
    `.hud-label`, `.hud-help` y el botón de cámara de la franja se
    ocultan (en táctil no aplican); barra SUPERGOLPE con pista de
    84px.
  - Controles táctiles recogidos en consonancia: joystick y
    acciones de `bottom: 118px` a `bottom: 92px` (la franja que
    dejan libre las ayudas ocultas), joystick de 128 a 112px, GOLPE
    de 94 a 84px, utilidades a 44px desde `top: 118px`.
  - Paneles de pausa/fin con ancho `min(92vw, 430px)`.

Verificación (en la batería E2E, §2, y visual) **[OBS]**: en móvil,
ayuda, etiqueta y chips secundarios ocultos; marcador visible; y sin
solape medido por cajas: borde inferior del joystick en y=752 frente
al borde superior de la franja inferior en y=774 (22px de aire). En
escritorio, la ayuda de teclado sigue visible (check expreso de la
batería: el media query no se filtra al HUD grande). La captura
«después» muestra dos chips arriba, el marcador entero a la vista,
el selector de modo compacto y la franja inferior reducida a los
medidores, con joystick y GOLPE despejados.

Capturas: `e2e/screenshots/fase7-hud-movil-antes.png` ·
`e2e/screenshots/fase7-hud-movil-despues.png` (ambas locales; el
snapshot de GitHub no admite binarios).

## 2. Regresión E2E consolidada — `e2e/full-regression.mjs`

Script único y relanzable (`node e2e/full-regression.mjs`,
documentado en `e2e/README.md`): arranca su propio `vite preview`
en 127.0.0.1:4173 y lo cierra, busca Playwright en la VM (no es
dependencia del proyecto) y usa el Chromium completo de la caché
(`chromium-1248/chrome-linux64`) con SwiftShader, esperas por estado
con `{ polling: 100 }` y los hooks de test del juego, que puntúan
por la vía normal. Imprime PASS/FAIL por check y sale con código 1
si algo falla.

**Resultado de la pasada definitiva [OBS]: 23/23 PASS, 0 FAIL,
código de salida 0, 0 errores de consola en las dos sesiones y
puerto 4173 libre al cerrar.**

### Escritorio (1280×800) — 17/17

1. Menú y escena cargan (`__GAME_READY__`, probe con 335 objetos).
2. Audio perezoso: `ctxState = 'none'` y contadores a 0 sin gesto.
3. Tienda sin monedas: el clic despierta el audio (`ctxState =
   'running'`, `ui ≥ 1`) y la compra de «Carbono FX» (200 🪙) está
   deshabilitada con monedero a 0.
4. Personalizar: grupo «Modo de juego» con Torneo y Mundial.
5. Entrenamiento en pista: grada activa, 0 controles táctiles en el
   DOM de escritorio y ayuda de teclado visible (HUD intacto).
6. Entrenamiento: saque de aguja válido (`serve.valid = true`) y
   disparo de audio del bote (`bounce = 1`).
7. Partido: la IA devuelve ≥2 bolas (semilla 42, `aiHits = 2`).
8. Repetición: `__padelTestReplay` activa (76 frames grabados),
   rótulo «REPETICIÓN» en el DOM y la tecla V la cierra.
9. Efectos: `__padelWin` → 160 partículas activas, 1 ráfaga.
10. Set guiado completo: **6-0** y economía exacta **672 🪙**
    (24 puntos ×8 + 6 juegos ×40 + victoria 240, nivel Medio), con
    panel de fin y «¡Victoria!».
11. Persistencia: `game.padel.wallet = 672`, `stats.wins = 1`,
    `pointsWon = 24`.
12. Tras recargar: el menú muestra 🪙 672 y «Victorias 1 · Puntos
    ganados 24».
13. Tienda: compra de «Naranja Tour» (80 🪙) con las monedas
    ganadas → 592 🪙 y `equipped.ball = 'ball-orange'`.
14. Torneo: al entrar, `game.padel.run = {mode: 1, round: 0,
    baseLevel: 1}` y marcador a 4 juegos.
15. Torneo: Semifinal ganada 4-0 (**+528 🪙**), panel con
    «Siguiente ronda: Final», run en `round = 1` y monedero a 1.120.
16. Audio: mute con M → `game.muted = '1'` persistido y contadores
    congelados lanzando una bola a la IA (hit y bounce sin cambios
    en 4 s); desmuteo a `'0'` correcto.
17. Cero errores de consola en toda la sesión.

### Móvil emulado (390×844, hasTouch, isMobile) — 6/6

18. Partido con controles táctiles visibles (joystick, GOLPE,
    utilidades).
19. HUD compacto de §1: ayudas ocultas, marcador visible y sin
    solapes (joystick 752 ≤ franja inferior 774). Captura
    `fase7-hud-movil-despues.png`.
20. Joystick con eventos táctiles reales vía CDP: el jugador se
    desplaza x 2,20 → 4,55 (probe).
21. Saque por toques: primer toque en GOLPE → `serve-toss` con la
    aguja visible en el DOM; segundo toque → `serve = 1` y estado
    `rally`.
22. Botón ⏸ táctil: `paused = true` y panel de pausa visible.
23. Cero errores de consola en toda la sesión.

### Iteraciones hasta la pasada limpia (honestidad del proceso)

La batería no salió verde a la primera, y los fallos fueron del
**script de verificación, no del juego** (el código del juego no se
tocó por ninguno de ellos):

- Pasada 1: repetición «fallida» porque el rótulo se leía con
  `isVisible()` en el mismo instante en que el hook activaba la
  repetición, antes del tick de React (60 ms) que lo pinta; y el
  paso de Torneo esperaba el probe de partido sin re-seleccionar el
  modo tras la recarga de persistencia (vuelve a Entrenamiento por
  defecto). Corregido esperando visibilidad real (`waitFor`) y
  seleccionando el modo; el check de repetición pasó con 76 frames.
- Pasada 2 (22/23): la misma carrera, en la aguja del saque móvil.
- Una pasada se perdió por un reinicio del servicio de la VM
  (entorno, sin resultados) y en otra (22/23) la carrera apareció en
  el marcador del check de HUD. Se endurecieron con `waitFor` los
  cuatro puntos que leen el DOM tras un probe (rótulo, aguja,
  marcador y paneles de fin/pausa) y la pasada siguiente fue la
  definitiva: **23/23**.

Los partidos guiados usan `__padelTestWinPoint` (vía normal:
Score → economía → persistencia) porque con SwiftShader (~10× más
lento) un set a mano duraría horas: la batería verifica reglas,
economía, persistencia y cableado, no el tacto de juego, que sigue
siendo [DESC] en esta VM y queda para la prueba en PC real, como en
fases anteriores. Los contadores de audio son disparos lógicos
(FASE6 §1.3): verifican el cableado, no la escucha.

## 3. Versión y preparación del despliegue

- **`package.json`: versión 1.0.0** (desde 0.6.0) y descripción
  actualizada a «v1.0.0: juego completo (fases 0-7)».
- **`vercel.json` (nuevo)**: la misma configuración que funcionó en
  el proyecto Poynting del mismo usuario —
  `{ "framework": "vite", "buildCommand": "npm run build",
  "outputDirectory": "dist" }`, sin variables de entorno. Sin
  rewrites: es una SPA de una sola vista sin rutas (escena, menús y
  paneles viven en la misma página), así que no hay fallback que
  configurar; queda documentado en el README.
- **`render.yaml` (Fase 0): revisado y sigue siendo válido** —
  `buildCommand: npm ci && npm run build` y
  `staticPublishPath: ./dist` coinciden con el build actual
  (mismo `dist/` de Vite), y la decisión de no añadir fallback SPA
  por paridad con el original sigue en pie. Render queda como
  alternativa documentada en el README.
- **README principal reescrito a estado final**: fases 0-6
  completas + Fase 7, cómo se juega, controles de teclado y
  táctiles, tests, cómo relanzar la E2E, despliegue en Vercel y
  Render, y el marcador «URL de producción: pendiente de despliegue
  (Fase 7)» para que el padre lo sustituya por la URL real.

## 4. Tests y build finales **[OBS]**

- **Vitest: 171/171 en verde** (14 ficheros), sin cambiar ni una
  expectativa: el pulido es CSS + clases en el HUD y ningún test
  unitario cubre presentación; la regresión de comportamiento la
  aporta la batería E2E de §2 (que incluye un check expreso de que
  el HUD de escritorio queda intacto).
- **Build en verde** (`tsc --noEmit && vite build`), `dist/` =
  **854.244 B** en total:
  - `index.html` 1.068 B · `robots.txt` 23 B
  - CSS 11.898 B (el bloque móvil añade ~1,7 KB sobre la Fase 6)
  - JS principal 265.543 B · chunk de escena 575.712 B
  - 0 assets externos, como en todas las fases.

## 5. Subida al repo **[OBS]**

Repo: `github.com/jpecinagithub/padel-3d-replica`, rama `main`,
procedimiento snapshot del proyecto (solo texto UTF-8):

- Cabeza previa verificada antes de subir:
  `a6567175487b9a79f81ea9f0c828ae0fd1632861` (sin cambios desde la
  subida de las Fases 0-6).
- Manifest NUL-delimitado (`~/workspace/padel-f7-paths.bin`) con
  solo los 8 ficheros creados/modificados por esta fase:
  `src/styles.css`, `src/ui/CourtView.tsx`, `src/ui/Menu.tsx`,
  `package.json`, `vercel.json`, `README.md`,
  `e2e/full-regression.mjs`, `e2e/README.md`.
- **Nuevo commit: `c1cd7c828384014dd8317de36f9051bda9f058ee`** —
  «Fase 7: pulido final, E2E completos y preparación de despliegue
  (v1.0.0)».
- Registro de sync actualizado atómicamente
  (`~/workspace/padel-replica.muse-github-snapshot-sync.json`:
  2 entradas, la inicial y esta).
- Verificación leyendo de vuelta el remoto: `package.json` con
  `"version": "1.0.0"` y la descripción nueva, y `vercel.json` con
  la configuración esperada, ambos en el commit nuevo.
- **Este informe NO va en el snapshot de la fase** (a propósito: lo
  subirá el padre cerrado con la URL de producción), y las capturas
  tampoco (binarios, fuera del alcance del procedimiento snapshot).

## 6. Despliegue — COMPLETADO (cerrado por el padre, 4-nov-2026)

- **URL de producción: https://padel-3d-replica.vercel.app**
- Despliegue en Vercel importando el repo `jpecinagithub/padel-3d-replica`
  (equipo «jpecina-gmailcom's projects»), desde el commit `c1cd7c8`,
  estado **Ready** («Deployed to Production»), sin advertencias.
  Vercel pidió reautenticación por código de correo (como en Poynting);
  el código se obtuvo del Gmail del usuario por lectura protegida y
  se introdujo en el diálogo, sin inventar ninguno.
- **Verificación en vivo por el padre [OBS]:** la URL sirve la app
  real: título «Pádel 3D — Réplica», menú renderizado con
  «Réplica clean-room · v1.0.0», monedero, estadísticas y ayuda de
  controles — es decir, el bundle cargó y la UI montó sobre el
  despliegue, no es solo un HTML vacío.
- El marcador del README se sustituyó por la URL real y esta sección
  cierra la fase; ambos ficheros se suben al repo en el snapshot de
  cierre. Futuros pushes a `main` redespliegan solos en Vercel.
- Nota de alcance: la jugabilidad sobre la URL pública no se ha
  probado con navegador gráfico desde esta VM (la regresión E2E
  completa de §2 corre contra el mismo build en local); el juicio de
  juego real — tacto, IA, sonido — corresponde a Jon en su PC, como
  en todas las fases.

## 7. Qué NO incluye

- El despliegue en sí (§6) y cualquier ajuste posterior a verlo en
  producción (rendimiento en GPU real, tacto del joystick y de la
  IA, escucha real del audio): todo ello sigue siendo [DESC] en la
  VM de verificación y se juzga en el PC/móvil de Jon.
