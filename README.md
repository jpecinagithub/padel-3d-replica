# Pádel 3D — Réplica (clean-room)

Reimplementación original, desde la especificación de comportamiento de
`~/workspace/padel-analysis/REPLICA_SPEC.md`, de un juego de pádel 3D
para un jugador en el navegador. No contiene código ni assets del
original: solo parámetros de comportamiento observados (reglas,
fórmulas, catálogos) y código propio.

## Estado

- **Fases 0+1 (andamiaje, lógica pura y UI): completadas.** Marcador,
  modos, economía y tienda con persistencia en localStorage.
  Ver `FASE1_INFORME.md`.
- **Fase 2 (escena 3D): completada.** Pista, ambientes y cámaras.
  Ver `FASE2_INFORME.md`.
- **Fase 3 (bola y golpeo): completada.** Entrenamiento jugable con
  saque de aguja. Ver `FASE3_INFORME.md`.
- **Fase 4 (jugadores e IA): completada.** Rig procedural, IA por
  niveles y dobles. Ver `FASE4_INFORME.md`.
- **Fase 5 (partido completo): completada.** Score oficial, economía
  real, Torneo/Mundial, repetición y efectos. Ver `FASE5_INFORME.md`.
- **Fase 6 (audio y táctil): completada.** Audio 100 % sintetizado con
  WebAudio (sin ficheros) y controles táctiles (joystick + botones)
  sobre el mismo sistema de entrada que el teclado. Desde esta fase
  las monedas solo se ganan jugando: la tienda ya no tiene botón de
  prueba. Ver `FASE6_INFORME.md`.
- Fase 7 (pulido y deploy): pendiente, según la SPEC §8.

## Desarrollo

```bash
npm install
npm run dev       # desarrollo
npm test          # Vitest (lógica pura)
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # sirve dist/ en local
```

## Stack

Vite 7 · React 19.3.1 · TypeScript 5.9 · Three.js r180 · Vitest 3.
Sin backend: todo el estado vive en localStorage con el esquema de
la SPEC §4.
