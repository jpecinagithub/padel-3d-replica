# e2e — verificación visual (Playwright)

La suite E2E formal de la SPEC §7.3 llega en la Fase 7. Desde la Fase 2 se
verifica la escena con un script de Playwright contra `vite preview` en
localhost (sin pasar por el proxy de la VM), apoyado en los hooks de test:

- Espera a `window.__GAME_READY__ === true` con `waitForFunction` y
  `{ polling: 100 }` (en headless con SwiftShader el render va a ~0,5 fps:
  no se verifica nada por tiempo real ni por elementos de vida corta).
- Lee `window.__padelSceneProbe()` para cámara, superficie, ambiente,
  público y conteos de la escena.
- Muestrea los píxeles del canvas WebGL (el renderer usa
  `preserveDrawingBuffer: true` a propósito) para comprobar que la escena
  no está vacía, que Día es más luminoso que Noche y que el centro de la
  pista cambia de azul a rojo con la superficie.
- Guarda capturas en `e2e/screenshots/`.

El script de la Fase 2 se ejecutó desde fuera del proyecto (Playwright es
herramienta de verificación de la VM, no dependencia de la réplica); sus
resultados están en `FASE2_INFORME.md`.

En la Fase 3 la verificación usa además `window.__padelProbe()` y los
hooks deterministas `__padelTestServe(needle01)` y
`__padelTestLaunch({fromX?})`: saque en el punto dulce que debe botar en
el cuadro, saque con aguja extrema que debe contar como falta, movimiento
con WASD leído del probe, golpeo con ESPACIO en alcance (hits y dirección
de salida), pausa con ESC y Continuar, y capturas del saque, la aguja, el
rally, el HUD y la pausa. Resultados en `FASE3_INFORME.md`.

En la Fase 4 la verificación entra en el Partido libre (botón del
selector de modo), fija la semilla con `__padelTestSeed(n)` y juega
rallies guiados con `__padelTestLaunchAtAI()` (el humano «devuelve» sin
teclado) y `__padelTestAIServe()`: se comprueba que la IA devuelve al
menos 2 bolas en un rally, que gana un rally por no devolución, que su
saque bota válido por probe, y en dobles (activado en localStorage) que
hay 4 jugadores y el compañero se desplaza. Capturas del rally, la
celebración y los dobles. Resultados en `FASE4_INFORME.md`.

En la Fase 6 la verificación cubre audio y táctil por probe y DOM (los
disparos de sonido son contadores lógicos en `__padelProbe().audio`;
NO se afirma que nada se oyera): escritorio — ctxState antes/después
del primer gesto, clics de UI, grada al entrar a pista, bounce/glass
en rallies guiados, mute con M (persiste en `game.muted` y los
contadores dejan de crecer), partido guiado hasta el final con
applause/win/coin, y ausencia de controles táctiles; móvil (390×844,
hasTouch) — controles visibles, arrastre del joystick con eventos
táctiles reales vía CDP (el jugador se desplaza por probe), saque
completo con dos toques en GOLPE (aguja en el DOM y disparo 'serve')
y botón de pausa. Capturas `fase6-*.png`. Resultados en
`FASE6_INFORME.md`.
