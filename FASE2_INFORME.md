# Informe de la Fase 2 — Réplica clean-room de «Pádel 3D»

**Fecha:** miércoles 4 de noviembre de 2026 (CET).
**Proyecto:** `~/workspace/padel-replica/` (versión del paquete: 0.2.0).
**Alcance entregado:** Fase 2 de `REPLICA_SPEC.md` §8 — «Escena: pista
reglamentaria, cristales/malla, vallas, ambientes, cámaras TV/Jugador».
**Clean-room:** todo el código y todos los assets son originales y
procedurales. De `padel-analysis/served/` no se ha copiado nada: ni GLB,
ni MP3, ni las texturas publicitarias (las de la réplica son marcas
inventadas generadas por Canvas 2D) ni el público (geometría instanciada
propia, sin GLB; el GLB propio es de la Fase 4).

---

## 1. Dependencia nueva

- **three@0.180.0 (r180)**, la versión exacta fijada por la evidencia del
  original, y `@types/three@0.180.0` en desarrollo. React sigue en
  **19.3.1**; no se ha añadido React Router ni ninguna otra dependencia.

## 2. Módulos creados

### 2.1 Lógica pura (sin Three ni DOM, testeable en node)

| Fichero | Contenido |
|---|---|
| `src/game/courtConstants.ts` | Medidas: semiancho 5, semilargo 10, red 0,88 m, cristal 3 m, cerramiento 4 m, línea de saque a 6,95 m, cristal lateral 4 m; tamaño del público: 3 gradas × 3 filas × 34 = **306**. |
| `src/game/cameraMath.ts` | `CameraKind` (`tv`/`player`/`free`), orden del ciclo de la tecla C, mapeo desde `settings.camera` (0→TV, 1→Jugador, 2→Libre, resto→TV), zoom con clamp **0,45–2,6** (SPEC §5.7), poses por cámara (el zoom divide la distancia base: a más zoom, más cerca) y órbita esférica con clamp polar. |
| `src/game/ambiencePresets.ts` | Presets Noche/Día/Atardecer para la escena: degradado de cielo, niebla (Noche **38/95** y exposición **1,18**, los valores de la SPEC), luces hemisférica/clave/relleno con color, intensidad y posición, estrellas (900/0/0), nubes y montañas. Extiende los datos de `modes.ts` sin modificarlos. |

### 2.2 Escena Three.js

| Fichero | Contenido |
|---|---|
| `src/game/textures.ts` | Texturas Canvas 2D propias: dos vallas publicitarias de 750×126 con marcas inventadas («VOLANTIA» y «PALA·PRO — las palas de la réplica»), rejilla de malla metálica y rejilla fina de red, ambas con repetición. |
| `src/game/Court.ts` | La pista completa (ver §3). Devuelve conteos (cristales, mallas, vallas, público) y `applySurface`/`setCrowdVisible` para cambios en caliente. |
| `src/game/Backdrop.ts` | Entorno: esfera de cielo con shader de degradado propio, niebla, suelo exterior, 900 estrellas puntuales, 7 nubes de esferas aplastadas, anillo de 11 montañas cónicas, y las tres luces (la clave con sombras, mapa 2048, cámara ortográfica ±18 m). `applyPreset` actualiza todo al cambiar de ambiente. |
| `src/game/Cameras.ts` | Rig: poses TV/Jugador con interpolación suave (factor exponencial sobre dt), Libre con órbita propia (arrastre → azimut/polar; rueda → zoom clampado) que arranca desde la posición actual al entrar. Sin OrbitControls (decisión en §6). |
| `src/game/PadelScene.ts` | Orquestador: crea el renderer (antialias, sombras PCFSoft, ACES, pixelRatio ≤ 2, `preserveDrawingBuffer: true` — decisión en §6), aplica los settings **de forma diferencial** (solo lo que cambia: superficie, ambiente, público) y expone `probe()`. |

### 2.3 Integración React

