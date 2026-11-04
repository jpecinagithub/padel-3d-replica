# FASE 8 — Correcciones de la revisión Codex · Informe de cierre

Réplica clean-room de «Pádel 3D» (`~/workspace/padel-replica`).
Dictamen revisado: revisión externa de Codex sobre el commit
`a656717` (v0.6.0, fases 0–6), que retenía el visto bueno de
publicación. Este informe responde punto por punto, con el veredicto
sobre el código actual (v1.0.0) antes de corregir, la corrección
aplicada y el test que la fija.

## 0. Identificación de commits y estado de la subida

| Rol | SHA / estado |
|---|---|
| **Commit revisado** (Codex) | `a6567175487b9a79f81ea9f0c828ae0fd1632861` |
| **Commit base de esta fase** | `9cd73c38d4acd3721a30f1213fdc0e5143a48287` (v1.0.0, cabeza de `main` al empezar y al intentar subir) |
| **Commit corregido** (v1.1.0) | `7ed0882c1013bdd63d7ff827fbc16e0bd081f1db` (28 ficheros por snapshot) + `38255a8b26ecc293ea23197017f2159a9ed6a75f` (solo `.github/workflows/ci.yml`, creado vía web de GitHub — ver §5); cabeza de `main` al cierre: `38255a8b…` |
| **Commit desplegado** (Vercel) | El código desplegado es el del commit corregido `7ed0882c…` (el commit `38255a8b…` solo añade el workflow, sin cambios de app). Verificado en producción por el padre el 2026-11-04 ~18:00 CET: la URL sirve el bundle `assets/index-DnbCgaQV.js`, idéntico al build local de la v1.1.0, y el propio bundle contiene la cadena «v1.1.0» |

Todo el trabajo de código, tests y documentación de esta fase está
terminado y verificado en local (secciones 2 y 3). La subida y el
redespliegue quedaron completados tras resolver el bloqueo del §5.

## 1. Tabla punto por punto

Veredictos del PASO 0 (cada afirmación reproducida o descartada sobre
el código v1.0.0 antes de tocar nada):

