# Pádel 3D — Réplica (clean-room)

Reimplementación original, desde la especificación de comportamiento de
`~/workspace/padel-analysis/REPLICA_SPEC.md`, de un juego de pádel 3D
para un jugador en el navegador. No contiene código ni assets del
original: solo parámetros de comportamiento observados (reglas,
fórmulas, catálogos) y código propio. Todo el 3D es procedural, todo
el audio se sintetiza con WebAudio y no hay ni un solo fichero de
assets externos.

**URL de producción: https://padel-3d-replica.vercel.app**

El reglamento de juego de la réplica, artículo por artículo con lo
observado en el original separado de las decisiones propias, está en
[`REGLAMENTO.md`](REGLAMENTO.md).

## Estado: v1.1.0 — juego completo (fases 0-7) + correcciones de la revisión Codex (Fase 8)

- **Fases 0+1 (andamiaje, lógica pura y UI).** Marcador (Score),
  modos, economía y tienda con persistencia en localStorage.
  Ver `FASE1_INFORME.md`.
- **Fase 2 (escena 3D).** Pista reglamentaria 20×10, ambientes
  (Noche/Día/Atardecer), superficies y cámaras TV/Jugador/Libre.
  Ver `FASE2_INFORME.md`.
- **Fase 3 (bola y golpeo).** Física propia de la bola, 8 tipos de
  golpe, saque con aguja y punto dulce, modo Entrenamiento jugable.
  Ver `FASE3_INFORME.md`.
- **Fase 4 (jugadores e IA).** Rig articulado procedural con 11
  estados de animación, IA por niveles (reacción/error/velocidad de
  la SPEC), saque de la IA y dobles con compañero por zonas.
  Ver `FASE4_INFORME.md`.
- **Fase 5 (partido completo).** Marcador oficial (punto→juego→set,
  tiebreak a 7, punto de oro), economía real (monedas por punto,
  juego y resultado), modos Torneo (Semifinal/Final, bonus 200) y
  Mundial (Cuartos/Semifinal/Final, bonus 500, selecciones) con
  carrera persistente, repetición con la tecla V y efectos de
  partículas (confeti, fuegos, estallido dorado). Ver
  `FASE5_INFORME.md`.
- **Fase 6 (audio y táctil).** Audio 100 % sintetizado con WebAudio
  (golpe, bote, cristal, malla, red, aplausos, grada, monedas,
  victoria/campeonato) con mute persistido, y controles táctiles
  (joystick analógico multitouch + botones) sobre el mismo sistema
  de entrada que el teclado. Las monedas solo se ganan jugando: la
  tienda no tiene botón de prueba. Ver `FASE6_INFORME.md`.
- **Fase 7 (pulido).** HUD compacto en pantallas estrechas (≤760 px),
  batería E2E consolidada de regresión (`e2e/full-regression.mjs`) y
  preparación del despliegue. Ver `FASE7_INFORME.md`.
- **Fase 8 (correcciones de la revisión Codex).** Sin WebGL la app ya
  no desaparece (aviso y UI usable); la IA solo golpea tras su
  reacción; los cerramientos laterales resuelven el punto sin bote; la
  tecla R reinicia por el flujo de carrera; la grada suena con el
  contexto ya creado; el joystick conserva su magnitud analógica; la
  pantalla de fin muestra la ronda jugada; «Ayudas» y «Repeticiones»
  tienen efecto real; HUD compacto también en horizontal; E2E
  portable como dependencia del proyecto con CI. Ver
  `CODEX_FIXES_INFORME.md`.

## Cómo se juega

Desde el menú: **Jugar partido** abre la pista y allí se elige
**Entrenamiento** (saque con aguja y rally libre) o **Partido** contra
la IA con marcador oficial. En **Personalizar partido** se elige el
modo (Partida rápida a 6 juegos, Torneo o Mundial a 4 con carrera por
rondas que se guarda aunque salgas a mitad), la superficie, tu nivel,
el nivel del rival, individuales/dobles, ambiente, público y cámara.
Las monedas ganadas en los partidos se gastan en la **Tienda**
(palas con efecto real en potencia/alcance, pelotas, camisetas,
gorras y pieles: 22 artículos).