| Fichero | Contenido |
|---|---|
| `src/ui/SceneCanvas.tsx` | Crea la escena **una vez**, bucle `requestAnimationFrame` con **dt clampado a 0,05 s**, `ResizeObserver`, handlers de puntero/rueda solo en modo interactivo, limpieza completa al desmontar. Publica los hooks de test `window.__GAME_READY__` (tras el primer frame) y `window.__padelSceneProbe()`. |
| `src/ui/CourtView.tsx` | Vista de pista a pantalla completa: HUD mínimo (chip de cámara, botón Menú, ayuda de controles) y el rótulo honesto «Vista de pista · Fase 2 — el partido llega en la Fase 3». |
| `src/App.tsx` | La escena vive **detrás de toda la UI** (capa fija, como en el original), con un velo oscuro sobre ella cuando hay paneles. «Jugar partido» abre la vista de pista; **ESC** vuelve al menú y **C** cicla la cámara (override de sesión, no persistido: `settings.camera` sigue siendo la cámara por defecto al entrar). `SceneCanvas` se importa con `React.lazy` (ver §5). |
| `src/ui/Menu.tsx` | La pantalla «en construcción» de la Fase 1 desaparece: «Jugar» va a la vista de pista; subtítulo actualizado a «Fase 2» y ayuda reescrita con los controles ya reales. |
| `src/styles.css` | Capas `.scene-layer`/`.veil`/`.app-shell` con z-index, y estilos del HUD de la vista de pista. |

`src/game/README.md` y `e2e/README.md` se han actualizado al nuevo estado.

## 3. La pista, en detalle

- **Suelo** de 10×20 m con el color de la superficie de `settings`
  (Azul/Verde/Roja/Negra Pro de `modes.ts`) y apron exterior con su color.
  **Líneas** blancas como cajas finas sobre el suelo: perímetro, líneas de
  saque a **6,95 m** de la red y línea central de saque.
- **Red** a 0,88 m: rejilla procedural semitransparente, cinta blanca
  superior y postes metálicos exteriores.
- **Cristales** (6 paneles): fondos completos de 3 m y los primeros 4 m de
  cada lateral, con material transparente (opacidad 0,16) y marcos
  metálicos (montantes cada 2,5 m y travesaño superior).
- **Malla** (8 paneles): rejilla procedural con `alphaTest` sobre los
  cristales (de 3 a 4 m) y en los tramos laterales centrales completos
  (0–4 m), con postes cada 3 m.
- **Vallas** publicitarias (10): a ambos lados y en los dos fondos,
  alternando las dos texturas inventadas.
- **Gradas** de 3 peldaños en los dos laterales y en el fondo +z, con
  **público instanciado**: dos `InstancedMesh` (cuerpos cilíndricos y
  cabezas esféricas) con **306 figuras**, colores de camiseta y tonos de
  piel variados con semilla determinista. Se ocultan si
  `settings.crowd` es false. Las gradas permanecen (son arquitectura).
- **Focos** perimetrales decorativos en las esquinas (cabezas emisivas).
- **Ambientes**: el preset se aplica a cielo, niebla, exposición del
  renderer, luces, visibilidad de estrellas, color/opacidad de nubes,
  montañas y suelo exterior. Noche es el defecto, como en el original.

**Simplificaciones documentadas frente a una pista real:** sin puertas ni
huecos laterales en la malla (el cerramiento es continuo); la red es plana
a 0,88 m (sin la ligera caída central real); el cristal lateral cubre 4 m
desde cada fondo y el resto es malla, que es la distribución habitual
pero con el tramo de transición simplificado; el público es estático y de
silueta mínima (su animación y el GLB propio son de la Fase 4); sin
palmeras (decoración opcional que la tarea permitía omitir).

## 4. Tests unitarios — resultados reales

`npm test` (Vitest 3.2.7): **6 ficheros, 69 tests, 69 en verde** (55 de la
Fase 1 intactos, sin tocar ninguna expectativa, + 14 nuevos).

