# Fase 9 — Portada recomposada (v1.1.2)

Jon vio la portada del juego original y la encontró más elegante que la
nuestra. Esta fase recompone SOLO la portada (`src/ui/Menu.tsx` y
estilos) siguiendo esa composición — jerarquía y orden — con nuestros
componentes, textos y CSS. Sin cambios de lógica, store, parámetros ni
del resto de pantallas.

## Composición aplicada

1. **Cabecera:** píldora de monedas (🪙 + saldo) arriba a la izquierda y
   píldora de sonido arriba a la derecha («🔊 Sonido: on» / «🔇 Sonido:
   off»), que sigue siendo el mismo control de mute persistido
   (`game.muted`) de siempre, ahora con clase propia `sound-pill` y la
   misma familia visual que el monedero.
2. **Título:** «PÁDEL» en blanco y «3D» en lima brillante — nueva
   variable `--lime-bright: #c6e265` — con un brillo suave
   (`text-shadow`) en la línea del tema.
3. **Eslogan:** el de siempre, sin cambios, bajo el título.
4. **Botones grandes apilados y centrados** (columna
   `min(560px, 100%)`, radio 16px): primario en lima brillante con
   texto oscuro «▶ Jugar partido» (mismo flujo: abre la pista con la
   elección Entrenamiento/Partido, sin tocar la navegación) y
   secundarios oscuros «⚙ Personalizar partido» y «🛒 Tienda».
5. **Chips de configuración** leídos del store, ahora DEBAJO de los
   botones: modo, superficie con su rasgo («Negra Pro · Viva en
   paredes», de `surface.name` + `surface.label`), formato
   («Individuales» / «1 jugador + CPU vs 2 CPU» en dobles), «Tú:
   <nivel>», «Rival: <nivel>», ambiente, público, «Cam. <cámara>» y
   «Ayudas: sí/no». Píldoras oscuras semitransparentes con borde fino,
   centradas y con wrap.
6. **Una sola línea de estado** bajo los chips, dinámica: con run
   activo, su texto de ronda («Torneo en curso: Final — continúa con
   «Jugar partido»», que antes era un chip más); sin partidos
   completados, «Primer partido — ¡a por ello!»; con historial, la
   línea de victorias/derrotas/puntos de siempre.
7. **Pie:** tres líneas de controles con las teclas en negrita y, al
   final, la identidad discreta «Réplica clean-room · v1.1.2» (antes
   iba bajo el título; se recoloca al pie).

## Eliminado y diferencias deliberadas frente a la referencia

- **Eliminado el párrafo explicativo largo** («(«Jugar partido» abre la
  pista…»): la elegancia de la referencia viene de no tenerlo y el pie
  de controles ya explica lo necesario.
- **Sin firma del autor del original:** la referencia firma «Creado
  por David Duran · davduran@gmail.com». La réplica no es suya: la
  línea de crédito se sustituye por nuestra identidad clean-room.
- **Sin botón «Jugar online»:** no existe modo online ni en el
  original (app 100 % local, verificado en el análisis) ni en la
  réplica. Un botón que promete lo que no hay queda fuera; el hueco
  lo ocupan los tres botones reales.
- Se conserva nuestro panel translúcido sobre la escena 3D en vivo
  como fondo de la portada (identidad propia); la referencia es un
  fondo oscuro plano.

## Verificación

- **Unitarios: 204/204** verdes. **Build** verde.
- **E2E completa: 30/30 PASS** contra la nueva portada.
  **Sin ajustes de aserciones:** la regresión se apoya en
  `.game-title`, `.replica-subtitle` (ahora al pie, con el texto
  «Réplica clean-room · v1.1.2», que sigue cumpliendo el patrón
  `/v1\.1\.\d+/i`), `.wallet`, `.stats-line` (la línea de estado con
  historial sigue mostrando «Victorias 1 · …» tras recargar) y los
  botones por nombre — todo presente en la nueva composición. El
  check A1 confirma que sin WebGL el aviso sale y el menú sigue
  usable: la portada sigue siendo DOM puro.
- **Capturas nuevas** en `e2e/screenshots/` (locales, binarias):
  `fase9-portada-escritorio.png` (1280×800) y
  `fase9-portada-movil.png` (390×844). Juicio visual contra la
  referencia: misma jerarquía y orden; en móvil los chips envuelven
  en cuatro filas sin desbordar (ancho de documento = ancho de
  ventana en ambas capturas, medido por script).

## Commits y despliegue

| Rol | SHA |
|---|---|
| Base (v1.1.1 aprobada) | `aa33eb4b76abd26a4c5c31723991eedc9385d255` |
| Corregido (código, v1.1.2) | `e9e58f6a58313fb324fbb3deee1642a22e78d834` |
| Desplegado | `e9e58f6a…` (este informe se sube en un snapshot posterior sin cambios de código) |

Producción verificada por la ruta real: https://padel-3d-replica.vercel.app
sirve el bundle `assets/index-BTdfShGR.js`, idéntico al build local de
la v1.1.2, y el bundle servido contiene la cadena «v1.1.2».

La subida incluye además los literales de versión de
`src/ui/CourtView.tsx` (v1.1.2 en el HUD), como en los bumps
anteriores; ningún otro fichero de juego cambia.