| Punto | Veredicto sobre v1.0.0 | Corrección | Test que lo cubre |
|---|---|---|---|
| **A1** Sin WebGL la app desaparece | **CONFIRMADO**: `SceneCanvas` creaba `new PadelScene` sin protección y no hay error boundary: si `THREE.WebGLRenderer` lanza, React desmonta todo y el body queda vacío (la intención declarada en `App.tsx` —«si WebGL falla, la UI sigue»— solo cubría la carga del chunk, no el constructor) | Creación protegida (`ui/sceneGuard.ts`); si falla, aviso de incompatibilidad con «Reintentar el 3D» y «Entendido», y menú/tienda/ajustes usables. El aviso se monta en un portal a `body` en la esquina inferior: dentro de `.scene-layer` era visible pero **no clicable** (velo y paneles encima) — lo cazó la propia E2E nueva — y centrado tapaba botones de la tienda | `tests/scene-guard.test.ts` (3) + E2E A1: bloqueo de `getContext('webgl*')` vía init script; aviso visible, tienda navegable, reintento |
| **A2** La IA golpea antes de reaccionar | **CONFIRMADO**: `Match.attemptAIHit` solo exigía alcance geométrico (`brain.inReach`); con la bola junto al rival (p. ej. tras su cristal) devolvía en estado `reacting` con `decisionMs: null` | `AIBrain.hasDecided` (nuevo getter sobre el estado interno) y puerta en `attemptAIHit`: sin decisión cumplida no hay intento | `tests/match.test.ts` INTEGRACIÓN AI+Match: bola en alcance durante la reacción → 0 golpes, 0 intentos, `decisionMs` null; tras cumplirse (≥300 ms en Medio) golpea |
| **A3** Directa al lateral rival sigue en juego | **CONFIRMADO**: `handleEvent` excluía explícitamente `event.where !== 'side'` de la resolución sin bote. Nota: la regla documentada en la cabecera de `Match.ts` ya decía «directa al cerramiento sin botar = punto del contrario» sin excepción — la desviación era del código | Eliminada la exclusión: cristal y malla laterales sin bote previo resuelven como **falta de quien golpea** (punto del receptor), igual que ya hacían el fondo y el saque. Tras un bote en el campo receptor, el lateral no cierra (la bola puede seguir vía pared) | `tests/match.test.ts`: 4 casos simétricos (cristal/malla × golpea humano/IA) + tras-bote no cierra + fondo intacto |
| **A4** R tras un Torneo crea partido sin carrera | **CONFIRMADO**: la tecla R en `match-over` llamaba a `Match.startMatch()` directo, saltándose `App.handleStartMatch`/`startCareerRun`; sin `run`, `Career.settleMatch` retorna sin avanzar → la semifinal ganada no avanzaba | Reinicio unificado: nuevo callback `ctx.onRequestNewMatch` (Match → PadelScene → SceneCanvas → `App.handleStartMatch`, el mismo flujo que los botones). Sin callback, repliegue al arranque directo (robustez) | `tests/match.test.ts`: Torneo completo con R — semifinal → R → Final con `run.round===1` → campeonato con bonus 200, `stats.torneos=1`, run limpio; + E2E A4 con la misma secuencia y economía exacta (+992 🪙 en la Final a nivel Difícil) |
| **A5** La E2E no es ejecutable desde el repo | **CONFIRMADO y agravado**: `test:e2e` apuntaba a `playwright test` sin dependencia, config ni specs (fallaba); la batería real buscaba Playwright en proyectos vecinos de la VM y el Chromium en la caché local | `playwright@1.63.0` como devDependency (su Chromium es la revisión 1243); `test:e2e` = `node e2e/full-regression.mjs`; el script importa `playwright` normalmente y lanza `channel: 'chromium'` (build completo, el que instala el propio Playwright); sin rutas absolutas ni proxy: la única adaptación local posible es la variable `PLAYWRIGHT_CHROMIUM_PATH` (documentada, no necesaria en máquina limpia). `.github/workflows/ci.yml` con los pasos exactos y comandos exactos en `e2e/README.md` | Verificación completa tras `npm ci` limpio: tests, build y **E2E 30/30** (sección 2) |
| **M1** Grada «activa» sin sonido con el contexto ya creado | **CONFIRMADO**: `startCrowd()` marcaba `crowdPending` y llamaba a `ensureCtx()`, pero `buildCrowd()` solo se invocaba al CREAR el contexto; con contexto existente los nodos nunca nacían y `crowdActive` (basado en el flag) mentía | `startCrowd()` construye explícitamente tras `ensureCtx()` (`buildCrowd` es idempotente); el probe expone el estado REAL de los nodos: `crowdNodesCreated` (la cadena existe en el grafo) y `crowdStarted` (fuente y LFO recibieron `start()`), leídos del motor, no un flag paralelo | `tests/audio.test.ts`: estructura de nodos sobre el mock WebAudio (fuente en bucle arrancada + LFO arrancado) con el contexto creado ANTES, y ciclo entrar → mute → desmute → salir → reentrar; E2E lee `crowdNodesCreated && crowdStarted` en vivo al entrar a pista |
| **M2** El joystick pierde la intensidad analógica | **CONFIRMADO, localizado en el movimiento**: `JoystickTracker` e `InputManager` conservan la magnitud; quienes normalizaban siempre eran `Match.update` y `Training.update` (`ax/len`) → 20 % corría como 100 % | Helper puro `Input.moveVector(ax, az)`: conserva la magnitud ≤ 1 y solo recorta si supera 1 (diagonales de teclado); aplicado en ambos modos; la velocidad y la ratio de animación resultantes escalan con la magnitud | `tests/input.test.ts`: vector al 20 % y al 100 %, diagonal √2→1, ejes del InputManager sin normalizar y velocidad resultante (20 % → 20 % de la del nivel) |
| **M3** La pantalla de resultado muestra la ronda equivocada | **CONFIRMADO**: el panel de fin leía la `career` VIVA (ya avanzada): tras la semifinal decía «Torneo (Final)» y al campeonar volvía a «Semifinal» | `MatchFlowConfig`/`MatchSummary` llevan `modeName`/`roundName` CERRADOS al empezar el partido (los fija `Match.startMatch` desde la carrera de esa ronda); el panel usa el resumen (`endInfo.summary`), con la carrera viva solo como repliegue transitorio | `tests/matchflow.test.ts`: semifinal → final → campeonato con textos correctos y sin contaminación entre resúmenes; `tests/match.test.ts` (A4) verifica `summary.roundName`; E2E: el panel dice «Torneo (Semifinal)» y, tras campeonar, «Torneo (Final)» |
| **M4** «Ayudas» y «Repeticiones» sin efecto | **CONFIRMADO**: `settings.assist`/`replays` solo se leían en `Setup.tsx` (selectores) y `Menu.tsx` (chip); el motor no los consumía | Semántica real y documentada (REGLAMENTO arts. 6.2/6.3): Ayudas Sí = aguja de saque con zona dulce + mensajes contextuales de ayuda + medidor SUPERGOLPE visibles (helper puro `src/game/guides.ts`, aplicado en `CourtView`); Repeticiones Sí = repetición automática breve tras cada punto en Partido (una por punto, en `Match.update`), además de la V manual. **Decisión propia documentada**: el defecto de Ayudas pasa a «Sí» (la SPEC guarda `assist: 0`, pero el menú del original mostraba «Ayudas: sí» por defecto y su semántica es no observable; con «No» por defecto la v1.1.0 habría perdido las guías que la v1.0.0 mostraba). Dos aserciones de `tests/store.test.ts` actualizadas por esto, con la justificación escrita en el propio test | `tests/input.test.ts` (guidesFor: cada ajuste cambia su salida, independencia) + `tests/match.test.ts` (auto-replay Sí/No y no-en-bucle) + E2E M4 (Ayudas=No → aguja/medidor/ayuda ausentes del DOM; Repeticiones=Sí → `replay.active` sin tocar V) |
| **M5** HUD móvil tapa el juego | **PARCIALMENTE RESUELTO EN FASE 7**: el retrato 390×844 tenía compacto (media query por ancho ≤760 px), pero el horizontal 844×390 quedaba fuera (ancho >760) con el HUD de escritorio | Nueva media query por ALTURA — `@media (orientation: landscape) and (max-height: 500px)` — con el mismo tratamiento compacto (sin textos de escritorio, marcador reducido, controles recogidos, paneles con scroll) + `:focus-visible` global | E2E con cajas DOM en AMBAS orientaciones: retrato (joystick bottom 752 ≤ hud-bottom top 774) y horizontal (326 ≤ 354), marcador visible y textos de escritorio ocultos en las dos |
| **M6** Sin localStorage, `setRun()` no notifica | **CONFIRMADO**: `setRun()` hacía `if (!this.storage) return;` ANTES de `emit()` | La notificación va siempre; la persistencia es la única parte condicionada al almacenamiento | `tests/store.test.ts`: suscriptor con `new GameStore(null)` recibe los cambios y una carrera de Torneo completa (crear → avanzar → campeonar → abono) funciona en memoria |
| **C1** `npm audit`: 3 vulnerables en la cadena de Vitest | **CONFIRMADO en origen; NO re-auditable desde esta VM**: el endpoint de auditoría del registro devuelve 403 `policy_denied` (política del espejo interno) — queda registrado como limitación del entorno, no como «audit limpio» | Actualización aplicada dentro de lo posible: **Vitest 3.2.7 → 4.0.18** (la cadena señalada), con la suite (204) y el build en verde tras el cambio; vite queda en 7.3.7 deduplicado. Sin `audit` ejecutable aquí, no se afirma que el conteo haya quedado a cero: el riesgo, en cualquier caso, es de la cadena de DESARROLLO (tests), no del bundle de producción | Suite completa + build tras el bump (sección 2). Pendiente externo: ejecutar `npm audit` en un entorno con el endpoint accesible |
| **C2** Persistidos sin validar | **CONFIRMADO**: settings se fusionaba sin validar (`{...defaults, ...raw}`), stats aceptaba negativos/decimales, run aceptaba cualquier `mode > 0` y `round` sin cota (y conservaba campos extra) | Saneamiento completo en `store.ts`: rangos por campo (superficie 0–3, niveles 0–2, ambiente/cámara/modo 0–2, replays/assist 0–1, booleanos estrictos), stats a enteros ≥ 0, run solo modos 1/2 con ronda acotada a las rondas del modo y `baseLevel` 0–2 u omitido; `updateSettings` también sanea el parche | `tests/store.test.ts`: payloads corruptos y fuera de rango para settings/stats/run + parche imposible |
| **C3** Hooks de prueba en producción | **CONFIRMADO**: `SceneCanvas` registraba todos `__padelTest*`/`__padelWin`/`__padelGold`/`__padelFX` sin condición | Política implementada: los hooks que FUERZAN estado solo se registran en dev o con `?hooks=1`; los probes de solo lectura (`__padelProbe`, `__padelSceneProbe`, `__gameProbe`, `__GAME_READY__`) permanecen siempre. La E2E navega a `/?hooks=1`. **Documentado con crudeza** en README, REGLAMENTO (art. 8) y aquí: es una política de DEPURACIÓN contra activación accidental, **NO una medida de seguridad** — cualquiera puede añadir el parámetro; es aceptable porque el juego es 100 % local y las monedas no tienen valor fuera del navegador del propio jugador | E2E C3: contexto sin `?hooks=1` → `__padelWin/__padelGold/__padelTestWinPoint/__padelTestSeed` son `undefined` y los probes son funciones; con `?hooks=1`, los de estado existen. La regresión completa pasa con la política nueva |
| **C4** La escena se monta también en el menú | **EVALUADO y aplicado lo razonable** (el fondo 3D del menú es paridad visual con el original: no se quita). Modo de bajo consumo con `playMode === 'none'`: pixelRatio con tope 1 (la escena nace ya así) y render a media tasa (1 de cada 2 frames); al entrar en pista se restaura (tope 2, tasa completa). El probe expone `lowPower` | E2E C4 (`lowPower === true` y `pixelRatio ≤ 1` en el menú). Medición local (script no commiteado, esta VM con SwiftShader y DPR 1): ~1 render/s tanto en menú como en pista — aquí el cuello de botella es el propio render por software, así que el ahorro no es medible en renders/s en esta VM; se materializa en hardware real con DPR 2 (4× menos píxeles por frame en el menú) y en mitad de llamadas de dibujo. No se afirma un FPS de escritorio real |
| **C5** Accesibilidad básica | **CONFIRMADO (parcial)**: los botones táctiles YA tenían `aria-label` y los menús son `<button>` reales; faltaba la gestión de foco | Foco en pausa y fin de partido (`CourtView`): al abrirse el panel, el foco va a su primer botón; al cerrarse, vuelve al elemento que lo tenía. `:focus-visible` con contorno lima para botones | E2E C5: ESC → `document.activeElement` es «Continuar»; clic en Continuar → la pausa se cierra y el foco ya no está en el botón |
| **C6** Despliegue en Render | **FUERA DE LOS REQUISITOS** (precisión del revisor): la plataforma elegida y verificada es Vercel. Nota informativa: `render.yaml` queda en el repo como alternativa **no verificada**; no se ha desplegado en Render ni se afirma nada sobre él | — | — |