| Fichero | Tests | Novedad |
|---|---|---|
| `tests/scene.test.ts` | 14 | **Nuevo.** Presets de ambiente (niebla/exposición/estrellas de la SPEC; id desconocido → Noche; sol de Atardecer más bajo que el de Día); superficies con colores únicos y canales dominantes azul/rojo; constantes reglamentarias; mapeo `settings.camera` y ciclo de la tecla C; clamp de zoom 0,45–2,6 y de ángulo polar; distancia TV decreciente con el zoom; pose Jugador baja tras el fondo local mirando a la red; `orbitPosition` conserva el radio. |
| score / store / economy / catalog / data | 55 | Sin cambios: siguen verdes. |

## 5. Build — resultado real y decisión de carga diferida

`npm run build` (typecheck estricto + Vite 7.3.7) **en verde**.
`dist/` total: **748.512 B** (Fase 1: 252 KB).

| Chunk | Tamaño | gzip | Qué es |
|---|---|---|---|
| `assets/index-[hash].js` | 241,34 kB | 76,11 kB | Arranque: React + UI + lógica (≈ Fase 1: 238,44 kB) |
| `assets/SceneCanvas-[hash].js` | 500,67 kB | 127,50 kB | Three.js r180 + toda la escena, **chunk diferido** |
| `assets/index-[hash].css` | 5,41 kB | 1,65 kB | Estilos |
| `index.html` + `robots.txt` | ~1,1 kB | — | — |

**Decisión: carga diferida con `React.lazy`.** La escena se importa como
chunk aparte: el menú inicial no paga el medio megabyte de Three.js en el
bundle principal, la UI funciona aunque WebGL falle, y la escena entra en
paralelo justo después del primer pintado (sigue siendo el fondo del
menú). El aviso de Vite de «chunk mayor de 500 kB» se refiere a ese chunk
diferido y es esperado: es Three.js completo, sin tree-shaking adicional
posible sin perder las APIs que usarán las fases siguientes.

## 6. Decisiones técnicas reseñables

- **`preserveDrawingBuffer: true`** en el renderer: coste pequeño y
  constante, a cambio de que los tests visuales puedan muestrear los
  píxeles del canvas en cualquier momento (SPEC §7.3), no solo en el
  instante posterior a un frame. Sin esto, la verificación por píxeles en
  SwiftShader sería una lotería.
- **Órbita propia en vez de OrbitControls**: la SPEC pide un rango de
  zoom concreto (0,45–2,6) y poses compartidas con las cámaras TV/Jugador;
  la órbita propia son ~30 líneas sobre las matemáticas puras ya
  testeadas, y evita importar `three/addons` solo para esto.
- **Mapeo de cámaras verificado en el código de la Fase 1**: `CAMERAS` de
  `modes.ts` ya definía 0=TV, 1=Jugador, 2=Libre; la SPEC §5.7 y la tarea
  lo confirman (Libre existe como ajuste y además se llega a ella con la
  tecla C en la vista). El override de la tecla C es de sesión y no se
  persiste, decisión documentada en `App.tsx`.
- **El público es booleano** porque así es `settings.crowd` desde la
  Fase 1 (paridad con lo observado); no se ha inventado un ajuste 0–100.
  La cantidad fija (306) queda en `courtConstants.ts` y en el probe.
- **Las líneas son geometría, no textura**: cajas finas con el color de
  línea de la superficie; cambiar de superficie recolorea suelo, apron y
  líneas sin reconstruir nada.

## 7. Verificación en vivo — resultados reales

Script de Playwright (el de la VM, no dependencia del proyecto) contra
`vite preview` en `http://localhost:4173/`, viewport 1280×800, Chromium
headless con SwiftShader. Esperas siempre con
`waitForFunction(..., { polling: 100 })` sobre `__GAME_READY__` y sobre el
probe, nunca por tiempo real. **15/15 comprobaciones en verde y 0 errores
de consola** en todo el recorrido:

1. `__GAME_READY__` tras la carga inicial.
2. Probe inicial: cámara `tv`, superficie `Azul`, ambiente `Noche`,
   público visible con **306** figuras, **6** cristales, **8** mallas,
   **10** vallas, **160 objetos / 129 mallas** en la escena, renderer
   1280×800, pixelRatio 1 (headless).
