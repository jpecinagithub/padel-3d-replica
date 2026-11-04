# Pádel 3D — Réplica (clean-room)

Reimplementación original, desde la especificación de comportamiento de
`~/workspace/padel-analysis/REPLICA_SPEC.md`, de un juego de pádel 3D
para un jugador en el navegador. No contiene código ni assets del
original: solo parámetros de comportamiento observados (reglas,
fórmulas, catálogos) y código propio. Todo el 3D es procedural, todo
el audio se sintetiza con WebAudio y no hay ni un solo fichero de
assets externos.

**URL de producción: https://padel-3d-replica.vercel.app**

## Estado: v1.0.0 — juego completo (fases 0-6) + pulido (Fase 7)

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
  R reiniciar rally · M sonido · ESC pausa.
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
npm install
npm run dev       # desarrollo
npm test          # Vitest (lógica pura): 171 tests
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # sirve dist/ en local (puerto 4173)
```

### E2E de regresión

```bash
node e2e/full-regression.mjs   # batería completa contra vite preview
```

Arranca su propio `vite preview`, ejecuta en una pasada la batería
clave de todo el juego (menú/escena, tienda, entrenamiento, partido
con set guiado y persistencia, Torneo, repetición, efectos, audio y
táctil en viewport móvil), imprime PASS/FAIL por check y termina con
código de salida distinto de cero si algo falla. Playwright es
herramienta de verificación de la VM (no dependencia del proyecto);
ver `e2e/README.md`. Capturas en `e2e/screenshots/`.

## Despliegue

- **Vercel (previsto):** `vercel.json` en la raíz — framework `vite`,
  `buildCommand: npm run build`, `outputDirectory: dist`, sin
  variables de entorno. No hacen falta rewrites: es una SPA de una
  sola vista sin rutas (la escena y los paneles viven en la misma
  página).
- **Render (alternativa documentada):** `render.yaml` (Static Site)
  con `buildCommand: npm ci && npm run build` y
  `staticPublishPath: ./dist`, sin fallback SPA por paridad con el
  original.

## Stack

Vite 7 · React 19.3.1 · TypeScript 5.9 · Three.js r180 · Vitest 3.
Sin backend: todo el estado vive en localStorage con el esquema de
la SPEC §4.