### Reglamento (acción pedida por el dictamen)

Creado [`REGLAMENTO.md`](REGLAMENTO.md): artículo por artículo, con
las dos categorías **separadas y etiquetadas** — (a) OBSERVADO en el
original, con su respaldo en la SPEC/informes, y (b) DECISIÓN PROPIA
donde el original no consta o la SPEC calla — incluyendo las variantes
que el dictamen pedía cerrar sin cambiar: un saque por punto (2.3),
saque alto (2.4), punto de oro solo en el juego decisivo (1.4) y el
tratamiento de cerramientos (3.2). Ninguna regla de juego vigente se
ha modificado en esta fase; la única desviación encontrada entre lo
documentado y el código era la de A3 (el código excluía los laterales
que su propia cabecera de reglas no excluía) y era un fallo, no una
variante. Los tests que fijan cada artículo se citan en el propio
reglamento.

### Hallazgo adicional de la fase

La primera versión del aviso de A1 (dentro de la capa de la escena)
era visible pero **inutilizable**: el velo y los paneles quedan por
encima de esa capa y el botón no recibía clics; recolocado en el
centro, además tapaba el botón de volver de la tienda. Lo detectó la
E2E nueva (no la inspección), y la solución final es portal a `body`
+ esquina inferior izquierda + botón «Entendido». Queda registrado
porque es exactamente la clase de fallo que el dictamen señalaba en
otros puntos: lo que se da por bueno sin verificar el camino real.