3. Canvas no vacío en el menú: **55,8 %** de píxeles distintos del color
   de fondo del cielo; luminancia media 28,7.
4. Centro de la pista con superficie Azul: canal **B 144,3 > R 4,0**.
5. Tecla C: TV → **Jugador** → **Libre** (verificado por el probe).
6. En Libre, arrastre con el ratón y rueda: **zoom 1,12** (> 1, dentro del
   rango) sin errores.
7. Ambiente **Día**: luminancia media **58,0** frente a 28,7 de Noche
   (×2,0; el umbral exigido era ×1,3).
8. Superficie **Roja**: centro de la pista con canal **R 99,6 > B 31,4**.
9. Público No → `crowd: false` en el probe; Público Sí → `crowd: true`.
10. Los settings tocados durante la verificación se devolvieron a los
    valores por defecto al final de la propia pasada.

**Capturas** en `e2e/screenshots/` (revisadas visualmente una a una):
`menu-noche.png` (el panel sobre la pista con gradas a ambos lados),
`pista-tv-noche.png`, `pista-tv-dia.png`, `pista-tv-roja.png` y
`pista-libre.png` (órbita lateral con estrellas y montañas visibles). La
escena se ve completa y coherente: pista con líneas, red, cristal del
fondo, vallas legibles y público de colores en las gradas.

**Rendimiento, con honestidad:** la medición es con SwiftShader
(software, ~0,5 fps): sirve para verificar corrección, no para afirmar
FPS de un PC real, que no se han medido. La escena está pensada para ir
sobrada en hardware real: geometría sencilla, sombras solo de la luz
clave, pixelRatio capado a 2 y 612 instancias de público en solo 2 draws.
La verificación completa (carga + 5 cambios de escena con sus frames)
tardó ~3,3 minutos de reloj, casi todo esperando frames de SwiftShader.
Servidor y navegador cerrados al terminar, sin procesos residuales
(comprobado: puerto 4173 libre).

## 8. Qué NO incluye esta fase (por diseño de la SPEC)

- **Sin bola ni física** (Fase 3): no hay pelota, golpeo, saque ni HUD de
  partido; el probe de partido `__padelProbe()` aún no existe (el de esta
  fase es `__padelSceneProbe()`).
- **Sin jugadores ni IA** (Fase 4): nadie ocupa la pista; el público es
  decorado estático, no el GLB de la SPEC §5.6, que llegará con su
  animación en esa fase.
- Sin flujo de partido, SUPERGOLPE, repeticiones ni efectos (Fase 5).
- Sin audio ni controles táctiles (Fase 6): la rueda y el arrastre de la
  vista de pista son de ratón.
- Sin suite E2E formal en el proyecto ni deploy (Fase 7): la verificación
  ha sido el script descrito en §7 contra el preview local.

## 9. Riesgos y notas para la Fase 3 (bola y golpeo)

- **El punto de anclaje ya existe**: `PadelScene` es donde `Ball` y la
  entrada deben engancharse; conviene que la Fase 3 añada su actualización
  dentro de `PadelScene.update(dt)` y extienda el probe con bola y
  jugador, manteniendo __GAME_READY__ como puerta de los E2E.
- **La cámara Jugador está pensada para el resto en z = −10**: cuando
  exista jugador humano, su posición de resto y la pose de esta cámara
  deben coordinarse (la cámara no sigue aún a nadie; en la Fase 3/4 habrá
  que decidir si sigue al jugador o se queda fija tras el fondo).
- **El tacto sigue siendo el riesgo principal** (física y golpeo): las
  constantes de la SPEC §5.2 ya están referenciadas en
  `courtConstants.ts`/SPEC y las superficies exponen sus multiplicadores
  en `modes.ts`, listos para consumir.
- En SwiftShader cada frame cuesta ~2 s: los E2E de la Fase 3 deben
  seguir verificando por estado (probe) y no por secuencias largas de
  frames, como hasta ahora.