### Controles

- **Teclado:** WASD/flechas moverte · ESPACIO/clic golpear y sacar
  (en el saque, segundo ESPACIO en el punto dulce de la aguja =
  saque perfecto) · W potente (con la barra de SUPERGOLPE llena y
  bola alta, smash) · S dejada · W+E globo · Q cortado (mantener) ·
  E liftado (mantener) · C cámara · V repetición del último punto ·
  R reiniciar (repite el saque; sobre el panel de fin, revancha o
  siguiente ronda por el mismo flujo de carrera que los botones) ·
  M sonido · ESC pausa.
- **Táctil** (solo en dispositivos táctiles o pantallas ≤760 px):
  joystick izquierdo para moverte, botón GOLPE (= ESPACIO, también
  para el saque de aguja en dos toques), CORTADO y LIFTADO
  mantenidos, y utilidades 📷 cámara · 🔁 repetición · ⏸ pausa ·
  🔊 sonido. Multi-touch real: un dedo en el joystick y otro
  golpeando a la vez.

El progreso (monedas, tienda, estadísticas y carrera de
Torneo/Mundial) se guarda en el navegador (localStorage, claves
`game.padel.*` y `game.muted`).

## Desarrollo

```bash
npm ci
npm run dev       # desarrollo
npm test          # Vitest (lógica pura e integración): 204 tests
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # sirve dist/ en local (puerto 4173)
```

### E2E de regresión

```bash
npm ci
npx playwright install chromium
npm run test:e2e   # batería completa contra vite preview
```

Playwright es dependencia de desarrollo del proyecto: la batería
(`e2e/full-regression.mjs`) arranca su propio `vite preview`, ejecuta
en una pasada la batería clave de todo el juego (menú/escena, tienda,
entrenamiento, partido con set guiado y persistencia, Torneo completo
con campeonato, repetición, efectos, audio, ajustes, sin-WebGL y
táctil en retrato y horizontal), imprime PASS/FAIL por check y
termina con código de salida distinto de cero si algo falla. El
workflow `.github/workflows/ci.yml` corre los mismos pasos (npm ci,
tests, build, instalación de Chromium y E2E). Detalle en
`e2e/README.md`. Capturas en `e2e/screenshots/`.

### Hooks de prueba y política `?hooks=1`

Los probes de solo lectura (`__padelProbe`, `__padelSceneProbe`,
`__gameProbe`, `__GAME_READY__`) están siempre activos. Los hooks que
**fuerzan estado** (`__padelTest*`, `__padelWin`, `__padelGold`,
`__padelFX`) solo se registran en desarrollo o si la URL lleva
`?hooks=1` (la batería E2E navega así).

Que quede claro: **esto es una política de depuración, no una medida
de seguridad.** Evita la activación accidental, pero cualquiera puede
añadir `?hooks=1` a la URL y usar los hooks para, por ejemplo,
ganarse monedas sin jugar. Es aceptable porque el juego es 100 %
local, sin servidor ni cuentas: esas monedas viven en el navegador
del propio jugador y no tienen ningún valor fuera de él. Si algún día
hubiera un servidor o recompensas reales, esta política no valdría.

## Despliegue

- **Vercel (la plataforma elegida; verificado):**
  https://padel-3d-replica.vercel.app — `vercel.json` en la raíz:
  framework `vite`, `buildCommand: npm run build`,
  `outputDirectory: dist`, sin variables de entorno. No hacen falta
  rewrites: es una SPA de una sola vista sin rutas (la escena y los
  paneles viven en la misma página). Cada push a `main` redespliega.
- **Render (alternativa NO verificada):** queda un `render.yaml`
  (Static Site) como alternativa documentada; no se ha desplegado ni
  verificado en Render y no forma parte de los requisitos del
  proyecto.

## Stack

Vite 7 · React 19.3.1 · TypeScript 5.9 · Three.js r180 · Vitest 4 ·
Playwright 1.63 (solo E2E, dev). Sin backend: todo el estado vive en
localStorage con el esquema de la SPEC §4.