## 2. Pruebas locales (esta VM)

- **Unitarios (Vitest)**: 171 tests / 14 ficheros antes → **204 tests /
  17 ficheros, todos en verde**. Nuevos: `tests/match.test.ts` (11:
  integración A2, A3 ×6, A4 ×2, M4 ×2), `tests/input.test.ts` (9:
  guides M4 + moveVector/ejes M2), `tests/scene-guard.test.ts` (3:
  A1), `tests/store.test.ts` (+6: C2 ×4, M6 ×2), `tests/audio.test.ts`
  (+2: M1 con estructura de nodos), `tests/matchflow.test.ts` (+2:
  M3). Cambios de expectativas sobre tests previos: solo las 2
  aserciones del defecto `assist: 0 → 1` (M4, justificadas arriba y en
  el propio test).
- **E2E (Playwright, `npm run test:e2e`)**: la batería crece de 23 a
  **30 checks, 30/30 PASS**, en dos pasadas completas: la ordinaria y
  la de verificación de A5 **tras `npm ci` limpio** (con `npm test` y
  `npm run build` también en verde tras la instalación limpia).
  Pasadas intermedias: 27/30 → 29/30 → 30/30 (regex de versión
  sensible a mayúsculas por el `text-transform` del subtítulo; el
  portal de A1; el contexto del check M4; la posición del aviso A1).
