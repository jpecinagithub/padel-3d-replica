# Fase 10 — HUD de centro libre y estadio realista (v1.2.0)

Informe de cierre. Encargo de Jon (4-nov-2026) a partir de dos capturas
del juego original en partido: (10a) las indicaciones en juego «están
todas en el medio de la pantalla y no se puede jugar» — adaptar el
layout al modelo; (10b) «el público y en general todo el diseño es
mucho más realista en el modelo» — adaptar el realismo de la escena.

## 0. Identificación de commits

| Rol | SHA / estado |
|---|---|
| **Commit base de esta fase** | `ba2b15c3dc7e50b995f4a06b1bc29247e9f24f2c` (v1.1.2, cabeza de `main` al empezar) |
| **Commit corregido** (v1.2.0) | `068e71c1124a557cf0da33c5aafb0648982a16f7` (17 ficheros por snapshot) |
| **Commit desplegado** (Vercel) | El código desplegado es el del commit corregido `068e71c1…`. Verificado en producción por la ruta real: la URL sirve el bundle `assets/index-DtQmwC38.js`, idéntico al build local de la v1.2.0, con la cadena «v1.2.0» dentro del bundle servido y el chunk de escena `SceneCanvas-D2jdyZj_.js` accesible (200) |

Nota de proceso: la implementación la hizo un agente que terminó sin
entregar informe ni subir; este cierre lo completa otro agente que ha
verificado el estado real (código leído, capturas revisadas, batería
completa repetida) antes de firmar nada.

## 1. 10a — Layout de indicaciones: el centro queda libre

Inventario final de dónde vive cada elemento durante el juego
(`src/ui/CourtView.tsx` + `src/styles.css`):

- **Marcador**: píldora compacta centrada en el borde superior
  (equipos, juegos con el del servidor destacado, «SET · <modo> ·
  <formato>»), como la del modelo. No crece hacia el centro.
- **Botones circulares en el borde derecho** (`.hud-side-actions`):
  reiniciar (⟳), cámara/repetición (🎥) y pausa (⏸), cableados a las
  acciones existentes, con foco visible. **Solo escritorio**: en
  táctil esas acciones ya viven en la columna de utilidades táctil, y
  duplicarlas generaba solapes (decisión anotada en el propio CSS).
- **SUPERGOLPE**: medidor fino en la franja inferior, a la izquierda,
  junto al indicador de velocidad. **Conflicto táctil resuelto
  así**: el medidor permanece en la franja inferior y el joystick se
  eleva por encima de ella (`bottom: 64px`); la E2E lo verifica con
  cajas reales: joystick `bottom=752` frente a franja `top=774` en
  retrato 390×844, y `326` frente a `354` en horizontal 844×390.
- **Aguja del saque**: misma mecánica intacta (periodo 1,15 s, punto
  dulce ±7 %, zona buena ±18 % — `Shots.needleZone`/`NEEDLE_PERIOD`
  sin tocar), nueva presentación: calibre fino
  (`.needle-gauge`, 10 px de alto) en la franja inferior central con
  su caption de una línea. Solo aparece en la fase de lanzamiento y
  solo si «Ayudas» lo permite (semántica de `guides.ts` intacta). El
  objetivo sigue marcado con el anillo sobre la pista.
- **Ayuda contextual**: UNA línea (`.hud-help`) en la parte inferior
  central, solo en los estados que la justifican (p. ej. saque:
  «Tu saque: ESPACIO para lanzar la bola y golpearla en el punto
  dulce»). En rally no hay línea. En pantallas pequeñas se oculta por
  CSS para no competir con los controles táctiles.
- **Avisos de punto y guías**: banda fina (`.hud-band`) bajo el
  marcador, en el borde superior; nunca paneles centrados durante el
  juego. Pausa y fin de partido siguen siendo modales centrados,
  porque el juego está detenido.
- **Check E2E nuevo**: «Fase 10: en rally, ningún elemento del HUD
  invade el centro de la pantalla» — verifica por cajas que ningún
  overlay visible entra en la zona central durante un rally, y deja
  la captura `fase10-rally-centro-libre.png`. **PASS.**

## 2. 10b — Realismo de la escena (todo procedural, clean-room)

- **Público: 306 → 1.754 figuras** instanciadas. Plan de asientos
  determinista (`courtConstants.CROWD_PLAN`, semilla fija, fijado por
  test en `tests/scene.test.ts`): gradas escalonadas en los **4
  lados × 10 filas**, pasillo vertical cada 13 asientos, ~4,5 % de
  huecos sueltos, 12 % de figuras de pie y 18 % con los brazos en
  alto; colores de ropa y piel variados por instancia. **Reacción al
  punto**: `Court.crowdCheer(big)` anima la celebración 2,4 s (3,4 s
  en puntos grandes) sobre el subconjunto con brazos, disparada
  desde el mismo evento de fin de punto que ya sonaba la grada.
  Los ajustes «Sin público» y bajo consumo del menú siguen intactos.
