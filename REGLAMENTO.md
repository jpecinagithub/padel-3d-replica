# REGLAMENTO — Pádel 3D (réplica clean-room)

Reglamento de producto de esta réplica, artículo por artículo. Cada
artículo lleva UNA de estas dos etiquetas, y la distinción es parte del
documento:

- **(a) OBSERVADO** — comportamiento visto en el juego original
  (https://padel-mto1.onrender.com/) durante su análisis; el respaldo
  está en `~/workspace/padel-analysis/REPLICA_SPEC.md` (SPEC) y en
  `INFORME_REA.md`, con la sección indicada.
- **(b) DECISIÓN PROPIA** — donde el original no consta o la SPEC
  calla, la réplica decidió una regla. Se documenta como decisión, NO
  como comportamiento observado, con su motivo.

Este reglamento se cierra en la Fase 8 (revisión Codex): las reglas no
se cambian en silencio; cualquier cambio futuro debe actualizar este
fichero y los tests que fijan cada artículo.

---

## 1. Marcador y estructura del partido

1.1 **(a) OBSERVADO** — Puntos con etiquetas 0/15/30/40; a partir de
3-3, «Iguales» y «Ventaja». El juego se gana con ≥4 puntos y 2 de
diferencia. (SPEC §5.4; `tests/score.test.ts`.)

1.2 **(a) OBSERVADO** — El set se gana a `gamesToWin` juegos (6 en
Partida rápida, 4 en Torneo/Mundial) con 2 de diferencia; a
`gamesToWin`–`gamesToWin` hay tiebreak a 7 puntos con diferencia de 2,
que cuenta como un juego. (SPEC §5.4/§5.1; `tests/score.test.ts`,
`tests/matchflow.test.ts`.)

1.3 **(a) OBSERVADO** — Existe el punto de oro ligado al punto que
decide el partido. (SPEC §5.4: «punto de oro en el punto que decide
partido (según flujo del original)».)

1.4 **(b) DECISIÓN PROPIA** — Alcance exacto del punto de oro: solo en
el juego cuyo ganador ganaría el partido, a 40-40; ese punto se juega
sin ventaja y decide juego y partido. La SPEC no detalla en qué
juegos aparece fuera del decisivo, así que la réplica lo limita al
decisivo. (`Score.goldPoint`; `tests/score.test.ts`.)

1.5 **(a) OBSERVADO** — El saque rota entre jugadores con un ciclo de
2 en individuales (tú → rival) y de 4 en dobles (tú → rival →
compañero → rival 2); en el tiebreak, el patrón es 1-2-2. La rotación
es por JUEGOS, no por puntos. (SPEC §5.4; cabecera de `Match.ts`.)

1.6 **(b) DECISIÓN PROPIA** — El lado de saque (derecha/izquierda) sale
de la paridad de puntos del juego en curso (par = derecha), como en el
pádel real. La SPEC no fija el criterio del original. (`Match.setupServe`.)

## 2. El saque

2.1 **(a) OBSERVADO** — Minijuego de aguja oscilante para el saque
humano: hay una zona dulce que da la máxima potencia («¡Saque
perfecto!») y zonas buena/floja/falta (red o larga). (SPEC §5.3/§5.6;
`tests/shots.test.ts`.)

2.2 **(a) OBSERVADO** — La IA saca con una aguja virtual: con
probabilidad `aiServeFault` de su nivel (0,22/0,13/0,07) su saque es
falta. (SPEC §5.1; `tests/ai.test.ts`.)

2.3 **(b) DECISIÓN PROPIA** — UN solo saque por punto, sin segundo
intento: si es falta, el punto es del equipo que restaba.
Simplificación deliberada de la réplica, documentada desde la Fase 1;
el tratamiento del segundo saque en el original no consta en la SPEC.

2.4 **(b) DECISIÓN PROPIA** — Saque «alto»: el lanzamiento sube hasta
≈2,37 m y el contacto válido debe ser elevado (≥1,6 m); con contacto
bajo el saque sale débil hacia la red. La SPEC observa la aguja, no la
altura de contacto del original. (`Match.strikeHumanServe`.)

2.5 **(a) OBSERVADO** — El saque debe botar en el cuadro diagonal
contrario; si bota fuera del cuadro, es larga o no llega, es falta.
(Regla de pádel asumida por el flujo del original y fijada en la
cabecera de reglas de `Match.ts`; `tests/shots.test.ts` para `isInServeBox`.)

2.6 **(b) DECISIÓN PROPIA** — El resto no puede volear el saque antes
de que bote. Regla real de pádel; su tratamiento exacto en el original
no consta. (`Match.attemptHumanHit` exige que el saque ya no esté «en vuelo».)

## 3. El rally y los cerramientos

3.1 **(a) OBSERVADO** — Física de la bola: pista de 20×10 m, red de
0,88 m, pared de 4 m (cristal 3 m + malla encima; en laterales, cristal
junto a los fondos y malla en el centro), gravedad −9,9, arrastre 0,02,
restitución suelo 0,72 / cristal 0,85 / malla 0,50, fricción de bote
0,88, velocidad máxima 34 m/s. (SPEC §5.2; `tests/ball.test.ts`.)

3.2 **(b) DECISIÓN PROPIA** — Segundo bote en el campo contrario =
punto de quien golpeó. Directa al cerramiento sin botar (fondo O
lateral, cristal O malla), a la red, sin cruzar la red o por encima de
los 4 m sin haber botado = punto del contrario (falta de quien golpeó).
Si bota en el campo contrario y sale por encima del fondo, es punto de
quien golpeó («la sacó»). Fijado en `tests/match.test.ts` (A3, casos
simétricos por equipo, lado y material). *Nota Fase 8:* hasta esta
fase el código excluía los laterales de la resolución sin bote; la
cabecera de reglas de `Match.ts` ya decía «directa al cerramiento» sin
excepción — la desviación era del código, no de este reglamento.

3.3 **(b) DECISIÓN PROPIA** — Se puede golpear de volea, tras un bote o
tras el rebote en el propio cristal de fondo; golpear contra el propio
cerramiento antes de cruzar es falta. (Cabecera de `Match.ts`.)

## 4. Jugadores e IA

4.1 **(a) OBSERVADO** — Tres niveles (Fácil/Medio/Difícil) para el
jugador (velocidad 5,2/6,4/7,6 m/s y suelo de calidad 0,35/0,5/0,65) y
para la IA (reacción 0,5/0,3/0,16 s; error 0,24/0,12/0,05; error extra
tras pared +0,10; velocidad 5/6,1/7 m/s). (SPEC §5.1;
`tests/ai.test.ts`, `tests/modes.test.ts` en su caso.)

4.2 **(b) DECISIÓN PROPIA** — *Cuándo* puede golpear la IA: solo tras
cumplir su tiempo de reacción (`aiReaction`) desde el golpe contrario.
Es la lectura natural del parámetro observado en 4.1, pero el momento
exacto de aplicación no consta en el original; hasta la Fase 8 la
réplica golpeaba por alcance geométrico aunque siguiera «reaccionando»
(fallo A2 de la revisión). Fijado en `tests/match.test.ts` (integración).

4.3 **(b) DECISIÓN PROPIA** — El compañero de dobles juega con el nivel
de IA equivalente al nivel de jugador elegido (0→Fácil, 1→Medio,
2→Difícil) y cede las bolas claramente del humano si este está cerca.
La SPEC no fija el nivel del compañero. (`Match.partnerLevel`.)

4.4 **(b) DECISIÓN PROPIA** — Zonas de dobles: cada jugador de dobles
cubre una mitad en x (centro ±2,5 m). Detalle de implementación sin
respaldo en la SPEC. (`AI.ts`, `tests/ai.test.ts`.)

## 5. Modos, carrera y economía

5.1 **(a) OBSERVADO** — Modos Partida rápida (set a 6), Torneo (rondas
Semifinal y Final, set a 4) y Mundial (Cuartos, Semifinal y Final, set
a 4), con rampa de nivel del rival de +1 por ronda (tope Difícil).
(SPEC §5.1; `tests/career.test.ts`.)

5.2 **(a) OBSERVADO** — Monedas: punto ganado 4×(nivel del rival + 1),
juego ganado 20×(nivel + 1), victoria 120×(nivel + 1), derrota 40
fijas, bonus de campeón 200 (Torneo) / 500 (Mundial). Se abonan al
cerrar el partido, en una sola transacción. (SPEC §5.5;
`tests/matchflow.test.ts`, `tests/economy.test.ts`.)

5.3 **(a) OBSERVADO** — La carrera se guarda entre sesiones: salir a
mitad de un Torneo/Mundial deja la ronda guardada y se continúa donde
quedó. Ganar una ronda no final avanza; ganar la final campeona y
cierra; perder cualquier ronda cierra la carrera. (Flujo observado en
el original y fijado en la SPEC §5.1; `tests/career.test.ts`.)

5.4 **(b) DECISIÓN PROPIA** — En el Mundial, la selección rival de cada
ronda es determinista: índice (ronda × 3) mod 8 sobre la lista de
selecciones (Cuartos: Argentina, Semifinal: Francia, Final: Chile).
La SPEC lista las selecciones pero no su orden por ronda.
(`Career.worldTeamForRound`.)

5.5 **(b) DECISIÓN PROPIA** — El reinicio tras un partido (botones de
la pantalla de fin y tecla R) es UN solo flujo: pasa por la app, que
crea/mantiene el run de carrera antes de arrancar. Hasta la Fase 8, la
tecla R arrancaba un partido sin carrera (fallo A4 de la revisión).
Fijado en `tests/match.test.ts`.

## 6. Ajustes con efecto real

6.1 **(a) OBSERVADO** — Los ajustes se persisten con las claves
`game.padel.settings|wallet|stats|run` y `game.muted` en localStorage,
con los valores por defecto de la SPEC §4. *Excepción en 6.2.*

6.2 **(b) DECISIÓN PROPIA** — «Ayudas»: Sí = se ven la aguja del saque
con su zona dulce, los mensajes contextuales de ayuda y el medidor
SUPERGOLPE; No = se ocultan (el mensaje de estado del rally se ve
siempre). Por defecto Sí. Motivo: el original guarda `assist: 0` pero
su menú mostraba «Ayudas: sí» con los ajustes por defecto (análisis
visual) y la semántica interna del valor no es observable; al darle
efecto real en la Fase 8 (fallo M4) se eligió el defecto que no cambia
la experiencia que la réplica ya tenía. (`guides.ts`,
`tests/input.test.ts`, E2E M4.)

6.3 **(b) DECISIÓN PROPIA** — «Repeticiones»: Sí = repetición
automática breve tras cada punto del partido, además de la manual con
V; No = solo la manual. Por defecto No, como guarda la SPEC.
(`guides.ts`, `tests/match.test.ts`.)

6.4 **(b) DECISIÓN PROPIA** — Movimiento analógico: el vector del
joystick conserva su magnitud (20 % de inclinación = 20 % de la
velocidad del nivel); solo se recorta por encima de 1. Hasta la Fase 8
se normalizaba siempre (fallo M2). (`Input.moveVector`.)

## 7. Persistencia y robustez (Fase 8)

7.1 **(b) DECISIÓN PROPIA** — Todo lo persistido se valida al cargar
(tipos y rangos: niveles 0–2, modo 0–2, ronda dentro de las rondas del
modo, contadores enteros ≥ 0…); lo corrupto o fuera de rango cae a
valores por defecto. Sin localStorage, el juego funciona en memoria y
los cambios de carrera notifican igual a la UI (fallo M6).
(`store.ts`, `tests/store.test.ts`.)

7.2 **(b) DECISIÓN PROPIA** — Sin WebGL, la app no desaparece: aviso de
incompatibilidad 3D con botón de reintento, y menú/tienda/ajustes
siguen usables (fallo A1). (`ui/sceneGuard.ts`, E2E A1.)

## 8. Hooks de prueba (política de depuración, NO de seguridad)

8.1 **(a) OBSERVADO** — El diseño (SPEC §5.7) contempla probes de solo
lectura siempre disponibles: `__GAME_READY__`, `__gameProbe()` y
`__padelProbe()` (y `__padelSceneProbe()` en la réplica); los hooks de
efectos `__padelWin`/`__padelGold`/`__padelFX` figuraban «en
desarrollo». La réplica añade los `__padelTest*` (puntos guiados,
semilla, saques) para su batería E2E.

8.2 **(b) DECISIÓN PROPIA** — Desde la Fase 8, los hooks que FUERZAN
estado (todos los `__padelTest*` y los de efectos) solo se registran
en desarrollo o con `?hooks=1` en la URL. **Esto es una política de
depuración contra activación accidental, NO una medida de seguridad:**
cualquiera puede añadir el parámetro. Es aceptable porque el juego es
100 % local, sin servidor: las monedas y recompensas viven en el
navegador del propio jugador y no tienen valor fuera de él.