- **Build**: `tsc --noEmit` + `vite build` en verde. Versión **1.1.0**
  (`package.json`, subtítulo del menú y etiquetas del HUD).
- **Medición C4**: ver tabla C4 (medida en esta VM; sin afirmar FPS
  reales de escritorio).

## 3. CI

- El workflow `.github/workflows/ci.yml` (incluido en el snapshot)
  corre exactamente: `npm ci` → `npm test` → `npm run build` →
  `npx playwright install --with-deps chromium` →
  `npm run test:e2e`, en `push` a `main` y en pull requests.
- El workflow ya existe en el repo remoto (commit `38255a8b…`, creado
  vía web — ver §5) y su primera ejecución quedó disparada por ese
  push. **Su resultado NO se da por verde**: al cierre de este
  informe, la insignia del workflow en GitHub seguía en «no status»
  (ejecución sin resultado registrado todavía). Lo que sí está
  verificado es que esos mismos pasos, en ese orden, pasan en local
  tras una instalación limpia.

## 4. Comprobaciones en producción

- Fetch inicial (2026-11-04 17:53 UTC): producción servía aún
  **v1.0.0** (commit base `9cd73c3…`), como correspondía mientras la
  subida estaba bloqueada.
- **Verificación final (2026-11-04 ~18:00 CET, por el padre, sobre la
  ruta real de producción):** `https://padel-3d-replica.vercel.app`
  responde 200 y su HTML referencia el bundle
  `assets/index-DnbCgaQV.js`, **idéntico al bundle del build local de
  la v1.1.0**; el bundle servido contiene la cadena «v1.1.0».
  Producción sirve por tanto el código corregido (commit `7ed0882c…`).

## 5. Bloqueo de la subida — RESUELTO (causa real identificada)

- La subida por snapshot falló tres veces (dos del agente y una del
  padre) al crear el árbol: `POST …/git/trees: 403 Resource not
  accessible by integration`. La primera hipótesis (acceso de la App
  al repo) era **incorrecta**: el padre repitió la subida excluyendo
  un único fichero, `.github/workflows/ci.yml`, y entró a la primera.
  **Causa real:** la integración de GitHub no tiene el permiso de
  *workflows*, y GitHub rechaza cualquier árbol que cree o modifique
  ficheros bajo `.github/workflows/` — las subidas de fases anteriores
  no contenían ninguno.
- Resolución aplicada:
  1. Snapshot de **28 ficheros** (todo menos `ci.yml`) → **commit
     corregido `7ed0882c1013bdd63d7ff827fbc16e0bd081f1db`**, con su
     entrada en el registro de sync (4 entradas).
  2. `.github/workflows/ci.yml` creado desde la sesión web de GitHub
     del usuario, contenido idéntico al local → commit
     `38255a8b26ecc293ea23197017f2159a9ed6a75f` (no es un snapshot; no
     figura en el registro de sync).
  3. Este informe se sube en un snapshot final y su SHA queda en el
     registro de sync.
  4. Producción verificada sirviendo el código corregido (ver §4).

## 6. Pendientes que no son de esta fase

- Juicio de Jon en su PC (de la Fase 7, sigue igual): tacto de juego,
  equilibrio de la IA y sonido real del audio sintetizado — no
  verificables desde esta VM con SwiftShader.
- `npm audit` en un entorno con el endpoint accesible (C1).
- El visto bueno del revisor queda, como él mismo fijó, pendiente de
  juzgar este informe (la v1.1.0 ya está desplegada y verificada).
---

## Addenda — Ronda 2 (cierre condicionado)

El revisor dictaminó **cierre condicionado** sobre la Fase 8 con tres
puntos: (1) la actualización de Vitest 4.0.18 seguía dentro de los
rangos afectados por dos avisos (correcciones en 4.1.11 y 4.1.12);
(2) el REGLAMENTO contenía cifras que contradecían el código y el
art. 2.5 se etiquetaba «observado» llamándose «asumido» en su propia
justificación; (3) el CI existía pero aún no acreditaba una pasada
correcta. Se añade (4) un humo de recorridos contra la URL real, en
respuesta a que «el bundle no sustituye la comprobación de los
recorridos en producción». **No se ha tocado ningún parámetro del
juego**: la Ronda 2 es dependencias, documentación y verificación.
Versión resultante: **v1.1.1**.

