# e2e — regresión completa (Playwright)

## Cómo se ejecuta (máquina limpia)

Playwright ES dependencia de desarrollo del proyecto desde la Fase 8
(punto A5 de la revisión Codex: antes la batería solo corría en la VM
de verificación, buscando Playwright en proyectos vecinos). Desde la
raíz del repo:

```bash
npm ci
npx playwright install chromium
npm run build        # la batería sirve el dist/ con vite preview
npm run test:e2e
```

- `npm run test:e2e` ejecuta `node e2e/full-regression.mjs`, que
  arranca su propio `vite preview` (127.0.0.1:4173) y lo cierra al
  terminar. Imprime `PASS`/`FAIL` por check con su detalle y un
  resumen final; termina con código 1 si algo falla (2 si la batería
  ni arranca). El workflow `.github/workflows/ci.yml` corre exactamente
  estos pasos.
- Se usa el Chromium COMPLETO que instala Playwright
  (`channel: 'chromium'`): el headless-shell no basta para WebGL.
  El script commiteado no contiene rutas absolutas ni herramientas de
  ninguna máquina concreta.
- Adaptación local SOLO por variable de entorno (opcional, no hace
  falta en una máquina limpia): `PLAYWRIGHT_CHROMIUM_PATH` permite
  señalar otro ejecutable de Chromium concreto.

## Qué cubre la batería (Fase 8)

Una sola pasada, tres contextos de escritorio y dos móviles:

- **Escritorio (1280×800):** menú/escena, política de hooks C3 (sin
  `?hooks=1` no existen los hooks que fuerzan estado; los probes de
  lectura sí), bajo consumo en el menú (C4), audio perezoso, tienda
  sin monedas, personalizar, entrenamiento (grada verificada por el
  estado REAL de sus nodos — `crowdNodesCreated`/`crowdStarted`, M1;
  saque de aguja válido), partido con la IA devolviendo ≥2 bolas,
  repetición con V, foco de la pausa (C5), efectos `__padelWin`, set
  guiado completo 6-0 con economía exacta (672 🪙 a nivel Medio),
  persistencia tras recarga, compra en la tienda, Torneo (Semifinal
  4-0, +528 🪙, panel «Torneo (Semifinal)» — M3; tecla R que abre la
  Final de la carrera — A4; campeonato con bonus 200 y +992 🪙),
  mute persistido con contadores congelados, sin WebGL (aviso A1 y UI
  usable) y ajustes con efecto (M4: Ayudas=No oculta aguja/ayuda/
  medidor; Repeticiones=Sí repite el punto solo). Cero errores de
  consola en la sesión principal.
- **Móvil retrato (390×844, hasTouch):** controles táctiles visibles,
  HUD compacto sin solapes, joystick con toques reales vía CDP, saque
  por toques y pausa táctil.
- **Móvil horizontal (844×390):** el tratamiento compacto por ALTURA
  de la Fase 8 (M5): sin textos de escritorio, marcador visible y sin
  solapes. Cero errores de consola en las sesiones móviles.

## Convenciones de la batería

- La batería navega a `/?hooks=1`: los hooks que fuerzan estado
  (`__padelTestWinPoint` y compañía) solo se registran con ese
  parámetro (o en dev). Es una política de DEPURACIÓN, no de
  seguridad — cualquiera puede añadir el parámetro; ver el README
  principal y el art. 8 del REGLAMENTO.md.
- Los partidos se guían con esos hooks, que puntúan **por la vía
  normal** (Score → economía → persistencia): con SwiftShader un set
  jugado a mano duraría demasiado. Todo se espera por estado
  (`waitForFunction` con `{ polling: 100 }`), nunca por tiempos fijos.
- Los contadores de audio son disparos lógicos (FASE6 §1.3): verifican
  el cableado, no la escucha.
- Capturas de la batería en `e2e/screenshots/`
  (`fase8-hud-movil-retrato.png`, `fase8-hud-movil-horizontal.png`).

## Verificaciones históricas por fase (Fases 2-6)

Las verificaciones de las Fases 2–6 se apoyaron en este mismo enfoque
(probes y hooks contra `vite preview` en localhost); sus resultados
están en los informes `FASE2_INFORME.md`…`FASE6_INFORME.md` y la
batería consolidada nació en la Fase 7 (`FASE7_INFORME.md`).