- **Entorno**: anillo de edificios con **ventanas iluminadas**
  (textura procedural propia, `Backdrop.ts`), **palmeras low-poly
  propias** (geometría fusionada, colores por vértice) en las
  esquinas, suelo exterior y cierre del recinto; el telón diurno
  (montañas) se conserva para el modo Día.
- **Luz**: **conos translúcidos de los focos** (`Court.ts`) con
  opacidad según el ambiente (visibles de noche), sombras con más
  cuerpo en la pista negra.
- **Pista y vallas**: **grano procedural** en la superficie de juego
  y el apron (`textures.makeCourtGrainTexture`), cristal y marcos
  con más presencia, y vallas perimetrales con **marcas inventadas**
  del proyecto (ONDARA, SOLANA, VOLANTA, PALA-PRO) — ningún texto ni
  marca del original.
- **Jugadores**: el rig procedural gana pelo bajo la gorra y
  zapatillas con color propio (`Player.ts`, campos `hair`/`shoes`),
  con los kits diferenciados por equipo que ya existían.
- **Cifras de escena** (probe `__padelSceneProbe`, build de cierre):
  objetos **335 → 445**; figuras de público **306 → 1.754**; draw
  calls **204** en pista y 181 en menú (la cifra anterior no se
  había medido: queda «no medido» para el antes); triángulos
  127.232 en pista. El público denso cuesta pocas llamadas porque se
  dibuja instanciado.

## 3. Verificación (local, en esta VM con SwiftShader)

- **Unitarios: 204/204** (`npm test`, con el conteo de público
  actualizado a 1.754 en `tests/scene.test.ts`).
- **Build: verde** (`tsc --noEmit && vite build`): paquete principal
  `index-DtQmwC38.js` (267,7 kB) + escena `SceneCanvas-D2jdyZj_.js`
  (596,5 kB).
- **E2E (`npm run test:e2e`), con honestidad sobre las dos pasadas:**
  - *Primera pasada: 19/31.* Tres pasos sensibles al tiempo fallaron
    (C3 por timeout de 90 s, IA con aiHits=1, repetición por timeout)
    y a partir del paso A1 el servidor `vite preview` **murió a
    mitad de batería** (`ERR_CONNECTION_REFUSED` en todos los pasos
    restantes, incluidos los móviles). No era un fallo del juego:
    era la máquina.
  - *Diagnóstico*: monitorizando la segunda pasada, la memoria
    disponible de la VM cae hasta **~270 MB de 8 GB, sin swap**,
    con 11–13 procesos de Chromium de SwiftShader vivos: esta
    batería se ejecuta al límite del hardware de la VM, y en la
    primera pasada el proceso que no sobrevivió fue el preview.
  - *Segunda pasada completa, con la máquina en quieto:*
    **31/31 PASS, 0 FAIL** — incluido el check nuevo de centro
    libre, la IA devolviendo (aiHits=2), A1, M4, C3 y todo el
    bloque móvil en ambas orientaciones.
  - En este cierre **no se ha modificado ni una aserción ni una
    línea del arnés**. El único ajuste propio del cierre ha sido
    sincronizar la versión del `package-lock.json` (1.1.2 → 1.2.0,
    dos campos raíz) que la implementación había dejado atrás al
    subir la versión en `package.json`.
- **Capturas** (solo locales, binarios no subibles por snapshot):
  `fase10-antes-{general,saque,rally,movil-general}.png` y
  `fase10-despues-{general,saque,rally,movil-general}.png` en las
  mismas condiciones (dobles, noche, Negra Pro, cámara TV), más
  `fase10-rally-centro-libre.png`.

## 4. Límites honestos

- Las figuras del público son cuerpos low-poly (cuerpo + cabeza +
  brazos en el subconjunto animado) con color variado: la grada se
  ve llena y viva a distancia de partido, pero la figura individual
  sigue siendo esquemática de cerca; no son las figuras sentadas
  articuladas del modelo.
- SwiftShader rinde a ~0,5 fps: las capturas acreditan composición,
  densidad y layout, **no fluidez**. El rendimiento en un PC real se
  apoya en el instanciado (1.754 figuras en 204 draw calls totales),
  pero no está medido en hardware real: sigue pendiente el juicio
  de Jon en su PC (jugabilidad, equilibrio y sonido, como en fases
  anteriores).
- Las comparativas son del modo **Noche**, como las referencias de
  Jon; el modo Día no se re-capturó en esta fase.
- La batería E2E va justa de memoria en esta VM (ver §3): el CI de
  GitHub, en máquina distinta, es la revalidación independiente de
  esta misma cabeza.

## 5. CI y despliegue

- Ejecución de CI de la cabeza corregida (`068e71c1…`): run **8**,
  id **41914302342**, en estado `in_progress` al cierre de este
  informe —
  https://github.com/jpecinagithub/padel-3d-replica/actions/runs/41914302342
  Su conclusión no se da por verde hasta que GitHub la registre; la
  revalidación local completa (31/31) está en el §3.