### R2.1 Dependencias: Vitest y @vitest/mocker a 4.1.12

| Paquete | Antes (lockfile) | Después (lockfile) | Fijo en |
|---|---|---|---|
| `vitest` | 4.0.18 | **4.1.12** | 4.1.11 (aviso 1) |
| `@vitest/mocker` | 4.0.18 | **4.1.12** | 4.1.12 (aviso 2) |

- La última 4.1.x publicada es la **4.1.12** para ambos paquetes
  (consultado en el registro el 2026-11-04); se fijó `vitest: ^4.1.12`
  en `package.json` y el lockfile resuelve 4.1.12 exactos en los dos,
  verificado por grep de `package-lock.json` (`node_modules/vitest` y
  `node_modules/@vitest/mocker`). El diff del lockfile es quirúrgico:
  solo sube la familia `@vitest/*` (7 paquetes, 4.0.18 → 4.1.12),
  `vitest`, y dos dependencias suyas (`es-module-lexer` 1.7.0 → 2.3.2,
  `std-env` 3.10.0 → 4.3.0). 10 paquetes en total.
- **Mecanismo (documentado por transparencia):** `npm install` a secas
  falla en esta VM con un error interno de npm 10.9.4
  (`Cannot read properties of null (reading 'edgesOut')` en
  `#loadPeerSet` de Arborist) al resolver el árbol con la nueva
  versión. La instalación se completó con `--legacy-peer-deps`, que
  solo afecta a cómo npm resuelve los *peer* al instalar en local: el
  lockfile resultante no difiere en ninguna marca `peer` del anterior
  (diff = 0) y `npm ci` —el comando que usa el CI, sin esa opción—
  instala desde él sin error (verificado en local: 106 paquetes).
- **Auditoría: `npm audit` NO es ejecutable en esta VM** (igual que en
  la Fase 8). Salida íntegra de los dos intentos (por defecto y con
  `--registry https://registry.npmjs.org`, que ya era el registro
  configurado):

  ```
  npm warn audit 403 Forbidden - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - policy_denied
  {
    detail: 'POST /-/npm/v1/security/audits/quick not permitted by policy',
    error: 'policy_denied',
    policy: 'zz_managed_internal_spaces_package_registries',
    rule: 'POST /-/npm/v1/security/audits/quick'
  }
  npm error audit endpoint returned an error
  ```

  La política de egress de la VM bloquea el endpoint de auditoría; no
  es un fallo del proyecto. **No se afirma que la auditoría corriera.**
- **Comprobación sustituta, versión a versión contra la base OSV
  (GitHub Advisory Database):** consulta a `api.osv.dev` de **los 156
  pares paquete@versión únicos del lockfile completo**:
  - Lockfile anterior: 2 paquetes con avisos — `vitest@4.0.18` con
    GHSA-5xrq-8626-4rwp y GHSA-82fw-gwwq-j7x9; `@vitest/mocker@4.0.18`
    con GHSA-82fw-gwwq-j7x9 y GHSA-qxg6-89mg-rqv8 (los dos avisos del
    revisor están entre ellos: GHSA-82fw…, corregido en 4.1.11 para
    ambos paquetes, y GHSA-qxg6…, corregido en 4.1.12 para mocker).
  - Lockfile nuevo: **0 de 156 paquetes con avisos**; las consultas
    individuales a `vitest@4.1.12` y `@vitest/mocker@4.1.12` devuelven
    `{}` (sin vulnerabilidades conocidas).
- Suite unitaria con las versiones nuevas: **204/204 en verde**, sin
  ningún cambio de configuración de Vitest. Build (`tsc --noEmit` +
  `vite build`) en verde. Son dependencias **solo de desarrollo**: el
  juego publicado no incluye Vitest, así que esto nunca fue una
  vulnerabilidad del juego servido, como ya señaló el revisor.

### R2.2 REGLAMENTO contra el código: auditoría numérica completa

Se extrajeron **todas** las cifras del REGLAMENTO y se contrastaron
con el código (`src/state/modes.ts`, `src/game/AI.ts`, `Shots.ts`,
`Ball.ts`, `Score.ts`, `courtConstants.ts`, `src/state/economy.ts`,
`src/game/Career.ts`, `Match.ts`, `Training.ts`, `src/state/store.ts`,
`src/game/guides.ts`). Resultado: **5 cifras corregidas y 1 artículo
reetiquetado**; el resto del documento coincide con el código (física
de 3.1 completa, economía de 5.2, modos y bonus de 5.1, gold point de
1.3/1.4, rotaciones de 1.5, zonas de dobles ±2,5 de 4.4, selecciones
de 5.4, defectos de 6.2/6.3, rangos de 7.1). Detalle de lo corregido,
con su fuente en el código anotada también en el propio artículo:

| # | Artículo | Decía | Dice ahora | Fuente en el código | ¿Del revisor? |
|---|---|---|---|---|---|
| 1 | 2.2 | falta de saque IA 0,22/0,13/0,07 | **0,14/0,07/0,03** | `src/state/modes.ts` · `AI_LEVELS.aiServeFault` | Sí |
| 2 | 4.1 | velocidad del jugador 5,2/6,4/7,6 m/s | **6,4/7,2/7,9 m/s** | `src/state/modes.ts` · `PLAYER_LEVELS.speed` | Sí |
| 3 | 4.1 | suelo de calidad 0,35/0,50/0,65 | **0,28/0,35/0,45** | `src/state/modes.ts` · `PLAYER_LEVELS.qualityFloor` | Sí |
| 4 | 4.1 | error extra tras pared +0,10 | **+0,25/+0,15/+0,07** (sumado al error base) | `src/state/modes.ts` · `AI_LEVELS.aiWallError`; suma en `src/game/AI.ts` · `AIBrain.rollError` | Sí |
| 5 | 2.4 | el lanzamiento sube hasta ≈2,37 m | **≈2,47 m** | `src/game/Match.ts` y `Training.ts`: y = 1,02 + 5,35t − 4,95t², pico = 1,02 + 5,35²/(2·9,9) ≈ 2,466 m | **No: hallazgo de esta auditoría** |
| 6 | 2.5 | etiqueta (a) OBSERVADO | **(b) DECISIÓN PROPIA**, texto alineado («asumida») | Regla real de pádel fijada en `Match.ts` e `isInServeBox` (`Shots.ts`); sin respaldo en la SPEC como observado | Sí |

- Nota sobre las cifras 1–4: los valores erróneos no coincidían **ni
  con el código ni con la SPEC** (§5.1 de `REPLICA_SPEC.md` registra
  exactamente los valores del código). Eran errores de transcripción
  del reglamento al redactarlo en la Fase 8; las etiquetas (a) se
  mantienen porque la SPEC sí respalda las cifras corregidas.
- Revisión de etiquetas (a)/(b) en todo el documento: solo el 2.5
  contradecía su propia justificación. El 8.1 se revisó expresamente
  y se mantiene como (a): su respaldo es la SPEC §5.7, que documenta
  los probes del análisis del original. Sin ningún otro cambio de
  etiqueta.
- **Ningún parámetro del juego se ha modificado** en esta ronda: el
  diff de código de la v1.1.1 es solo la cadena de versión mostrada
  (menú y HUD) y el arreglo de la E2E descrito en R2.3.

### R2.3 Resultado del CI: verde en la cabeza final (con un rojo intermedio instructivo)

Consultado por la API pública de Actions (sin autenticación), hasta
la conclusión de cada ejecución:

| Ejecución | Cabeza | Conclusión | URL |
|---|---|---|---|
| 41882283501 | `38255a8b` (v1.1.0 + ci.yml) | **success** | https://github.com/jpecinagithub/padel-3d-replica/actions/runs/41882283501 |
| 41882525334 | `bd612020` (cierre Fase 8) | **success** | https://github.com/jpecinagithub/padel-3d-replica/actions/runs/41882525334 |
| 41884390791 | `cade1d7b` (Ronda 2, primer push) | **failure** — solo el paso «Regresión E2E» | https://github.com/jpecinagithub/padel-3d-replica/actions/runs/41884390791 |
| 41884681419 | `5397ede7` (Ronda 2, cabeza de código final) | **success** | https://github.com/jpecinagithub/padel-3d-replica/actions/runs/41884681419 |

- Las dos ejecuciones que el revisor vio `in_progress` **concluyeron
  en success**: instalación limpia, tests unitarios, build, Chromium
  y regresión E2E, todo en verde en la infraestructura de GitHub.
  Esa es la revalidación independiente de la v1.1.0 que faltaba.
- El rojo de `cade1d7b` tiene diagnóstico por diff (los logs completos
  exigen autenticación y no están disponibles): en esa cabeza los
  pasos 4–7 fueron success (npm ci, **tests unitarios con Vitest
  4.1.12**, build, instalación de Chromium) y solo falló la E2E. La
  única diferencia entre `cade1d7b` y la cabeza verde `5397ede7` es
  una línea del propio arnés E2E: el check nº 1 fijaba el subtítulo
  del menú con el patrón literal `/v1\.1\.0/`, que dejó de cumplirse
  al subir la versión a 1.1.1. Corregido a `/v1\.1\.\d+/` (cualquier
  parche 1.1.x), sin tocar el juego. La secuencia exacta del workflow
  no hizo falta reproducirla en local porque la ejecución siguiente,
  con ese único cambio, acredita el diagnóstico pasando entera.
- Desglose de la ejecución verde de la cabeza final (41884681419):
  Set up ✓ · checkout ✓ · setup-node ✓ · Instalar dependencias
  (limpio) ✓ · Tests unitarios (Vitest) ✓ · Build (tsc + vite) ✓ ·
  Instalar el Chromium de Playwright ✓ · **Regresión E2E ✓**. El CI
  ejecuta la misma batería 30/30 validada en local, en una máquina
  que no es esta VM: la revalidación es independiente del ejecutor.

### R2.4 Comprobación en producción (HUMO — no sustituye a la E2E)

Recorridos ligeros ejecutados con Playwright (Chromium completo +
SwiftShader, mismo enfoque que la E2E local) contra la URL **real**
`https://padel-3d-replica.vercel.app/?hooks=1`, ya con la v1.1.1
desplegada. Es un **humo**: verifica que los recorridos básicos
funcionan sobre lo publicado; la batería completa sigue siendo la
E2E local y la del CI. Resultado: **6/6 checks OK**.

| # | Check | Resultado |
|---|---|---|
| 1 | Menú carga y probe de escena OK (`__GAME_READY__`, `__padelSceneProbe().ready`) | OK — 335 objetos de escena |
| 2 | Versión servida = v1.1.1 (subtítulo del menú) | OK — «Réplica clean-room · v1.1.1» |
| 3 | Entrar a pista (Entrenamiento) | OK |
| 4 | Saque de entrenamiento válido por hook (`__padelTestServe(0.5)` → `serve.valid`) | OK |
| 5 | Partido: la IA devuelve ≥1 bola (`__padelTestLaunchAtAI`, semilla 42) | OK — aiHits = 1 |
| 6 | Cero errores de consola en toda la sesión | OK — 0 |

Salvedades: render por SwiftShader (~0,5 fps), igual que en local —
los recorridos se verifican por estado (probes), no por fluidez; y el
acceso desde esta VM salió por el forwarder local documentado en
`AGENTS.md` (el Chromium directo contra el proxy da
`ERR_TUNNEL_CONNECTION_FAILED`). La primera pasada dio 5/6 por un
fallo del propio script de humo (el subtítulo se renderiza en
mayúsculas por CSS y la expresión era sensible a mayúsculas); con la
expresión corregida, la pasada registrada es 6/6.

### R2.5 Commits de la Ronda 2

| Rol | SHA |
|---|---|
| **Base de la ronda** | `bd612020e8a756180e58db165cf64edca46f781f` (cierre Fase 8) |
| **Corregido (código y docs)** | `cade1d7bbcc100777d8331611f09515c8e89c410` — package.json, package-lock.json, REGLAMENTO.md, cadena de versión en `src/ui/Menu.tsx` y `src/ui/CourtView.tsx` |
| **Ajuste del arnés E2E** | `5397ede76f1f41e7c8843013f26cc72b301073b0` — solo `e2e/full-regression.mjs` (patrón de versión); es la cabeza sobre la que corre el CI verde 41884681419 |
| **Desplegado (Vercel)** | El código de `cade1d7b`/`5397ede7` (idéntico en la app; el segundo commit no toca `src/`). Verificado por la ruta real tras los redespliegues: la URL sirve el bundle `assets/index-FWc6Dseb.js`, idéntico al build local de la v1.1.1, y el bundle contiene la cadena «v1.1.1» |
| **Esta addenda** | Se sube en el snapshot final de la ronda; su SHA queda registrado en `~/workspace/padel-replica.muse-github-snapshot-sync.json` (entradas 6, 7 y 8 de la ronda). Su propio push dispara una ejecución de CI más, sobre un árbol de código idéntico al de la ejecución verde 41884681419 |

Pendientes tras la Ronda 2: el visto bueno definitivo del revisor
sobre esta addenda; `npm audit` ejecutado en un entorno cuyo egress
permita el endpoint (la comprobación OSV de R2.1 lo sustituye aquí);
y el juicio de Jon en su PC (tacto, equilibrio de la IA, sonido real),
que sigue sin ser verificable desde esta VM.
